import { Bell, CalendarCheck, ClipboardList, Gavel, Megaphone, Target, Trophy, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { GoalSummary } from '@/components/goal-card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ActionForm, SubmitButton } from '@/components/ui/form';
import { EmptyState, Notice, PageHeader, ProgressBar, StatCard } from '@/components/ui/misc';
import { startOfMonth } from '@/lib/dates';
import { decideCheckIn } from '@/lib/logic/attendance';
import { challengePhase, rankIndividuals } from '@/lib/logic/challenges';
import { formatDate, formatDateTime, formatMoney, formatPercent, relativeTime } from '@/lib/format';
import { checkInAction } from '@/server/actions/attendance';
import { memberPage, type SearchParams } from '@/server/page';
import { memberStats, myAttendance } from '@/server/queries/attendance';
import { getSettings, officeNow } from '@/server/queries/common';
import { myOutstandingFines, personalTotals } from '@/server/queries/finance';
import { listGoals } from '@/server/queries/goals';
import { challengeScores } from '@/server/services/challenges';

export const metadata = { title: 'My Dashboard' };

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await memberPage();
  const me = session.userId;
  const d = await load(async (tx) => {
    const settings = await getSettings(tx, session.officeId);
    const now = await officeNow(tx, session.officeId);
    const month = startOfMonth(now.today);
    const [todayRec] = await myAttendance(tx, session.officeId, me, now.today, now.today);
    const monthStats = await memberStats(tx, session.officeId, me, settings, month, now.today, now.today, now.time);
    const tasks = await tx`select id, title, due_date::text as due, priority, status, kind from tasks
      where office_id = ${session.officeId} and assignee_id = ${me} and status in ('pending', 'in_progress')
      order by due_date nulls last, priority desc limit 6`;
    const [taskCounts] = await tx`select count(*) filter (where status in ('pending','in_progress'))::int as open,
        count(*) filter (where status in ('pending','in_progress') and due_date < ${now.today})::int as overdue,
        count(*) filter (where status = 'completed' and (completed_at at time zone ${fmt.timezone})::date >= ${month})::int as done_month
      from tasks where office_id = ${session.officeId} and assignee_id = ${me}`;
    const [pros] = await tx`select count(*) filter (where archived_at is null and stage not in ('converted','not_interested'))::int as active,
        count(*) filter (where archived_at is null and next_follow_up <= ${now.today} and stage not in ('converted','not_interested'))::int as due,
        count(*) filter (where (created_at at time zone ${fmt.timezone})::date >= ${month} and created_by = ${me})::int as added,
        count(*) filter (where stage = 'converted' and (converted_at at time zone ${fmt.timezone})::date >= ${month})::int as converted
      from prospects where office_id = ${session.officeId} and owner_id = ${me}`;
    const money = await personalTotals(tx, session.officeId, me, month, now.today);
    const fines = await myOutstandingFines(tx, session.officeId, me);
    const goals = (await listGoals(tx, session.officeId, { status: 'active', visibleTo: me })).slice(0, 3);
    const challenges = await tx`select c.id, c.name, c.status, c.start_date::text as sd, c.end_date::text as ed, c.target_value, c.unit
      from challenges c join challenge_participants p on p.challenge_id = c.id and p.user_id = ${me}
      where c.office_id = ${session.officeId} and c.status = 'published' and c.end_date >= ${now.today} order by c.end_date limit 3`;
    const challengeRows = [];
    for (const c of challenges) {
      const ranked = rankIndividuals(await challengeScores(tx, c.id), c.target_value ? Number(c.target_value) : null);
      challengeRows.push({ id: c.id as string, name: c.name as string, status: c.status as string, sd: c.sd as string, ed: c.ed as string, unit: c.unit as string, mine: ranked.find((r) => r.key === me), total: ranked.length });
    }
    const announcements = await tx`select id, title, body, pinned, published_at from announcements where office_id = ${session.officeId}
      and (expires_at is null or expires_at > now()) order by pinned desc, published_at desc limit 3`;
    const notes = await tx`select id, title, body, created_at, read_at, link from notifications where user_id = ${me} and office_id = ${session.officeId} order by created_at desc limit 5`;
    return { settings, now, todayRec, monthStats, tasks, taskCounts, pros, money, fines, goals, challengeRows, announcements, notes };
  });

  const hour = Number(d.now.time.slice(0, 2));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const decision = decideCheckIn(d.settings, d.now.today, d.now.time);

  return (
    <>
      {sp.denied ? <div className="mb-4"><Notice tone="warning">That area is only available to office administrators.</Notice></div> : null}
      <PageHeader eyebrow={formatDate(d.now.today, fmt.locale, 'long')} title={`${greeting}, ${session.fullName.split(' ')[0]}`}
        description="Here's where you stand today and this month." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-xs lg:col-span-1">
          <div className="text-xs font-medium text-slate-500">Today’s attendance</div>
          {d.todayRec ? (
            <div className="mt-2 flex items-center gap-2">
              <StatusBadge status={d.todayRec.status} />
              <span className="text-xs text-slate-500">{d.todayRec.checkInAt ? formatDateTime(d.todayRec.checkInAt, fmt, false) : 'by admin'}</span>
            </div>
          ) : decision.ok ? (
            <ActionForm action={checkInAction} className="mt-2">
              <SubmitButton size="sm" className="w-full"><CalendarCheck className="size-4" />Check in{decision.status === 'late' ? ' (late)' : ''}</SubmitButton>
            </ActionForm>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{decision.reason === 'not_working_day' ? 'Not a working day' : decision.reason === 'too_early' ? `Opens at ${d.settings.checkinOpens}` : 'Check-in closed'}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Month rate {formatPercent(d.monthStats.rate)}</p>
        </div>
        <StatCard label="Open tasks" value={d.taskCounts.open} icon={ClipboardList} tone={d.taskCounts.overdue ? 'critical' : 'brand'} href="/tasks"
          hint={d.taskCounts.overdue ? `${d.taskCounts.overdue} overdue` : `${d.taskCounts.done_month} completed this month`} />
        <StatCard label="Net cash flow (month)" value={formatMoney(d.money.net, fmt)} icon={Wallet} tone={Number(d.money.net) < 0 ? 'critical' : 'good'} href="/money"
          hint={`In ${formatMoney(d.money.income, fmt, { compact: true })} · Out ${formatMoney(d.money.expenses, fmt, { compact: true })}`} />
        <StatCard label="Outstanding fines" value={formatMoney(d.fines.outstanding, fmt)} icon={Gavel} tone={d.fines.count ? 'warning' : 'neutral'} href="/fines"
          hint={d.fines.count ? `${d.fines.count} unpaid fine${d.fines.count === 1 ? '' : 's'}` : 'All clear'} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Upcoming tasks" action={<LinkButton href="/tasks" variant="ghost" size="sm">View all</LinkButton>} />
          {d.tasks.length === 0 ? (
            <EmptyState compact icon={ClipboardList} title="No open tasks" description="You're all caught up." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                    <p className="text-xs text-slate-500">{t.kind === 'personal' ? 'Personal' : 'Assigned'} · {t.due ? `Due ${formatDate(t.due, fmt.locale, 'short')}` : 'No deadline'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {t.due && t.due < d.now.today ? <StatusBadge status="overdue" /> : null}
                    <StatusBadge status={t.priority} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Prospecting" description="Your pipeline this month" action={<LinkButton href="/prospects" variant="ghost" size="sm">Open</LinkButton>} />
          <CardBody className="grid grid-cols-2 gap-4">
            {[
              ['Active prospects', d.pros.active], ['Follow-ups due', d.pros.due], ['Added this month', d.pros.added], ['Converted this month', d.pros.converted],
            ].map(([l, v]) => (
              <div key={l as string}>
                <div className="text-xs text-slate-500">{l}</div>
                <div className="tabular mt-0.5 text-xl font-semibold text-slate-900">{v}</div>
              </div>
            ))}
            {d.pros.due > 0 ? <div className="col-span-2"><LinkButton href="/prospects?view=followups" size="sm" variant="secondary" className="w-full"><Users className="size-4" />Review {d.pros.due} follow-up{d.pros.due === 1 ? '' : 's'}</LinkButton></div> : null}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="My goals" action={<LinkButton href="/goals" variant="ghost" size="sm">All goals</LinkButton>} />
          <CardBody className="space-y-3">
            {d.goals.length === 0 ? <EmptyState compact icon={Target} title="No active goals" description="Your administrator hasn't set targets for you yet." /> : d.goals.map((g) => <GoalSummary key={g.id} g={g} today={d.now.today} fmt={fmt} />)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Challenges" action={<LinkButton href="/challenges" variant="ghost" size="sm">Browse</LinkButton>} />
          <CardBody className="space-y-4">
            {d.challengeRows.length === 0 ? (
              <EmptyState compact icon={Trophy} title="Not in a challenge" description="Join an active challenge to compete." action={<LinkButton href="/challenges" size="sm">See challenges</LinkButton>} />
            ) : d.challengeRows.map((c) => (
              <Link key={c.id} href={`/challenges/${c.id}`} className="block rounded-lg p-1 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-900">{c.name}</p>
                  <Badge tone="brand">{c.mine ? `#${c.mine.rank} of ${c.total}` : '—'}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{c.mine?.score ?? 0} {c.unit}{c.mine?.remaining != null ? ` · ${c.mine.remaining} to target` : ''} · {challengePhase({ status: c.status, startDate: c.sd, endDate: c.ed }, d.now.today) === 'upcoming' ? 'starts' : 'ends'} {formatDate(c.ed, fmt.locale, 'short')}</p>
                {c.mine?.percent != null ? <div className="mt-2"><ProgressBar value={c.mine.percent} size="sm" label={`${c.name} progress`} /></div> : null}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Announcements" />
          {d.announcements.length === 0 ? <EmptyState compact icon={Megaphone} title="No announcements" /> : (
            <ul className="divide-y divide-slate-100">
              {d.announcements.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-center gap-2"><p className="text-sm font-medium text-slate-900">{a.title}</p>{a.pinned ? <Badge tone="brand">Pinned</Badge> : null}</div>
                  <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{relativeTime(a.published_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Recent notifications" action={<LinkButton href="/notifications" variant="ghost" size="sm">View all</LinkButton>} />
          {d.notes.length === 0 ? <EmptyState compact icon={Bell} title="You're up to date" /> : (
            <ul className="divide-y divide-slate-100">
              {d.notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-5 py-3">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? 'bg-slate-200' : 'bg-brand-500'}`} aria-label={n.read_at ? 'Read' : 'Unread'} />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">{n.title}</p>
                    {n.body ? <p className="truncate text-xs text-slate-500">{n.body}</p> : null}
                    <p className="text-xs text-slate-400">{relativeTime(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
