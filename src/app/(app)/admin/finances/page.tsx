import { Download, Landmark, Plus } from 'lucide-react';
import { BarsChart, RankBars } from '@/components/charts/charts';
import { OfficeTxnFields } from '@/components/forms/finance-forms';
import { ActionButton } from '@/components/ui/action-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect } from '@/components/ui/filters';
import { FormGrid, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { EmptyState, MetricNote, Notice, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { RangeFilter } from '@/components/ui/range-filter';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { SERIES_COLORS } from '@/lib/chart-colors';
import { addMonths, resolveRange, startOfMonth } from '@/lib/dates';
import { formatDate, formatMoney, humanize } from '@/lib/format';
import {
  cancelObligationAction, createObligationAction, reconcileAccountAction, recordOfficeTxnAction, reverseOfficeTxnAction, reviewPersonalTxnAction,
  saveBudgetAction, saveOfficeAccountAction, settleObligationAction,
} from '@/server/actions/finance';
import { adminPage, type SearchParams } from '@/server/page';
import { categoryOptions, officeAccountOptions, officeNow } from '@/server/queries/common';
import { officeBalances, officeMonthly, officeObligationTotals, officeTotals } from '@/server/queries/finance';


export const metadata = { title: 'Office Finances' };

export default async function AdminFinances({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = str(sp, 'tab') ?? 'overview';
  const { session, fmt, load } = await adminPage();
  const { page, limit, offset } = pageOf(sp, 25);
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const range = resolveRange({ range: str(sp, 'range'), from: str(sp, 'from'), to: str(sp, 'to') }, today);
    const balances = await officeBalances(tx, session.officeId);
    const accounts = await officeAccountOptions(tx, session.officeId);
    const categories = await categoryOptions(tx, session.officeId, 'office');
    const totals = await officeTotals(tx, session.officeId, range.from, range.to);
    const obligationTotals = await officeObligationTotals(tx, session.officeId);
    const r: Record<string, unknown> = {};
    if (tab === 'overview') {
      r.monthly = await officeMonthly(tx, session.officeId, addMonths(today, -11), today);
      r.byCategory = await tx`select c.name, sum(t.direction * t.amount)::float8 as v from office_transactions t join finance_categories c on c.id = t.category_id
        where t.office_id = ${session.officeId} and t.type = 'expense' and t.txn_date between ${range.from} and ${range.to} group by c.name having sum(t.direction * t.amount) <> 0 order by v desc`;
    }
    if (tab === 'transactions') {
      const type = str(sp, 'type');
      const acct = str(sp, 'account');
      const where = tx`t.office_id = ${session.officeId} and t.txn_date between ${range.from} and ${range.to} ${type ? tx`and t.type = ${type}` : tx``} ${acct ? tx`and (t.account_id = ${acct} or t.to_account_id = ${acct})` : tx``}`;
      r.total = (await tx`select count(*)::int as n from office_transactions t where ${where}`)[0].n;
      r.txns = await tx`select t.*, t.txn_date::text as d, a.name as account, ta.name as to_account, c.name as category, u.full_name as recorder,
          exists (select 1 from office_transactions x where x.reverses_id = t.id) as reversed
        from office_transactions t join office_accounts a on a.id = t.account_id left join office_accounts ta on ta.id = t.to_account_id
        left join finance_categories c on c.id = t.category_id join users u on u.id = t.recorded_by where ${where}
        order by t.txn_date desc, t.created_at desc limit ${limit} offset ${offset}`;
    }
    if (tab === 'verifications') {
      r.pending = await tx`select t.*, t.txn_date::text as d, u.full_name, c.name as category from personal_transactions t join users u on u.id = t.user_id
        left join finance_categories c on c.id = t.category_id where t.office_id = ${session.officeId} and t.status = 'pending' and t.user_id <> ${session.userId} order by t.created_at`;
    }
    if (tab === 'obligations') {
      r.obligations = await tx`select o.*, o.due_date::text as due from office_obligations o where o.office_id = ${session.officeId} order by o.status = 'open' desc, o.due_date nulls last`;
    }
    if (tab === 'budgets') {
      const month = str(sp, 'month') && /^\d{4}-\d{2}$/.test(str(sp, 'month')!) ? `${str(sp, 'month')}-01` : startOfMonth(today);
      r.month = month;
      r.budgets = await tx`select c.id, c.name, coalesce(b.amount, 0)::float8 as budget,
          coalesce((select sum(t.direction * t.amount) from office_transactions t where t.category_id = c.id and t.type = 'expense' and date_trunc('month', t.txn_date) = ${month}::date), 0)::float8 as actual
        from finance_categories c left join budgets b on b.category_id = c.id and b.month = ${month}
        where c.office_id = ${session.officeId} and c.scope = 'office' and c.kind = 'expense' and c.is_active order by c.name`;
    }
    return { today, range, balances, accounts, categories, totals, obligationTotals, ...r };
  });
  const cash = d.balances.reduce((s, b) => s + Number(b.balance), 0);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const x = d as any;
  return (
    <>
      <PageHeader title="Office finances" description="The office’s own books — separate from members’ personal finances. Entries are append-only: corrections are made with reversals."
        actions={<>
          <LinkButton href={`/api/export/office-transactions?from=${d.range.from}&to=${d.range.to}`} variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={recordOfficeTxnAction} title="Record office transaction" trigger={<><Plus className="size-4" />Record transaction</>} size="lg">
            <OfficeTxnFields accounts={d.accounts} categories={d.categories} today={d.today} currency={fmt.currency} />
          </FormDialog>
        </>} />
      <RangeFilter range={d.range.preset} from={d.range.from} to={d.range.to} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Income (period)" value={formatMoney(d.totals.income, fmt)} hint={`incl. ${formatMoney(d.totals.fines, fmt, { compact: true })} fine collections`} />
        <StatCard label="Expenses (period)" value={formatMoney(d.totals.expenses, fmt)} hint={`Training ${formatMoney(d.totals.training, fmt, { compact: true })} · Incentives ${formatMoney(d.totals.incentives, fmt, { compact: true })}`} />
        <StatCard label="Net (period)" value={formatMoney(d.totals.net, fmt)} tone={Number(d.totals.net) < 0 ? 'critical' : 'good'} />
        <StatCard label="Recorded cash balance (now)" value={formatMoney(cash, fmt)} icon={Landmark} tone="brand" />
      </div>
      <MetricNote>Income/expenses exclude transfers between office accounts and reconciliation adjustments; reversals carry the opposite sign and cancel the original. Members’ personal income is never counted as office revenue.</MetricNote>

      <div className="mt-6">
        <LinkTabs base="/admin/finances" params={sp} current={tab} tabs={[
          { value: 'overview', label: 'Overview' }, { value: 'transactions', label: 'Ledger' }, { value: 'verifications', label: 'Member verifications' },
          { value: 'obligations', label: 'Receivables & payables' }, { value: 'budgets', label: 'Budget vs actual' },
        ]} />

        {tab === 'overview' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Monthly income vs expenses" description="Last 12 months" />
              <CardBody>
                {x.monthly.length === 0 ? <EmptyState compact title="No transactions yet" /> : (
                  <BarsChart ariaLabel="Office income and expenses per month" data={x.monthly.map((m: any) => ({ ...m, label: m.month }))} xKey="label" xLabel="Month" format={{ kind: 'money', currency: fmt.currency, locale: fmt.locale }}
                    series={[{ key: 'income', label: 'Income', color: SERIES_COLORS[0] }, { key: 'expenses', label: 'Expenses', color: SERIES_COLORS[1] }]} />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Accounts" description="Opening balance + entries on/after opening date" action={
                <FormDialog action={saveOfficeAccountAction} title="Add office account" trigger={<Plus className="size-4" />} triggerLabel="Add account" triggerVariant="ghost" triggerSize="sm" size="sm">
                  <OfficeAccountFields today={d.today} currency={fmt.currency} />
                </FormDialog>} />
              <ul className="divide-y divide-slate-100">
                {d.balances.map((b) => (
                  <li key={b.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-900">{b.name}</span><span className="tabular text-sm font-semibold">{formatMoney(b.balance, fmt)}</span></div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{humanize(b.kind)} · opening {formatMoney(b.opening_balance, fmt, { compact: true })} on {formatDate(b.opening_date, fmt.locale, 'short')}</span>
                      <span className="flex">
                        <FormDialog action={reconcileAccountAction} title={`Reconcile ${b.name}`} trigger="Reconcile" triggerVariant="ghost" triggerSize="sm" hidden={{ accountId: b.id }} size="sm"
                          description={`Calculated balance: ${formatMoney(b.balance, fmt)}. Enter the counted cash or bank statement balance; any difference is posted as an audited adjustment.`}>
                          <MoneyInput name="countedBalance" label="Counted / statement balance" required currency={fmt.currency} />
                          <Input name="txnDate" type="date" label="As of" required defaultValue={d.today} />
                          <Textarea name="note" label="Explanation" required rows={2} />
                        </FormDialog>
                        <FormDialog action={saveOfficeAccountAction} title={`Edit ${b.name}`} trigger="Edit" triggerVariant="ghost" triggerSize="sm" hidden={{ accountId: b.id }} size="sm">
                          <OfficeAccountFields today={d.today} currency={fmt.currency} defaults={{ name: b.name, kind: b.kind, openingBalance: b.opening_balance, openingDate: b.opening_date }} />
                        </FormDialog>
                      </span>
                    </div>
                    {b.before_opening ? <p className="mt-1 text-xs text-amber-700">{b.before_opening} entr{b.before_opening === 1 ? 'y is' : 'ies are'} dated before the opening date and excluded.</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Expenses by category (period)" />
              <CardBody>{x.byCategory.length === 0 ? <EmptyState compact title="No expenses in this period" /> : <RankBars ariaLabel="Expenses by category" items={x.byCategory.map((c: any) => ({ label: c.name, value: c.v }))} format={{ kind: 'money', currency: fmt.currency, locale: fmt.locale }} />}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Owed to / by the office" />
              <CardBody className="space-y-2 text-sm">
                <Row label="Outstanding member fines" v={formatMoney(d.obligationTotals.fines_outstanding, fmt)} />
                <Row label="Open receivables" v={formatMoney(d.obligationTotals.receivables, fmt)} />
                <Row label="Open payables" v={formatMoney(d.obligationTotals.payables, fmt)} />
                <Row label="Approved expenses not yet paid" v={formatMoney(d.obligationTotals.approved_unpaid, fmt)} />
              </CardBody>
            </Card>
          </div>
        ) : null}

        {tab === 'transactions' ? (
          <Card>
            <CardHeader title="Ledger" action={
              <FilterBar>
                <FilterSelect name="type" label="Type" defaultValue={str(sp, 'type')} options={['income', 'expense', 'transfer', 'adjustment'].map((v) => ({ value: v, label: humanize(v) }))} />
                <FilterSelect name="account" label="Account" defaultValue={str(sp, 'account')} options={d.accounts} />
              </FilterBar>} />
            {x.txns.length === 0 ? <EmptyState icon={Landmark} title="No entries in this period" /> : (
              <>
                <Table>
                  <THead><tr><Th>Date</Th><Th>Description</Th><Th>Account</Th><Th align="right">Amount</Th><Th>Recorded by</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                  <TBody>{x.txns.map((t: any) => {
                    const sign = t.type === 'income' ? 1 : t.type === 'expense' ? -1 : t.type === 'adjustment' ? 1 : 0;
                    const v = Number(t.amount) * t.direction * sign;
                    return (
                      <Tr key={t.id}>
                        <Td className="whitespace-nowrap">{formatDate(t.d, fmt.locale)}</Td>
                        <Td><div className="font-medium text-slate-900">{t.description}</div><div className="text-xs text-slate-500">{[humanize(t.type), t.category, t.counterparty, t.reference].filter(Boolean).join(' · ')}{t.expense_id ? ' · linked expense' : ''}{t.fine_payment_id ? ' · fine payment' : ''}</div>{t.notes ? <div className="text-xs text-slate-400">{t.notes}</div> : null}</Td>
                        <Td className="text-xs">{t.account}{t.to_account ? ` → ${t.to_account}` : ''}</Td>
                        <Td align="right" className={v > 0 ? 'text-emerald-700' : ''}>{sign === 0 ? formatMoney(t.amount, fmt) : `${v > 0 ? '+' : '−'}${formatMoney(Math.abs(v), fmt)}`}</Td>
                        <Td className="text-xs">{t.recorder}</Td>
                        <Td align="right">{t.reversed ? <Badge>Reversed</Badge> : t.reverses_id ? <Badge tone="info">Reversal</Badge> : (
                          <ActionButton action={reverseOfficeTxnAction} fields={{ txnId: t.id }} variant="ghost" reasonName="reason" confirmTitle="Reverse entry"
                            confirm="Office books are append-only. A reversal entry with the opposite sign will be posted today and linked to this one.">Reverse</ActionButton>
                        )}</Td>
                      </Tr>
                    );
                  })}</TBody>
                </Table>
                <Pagination base="/admin/finances" params={sp} page={page} pageSize={25} total={x.total} />
              </>
            )}
          </Card>
        ) : null}

        {tab === 'verifications' ? (
          <Card>
            <CardHeader title="Member records awaiting verification" description="Members submit personal income/expense records for verification. Approved records are locked and count as verified (e.g. for challenges). This does not move office money." />
            {x.pending.length === 0 ? <EmptyState compact title="Nothing to verify" /> : (
              <Table>
                <THead><tr><Th>Member</Th><Th>Date</Th><Th>Record</Th><Th align="right">Amount</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                <TBody>{x.pending.map((t: any) => (
                  <Tr key={t.id}>
                    <Td className="font-medium text-slate-900">{t.full_name}</Td><Td>{formatDate(t.d, fmt.locale, 'short')}</Td>
                    <Td>{t.description}<div className="text-xs text-slate-500">{humanize(t.type)} · {t.category ?? 'Uncategorised'}{t.notes ? ` · ${t.notes}` : ''}</div></Td>
                    <Td align="right">{formatMoney(t.amount, fmt)}</Td>
                    <Td align="right"><div className="flex justify-end gap-1">
                      <ActionButton action={reviewPersonalTxnAction} fields={{ txnId: t.id, decision: 'approved' }} variant="success">Verify</ActionButton>
                      <FormDialog action={reviewPersonalTxnAction} title="Reject record" trigger="Reject" triggerVariant="ghost" triggerSize="sm" hidden={{ txnId: t.id, decision: 'rejected' }} submitVariant="danger" submitLabel="Reject" size="sm">
                        <Textarea name="note" label="Reason (shared with the member)" required rows={2} />
                      </FormDialog>
                    </div></Td>
                  </Tr>
                ))}</TBody>
              </Table>
            )}
          </Card>
        ) : null}

        {tab === 'obligations' ? (
          <Card>
            <CardHeader title="Receivables & payables" description="Money owed to or by the office. Settling posts the payment to the ledger once." action={
              <FormDialog action={createObligationAction} title="Record receivable or payable" trigger={<><Plus className="size-4" />Add</>} triggerVariant="secondary" triggerSize="sm">
                <FormGrid>
                  <Select name="kind" label="Kind" options={[{ value: 'receivable', label: 'Receivable (owed to office)' }, { value: 'payable', label: 'Payable (office owes)' }]} />
                  <Input name="counterparty" label="Counterparty" required />
                  <MoneyInput name="amount" label="Amount" required currency={fmt.currency} />
                  <Input name="dueDate" type="date" label="Due date" />
                </FormGrid>
                <Input name="description" label="Description" required />
              </FormDialog>} />
            {x.obligations.length === 0 ? <EmptyState compact title="Nothing recorded" /> : (
              <Table>
                <THead><tr><Th>Kind</Th><Th>Counterparty</Th><Th align="right">Amount</Th><Th>Due</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                <TBody>{x.obligations.map((o: any) => (
                  <Tr key={o.id}>
                    <Td><Badge tone={o.kind === 'receivable' ? 'good' : 'warning'}>{humanize(o.kind)}</Badge></Td>
                    <Td><div className="font-medium text-slate-900">{o.counterparty}</div><div className="text-xs text-slate-500">{o.description}</div></Td>
                    <Td align="right">{formatMoney(o.amount, fmt)}</Td>
                    <Td className={o.status === 'open' && o.due && o.due < d.today ? 'text-red-700' : ''}>{o.due ? formatDate(o.due, fmt.locale, 'short') : '—'}</Td>
                    <Td><StatusBadge status={o.status} /></Td>
                    <Td align="right">{o.status === 'open' ? (
                      <div className="flex justify-end gap-1">
                        <FormDialog action={settleObligationAction} title={`Settle — ${o.counterparty}`} trigger="Settle" triggerVariant="ghost" triggerSize="sm" hidden={{ obligationId: o.id }} size="sm">
                          <Select name="accountId" label="Account" required options={d.accounts} />
                          <Select name="categoryId" label="Category" required options={d.categories.filter((c) => c.kind === (o.kind === 'receivable' ? 'income' : 'expense'))} placeholder="Choose…" />
                          <Input name="txnDate" type="date" label="Date" required defaultValue={d.today} />
                        </FormDialog>
                        <ActionButton action={cancelObligationAction} fields={{ obligationId: o.id }} variant="ghost" reasonName="reason" confirmTitle="Cancel obligation">Cancel</ActionButton>
                      </div>
                    ) : null}</Td>
                  </Tr>
                ))}</TBody>
              </Table>
            )}
          </Card>
        ) : null}

        {tab === 'budgets' ? (
          <Card>
            <CardHeader title={`Budget vs actual — ${formatDate(x.month, fmt.locale, 'medium').split(' ').slice(1).join(' ')}`} description="Actual = expense entries in the month (net of reversals)" action={
              <FilterBar><label className="flex flex-col gap-1 text-xs font-medium text-slate-500">Month<input type="month" name="month" defaultValue={x.month.slice(0, 7)} className="h-9 rounded-lg border border-slate-200 px-2.5 text-sm" /></label>
                <button type="submit" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm">Go</button></FilterBar>} />
            <CardBody>
              <RankBars ariaLabel="Budget versus actual by category" items={x.budgets.map((b: any) => ({ label: b.name, value: b.actual, compare: b.budget }))} format={{ kind: 'money', currency: fmt.currency, locale: fmt.locale }} compare={{ label: 'Budget', valueLabel: 'Actual spend' }} />
              {x.budgets.some((b: any) => b.budget > 0 && b.actual > b.budget) ? <div className="mt-4"><Notice tone="warning">Some categories are over budget this month.</Notice></div> : null}
            </CardBody>
            <Table>
              <THead><tr><Th>Category</Th><Th align="right">Budget</Th><Th align="right">Actual</Th><Th align="right">Remaining</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>{x.budgets.map((b: any) => (
                <Tr key={b.id}><Td>{b.name}</Td><Td align="right">{formatMoney(b.budget, fmt)}</Td><Td align="right">{formatMoney(b.actual, fmt)}</Td>
                  <Td align="right" className={b.budget - b.actual < 0 ? 'text-red-700' : ''}>{b.budget ? formatMoney(b.budget - b.actual, fmt) : '—'}</Td>
                  <Td align="right"><FormDialog action={saveBudgetAction} title={`Budget — ${b.name}`} trigger="Set budget" triggerVariant="ghost" triggerSize="sm" hidden={{ categoryId: b.id, month: x.month.slice(0, 7) }} size="sm">
                    <MoneyInput name="amount" label="Budget for the month" required currency={fmt.currency} defaultValue={String(b.budget)} />
                  </FormDialog></Td></Tr>
              ))}</TBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return <div className="flex justify-between gap-3"><span className="text-slate-600">{label}</span><span className="tabular font-medium">{v}</span></div>;
}

function OfficeAccountFields({ today, currency, defaults }: { today: string; currency: string; defaults?: { name: string; kind: string; openingBalance: string; openingDate: string } }) {
  return (
    <FormGrid>
      <Input name="name" label="Name" required defaultValue={defaults?.name} wrapperClassName="sm:col-span-2" />
      <Select name="kind" label="Kind" defaultValue={defaults?.kind ?? 'bank'} options={[{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank' }, { value: 'mobile_money', label: 'Mobile money' }, { value: 'other', label: 'Other' }]} />
      <MoneyInput name="openingBalance" label="Opening balance" currency={currency} defaultValue={defaults?.openingBalance ?? '0'} />
      <Input name="openingDate" type="date" label="Opening date" required defaultValue={defaults?.openingDate ?? today} wrapperClassName="sm:col-span-2" hint="Entries before this date are treated as included in the opening balance." />
    </FormGrid>
  );
}
