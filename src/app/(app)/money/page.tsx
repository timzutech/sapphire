import { randomUUID } from 'node:crypto';
import { ArrowDownRight, ArrowUpRight, Landmark, PiggyBank, Plus, Receipt, Scale, Wallet } from 'lucide-react';
import { BarsChart } from '@/components/charts/charts';
import { SERIES_COLORS } from '@/lib/chart-colors';
import { ExpenseFields, PersonalTxnFields } from '@/components/forms/finance-forms';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect } from '@/components/ui/filters';
import { FormGrid, Input, MoneyInput, Select } from '@/components/ui/form';
import { EmptyState, MetricNote, Notice, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { RangeFilter } from '@/components/ui/range-filter';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { addMonths, resolveRange } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import {
  correctPersonalTxnAction, deletePersonalTxnAction, expenseActionAction, saveExpenseAction, savePersonalAccountAction, savePersonalTxnAction,
  submitPersonalTxnAction, withdrawPersonalTxnAction,
} from '@/server/actions/finance';
import { memberPage, type SearchParams } from '@/server/page';
import { categoryOptions, officeNow } from '@/server/queries/common';
import { personalBalances, personalMonthly, personalTotals } from '@/server/queries/finance';
import { ensureDefaultAccounts } from '@/server/services/personal-finance';

export const metadata = { title: 'My Money' };

export default async function MoneyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = str(sp, 'tab') === 'claims' ? 'claims' : 'transactions';
  const { session, fmt, load } = await memberPage();
  const me = session.userId;
  const d = await load(async (tx) => {
    await ensureDefaultAccounts(tx, session);
    const now = await officeNow(tx, session.officeId);
    const range = resolveRange({ range: str(sp, 'range'), from: str(sp, 'from'), to: str(sp, 'to') }, now.today);
    const totals = await personalTotals(tx, session.officeId, me, range.from, range.to);
    const accounts = await personalBalances(tx, session.officeId, me);
    const monthly = await personalMonthly(tx, session.officeId, me, addMonths(now.today, -5), now.today);
    const categories = await categoryOptions(tx, session.officeId, 'personal');
    const [{ saved }] = await tx`select coalesce(sum(l.signed_amount), 0) as saved from personal_ledger l join personal_accounts a on a.id = l.account_id
      where a.user_id = ${me} and a.office_id = ${session.officeId} and a.kind = 'savings' and l.txn_date between ${range.from} and ${range.to}`;
    const type = str(sp, 'type');
    const status = str(sp, 'status');
    const { page, limit, offset } = pageOf(sp, 20);
    const where = tx`t.office_id = ${session.officeId} and t.user_id = ${me} and t.txn_date between ${range.from} and ${range.to}
      ${type ? tx`and t.type = ${type}` : tx``} ${status ? tx`and t.status = ${status}` : tx``}`;
    const [{ total }] = await tx`select count(*)::int as total from personal_transactions t where ${where}`;
    const txns = await tx`select t.*, t.txn_date::text as d, a.name as account, ta.name as to_account, c.name as category,
        exists (select 1 from personal_transactions r where r.reverses_id = t.id) as corrected
      from personal_transactions t join personal_accounts a on a.id = t.account_id left join personal_accounts ta on ta.id = t.to_account_id
      left join finance_categories c on c.id = t.category_id where ${where} order by t.txn_date desc, t.created_at desc limit ${limit} offset ${offset}`;
    const claims = tab === 'claims'
      ? await tx`select e.*, e.expense_date::text as d, c.name as category from expenses e join finance_categories c on c.id = e.category_id
          where e.office_id = ${session.officeId} and e.submitted_by = ${me} order by e.created_at desc limit 50`
      : [];
    const expenseCats = tab === 'claims' ? await categoryOptions(tx, session.officeId, 'office', 'expense') : [];
    return { now, range, totals, accounts, monthly, categories, saved, txns, total, page, claims, expenseCats };
  });

  const activeAccounts = d.accounts.filter((a) => !a.archived).map((a) => ({ value: a.id as string, label: a.name as string }));
  const totalBalance = d.accounts.reduce((s, a) => s + Number(a.balance), 0);
  const savings = d.accounts.filter((a) => a.kind === 'savings').reduce((s, a) => s + Number(a.balance), 0);
  const chart = d.monthly.map((m) => ({ month: formatDate(`${m.month}-01`, fmt.locale, 'short').split(' ').slice(1).join(' ') || m.month, income: m.income, expenses: m.expenses }));
  const addTxn = (
    <FormDialog action={savePersonalTxnAction} title="Record a transaction" trigger={<><Plus className="size-4" />Record transaction</>} submitLabel="Save">
      <PersonalTxnFields accounts={activeAccounts} categories={d.categories} today={d.now.today} currency={fmt.currency} token={randomUUID()} />
    </FormDialog>
  );

  return (
    <>
      <PageHeader title="My Money" description="Track what you earn, spend and save. Balances are calculated from your own records — this is not connected to a bank." actions={addTxn} />
      <RangeFilter range={d.range.preset} from={d.range.from} to={d.range.to} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Income (period)" value={formatMoney(d.totals.income, fmt)} icon={ArrowUpRight} tone="good" hint={`${formatMoney(d.totals.verifiedIncome, fmt, { compact: true })} verified`} />
        <StatCard label="Expenses (period)" value={formatMoney(d.totals.expenses, fmt)} icon={ArrowDownRight} tone="warning" />
        <StatCard label="Net cash flow (period)" value={formatMoney(d.totals.net, fmt)} icon={Scale} tone={Number(d.totals.net) < 0 ? 'critical' : 'brand'} hint="Income − expenses" />
        <StatCard label="Recorded balance (now)" value={formatMoney(totalBalance, fmt)} icon={Wallet} hint={`Savings ${formatMoney(savings, fmt, { compact: true })} · +${formatMoney(d.saved, fmt, { compact: true })} this period`} />
      </div>
      <MetricNote>Period totals cover {formatDate(d.range.from, fmt.locale)} – {formatDate(d.range.to, fmt.locale)} and exclude transfers between your accounts and rejected records. Recorded balance = each account’s opening balance + every non-rejected transaction dated on/after its opening date (lifetime, not period).</MetricNote>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Income vs expenses" description="Last 6 months" />
          <CardBody>
            {chart.length === 0 ? <EmptyState compact icon={Landmark} title="No transactions yet" description="Record income or expenses to see your trend." /> : (
              <BarsChart ariaLabel="Monthly income and expenses" data={chart} xKey="month" xLabel="Month" format={{ kind: 'money', currency: fmt.currency, locale: fmt.locale }}
                series={[{ key: 'income', label: 'Income', color: SERIES_COLORS[0] }, { key: 'expenses', label: 'Expenses', color: SERIES_COLORS[1] }]} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Accounts" description="Opening balance + recorded transactions" action={
            <FormDialog action={savePersonalAccountAction} title="Add account" trigger={<Plus className="size-4" />} triggerLabel="Add account" triggerVariant="ghost" triggerSize="sm" size="sm">
              <AccountFields today={d.now.today} currency={fmt.currency} />
            </FormDialog>
          } />
          <ul className="divide-y divide-slate-100">
            {d.accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-500">{a.kind === 'savings' ? <PiggyBank className="size-4" /> : <Wallet className="size-4" />}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{a.name}</p>
                    <p className="text-xs text-slate-500">Opening {formatMoney(a.opening_balance, fmt, { compact: true })} on {formatDate(a.opening_date, fmt.locale, 'short')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="tabular text-sm font-semibold text-slate-900">{formatMoney(a.balance, fmt)}</span>
                  <FormDialog action={savePersonalAccountAction} title={`Edit ${a.name}`} trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="sm" hidden={{ accountId: a.id }}>
                    <AccountFields today={d.now.today} currency={fmt.currency} defaults={{ name: a.name, kind: a.kind, openingBalance: a.opening_balance, openingDate: a.opening_date }} />
                  </FormDialog>
                </div>
              </li>
            ))}
          </ul>
          {d.accounts.some((a) => Number(a.before_opening) !== 0) ? <div className="px-5 pb-4"><Notice tone="info">Some transactions are dated before an account’s opening date and are treated as already included in its opening balance.</Notice></div> : null}
        </Card>
      </div>

      <div className="mt-6">
        <LinkTabs base="/money" params={sp} tabs={[{ value: 'transactions', label: 'Transactions', count: d.total }, { value: 'claims', label: 'Office expense claims' }]} current={tab} />
        {tab === 'transactions' ? (
          <Card>
            <CardHeader title="Transactions" description="Unverified and rejected records can be edited or deleted. Verified records are locked — record a correction instead." action={<TxnFilter sp={sp} />} />
            {d.txns.length === 0 ? (
              <EmptyState icon={Receipt} title="No transactions in this period" description="Record your first income or expense to start tracking." action={addTxn} />
            ) : (
              <>
                <Table>
                  <THead><tr><Th>Date</Th><Th>Description</Th><Th>Account</Th><Th align="right">Amount</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                  <TBody>
                    {d.txns.map((t) => {
                      const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : 0;
                      const signed = Number(t.amount) * t.direction * sign;
                      const editable = (t.status === 'recorded' || t.status === 'rejected') && !t.reverses_id && !t.corrected;
                      return (
                        <Tr key={t.id}>
                          <Td className="whitespace-nowrap">{formatDate(t.d, fmt.locale)}</Td>
                          <Td>
                            <div className="font-medium text-slate-900">{t.description}</div>
                            <div className="text-xs text-slate-500">{t.type === 'transfer' ? `Transfer → ${t.to_account}` : t.category ?? 'Uncategorised'}{t.reverses_id ? ' · correction entry' : ''}{t.review_note ? ` · “${t.review_note}”` : ''}</div>
                          </Td>
                          <Td className="text-xs">{t.account}</Td>
                          <Td align="right" className={signed > 0 ? 'text-emerald-700' : signed < 0 ? 'text-slate-900' : 'text-slate-500'}>
                            {sign === 0 ? formatMoney(t.amount, fmt) : `${signed > 0 ? '+' : '−'}${formatMoney(Math.abs(signed), fmt)}`}
                          </Td>
                          <Td>{t.corrected ? <StatusBadge status="cancelled" label="Corrected" /> : <StatusBadge status={t.status} label={t.status === 'approved' ? 'Verified' : undefined} />}</Td>
                          <Td align="right">
                            <div className="flex justify-end gap-1">
                              {editable ? (
                                <>
                                  <FormDialog action={savePersonalTxnAction} title="Edit transaction" trigger="Edit" triggerVariant="ghost" triggerSize="sm">
                                    <PersonalTxnFields accounts={activeAccounts} categories={d.categories} today={d.now.today} currency={fmt.currency} token={t.client_token}
                                      defaults={{ txnId: t.id, type: t.type, accountId: t.account_id, toAccountId: t.to_account_id, amount: t.amount, categoryId: t.category_id, txnDate: t.d, description: t.description, notes: t.notes, status: t.status }} />
                                  </FormDialog>
                                  {t.type !== 'transfer' ? <ActionButton action={submitPersonalTxnAction} fields={{ txnId: t.id }} variant="ghost">Submit</ActionButton> : null}
                                  <ActionButton action={deletePersonalTxnAction} fields={{ txnId: t.id }} variant="ghost" confirm="This permanently deletes the unverified record." confirmTitle="Delete transaction?" confirmLabel="Delete">Delete</ActionButton>
                                </>
                              ) : null}
                              {t.status === 'pending' ? <ActionButton action={withdrawPersonalTxnAction} fields={{ txnId: t.id }} variant="ghost">Withdraw</ActionButton> : null}
                              {t.status === 'approved' && !t.corrected && !t.reverses_id ? (
                                <ActionButton action={correctPersonalTxnAction} fields={{ txnId: t.id, clientToken: randomUUID() }} variant="ghost" reasonName="reason" confirmTitle="Record a correction"
                                  confirm="Verified records cannot be edited. A correction entry of the opposite sign will be added so this record nets to zero; you can then record the right figures.">Correct</ActionButton>
                              ) : null}
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
                <Pagination base="/money" params={sp} page={d.page} pageSize={20} total={d.total} />
              </>
            )}
          </Card>
        ) : (
          <Card>
            <CardHeader title="Office expense claims" description="Spent your own money on office business? Submit a claim for reimbursement." action={
              <FormDialog action={saveExpenseAction} title="New expense claim" trigger={<><Plus className="size-4" />New claim</>} submitLabel="Save claim">
                <ExpenseFields categories={d.expenseCats} today={d.now.today} currency={fmt.currency} showResponsible={false} />
              </FormDialog>
            } />
            {d.claims.length === 0 ? <EmptyState icon={Receipt} title="No claims yet" /> : (
              <Table>
                <THead><tr><Th>Date</Th><Th>Title</Th><Th align="right">Amount</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                <TBody>
                  {d.claims.map((e) => (
                    <Tr key={e.id}>
                      <Td>{formatDate(e.d, fmt.locale)}</Td>
                      <Td><div className="font-medium text-slate-900">{e.title}</div><div className="text-xs text-slate-500">{e.category}{e.attachment_id ? ' · receipt attached' : ''}</div></Td>
                      <Td align="right">{formatMoney(e.amount, fmt)}</Td>
                      <Td><StatusBadge status={e.status} /></Td>
                      <Td align="right">
                        <div className="flex justify-end gap-1">
                          {e.status === 'draft' || e.status === 'rejected' ? <ActionButton action={expenseActionAction} fields={{ expenseId: e.id, action: 'submit' }} variant="ghost">Submit</ActionButton> : null}
                          {e.status === 'pending' ? <ActionButton action={expenseActionAction} fields={{ expenseId: e.id, action: 'withdraw' }} variant="ghost">Withdraw</ActionButton> : null}
                          {e.status === 'draft' || e.status === 'rejected' ? <ActionButton action={expenseActionAction} fields={{ expenseId: e.id, action: 'delete' }} variant="ghost" confirm="Delete this claim?" confirmLabel="Delete">Delete</ActionButton> : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function TxnFilter({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  return (
    <FilterBar>
      <FilterSelect name="type" label="Type" defaultValue={str(sp, 'type')} options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'transfer', label: 'Transfer' }]} />
      <FilterSelect name="status" label="Status" defaultValue={str(sp, 'status')} options={[{ value: 'recorded', label: 'Unverified' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }]} />
    </FilterBar>
  );
}

function AccountFields({ today, currency, defaults }: { today: string; currency: string; defaults?: { name: string; kind: string; openingBalance: string; openingDate: string } }) {
  return (
    <FormGrid>
      <Input name="name" label="Name" required maxLength={60} defaultValue={defaults?.name} wrapperClassName="sm:col-span-2" />
      <Select name="kind" label="Kind" options={[{ value: 'cash', label: 'Cash / spending' }, { value: 'savings', label: 'Savings' }, { value: 'other', label: 'Other' }]} defaultValue={defaults?.kind ?? 'cash'} />
      <MoneyInput name="openingBalance" label="Opening balance" currency={currency} defaultValue={defaults?.openingBalance ?? '0'} hint="Can be negative for debts" />
      <Input name="openingDate" type="date" label="Opening date" required defaultValue={defaults?.openingDate ?? today} wrapperClassName="sm:col-span-2" hint="Transactions dated before this are treated as included in the opening balance." />
    </FormGrid>
  );
}

