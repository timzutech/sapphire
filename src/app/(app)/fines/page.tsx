import { Gavel } from 'lucide-react';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FormGrid, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { EmptyState, MetricNote, Notice, PageHeader, StatCard } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDate, formatMoney } from '@/lib/format';
import { raiseDisputeAction, submitFinePaymentAction } from '@/server/actions/finance';
import { memberPage } from '@/server/page';
import { getSettings, officeNow } from '@/server/queries/common';

export const metadata = { title: 'My Fines' };

export default async function FinesPage() {
  const { session, fmt, load } = await memberPage();
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const settings = await getSettings(tx, session.officeId);
    const fines = await tx`select f.*, f.issued_on::text as issued, f.due_date::text as due, c.name as category, u.full_name as issuer, w.full_name as waiver,
        app.fine_paid_total(f.id) as paid,
        (select count(*)::int from fine_payments p where p.fine_id = f.id and p.status = 'pending') as pending_payments,
        (select d.status from fine_disputes d where d.fine_id = f.id order by d.created_at desc limit 1) as dispute_status,
        (select d.resolution_note from fine_disputes d where d.fine_id = f.id order by d.created_at desc limit 1) as dispute_note
      from fines f left join fine_categories c on c.id = f.category_id join users u on u.id = f.issued_by left join users w on w.id = f.waived_by
      where f.office_id = ${session.officeId} and f.user_id = ${session.userId} order by f.issued_on desc`;
    const payments = await tx`select p.*, p.paid_on::text as d, f.reason from fine_payments p join fines f on f.id = p.fine_id
      where p.office_id = ${session.officeId} and p.user_id = ${session.userId} order by p.created_at desc limit 30`;
    return { today, settings, fines, payments };
  });
  const open = d.fines.filter((f) => ['pending', 'partially_paid', 'disputed'].includes(f.status));
  const outstanding = open.reduce((s, f) => s + Number(f.amount) - Number(f.paid), 0);
  const paidTotal = d.fines.reduce((s, f) => s + Number(f.paid), 0);
  return (
    <>
      <PageHeader title="My Fines" description="Fines are only issued by administrators with a recorded reason. You can submit payment confirmations or dispute a fine." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Outstanding" value={formatMoney(outstanding, fmt)} tone={outstanding > 0 ? 'warning' : 'good'} icon={Gavel} hint={`${open.length} open fine${open.length === 1 ? '' : 's'}`} />
        <StatCard label="Paid to date" value={formatMoney(paidTotal, fmt)} hint="Confirmed payments" />
        <StatCard label="Overdue" value={open.filter((f) => f.due && f.due < d.today).length} tone={open.some((f) => f.due && f.due < d.today) ? 'critical' : 'neutral'} />
      </div>
      <MetricNote>Outstanding = fine amount − payments confirmed by an administrator. Waived fines have nothing outstanding. Fines are never deducted from your recorded income.</MetricNote>
      <Card className="mt-6">
        <CardHeader title="Fines" />
        {d.fines.length === 0 ? <EmptyState icon={Gavel} title="No fines" description="Keep it up!" /> : (
          <Table>
            <THead><tr><Th>Issued</Th><Th>Reason</Th><Th align="right">Amount</Th><Th align="right">Outstanding</Th><Th>Due</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
            <TBody>
              {d.fines.map((f) => {
                const out = f.status === 'waived' ? 0 : Number(f.amount) - Number(f.paid);
                return (
                  <Tr key={f.id}>
                    <Td className="whitespace-nowrap">{formatDate(f.issued, fmt.locale)}</Td>
                    <Td>
                      <div className="font-medium text-slate-900">{f.reason}</div>
                      <div className="text-xs text-slate-500">{f.category ?? 'Other'} · issued by {f.issuer}{f.waive_reason ? ` · waived by ${f.waiver}: ${f.waive_reason}` : ''}{f.dispute_status && f.dispute_status !== 'open' ? ` · dispute ${f.dispute_status}: ${f.dispute_note}` : ''}</div>
                      {f.pending_payments ? <div className="text-xs text-amber-700">{f.pending_payments} payment confirmation awaiting review</div> : null}
                    </Td>
                    <Td align="right">{formatMoney(f.amount, fmt)}</Td>
                    <Td align="right" className="font-medium">{formatMoney(out, fmt)}</Td>
                    <Td className={f.due && f.due < d.today && out > 0 ? 'text-red-700' : ''}>{f.due ? formatDate(f.due, fmt.locale, 'short') : '—'}</Td>
                    <Td><StatusBadge status={f.status} /></Td>
                    <Td align="right">
                      {out > 0 ? (
                        <div className="flex justify-end gap-1">
                          {d.settings.membersSubmitFinePayments ? (
                            <FormDialog action={submitFinePaymentAction} title="Submit payment confirmation" trigger="I've paid" triggerVariant="secondary" triggerSize="sm" hidden={{ fineId: f.id }}
                              description="An administrator will confirm the payment before your balance changes.">
                              <FormGrid>
                                <MoneyInput name="amount" label="Amount paid" required currency={fmt.currency} defaultValue={String(out.toFixed(2))} />
                                <Input name="paidOn" type="date" label="Date paid" required defaultValue={d.today} max={d.today} />
                                <Select name="method" label="Method" options={['Cash', 'Transfer', 'POS', 'Mobile money'].map((v) => ({ value: v, label: v }))} />
                                <Input name="reference" label="Reference" placeholder="Transfer reference" maxLength={80} />
                              </FormGrid>
                              <Textarea name="note" label="Note" rows={2} />
                            </FormDialog>
                          ) : null}
                          {f.status !== 'disputed' ? (
                            <FormDialog action={raiseDisputeAction} title="Dispute this fine" trigger="Dispute" triggerVariant="ghost" triggerSize="sm" hidden={{ fineId: f.id }} submitLabel="Submit dispute">
                              <Notice tone="info">Explain why the fine should be reviewed. An administrator will uphold (waive) or reject the dispute with a written reason.</Notice>
                              <Textarea name="reason" label="Reason" required rows={4} />
                            </FormDialog>
                          ) : null}
                        </div>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Payment history" />
        {d.payments.length === 0 ? <EmptyState compact title="No payments yet" /> : (
          <Table>
            <THead><tr><Th>Date</Th><Th>Fine</Th><Th>Method</Th><Th align="right">Amount</Th><Th>Status</Th></tr></THead>
            <TBody>{d.payments.map((p) => (
              <Tr key={p.id}><Td>{formatDate(p.d, fmt.locale)}</Td><Td>{p.reason}{p.note ? <div className="text-xs text-slate-500">{p.note}</div> : null}</Td><Td>{p.method ?? '—'}{p.reference ? ` · ${p.reference}` : ''}</Td><Td align="right">{formatMoney(p.amount, fmt)}</Td><Td><StatusBadge status={p.status} /></Td></Tr>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
