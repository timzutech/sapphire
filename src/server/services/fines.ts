import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { adjustFineSchema, disputeSchema, fineCategorySchema, finePaymentSchema, issueFineSchema, resolveDisputeSchema, reviewFinePaymentSchema, waiveFineSchema } from '@/lib/validation/finance';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { notify, notifyAdmins } from '../notify';
import { recordOfficeTxn } from './office-finance';

export async function saveFineCategory(tx: Tx, actor: Actor, d: z.infer<typeof fineCategorySchema>) {
  if (d.categoryId) {
    await tx`update fine_categories set name = ${d.name}, default_amount = ${d.defaultAmount ?? null}, description = ${d.description ?? null}, is_active = ${d.isActive} where id = ${d.categoryId}`;
  } else {
    await tx`insert into fine_categories (office_id, name, default_amount, description) values (${actor.officeId}, ${d.name}, ${d.defaultAmount ?? null}, ${d.description ?? null})`;
  }
  await audit(tx, actor, { action: 'fine_category.save', entityType: 'fine_category', entityId: d.categoryId, summary: `Saved fine rule “${d.name}”`, after: d });
}

/** Fines are only ever created explicitly by an administrator with a recorded reason — never as hidden deductions. */
export async function issueFines(tx: Tx, actor: Actor, d: z.infer<typeof issueFineSchema>) {
  const rows = d.userIds.map((u) => ({
    office_id: actor.officeId,
    user_id: u,
    category_id: d.categoryId ?? null,
    reason: d.reason,
    amount: d.amount,
    issued_on: d.issuedOn,
    due_date: d.dueDate ?? null,
    issued_by: actor.userId,
    attendance_record_id: d.userIds.length === 1 ? (d.attendanceRecordId ?? null) : null,
  }));
  const created = await tx`insert into fines ${tx(rows)} returning id, user_id`;
  for (const f of created) {
    await notify(tx, actor.officeId, [f.user_id], { kind: 'fine', title: `New fine: ${d.reason}`, body: `Amount ${d.amount}${d.dueDate ? ` · due ${d.dueDate}` : ''}`, link: '/fines' });
    await audit(tx, actor, { action: 'fine.issue', entityType: 'fine', entityId: f.id, summary: `Issued fine of ${d.amount}: ${d.reason}`, after: { userId: f.user_id, amount: d.amount, reason: d.reason } });
  }
  return created.length;
}

export async function adjustFine(tx: Tx, actor: Actor, d: z.infer<typeof adjustFineSchema>) {
  const [f] = await tx`select * from fines where id = ${d.fineId} for update`;
  if (!f) throw new UserError('Fine not found.');
  if (f.status === 'waived') throw new UserError('Waived fines cannot be adjusted.');
  if (Number(f.amount) === Number(d.amount)) throw new UserError('The amount is unchanged.');
  await tx`update fines set amount = ${d.amount} where id = ${d.fineId}`;
  await tx`insert into fine_adjustments (office_id, fine_id, previous_amount, new_amount, reason, adjusted_by) values (${actor.officeId}, ${d.fineId}, ${f.amount}, ${d.amount}, ${d.reason}, ${actor.userId})`;
  await notify(tx, actor.officeId, [f.user_id], { kind: 'fine', title: 'A fine was adjusted', body: `${f.amount} → ${d.amount}: ${d.reason}`, link: '/fines' });
  await audit(tx, actor, { action: 'fine.adjust', entityType: 'fine', entityId: d.fineId, summary: `Adjusted fine from ${f.amount} to ${d.amount}`, before: { amount: f.amount }, after: { amount: d.amount }, reason: d.reason });
}

export async function waiveFine(tx: Tx, actor: Actor, d: z.infer<typeof waiveFineSchema>) {
  const [f] = await tx`update fines set status = 'waived', waived_by = ${actor.userId}, waive_reason = ${d.reason}
    where id = ${d.fineId} and status <> 'waived' and status <> 'paid' returning user_id, amount, reason`;
  if (!f) throw new UserError('Only unpaid fines can be waived.');
  await tx`update fine_disputes set status = 'upheld', resolution_note = ${`Fine waived: ${d.reason}`}, resolved_by = ${actor.userId}, resolved_at = now() where fine_id = ${d.fineId} and status = 'open'`;
  await notify(tx, actor.officeId, [f.user_id], { kind: 'fine', title: 'A fine was waived', body: d.reason, link: '/fines' });
  await audit(tx, actor, { action: 'fine.waive', entityType: 'fine', entityId: d.fineId, summary: `Waived fine of ${f.amount} (${f.reason})`, reason: d.reason });
}

async function postFinePayment(tx: Tx, actor: Actor, paymentId: string, accountId: string) {
  const [p] = await tx`select fp.amount, fp.paid_on, fp.reference, u.full_name, f.reason from fine_payments fp
    join fines f on f.id = fp.fine_id join users u on u.id = fp.user_id where fp.id = ${paymentId}`;
  const [cat] = await tx`select id from finance_categories where office_id = ${actor.officeId} and system_key = 'fine_collections'`;
  await recordOfficeTxn(tx, actor, {
    type: 'income', direction: 1, accountId, amount: p.amount, categoryId: cat?.id, txnDate: p.paid_on, reference: p.reference ?? undefined,
    counterparty: p.full_name, description: `Fine payment: ${p.reason}`.slice(0, 200), notes: undefined, toAccountId: undefined,
  }, { finePaymentId: paymentId });
}

/** Admin records a payment received; it is confirmed immediately and posted once to the office books. */
export async function recordFinePayment(tx: Tx, actor: Actor, d: z.infer<typeof finePaymentSchema>) {
  if (!d.accountId) throw new UserError('Choose the office account that received the payment.', { accountId: 'Required' });
  const [f] = await tx`select user_id from fines where id = ${d.fineId}`;
  if (!f) throw new UserError('Fine not found.');
  const [p] = await tx`insert into fine_payments (office_id, fine_id, user_id, amount, paid_on, method, reference, note, status, submitted_by)
    values (${actor.officeId}, ${d.fineId}, ${f.user_id}, ${d.amount}, ${d.paidOn}, ${d.method ?? null}, ${d.reference ?? null}, ${d.note ?? null}, 'confirmed', ${actor.userId}) returning id`;
  await postFinePayment(tx, actor, p.id, d.accountId);
  await notify(tx, actor.officeId, [f.user_id], { kind: 'fine', title: 'Fine payment recorded', body: `Amount ${d.amount}`, link: '/fines' });
  await audit(tx, actor, { action: 'fine.payment', entityType: 'fine', entityId: d.fineId, summary: `Recorded fine payment of ${d.amount}` });
}

/** Member submits proof of payment; nothing changes on the fine until an administrator confirms it. */
export async function submitFinePayment(tx: Tx, actor: Actor, d: z.infer<typeof finePaymentSchema>) {
  await tx`insert into fine_payments (office_id, fine_id, user_id, amount, paid_on, method, reference, note, status, submitted_by)
    values (${actor.officeId}, ${d.fineId}, ${actor.userId}, ${d.amount}, ${d.paidOn}, ${d.method ?? null}, ${d.reference ?? null}, ${d.note ?? null}, 'pending', ${actor.userId})`;
  await notifyAdmins(tx, actor.officeId, { kind: 'approval', title: 'Fine payment awaiting confirmation', body: `Amount ${d.amount}`, link: '/admin/fines?tab=payments' }, actor.userId);
}

export async function reviewFinePayment(tx: Tx, actor: Actor, d: z.infer<typeof reviewFinePaymentSchema>) {
  const [p] = await tx`select * from fine_payments where id = ${d.paymentId} for update`;
  if (!p) throw new UserError('Payment not found.');
  if (d.decision === 'confirmed') {
    if (p.status !== 'pending') throw new UserError('Only pending payments can be confirmed.');
    if (!d.accountId) throw new UserError('Choose the office account that received the payment.', { accountId: 'Required' });
    await tx`update fine_payments set status = 'confirmed', note = coalesce(${d.note ?? null}, note) where id = ${p.id}`;
    await postFinePayment(tx, actor, p.id, d.accountId);
  } else {
    if (p.status === 'rejected') throw new UserError('Payment already rejected.');
    if (!d.note) throw new UserError('Give a reason for rejecting this payment record.', { note: 'Reason required' });
    await tx`update fine_payments set status = 'rejected', note = ${d.note} where id = ${p.id}`;
    if (p.status === 'confirmed') {
      // A confirmed payment being voided: reverse its office-books entry so cash stays accurate.
      const [t] = await tx`select id from office_transactions where fine_payment_id = ${p.id}`;
      if (t) {
        const { reverseOfficeTxn } = await import('./office-finance');
        await reverseOfficeTxn(tx, actor, { txnId: t.id, reason: `Fine payment voided: ${d.note}` });
      }
    }
  }
  await notify(tx, actor.officeId, [p.user_id], { kind: 'fine', title: `Fine payment ${d.decision}`, body: d.note ?? `Amount ${p.amount}`, link: '/fines' });
  await audit(tx, actor, { action: `fine.payment_${d.decision}`, entityType: 'fine_payment', entityId: p.id, summary: `${d.decision === 'confirmed' ? 'Confirmed' : 'Rejected'} fine payment of ${p.amount}`, reason: d.note });
}

export async function raiseDispute(tx: Tx, actor: Actor, d: z.infer<typeof disputeSchema>) {
  const [f] = await tx`select status, reason from fines where id = ${d.fineId} and user_id = ${actor.userId}`;
  if (!f) throw new UserError('Fine not found.');
  if (f.status === 'paid' || f.status === 'waived') throw new UserError('Paid or waived fines cannot be disputed.');
  await tx`insert into fine_disputes (office_id, fine_id, raised_by, reason) values (${actor.officeId}, ${d.fineId}, ${actor.userId}, ${d.reason})`;
  await notifyAdmins(tx, actor.officeId, { kind: 'approval', title: `Fine disputed: ${f.reason}`, body: d.reason.slice(0, 140), link: '/admin/fines?tab=disputes' });
}

export async function resolveDispute(tx: Tx, actor: Actor, d: z.infer<typeof resolveDisputeSchema>) {
  const [dispute] = await tx`update fine_disputes set status = ${d.decision}, resolution_note = ${d.note}, resolved_by = ${actor.userId}, resolved_at = now()
    where id = ${d.disputeId} and status = 'open' returning fine_id, raised_by`;
  if (!dispute) throw new UserError('Open dispute not found.');
  if (d.decision === 'upheld') {
    await tx`update fines set status = 'waived', waived_by = ${actor.userId}, waive_reason = ${`Dispute upheld: ${d.note}`} where id = ${dispute.fine_id} and status <> 'paid'`;
  }
  await notify(tx, actor.officeId, [dispute.raised_by], { kind: 'fine', title: `Your dispute was ${d.decision}`, body: d.note, link: '/fines' });
  await audit(tx, actor, { action: `fine.dispute_${d.decision}`, entityType: 'fine', entityId: dispute.fine_id, summary: `Dispute ${d.decision}${d.decision === 'upheld' ? ' — fine waived' : ''}`, reason: d.note });
}
