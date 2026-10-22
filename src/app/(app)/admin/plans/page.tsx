import { CalendarDays, Plus } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { monthLabel } from '@/lib/dates';
import { savePlanAction } from '@/server/actions/plans';
import { adminPage } from '@/server/page';
import { officeNow } from '@/server/queries/common';

export const metadata = { title: 'Office Plans' };

export default async function AdminPlans() {
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => ({
    now: await officeNow(tx, session.officeId),
    plans: await tx`select p.*, p.month::text as m, (select count(*)::int from plan_activities a where a.plan_id = p.id) as activities,
        (select count(*)::int from activity_registrations r join plan_activities a on a.id = r.activity_id where a.plan_id = p.id and r.status = 'attended') as attended
      from office_plans p where p.office_id = ${session.officeId} order by p.month desc`,
  }));
  return (
    <>
      <PageHeader title="Monthly office plans" description="Plan trainings, workshops, outreach, incentives and deadlines. Members only see published plans."
        actions={<FormDialog action={savePlanAction} title="New monthly plan" trigger={<><Plus className="size-4" />New plan</>} submitLabel="Create plan">
          <Input name="month" type="month" label="Month" required defaultValue={d.now.today.slice(0, 7)} />
          <Input name="title" label="Title / theme" required />
          <Textarea name="summary" label="Summary" rows={3} />
        </FormDialog>} />
      <Card>
        {d.plans.length === 0 ? <EmptyState icon={CalendarDays} title="No plans yet" description="Create this month’s plan to share it with members." /> : (
          <Table>
            <THead><tr><Th>Month</Th><Th>Title</Th><Th align="right">Activities</Th><Th align="right">Attendances</Th><Th>Status</Th></tr></THead>
            <TBody>{d.plans.map((p) => (
              <Tr key={p.id}><Td>{monthLabel(p.m, fmt.locale)}</Td><Td><Link href={`/admin/plans/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{p.title}</Link></Td>
                <Td align="right">{p.activities}</Td><Td align="right">{p.attended}</Td><Td><StatusBadge status={p.status} /></Td></Tr>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
