import 'server-only';
import type { Tx } from '../db';

/** Period totals for a member's personal ledger. Transfers are excluded from income/expense; rejected rows ignored. */
export async function personalTotals(tx: Tx, officeId: string, userId: string, from: string, to: string) {
  const [r] = await tx`select
      coalesce(sum(direction * amount) filter (where type = 'income'), 0) as income,
      coalesce(sum(direction * amount) filter (where type = 'expense'), 0) as expenses,
      coalesce(sum(direction * amount) filter (where type = 'income' and status = 'approved'), 0) as verified_income,
      coalesce(sum(direction * amount) filter (where type = 'income'), 0) - coalesce(sum(direction * amount) filter (where type = 'expense'), 0) as net
    from personal_transactions where office_id = ${officeId} and user_id = ${userId} and status <> 'rejected' and txn_date between ${from} and ${to}`;
  return { income: r.income as string, expenses: r.expenses as string, net: r.net as string, verifiedIncome: r.verified_income as string };
}

export async function personalBalances(tx: Tx, officeId: string, userId: string) {
  return tx`select a.id, a.name, a.kind, a.opening_balance, a.opening_date::text as opening_date, a.archived,
      a.opening_balance + coalesce((select sum(l.signed_amount) from personal_ledger l where l.account_id = a.id and l.txn_date >= a.opening_date), 0) as balance,
      coalesce((select sum(l.signed_amount) from personal_ledger l where l.account_id = a.id and l.txn_date < a.opening_date), 0) as before_opening
    from personal_accounts a where a.office_id = ${officeId} and a.user_id = ${userId} order by a.archived, a.kind, a.name`;
}

export async function personalMonthly(tx: Tx, officeId: string, userId: string, from: string, to: string) {
  return tx`select to_char(date_trunc('month', txn_date), 'YYYY-MM') as month,
      coalesce(sum(direction * amount) filter (where type = 'income'), 0)::float8 as income,
      coalesce(sum(direction * amount) filter (where type = 'expense'), 0)::float8 as expenses
    from personal_transactions where office_id = ${officeId} and user_id = ${userId} and status <> 'rejected' and txn_date between ${from} and ${to}
    group by 1 order by 1`;
}

/** Office account balances: opening balance + ledger entries dated on/after the opening date. */
export async function officeBalances(tx: Tx, officeId: string) {
  return tx`select a.id, a.name, a.kind, a.opening_balance, a.opening_date::text as opening_date,
      a.opening_balance + coalesce((select sum(l.signed_amount) from office_ledger l where l.account_id = a.id and l.txn_date >= a.opening_date), 0) as balance,
      (select count(*)::int from office_ledger l where l.account_id = a.id and l.txn_date < a.opening_date) as before_opening
    from office_accounts a where a.office_id = ${officeId} and not a.archived order by a.name`;
}

export async function officeTotals(tx: Tx, officeId: string, from: string, to: string) {
  const [r] = await tx`select
      coalesce(sum(t.direction * t.amount) filter (where type = 'income'), 0) as income,
      coalesce(sum(t.direction * t.amount) filter (where type = 'expense'), 0) as expenses,
      coalesce(sum(t.direction * t.amount) filter (where type = 'income' and fine_payment_id is not null), 0) as fines,
      coalesce(sum(t.direction * t.amount) filter (where type = 'expense' and c.name = 'Incentives & rewards'), 0) as incentives,
      coalesce(sum(t.direction * t.amount) filter (where type = 'expense' and c.name = 'Training'), 0) as training,
      coalesce(sum(t.direction * t.amount) filter (where type = 'income'), 0) - coalesce(sum(t.direction * t.amount) filter (where type = 'expense'), 0) as net
    from office_transactions t left join finance_categories c on c.id = t.category_id
    where t.office_id = ${officeId} and t.txn_date between ${from} and ${to}`;
  return { income: r.income as string, expenses: r.expenses as string, net: r.net as string, fines: r.fines as string, incentives: r.incentives as string, training: r.training as string };
}

export async function officeMonthly(tx: Tx, officeId: string, from: string, to: string) {
  return tx`select to_char(date_trunc('month', txn_date), 'YYYY-MM') as month,
      coalesce(sum(direction * amount) filter (where type = 'income'), 0)::float8 as income,
      coalesce(sum(direction * amount) filter (where type = 'expense'), 0)::float8 as expenses
    from office_transactions where office_id = ${officeId} and txn_date between ${from} and ${to} group by 1 order by 1`;
}

/** Receivables = open receivable obligations + outstanding member fines. Payables = open payables + approved-but-unpaid expenses. */
export async function officeObligationTotals(tx: Tx, officeId: string) {
  const [r] = await tx`select
    coalesce((select sum(amount) from office_obligations where office_id = ${officeId} and kind = 'receivable' and status = 'open'), 0) as receivables,
    coalesce((select sum(f.amount - app.fine_paid_total(f.id)) from fines f where f.office_id = ${officeId} and f.status in ('pending', 'partially_paid', 'disputed')), 0) as fines_outstanding,
    coalesce((select sum(amount) from office_obligations where office_id = ${officeId} and kind = 'payable' and status = 'open'), 0) as payables,
    coalesce((select sum(amount) from expenses where office_id = ${officeId} and status = 'approved'), 0) as approved_unpaid`;
  return r as { receivables: string; fines_outstanding: string; payables: string; approved_unpaid: string };
}

export async function myOutstandingFines(tx: Tx, officeId: string, userId: string) {
  const [r] = await tx`select coalesce(sum(f.amount - app.fine_paid_total(f.id)), 0) as outstanding, count(*)::int as n
    from fines f where f.office_id = ${officeId} and f.user_id = ${userId} and f.status in ('pending', 'partially_paid', 'disputed')`;
  return { outstanding: r.outstanding as string, count: r.n as number };
}
