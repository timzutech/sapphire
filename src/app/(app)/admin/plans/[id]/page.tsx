import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ActivityFields } from '@/components/forms/plan-forms';
import { ActionButton } from '@/components/ui/action-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { ACTIVITY_KIND_LABELS } from '@/lib/constants';
import { monthLabel } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { deleteActivityAction, participationAction, publishPlanAction, saveActivityAction, savePlanAction } from '@/server/actions/plans';
import { adminPage } from '@/server/page';
import { memberOptions } from '@/server/queries/common';

export const metadata = { title: 'Office Plan' };

export default async function AdminPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const [plan] = await tx`select *, month::text as m from office_plans where id = ${id}`;
    if (!plan) return null;
    const activities = await tx`select a.*, to_char(a.starts_at at time zone ${fmt.timezone}, 'YYYY-MM-DD"T"HH24:MI') as s_local,
        to_char(a.ends_at at time zone ${fmt.timezone}, 'YYYY-MM-DD"T"HH24:MI') as e_local from plan_activities a where a.plan_id = ${id} order by a.starts_at`;
    const regs = await tx`select r.activity_id, r.user_id, r.status, u.full_name from activity_registrations r join users u on u.id = r.user_id
      join plan_activities a on a.id = r.activity_id where a.plan_id = ${id} and r.status <> 'cancelled' order by u.full_name`;
    return { plan, activities, regs, members: await memberOptions(tx, session.officeId) };
  });
  if (!d) notFound();
  const { plan } = d;
  const now = new Date();
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/plans" className="hover:underline">← Plans</Link>} title={`${plan.title} — ${monthLabel(plan.m, fmt.locale)}`} description={plan.summary}
        actions={<>
          <StatusBadge status={plan.status} />
          <FormDialog action={savePlanAction} title="Edit plan" trigger="Edit" triggerVariant="secondary" hidden={{ planId: id }}>
            <Input name="month" type="month" label="Month" required defaultValue={plan.m.slice(0, 7)} />
            <Input name="title" label="Title" required defaultValue={plan.title} />
            <Textarea name="summary" label="Summary" rows={3} defaultValue={plan.summary ?? ''} />
          </FormDialog>
          <FormDialog action={saveActivityAction} title="Add activity" trigger="Add activity" triggerVariant="secondary" hidden={{ planId: id }} size="lg"><ActivityFields defaults={{ startsAt: `${plan.m.slice(0, 8)}01T10:00` }} /></FormDialog>
          <ActionButton action={publishPlanAction} fields={{ planId: id, publish: plan.status === 'published' ? 'false' : 'true' }} variant={plan.status === 'published' ? 'secondary' : 'primary'} size="md"
            confirm={plan.status === 'published' ? 'Members will no longer see this plan.' : 'All active members will be notified.'} confirmTitle={plan.status === 'published' ? 'Unpublish plan?' : 'Publish plan?'}>
            {plan.status === 'published' ? 'Unpublish' : 'Publish'}
          </ActionButton>
        </>} />
      <Card>
        <CardHeader title="Activities" description={`Times in office time (${fmt.timezone})`} />
        {d.activities.length === 0 ? <EmptyState compact title="No activities yet" description="Add trainings, outreach days, meetings and deadlines." /> : (
          <ul className="divide-y divide-slate-100">
            {d.activities.map((a) => {
              const regs = d.regs.filter((r) => r.activity_id === a.id);
              const started = new Date(a.starts_at) <= now;
              return (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5"><Badge tone="brand">{ACTIVITY_KIND_LABELS[a.kind]}</Badge><span className="text-sm font-semibold text-slate-900">{a.title}</span></div>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(a.starts_at, fmt)}{a.location ? ` · ${a.location}` : ''}{a.requires_registration ? ` · ${regs.filter((r) => r.status !== 'absent').length}${a.capacity ? `/${a.capacity}` : ''} registered` : ''}</p>
                    </div>
                    <div className="flex gap-1">
                      <FormDialog action={participationAction} title={`Record participation — ${a.title}`} trigger="Participation" triggerVariant="ghost" triggerSize="sm" hidden={{ activityId: a.id }} size="sm">
                        <Select name="userId" label="Member" required options={d.members} placeholder="Choose…" />
                        <Select name="status" label="Status" options={[{ value: 'attended', label: 'Attended' }, { value: 'absent', label: 'Did not attend' }, { value: 'registered', label: 'Registered' }]} />
                      </FormDialog>
                      <FormDialog action={saveActivityAction} title="Edit activity" trigger="Edit" triggerVariant="ghost" triggerSize="sm" hidden={{ planId: id }} size="lg">
                        <ActivityFields defaults={{ activityId: a.id, kind: a.kind, title: a.title, description: a.description, startsAt: a.s_local, endsAt: a.e_local, location: a.location, requiresRegistration: a.requires_registration, capacity: a.capacity }} />
                      </FormDialog>
                      <ActionButton action={deleteActivityAction} fields={{ activityId: a.id }} variant="ghost" confirm="Remove this activity and its registrations?" confirmLabel="Remove">Remove</ActionButton>
                    </div>
                  </div>
                  {regs.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {regs.map((r) => (
                        <span key={r.user_id} className="inline-flex items-center gap-1 rounded-full bg-slate-50 py-0.5 pl-2 pr-0.5 text-xs ring-1 ring-slate-200">
                          {r.full_name}<StatusBadge status={r.status} />
                          {started && r.status === 'registered' ? <ActionButton action={participationAction} fields={{ activityId: a.id, userId: r.user_id, status: 'attended' }} variant="ghost" label={`Mark ${r.full_name} attended`}>✓</ActionButton> : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
