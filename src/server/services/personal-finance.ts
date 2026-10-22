import 'server-only';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { correctionSchema, personalAccountSchema, personalTxnSchema, reviewTxnSchema } from '@/lib/validation/finance';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { notify, notifyAdmins } from '../notify';

/** Every member gets a Cash and a Savings account the first time they open My Money. */
export async function ensureDefaultAccounts(tx: Tx, actor: Actor) {
  const [{ n }] = await tx`select count(*)::int as n from personal_accounts where office_id = ${actor.officeId} and user_id = ${actor.userId}`;
  if (n === 0) {
    await tx`insert into personal_accounts (office_id, user_id, name, kind) values
      (${actor.officeId}, ${actor.userId}, 'Cash', 'cash'), (${actor.officeId}, ${actor.userId}, 'Savings', 'savings') on conflict do nothing`;
  }
}

export async function saveAccount(tx: Tx, actor: Actor, d: z.infer<typeof personalAccountSchema>) {
  if (d.accountId) {
    const [a] = await tx`update personal_accounts set name = ${d.name}, kind = ${d.kind}, opening_balance = ${d.openingBalance}, opening_date = ${d.openingDate}
      where id = ${d.accountId} and user_id = ${actor.userId} returning id`;
    if (!a) throw new UserError('Account not found.');
    return;
  }
  await tx`insert into personal_accounts (office_id, user_id, name, kind, opening_balance, opening_date)
    values (${actor.officeId}, ${actor.userId}, ${d.name}, ${d.kind}, ${d.openingBalance}, ${d.openingDate})`;
}

export async function saveTransaction(tx: Tx, actor: Actor, d: z.infer<typeof personalTxnSchema>) {
  const f = {
    type: d.type,
    account_id: d.accountId,
    to_account_id: d.type === 'transfer' ? d.toAccountId! : null,
    amount: d.amount,
    category_id: d.type === 'transfer' ? null : (d.categoryId ?? null),
    txn_date: d.txnDate,
    description: d.description,
    notes: d.notes ?? null,
    status: d.submit && d.type !== 'transfer' ? 'pending' : 'recorded',
  };
  if (d.txnId) {
    const [t] = await tx`update personal_transactions set ${tx(f)}, review_note = null where id = ${d.txnId} and user_id = ${actor.userId} returning id`;
    if (!t) throw new UserError('Transaction not found.');
  } else {
    await tx`insert into personal_transactions ${tx({ ...f, office_id: actor.officeId, user_id: actor.userId, client_token: d.clientToken })}`;
  }
  if (f.status === 'pending') {
    await notifyAdmins(tx, actor.officeId, { kind: 'approval', title: 'Financial record awaiting verification', body: `${d.description} · ${d.amount}`, link: '/admin/finances?tab=verifications' }, actor.userId);
  }
}

export async function deleteTransaction(tx: Tx, actor: Actor, txnId: string) {
  const [t] = await tx`delete from personal_transactions where id = ${txnId} and user_id = ${actor.userId} returning id`;
  if (!t) throw new UserError('Transaction not found.');
}

export async function setSubmission(tx: Tx, actor: Actor, txnId: string, submit: boolean) {
  const [t] = await tx`update personal_transactions set status = ${submit ? 'pending' : 'recorded'}
    where id = ${txnId} and user_id = ${actor.userId} and status in ${submit ? tx(['recorded', 'rejected']) : tx(['pending'])} and type <> 'transfer'
    returning description, amount`;
  if (!t) throw new UserError(submit ? 'Only unverified records can be submitted.' : 'Only pending submissions can be withdrawn.');
  if (submit) await notifyAdmins(tx, actor.officeId, { kind: 'approval', title: 'Financial record awaiting verification', body: `${t.description} · ${t.amount}`, link: '/admin/finances?tab=verifications' }, actor.userId);
}

/** Corrections of approved records are append-only: a mirror entry with direction −1 nets the original to zero. */
export async function correctTransaction(tx: Tx, actor: Actor, d: z.infer<typeof correctionSchema>) {
  const [o] = await tx`select * from personal_transactions where id = ${d.txnId} and user_id = ${actor.userId}`;
  if (!o) throw new UserError('Transaction not found.');
  if (o.status !== 'approved') throw new UserError('Only approved records need a correction entry — edit or delete unapproved ones instead.');
  await tx`insert into personal_transactions (office_id, user_id, account_id, to_account_id, type, amount, direction, category_id, txn_date, description, notes, status, reverses_id, client_token)
    values (${actor.officeId}, ${actor.userId}, ${o.account_id}, ${o.to_account_id}, ${o.type}, ${o.amount}, ${-o.direction}, ${o.category_id},
      app.office_today(${actor.officeId}), ${`Correction: ${o.description}`.slice(0, 200)}, ${d.reason}, 'recorded', ${o.id}, ${d.clientToken})`;
  await audit(tx, actor, { action: 'personal_txn.correct', entityType: 'personal_transaction', entityId: o.id, summary: `Recorded correction for approved ${o.type} of ${o.amount}`, reason: d.reason });
}

export async function reviewTransaction(tx: Tx, actor: Actor, d: z.infer<typeof reviewTxnSchema>) {
  const [t] = await tx`update personal_transactions set status = ${d.decision}, review_note = ${d.note ?? null}
    where id = ${d.txnId} and status = 'pending' returning user_id, description, amount`;
  if (!t) throw new UserError('Submission not found or already reviewed.');
  await notify(tx, actor.officeId, [t.user_id], { kind: 'finance_review', title: `Your record “${t.description}” was ${d.decision}`, body: d.note ?? null, link: '/money' });
  await audit(tx, actor, { action: `personal_txn.${d.decision}`, entityType: 'personal_transaction', entityId: d.txnId, summary: `${d.decision === 'approved' ? 'Verified' : 'Rejected'} member record of ${t.amount}`, reason: d.note });
}

export const newToken = () => randomUUID();
