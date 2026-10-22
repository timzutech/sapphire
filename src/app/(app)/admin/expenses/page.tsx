import { Download, Paperclip, Plus, Receipt } from 'lucide-react';
import { RankBars } from '@/components/charts/charts';
import { ExpenseFields } from '@/components/forms/finance-forms';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { Pagination, pageOf, str } from '@/components/ui/nav';
import { RangeFilter } from '@/components/ui/range-filter';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { resolveRange } from '@/lib/dates';
import { formatDate, formatMoney } from '@/lib/format';
import { expenseActionAction, saveExpenseAction } from '@/server/actions/finance';
import { adminPage, type SearchParams } from '@/server/page';
import { categoryOptions, memberOptions, officeAccountOptions, officeNow } from '@/server/queries/common';

export const metadata = { title: 'Expenses' };

export default async function AdminExpenses({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await adminPage();
  const { page, limit, offset } = pageOf(sp, 25);
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const range = resolveRange({ range: str(sp, 'range') ?? 'last_90', from: str(sp, 'from'), to: str(sp, 'to') }, today);
    const status = str(sp, 'status');
    const cat = str(sp, 'category');
    const q = str(sp, 'q') ? `%${str(sp, 'q')!.replace(/[%_]/g, '')}%` : null;
    const where = tx`e.office_id = ${session.officeId} and e.expense_date between ${range.from} and ${range.to}
      ${status ? tx`and e.status = ${status}` : tx``} ${cat ? tx`and e.category_id = ${cat}` : tx``} ${q ? tx`and (e.title ilike ${q} or e.vendor ilike ${q})` : tx``}`;
    const [{ total }] = await tx`select count(*)::int as total from expenses e where ${where}`;
    const rows = await tx`select e.*, e.expense_date::text as d, c.name as category, s.full_name as submitter, r.full_name as responsible, a.filename,
        (select string_agg(x.action || coalesce(': ' || x.note, ''), ' → ' order by x.created_at) from expense_approvals x where x.expense_id = e.id) as trail
      from expenses e join finance_categories c on c.id = e.category_id join users s on s.id = e.submitted_by left join users r on r.id = e.responsible_user_id
      left join attachments a on a.id = e.attachment_id where ${where} order by e.status = 'pending' desc, e.expense_date desc limit ${limit} offset ${offset}`;
    const [sum] = await tx`select coalesce(sum(amount) filter (where status = 'pending'), 0) as pending, count(*) filter (where status = 'pending')::int as pending_n,
        coalesce(sum(amount) filter (where status = 'approved'), 0) as approved, coalesce(sum(amount) filter (where status = 'paid'), 0) as paid
      from expenses e where e.office_id = ${session.officeId} and e.expense_date between ${range.from} and ${range.to}`;
    const byMonth = await tx`select to_char(date_trunc('month', expense_date), 'YYYY-MM') as m, sum(amount)::float8 as v from expenses
      where office_id = ${session.officeId} and status in ('approved','paid') and expense_date between ${range.from} and ${range.to} group by 1 order by 1`;
    const byCat = await tx`select c.name, sum(e.amount)::float8 as v from expenses e join finance_categories c on c.id = e.category_id
      where e.office_id = ${session.officeId} and e.status in ('approved','paid') and e.expense_date between ${range.from} and ${range.to} group by c.name order by v desc`;
    return { today, range, rows, total, sum, byMonth, byCat, categories: await categoryOptions(tx, session.officeId, 'office', 'expense'), members: await memberOptions(tx, session.officeId), accounts: await officeAccountOptions(tx, session.officeId) };
  });
  const members = d.members.map((m) => ({ value: m.value, label: m.label }));
  return (
    <>
      <PageHeader title="Office expenses" description="Draft → pending approval → approved → paid. Paying an expense posts it to the office ledger exactly once."
        actions={<>
          <LinkButton href={`/api/export/expenses?from=${d.range.from}&to=${d.range.to}`} variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={saveExpenseAction} title="New expense" trigger={<><Plus className="size-4" />New expense</>} size="lg">
            <ExpenseFields categories={d.categories} members={members} today={d.today} currency={fmt.currency} />
          </FormDialog>
        </>} />
      <RangeFilter range={d.range.preset} from={d.range.from} to={d.range.to} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Awaiting approval" value={formatMoney(d.sum.pending, fmt)} hint={`${d.sum.pending_n} expense${d.sum.pending_n === 1 ? '' : 's'}`} tone={d.sum.pending_n ? 'warning' : 'neutral'} href="/admin/expenses?status=pending" />
        <StatCard label="Approved, unpaid" value={formatMoney(d.sum.approved, fmt)} />
        <StatCard label="Paid (period)" value={formatMoney(d.sum.paid, fmt)} />
        <StatCard label="Months covered" value={d.byMonth.length} hint={d.byMonth.map((m) => `${m.m}: ${formatMoney(m.v, fmt, { compact: true })}`).slice(-3).join(' · ') || '—'} />
      </div>
      <Card className="mt-6">
        <CardHeader title="Approved & paid by category (period)" />
        <CardBody>{d.byCat.length === 0 ? <EmptyState compact title="No approved expenses in this period" /> : <RankBars ariaLabel="Expenses by category" items={d.byCat.map((c) => ({ label: c.name, value: c.v }))} format={{ kind: 'money', currency: fmt.currency, locale: fmt.locale }} />}</CardBody>
      </Card>
      <FilterBar className="my-4">
        <SearchInput defaultValue={str(sp, 'q')} placeholder="Search title or vendor" />
        <FilterSelect name="status" label="Status" defaultValue={str(sp, 'status')} options={['draft', 'pending', 'approved', 'rejected', 'paid'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
        <FilterSelect name="category" label="Category" defaultValue={str(sp, 'category')} options={d.categories} />
      </FilterBar>
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={Receipt} title="No expenses match" /> : (
          <>
            <Table>
              <THead><tr><Th>Date</Th><Th>Expense</Th><Th align="right">Amount</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>{d.rows.map((e) => (
                <Tr key={e.id}>
                  <Td className="whitespace-nowrap">{formatDate(e.d, fmt.locale)}</Td>
                  <Td>
                    <div className="font-medium text-slate-900">{e.title}</div>
                    <div className="text-xs text-slate-500">{[e.category, e.vendor, e.payment_method, e.responsible ? `resp. ${e.responsible}` : null, `by ${e.submitter}`].filter(Boolean).join(' · ')}</div>
                    {e.attachment_id ? <a href={`/api/attachments/${e.attachment_id}`} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand-700 hover:underline"><Paperclip className="size-3" />{e.filename}</a> : null}
                    {e.trail ? <div className="text-[11px] text-slate-400">{e.trail}</div> : null}
                  </Td>
                  <Td align="right">{formatMoney(e.amount, fmt)}</Td>
                  <Td><StatusBadge status={e.status} /></Td>
                  <Td align="right"><div className="flex justify-end gap-1">
                    {e.status === 'pending' ? <>
                      <ActionButton action={expenseActionAction} fields={{ expenseId: e.id, action: 'approve' }} variant="success">Approve</ActionButton>
                      <FormDialog action={expenseActionAction} title="Reject expense" trigger="Reject" triggerVariant="ghost" triggerSize="sm" hidden={{ expenseId: e.id, action: 'reject' }} submitVariant="danger" submitLabel="Reject" size="sm">
                        <Textarea name="note" label="Reason" required rows={2} />
                      </FormDialog>
                    </> : null}
                    {e.status === 'approved' ? (
                      <FormDialog action={expenseActionAction} title={`Mark paid — ${e.title}`} trigger="Mark paid" triggerVariant="secondary" triggerSize="sm" hidden={{ expenseId: e.id, action: 'pay' }} size="sm"
                        description="This posts an expense entry to the office ledger.">
                        <Select name="accountId" label="Paid from" required options={d.accounts} />
                        <Input name="paidOn" type="date" label="Paid on" defaultValue={d.today} max={d.today} />
                        <Textarea name="note" label="Note" rows={2} />
                      </FormDialog>
                    ) : null}
                    {e.status === 'draft' || e.status === 'rejected' ? <>
                      <FormDialog action={saveExpenseAction} title="Edit expense" trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="lg">
                        <ExpenseFields categories={d.categories} members={members} today={d.today} currency={fmt.currency} defaults={{ expenseId: e.id, title: e.title, categoryId: e.category_id, amount: e.amount, expenseDate: e.d, paymentMethod: e.payment_method, responsibleUserId: e.responsible_user_id, vendor: e.vendor, description: e.description }} />
                      </FormDialog>
                      <ActionButton action={expenseActionAction} fields={{ expenseId: e.id, action: 'delete' }} variant="ghost" confirm="Delete this expense?" confirmLabel="Delete">Delete</ActionButton>
                    </> : null}
                  </div></Td>
                </Tr>
              ))}</TBody>
            </Table>
            <Pagination base="/admin/expenses" params={sp} page={page} pageSize={25} total={d.total} />
          </>
        )}
      </Card>
    </>
  );
}
