import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { budgetSchema, cancelObligationSchema, categorySchema, obligationSchema, officeAccountSchema, officeTxnSchema, reverseSchema, settleObligationSchema } from '@/lib/validation/finance';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';

export async function saveOfficeAccount(tx: Tx, actor: Actor, d: z.infer<typeof officeAccountSchema>) {
  if (d.accountId) {
    const [before] = await tx`select * from office_accounts where id = ${d.accountId}`;
    await tx`update office_accounts set name = ${d.name}, kind = ${d.kind}, opening_balance = ${d.openingBalance}, opening_date = ${d.openingDate} where id = ${d.accountId}`;
    await audit(tx, actor, { action: 'office_account.update', entityType: 'office_account', entityId: d.accountId, summary: `Updated account ${d.name} (opening balance ${d.openingBalance})`, before, after: d });
    return;
  }
  const [a] = await tx`insert into office_accounts (office_id, name, kind, opening_balance, opening_date) values (${actor.officeId}, ${d.name}, ${d.kind}, ${d.openingBalance}, ${d.openingDate}) returning id`;
  await audit(tx, actor, { action: 'office_account.create', entityType: 'office_account', entityId: a.id, summary: `Created account ${d.name} with opening balance ${d.openingBalance}` });
}

export async function recordOfficeTxn(tx: Tx, actor: Actor, d: z.infer<typeof officeTxnSchema>, links: { expenseId?: string; finePaymentId?: string } = {}) {
  const [t] = await tx`insert into office_transactions ${tx({
    office_id: actor.officeId,
    account_id: d.accountId,
    to_account_id: d.type === 'transfer' ? d.toAccountId! : null,
    type: d.type,
    direction: d.type === 'adjustment' ? d.direction : 1,
    amount: d.amount,
    category_id: d.type === 'transfer' || d.type === 'adjustment' ? null : d.categoryId!,
    txn_date: d.txnDate,
    reference: d.reference ?? null,
    counterparty: d.counterparty ?? null,
    description: d.description,
    notes: d.notes ?? null,
    expense_id: links.expenseId ?? null,
    fine_payment_id: links.finePaymentId ?? null,
    recorded_by: actor.userId,
  })} returning id`;
  await audit(tx, actor, { action: 'office_txn.create', entityType: 'office_transaction', entityId: t.id, summary: `Recorded office ${d.type} of ${d.amount}: ${d.description}`, after: d });
  return t.id as string;
}

/** Office books are append-only: mistakes are corrected with a reversal entry, never edited or deleted. */
export async function reverseOfficeTxn(tx: Tx, actor: Actor, d: z.infer<typeof reverseSchema>) {
  const [o] = await tx`select * from office_transactions where id = ${d.txnId}`;
  if (!o) throw new UserError('Transaction not found.');
  if (o.reverses_id) throw new UserError('A reversal cannot itself be reversed. Record a new entry instead.');
  const [r] = await tx`insert into office_transactions (office_id, account_id, to_account_id, type, amount, direction, category_id, txn_date, reference, counterparty, description, notes, reverses_id, recorded_by)
    values (${actor.officeId}, ${o.account_id}, ${o.to_account_id}, ${o.type}, ${o.amount}, ${-o.direction}, ${o.category_id}, app.office_today(${actor.officeId}),
      ${o.reference}, ${o.counterparty}, ${`Reversal: ${o.description}`.slice(0, 200)}, ${d.reason}, ${o.id}, ${actor.userId}) returning id`;
  await audit(tx, actor, { action: 'office_txn.reverse', entityType: 'office_transaction', entityId: o.id, summary: `Reversed ${o.type} of ${o.amount}: ${o.description}`, reason: d.reason, after: { reversalId: r.id } });
}

export async function createObligation(tx: Tx, actor: Actor, d: z.infer<typeof obligationSchema>) {
  const [o] = await tx`insert into office_obligations (office_id, kind, counterparty, description, amount, due_date, created_by)
    values (${actor.officeId}, ${d.kind}, ${d.counterparty}, ${d.description}, ${d.amount}, ${d.dueDate ?? null}, ${actor.userId}) returning id`;
  await audit(tx, actor, { action: 'obligation.create', entityType: 'office_obligation', entityId: o.id, summary: `Recorded ${d.kind} of ${d.amount} (${d.counterparty})` });
}

/** Settling posts the cash movement to the books and links it, so it is counted once. */
export async function settleObligation(tx: Tx, actor: Actor, d: z.infer<typeof settleObligationSchema>) {
  const [o] = await tx`select * from office_obligations where id = ${d.obligationId} and status = 'open' for update`;
  if (!o) throw new UserError('Open obligation not found.');
  const [cat] = await tx`select kind from finance_categories where id = ${d.categoryId} and scope = 'office'`;
  const type = o.kind === 'receivable' ? 'income' : 'expense';
  if (!cat || cat.kind !== type) throw new UserError(`Choose an office ${type} category.`, { categoryId: 'Wrong category type' });
  const txnId = await recordOfficeTxn(tx, actor, {
    type, direction: 1, accountId: d.accountId, amount: o.amount, categoryId: d.categoryId, txnDate: d.txnDate,
    counterparty: o.counterparty, description: `${o.kind === 'receivable' ? 'Received' : 'Paid'}: ${o.description}`.slice(0, 200),
    reference: undefined, notes: undefined, toAccountId: undefined,
  });
  await tx`update office_obligations set status = 'settled', settled_txn_id = ${txnId} where id = ${o.id}`;
}

export async function cancelObligation(tx: Tx, actor: Actor, d: z.infer<typeof cancelObligationSchema>) {
  const [o] = await tx`update office_obligations set status = 'cancelled' where id = ${d.obligationId} and status = 'open' returning description, amount`;
  if (!o) throw new UserError('Open obligation not found.');
  await audit(tx, actor, { action: 'obligation.cancel', entityType: 'office_obligation', entityId: d.obligationId, summary: `Cancelled obligation ${o.description} (${o.amount})`, reason: d.reason });
}

export async function saveBudget(tx: Tx, actor: Actor, d: z.infer<typeof budgetSchema>) {
  await tx`insert into budgets (office_id, category_id, month, amount) values (${actor.officeId}, ${d.categoryId}, ${`${d.month}-01`}, ${d.amount})
    on conflict (office_id, category_id, month) do update set amount = excluded.amount`;
  await audit(tx, actor, { action: 'budget.set', entityType: 'budget', summary: `Set budget for ${d.month} to ${d.amount}`, after: d });
}

export async function saveCategory(tx: Tx, actor: Actor, d: z.infer<typeof categorySchema>) {
  if (d.categoryId) {
    const [c] = await tx`update finance_categories set name = case when system_key is null then ${d.name} else name end, is_active = ${d.isActive} where id = ${d.categoryId} returning id`;
    if (!c) throw new UserError('Category not found.');
  } else {
    await tx`insert into finance_categories (office_id, scope, kind, name) values (${actor.officeId}, ${d.scope}, ${d.kind}, ${d.name})`;
  }
  await audit(tx, actor, { action: 'category.save', entityType: 'finance_category', entityId: d.categoryId, summary: `Saved ${d.scope} ${d.kind} category ${d.name}` });
}

/** Reconciliation: compares the calculated balance with a counted/bank balance and posts the difference as an adjustment. */
export async function reconcileAccount(tx: Tx, actor: Actor, d: { accountId: string; countedBalance: string; txnDate: string; note: string }) {
  const [a] = await tx`select a.name, a.opening_balance + coalesce((select sum(l.signed_amount) from office_ledger l where l.account_id = a.id and l.txn_date >= a.opening_date), 0) as balance
    from office_accounts a where a.id = ${d.accountId}`;
  if (!a) throw new UserError('Account not found.');
  const [{ diff }] = await tx`select (${d.countedBalance}::numeric - ${a.balance}::numeric)::text as diff`;
  if (Number(diff) === 0) return { diff: '0.00', posted: false };
  await recordOfficeTxn(tx, actor, {
    type: 'adjustment', direction: Number(diff) > 0 ? 1 : -1, accountId: d.accountId, amount: diff.replace('-', ''), txnDate: d.txnDate,
    description: `Reconciliation adjustment (${a.name})`, notes: d.note, categoryId: undefined, reference: undefined, counterparty: undefined, toAccountId: undefined,
  });
  await audit(tx, actor, { action: 'office_account.reconcile', entityType: 'office_account', entityId: d.accountId, summary: `Reconciled ${a.name}: calculated ${a.balance}, counted ${d.countedBalance}`, reason: d.note });
  return { diff, posted: true };
}
