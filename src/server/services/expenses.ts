import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { expenseActionSchema, expenseSchema } from '@/lib/validation/finance';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { notify, notifyAdmins } from '../notify';
import { recordOfficeTxn } from './office-finance';

export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Validates type by magic bytes (not just the declared MIME type) and stores the file in the database. */
export async function storeAttachment(tx: Tx, actor: Actor, file: File): Promise<string> {
  if (file.size === 0) throw new UserError('The uploaded file is empty.', { receipt: 'Empty file' });
  if (file.size > MAX_UPLOAD_BYTES) throw new UserError('Receipts must be 5 MB or smaller.', { receipt: 'Too large' });
  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(buf);
  if (!sniffed || !ALLOWED_UPLOAD_TYPES.includes(sniffed)) throw new UserError('Receipts must be PDF, PNG, JPEG or WebP files.', { receipt: 'Unsupported file type' });
  const name = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'receipt';
  const [a] = await tx`insert into attachments (office_id, uploaded_by, filename, mime_type, size_bytes, data)
    values (${actor.officeId}, ${actor.userId}, ${name}, ${sniffed}, ${buf.length}, ${buf}) returning id`;
  return a.id as string;
}

export function sniffMime(b: Buffer): string | null {
  if (b.length >= 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b.length >= 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

export async function saveExpense(tx: Tx, actor: Actor, d: z.infer<typeof expenseSchema>, receipt?: File | null) {
  const attachmentId = receipt && receipt.size > 0 ? await storeAttachment(tx, actor, receipt) : null;
  const f = {
    title: d.title,
    category_id: d.categoryId,
    amount: d.amount,
    expense_date: d.expenseDate,
    payment_method: d.paymentMethod ?? null,
    responsible_user_id: d.responsibleUserId ?? null,
    vendor: d.vendor ?? null,
    description: d.description ?? null,
    status: d.submit ? 'pending' : 'draft',
  };
  const [cat] = await tx`select 1 from finance_categories where id = ${d.categoryId} and scope = 'office' and kind = 'expense'`;
  if (!cat) throw new UserError('Choose an office expense category.', { categoryId: 'Invalid category' });
  let id = d.expenseId;
  if (id) {
    const [e] = await tx`update expenses set ${tx(f)} ${attachmentId ? tx`, attachment_id = ${attachmentId}` : tx``} where id = ${id} returning id`;
    if (!e) throw new UserError('Expense not found.');
  } else {
    const [e] = await tx`insert into expenses ${tx({ ...f, office_id: actor.officeId, submitted_by: actor.userId, attachment_id: attachmentId })} returning id`;
    id = e.id as string;
  }
  if (d.submit) await afterSubmit(tx, actor, id!, d.title, d.amount);
  return id!;
}

async function afterSubmit(tx: Tx, actor: Actor, expenseId: string, title: string, amount: string) {
  await tx`insert into expense_approvals (office_id, expense_id, action, actor_id) values (${actor.officeId}, ${expenseId}, 'submitted', ${actor.userId})`;
  await notifyAdmins(tx, actor.officeId, { kind: 'approval', title: `Expense awaiting approval: ${title}`, body: amount, link: '/admin/expenses?status=pending' }, actor.userId);
}

export async function expenseAction(tx: Tx, actor: Actor & { role: string }, d: z.infer<typeof expenseActionSchema>) {
  const [e] = await tx`select * from expenses where id = ${d.expenseId} for update`;
  if (!e) throw new UserError('Expense not found.');
  const log = (action: string) =>
    tx`insert into expense_approvals (office_id, expense_id, action, actor_id, note) values (${actor.officeId}, ${e.id}, ${action}, ${actor.userId}, ${d.note ?? null})`;
  switch (d.action) {
    case 'submit':
      await tx`update expenses set status = 'pending' where id = ${e.id}`;
      await afterSubmit(tx, actor, e.id, e.title, e.amount);
      return 'Submitted for approval';
    case 'withdraw':
      await tx`update expenses set status = 'draft' where id = ${e.id}`;
      return 'Submission withdrawn';
    case 'delete': {
      const [x] = await tx`delete from expenses where id = ${e.id} returning id`;
      if (!x) throw new UserError('Only draft or rejected expenses can be deleted.');
      return 'Expense deleted';
    }
    case 'approve':
    case 'reject': {
      if (actor.role !== 'admin') throw new UserError('Administrator access is required.');
      if (d.action === 'reject' && !d.note) throw new UserError('Give a reason for rejecting.', { note: 'Reason required' });
      const status = d.action === 'approve' ? 'approved' : 'rejected';
      await tx`update expenses set status = ${status} where id = ${e.id}`;
      await log(status);
      if (e.submitted_by !== actor.userId) {
        await notify(tx, actor.officeId, [e.submitted_by], { kind: 'expense', title: `Expense ${status}: ${e.title}`, body: d.note ?? null, link: '/money?tab=claims' });
      }
      await audit(tx, actor, { action: `expense.${status}`, entityType: 'expense', entityId: e.id, summary: `${status === 'approved' ? 'Approved' : 'Rejected'} expense “${e.title}” (${e.amount})`, reason: d.note });
      return `Expense ${status}`;
    }
    case 'pay': {
      if (actor.role !== 'admin') throw new UserError('Administrator access is required.');
      if (!d.accountId) throw new UserError('Choose the account it was paid from.', { accountId: 'Required' });
      await tx`update expenses set status = 'paid', paid_account_id = ${d.accountId} where id = ${e.id}`;
      await recordOfficeTxn(tx, actor, {
        type: 'expense', direction: 1, accountId: d.accountId, amount: e.amount, categoryId: e.category_id, txnDate: d.paidOn ?? e.expense_date,
        description: `Expense: ${e.title}`.slice(0, 200), counterparty: e.vendor ?? undefined, reference: undefined, notes: d.note, toAccountId: undefined,
      }, { expenseId: e.id });
      await log('paid');
      if (e.submitted_by !== actor.userId) {
        await notify(tx, actor.officeId, [e.submitted_by], { kind: 'expense', title: `Expense paid: ${e.title}`, link: '/money?tab=claims' });
      }
      return 'Expense marked as paid and posted to the office books';
    }
  }
}
