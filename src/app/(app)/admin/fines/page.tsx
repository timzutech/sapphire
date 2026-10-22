import { Download, Gavel, Plus } from 'lucide-react';
import { ActionButton } from '@/components/ui/action-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect } from '@/components/ui/filters';
import { CheckboxList, FormGrid, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { EmptyState, MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, str } from '@/components/ui/nav';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import {
  adjustFineAction, issueFineAction, recordFinePaymentAction, resolveDisputeAction, reviewFinePaymentAction, saveFineCategoryAction, waiveFineAction,
} from '@/server/actions/finance';
import { adminPage, type SearchParams } from '@/server/page';
import { memberOptions, officeAccountOptions, officeNow } from '@/server/queries/common';

export const metadata = { title: 'Fines' };

export default async function AdminFines({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = str(sp, 'tab') ?? 'fines';
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const status = str(sp, 'status');
    const member = str(sp, 'member');
    const fines = await tx`select f.*, f.issued_on::text as issued, f.due_date::text as due, u.full_name, c.name as category, i.full_name as issuer, app.fine_paid_total(f.id) as paid,
        (select count(*)::int from fine_adjustments a where a.fine_id = f.id) as adjustments
      from fines f join users u on u.id = f.user_id left join fine_categories c on c.id = f.category_id join users i on i.id = f.issued_by
      where f.office_id = ${session.officeId} ${status ? (status === 'open' ? tx`and f.status in ('pending','partially_paid','disputed')` : tx`and f.status = ${status}`) : tx``}
        ${member ? tx`and f.user_id = ${member}` : tx``} order by f.issued_on desc limit 200`;
    const payments = await tx`select p.*, p.paid_on::text as d, u.full_name, f.reason, f.amount as fine_amount, app.fine_paid_total(f.id) as fine_paid
      from fine_payments p join users u on u.id = p.user_id join fines f on f.id = p.fine_id where p.office_id = ${session.officeId} order by p.status = 'pending' desc, p.created_at desc limit 100`;
    const disputes = await tx`select x.*, u.full_name, f.reason as fine_reason, f.amount, r.full_name as resolver from fine_disputes x join users u on u.id = x.raised_by
      join fines f on f.id = x.fine_id left join users r on r.id = x.resolved_by where x.office_id = ${session.officeId} order by x.status = 'open' desc, x.created_at desc`;
    const cats = await tx`select * from fine_categories where office_id = ${session.officeId} order by name`;
    const [s] = await tx`select coalesce(sum(amount - app.fine_paid_total(id)) filter (where status in ('pending','partially_paid','disputed')), 0) as outstanding,
        coalesce(sum(app.fine_paid_total(id)), 0) as collected, coalesce(sum(amount) filter (where status = 'waived'), 0) as waived,
        count(*) filter (where status in ('pending','partially_paid') and due_date < ${today})::int as overdue from fines where office_id = ${session.officeId}`;
    const late = await tx`select a.id, a.att_date::text as d, u.id as user_id, u.full_name from attendance_records a join users u on u.id = a.user_id
      where a.office_id = ${session.officeId} and a.status in ('late','absent') and a.att_date >= ${today}::date - 14
        and not exists (select 1 from fines f where f.attendance_record_id = a.id) order by a.att_date desc limit 50`;
    return { today, fines, payments, disputes, cats, s, late, members: await memberOptions(tx, session.officeId, true), accounts: await officeAccountOptions(tx, session.officeId) };
  });
  const members = d.members.filter((m) => m.status === 'active').map((m) => ({ value: m.value, label: m.label }));
  const pendingPayments = d.payments.filter((p) => p.status === 'pending').length;
  const openDisputes = d.disputes.filter((x) => x.status === 'open').length;
  return (
    <>
      <PageHeader title="Fines" description="Fines are issued explicitly with a reason — never as hidden deductions. Waivers, adjustments and disputes are all recorded."
        actions={<>
          <LinkButton href="/api/export/fines" variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={issueFineAction} title="Issue fine" trigger={<><Plus className="size-4" />Issue fine</>} submitLabel="Issue" size="lg">
            <CheckboxList name="userIds" label="Members" required options={members} />
            <FormGrid>
              <Select name="categoryId" label="Rule / category" options={d.cats.filter((c) => c.is_active).map((c) => ({ value: c.id, label: `${c.name}${c.default_amount ? ` (${formatMoney(c.default_amount, fmt)})` : ''}` }))} placeholder="Other" />
              <MoneyInput name="amount" label="Amount" required currency={fmt.currency} />
              <Input name="issuedOn" type="date" label="Issue date" required defaultValue={d.today} max={d.today} />
              <Input name="dueDate" type="date" label="Due date" />
            </FormGrid>
            <Textarea name="reason" label="Reason" required rows={2} hint="Shown to the member." />
          </FormDialog>
        </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding" value={formatMoney(d.s.outstanding, fmt)} icon={Gavel} tone="warning" />
        <StatCard label="Collected (all time)" value={formatMoney(d.s.collected, fmt)} hint="Confirmed payments" />
        <StatCard label="Waived (all time)" value={formatMoney(d.s.waived, fmt)} />
        <StatCard label="Overdue fines" value={d.s.overdue} tone={d.s.overdue ? 'critical' : 'neutral'} />
      </div>
      <MetricNote>Outstanding = fine amount − confirmed payments, for pending, partly paid and disputed fines. Confirmed payments are posted once to the office ledger under “Fine collections”. Overpayments are rejected.</MetricNote>
      <div className="mt-6">
        <LinkTabs base="/admin/fines" params={sp} current={tab} tabs={[
          { value: 'fines', label: 'Fines' }, { value: 'payments', label: 'Payments', count: pendingPayments }, { value: 'disputes', label: 'Disputes', count: openDisputes },
          { value: 'attendance', label: 'Attendance review', count: d.late.length }, { value: 'rules', label: 'Rules' },
        ]} />
        {tab === 'fines' ? (
          <>
            <FilterBar className="mb-4">
              <FilterSelect name="status" label="Status" defaultValue={str(sp, 'status')} options={[{ value: 'open', label: 'Open (unpaid)' }, ...['pending', 'partially_paid', 'paid', 'waived', 'disputed'].map((v) => ({ value: v, label: v.replace('_', ' ') }))]} />
              <FilterSelect name="member" label="Member" defaultValue={str(sp, 'member')} options={d.members.map((m) => ({ value: m.value, label: m.label }))} />
            </FilterBar>
            <Card>
              {d.fines.length === 0 ? <EmptyState icon={Gavel} title="No fines" /> : (
                <Table>
                  <THead><tr><Th>Member</Th><Th>Reason</Th><Th align="right">Amount</Th><Th align="right">Outstanding</Th><Th>Due</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                  <TBody>{d.fines.map((f) => {
                    const out = f.status === 'waived' ? 0 : Number(f.amount) - Number(f.paid);
                    return (
                      <Tr key={f.id}>
                        <Td className="font-medium text-slate-900">{f.full_name}</Td>
                        <Td>{f.reason}<div className="text-xs text-slate-500">{f.category ?? 'Other'} · {formatDate(f.issued, fmt.locale, 'short')} by {f.issuer}{f.adjustments ? ` · adjusted ${f.adjustments}×` : ''}{f.waive_reason ? ` · waived: ${f.waive_reason}` : ''}</div></Td>
                        <Td align="right">{formatMoney(f.amount, fmt)}</Td><Td align="right" className="font-medium">{formatMoney(out, fmt)}</Td>
                        <Td className={f.due && f.due < d.today && out > 0 ? 'text-red-700' : ''}>{f.due ? formatDate(f.due, fmt.locale, 'short') : '—'}</Td>
                        <Td><StatusBadge status={f.status} /></Td>
                        <Td align="right">{out > 0 ? (
                          <div className="flex justify-end gap-1">
                            <FormDialog action={recordFinePaymentAction} title={`Record payment — ${f.full_name}`} trigger="Payment" triggerVariant="secondary" triggerSize="sm" hidden={{ fineId: f.id }}
                              description={`Outstanding ${formatMoney(out, fmt)}. Recorded payments are confirmed immediately and posted to the office ledger.`}>
                              <FormGrid>
                                <MoneyInput name="amount" label="Amount" required currency={fmt.currency} defaultValue={out.toFixed(2)} />
                                <Input name="paidOn" type="date" label="Date" required defaultValue={d.today} max={d.today} />
                                <Select name="accountId" label="Received into" required options={d.accounts} />
                                <Select name="method" label="Method" options={['Cash', 'Transfer', 'POS', 'Mobile money'].map((v) => ({ value: v, label: v }))} />
                                <Input name="reference" label="Reference" />
                              </FormGrid>
                              <Textarea name="note" label="Note" rows={2} />
                            </FormDialog>
                            <FormDialog action={adjustFineAction} title="Adjust fine amount" trigger="Adjust" triggerVariant="ghost" triggerSize="sm" hidden={{ fineId: f.id }} size="sm">
                              <MoneyInput name="amount" label="New amount" required currency={fmt.currency} defaultValue={f.amount} hint={`Cannot be below the ${formatMoney(f.paid, fmt)} already paid.`} />
                              <Textarea name="reason" label="Reason" required rows={2} />
                            </FormDialog>
                            <ActionButton action={waiveFineAction} fields={{ fineId: f.id }} variant="ghost" reasonName="reason" confirmTitle="Waive fine" confirm="The outstanding balance is cancelled. Payments already confirmed are kept.">Waive</ActionButton>
                          </div>
                        ) : null}</Td>
                      </Tr>
                    );
                  })}</TBody>
                </Table>
              )}
            </Card>
          </>
        ) : null}
        {tab === 'payments' ? (
          <Card>
            <CardHeader title="Payments" description="Member-submitted payment confirmations stay pending until you confirm them." />
            {d.payments.length === 0 ? <EmptyState compact title="No payments" /> : (
              <Table>
                <THead><tr><Th>Member</Th><Th>Fine</Th><Th>Date · method</Th><Th align="right">Amount</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                <TBody>{d.payments.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-medium text-slate-900">{p.full_name}</Td><Td>{p.reason}<div className="text-xs text-slate-500">Paid {formatMoney(p.fine_paid, fmt)} of {formatMoney(p.fine_amount, fmt)}</div></Td>
                    <Td className="text-xs">{formatDate(p.d, fmt.locale, 'short')} · {p.method ?? '—'}{p.reference ? ` · ${p.reference}` : ''}{p.note ? <div className="text-slate-400">{p.note}</div> : null}</Td>
                    <Td align="right">{formatMoney(p.amount, fmt)}</Td><Td><StatusBadge status={p.status} /></Td>
                    <Td align="right"><div className="flex justify-end gap-1">
                      {p.status === 'pending' ? (
                        <FormDialog action={reviewFinePaymentAction} title="Confirm payment" trigger="Confirm" triggerVariant="success" triggerSize="sm" hidden={{ paymentId: p.id, decision: 'confirmed' }} size="sm" description="Posts the payment to the office ledger.">
                          <Select name="accountId" label="Received into" required options={d.accounts} />
                        </FormDialog>
                      ) : null}
                      {p.status !== 'rejected' ? (
                        <FormDialog action={reviewFinePaymentAction} title={p.status === 'confirmed' ? 'Void confirmed payment' : 'Reject payment'} trigger={p.status === 'confirmed' ? 'Void' : 'Reject'} triggerVariant="ghost" triggerSize="sm" hidden={{ paymentId: p.id, decision: 'rejected' }} submitVariant="danger" size="sm"
                          description={p.status === 'confirmed' ? 'The linked ledger entry will be reversed.' : undefined}>
                          <Textarea name="note" label="Reason" required rows={2} />
                        </FormDialog>
                      ) : null}
                    </div></Td>
                  </Tr>
                ))}</TBody>
              </Table>
            )}
          </Card>
        ) : null}
        {tab === 'disputes' ? (
          <Card>
            {d.disputes.length === 0 ? <EmptyState compact title="No disputes" /> : (
              <Table>
                <THead><tr><Th>Member</Th><Th>Fine</Th><Th>Member’s reason</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                <TBody>{d.disputes.map((x) => (
                  <Tr key={x.id}>
                    <Td className="font-medium text-slate-900">{x.full_name}<div className="text-xs font-normal text-slate-500">{formatDateTime(x.created_at, fmt)}</div></Td>
                    <Td>{x.fine_reason}<div className="text-xs text-slate-500">{formatMoney(x.amount, fmt)}</div></Td>
                    <Td className="max-w-sm text-sm">{x.reason}{x.resolution_note ? <div className="mt-1 text-xs text-slate-500">Resolution ({x.resolver}): {x.resolution_note}</div> : null}</Td>
                    <Td><StatusBadge status={x.status} /></Td>
                    <Td align="right">{x.status === 'open' ? (
                      <div className="flex justify-end gap-1">
                        <FormDialog action={resolveDisputeAction} title="Uphold dispute" trigger="Uphold" triggerVariant="success" triggerSize="sm" hidden={{ disputeId: x.id, decision: 'upheld' }} size="sm" description="The fine will be waived.">
                          <Textarea name="note" label="Resolution note" required rows={2} />
                        </FormDialog>
                        <FormDialog action={resolveDisputeAction} title="Reject dispute" trigger="Reject" triggerVariant="ghost" triggerSize="sm" hidden={{ disputeId: x.id, decision: 'rejected' }} submitVariant="danger" size="sm" description="The fine stays payable.">
                          <Textarea name="note" label="Resolution note" required rows={2} />
                        </FormDialog>
                      </div>
                    ) : null}</Td>
                  </Tr>
                ))}</TBody>
              </Table>
            )}
          </Card>
        ) : null}
        {tab === 'attendance' ? (
          <Card>
            <CardHeader title="Late or absent in the last 14 days, not yet fined" description="Review each case. Fines are only issued when you choose to — nothing is applied automatically." />
            {d.late.length === 0 ? <EmptyState compact title="Nothing to review" /> : (
              <Table>
                <THead><tr><Th>Date</Th><Th>Member</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                <TBody>{d.late.map((a) => {
                  const cat = d.cats.find((c) => c.name === 'Lateness') ?? d.cats[0];
                  return (
                    <Tr key={a.id}><Td>{formatDate(a.d, fmt.locale)}</Td><Td>{a.full_name}</Td>
                      <Td align="right"><FormDialog action={issueFineAction} title={`Issue fine — ${a.full_name}`} trigger="Issue fine…" triggerVariant="ghost" triggerSize="sm" hidden={{ 'userIds[]': a.user_id, attendanceRecordId: a.id, issuedOn: d.today }} size="sm">
                        <Select name="categoryId" label="Rule" options={d.cats.map((c) => ({ value: c.id, label: c.name }))} defaultValue={cat?.id} />
                        <MoneyInput name="amount" label="Amount" required currency={fmt.currency} defaultValue={cat?.default_amount ?? ''} />
                        <Input name="dueDate" type="date" label="Due date" />
                        <Textarea name="reason" label="Reason" required rows={2} defaultValue={`Attendance on ${formatDate(a.d, fmt.locale)}`} />
                      </FormDialog></Td></Tr>
                  );
                })}</TBody>
              </Table>
            )}
          </Card>
        ) : null}
        {tab === 'rules' ? (
          <Card>
            <CardHeader title="Fine rules & categories" action={<FormDialog action={saveFineCategoryAction} title="New fine rule" trigger={<><Plus className="size-4" />Rule</>} triggerVariant="secondary" triggerSize="sm" size="sm">
              <Input name="name" label="Name" required /><MoneyInput name="defaultAmount" label="Default amount" currency={fmt.currency} /><Textarea name="description" label="When it applies" rows={2} />
            </FormDialog>} />
            <Table>
              <THead><tr><Th>Rule</Th><Th align="right">Default amount</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>{d.cats.map((c) => (
                <Tr key={c.id}><Td className="font-medium text-slate-900">{c.name}<div className="text-xs font-normal text-slate-500">{c.description}</div></Td>
                  <Td align="right">{c.default_amount ? formatMoney(c.default_amount, fmt) : '—'}</Td><Td>{c.is_active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  <Td align="right"><FormDialog action={saveFineCategoryAction} title="Edit rule" trigger="Edit" triggerVariant="ghost" triggerSize="sm" hidden={{ categoryId: c.id }} size="sm">
                    <Input name="name" label="Name" required defaultValue={c.name} /><MoneyInput name="defaultAmount" label="Default amount" currency={fmt.currency} defaultValue={c.default_amount ?? ''} />
                    <Textarea name="description" label="When it applies" rows={2} defaultValue={c.description ?? ''} />
                    <Select name="isActive" label="Status" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} defaultValue={String(c.is_active)} />
                  </FormDialog></Td></Tr>
              ))}</TBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
