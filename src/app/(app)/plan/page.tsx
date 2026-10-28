import { CalendarDays, MapPin } from 'lucide-react';
import Link from 'next/link';
import { ActionButton } from '@/components/ui/action-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { str } from '@/components/ui/nav';
import { ACTIVITY_KIND_LABELS } from '@/lib/constants';
import { addMonths, monthLabel, startOfMonth } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { registrationAction } from '@/server/actions/plans';
import { memberPage, type SearchParams } from '@/server/page';
import { officeNow } from '@/server/queries/common';

export const metadata = { title: 'Office Plan' };

export default async function PlanPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await memberPage();
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const m = str(sp, 'month');
    const month = m && /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : startOfMonth(today);
    const [plan] = await tx`select * from office_plans where office_id = ${session.officeId} and month = ${month} and status = 'published'`;
    const activities = plan ? await tx`select a.*, r.status as my_status, c.registered
        from plan_activities a left join activity_registrations r on r.activity_id = a.id and r.user_id = ${session.userId}
        left join app.activity_registration_counts(${plan.id}) c on c.activity_id = a.id
        where a.plan_id = ${plan.id} order by a.starts_at` : [];
    const [part] = await tx`select count(*) filter (where r.status = 'attended')::int as attended, count(*) filter (where r.status in ('registered','attended','absent'))::int as registered
      from activity_registrations r join plan_activities a on a.id = r.activity_id where r.user_id = ${session.userId} and r.office_id = ${session.officeId}`;
    return { today, month, plan, activities, part };
  });
  const now = new Date();
  return (
    <>
      <PageHeader title="Office plan" description="Trainings, workshops, outreach and key dates published by your administrator."
        actions={<div className="flex gap-1">
          <Link className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50" href={`/plan?month=${addMonths(d.month, -1).slice(0, 7)}`}>‹ {monthLabel(addMonths(d.month, -1), fmt.locale)}</Link>
          <Link className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50" href={`/plan?month=${addMonths(d.month, 1).slice(0, 7)}`}>{monthLabel(addMonths(d.month, 1), fmt.locale)} ›</Link>
        </div>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Activities this month" value={d.activities.length} />
        <StatCard label="My registrations (all time)" value={d.part.registered} />
        <StatCard label="Sessions attended (all time)" value={d.part.attended} hint="Marked by an administrator" />
      </div>
      {!d.plan ? (
        <Card><EmptyState icon={CalendarDays} title={`No published plan for ${monthLabel(d.month, fmt.locale)}`} description="Check back once your administrator publishes it." /></Card>
      ) : (
        <Card>
          <CardHeader title={`${d.plan.title} — ${monthLabel(d.month, fmt.locale)}`} description={d.plan.summary} />
          {d.activities.length === 0 ? <EmptyState compact title="No activities yet" /> : (
            <ul className="divide-y divide-slate-100">
              {d.activities.map((a) => {
                const past = new Date(a.starts_at) < now;
                const full = a.capacity && Number(a.registered) >= a.capacity;
                return (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="brand">{ACTIVITY_KIND_LABELS[a.kind]}</Badge>
                        <h3 className="text-sm font-semibold text-slate-900">{a.title}</h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatDateTime(a.starts_at, fmt)}{a.ends_at ? ` – ${formatDateTime(a.ends_at, fmt, false)}` : ''}{a.location ? <> · <MapPin className="inline size-3" /> {a.location}</> : null}</p>
                      {a.description ? <p className="mt-1 text-sm text-slate-600">{a.description}</p> : null}
                      {a.requires_registration ? <p className="mt-1 text-xs text-slate-500">{a.registered ?? 0}{a.capacity ? ` / ${a.capacity}` : ''} registered</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {a.my_status && a.my_status !== 'cancelled' ? <StatusBadge status={a.my_status} /> : null}
                      {a.requires_registration && !past ? (
                        a.my_status === 'registered'
                          ? <ActionButton action={registrationAction} fields={{ activityId: a.id, action: 'cancel' }} variant="ghost">Cancel registration</ActionButton>
                          : full ? <Badge tone="warning">Full</Badge> : <ActionButton action={registrationAction} fields={{ activityId: a.id, action: 'register' }} variant="primary">Register</ActionButton>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <CardBody className="border-t border-slate-100 text-xs text-slate-500">Times are shown in office time ({fmt.timezone}).</CardBody>
        </Card>
      )}
    </>
  );
}
