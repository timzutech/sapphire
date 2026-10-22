import { AlertTriangle, CalendarCheck, ClipboardList, Gavel, Landmark, Users } from 'lucide-react';
import Link from 'next/link';
import { BarsChart } from '@/components/charts/charts';
import { GoalSummary } from '@/components/goal-card';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { STATUS_COLORS } from '@/lib/chart-colors';
import { addDays, eachDay, isoWeekday, startOfMonth } from '@/lib/dates';
import { formatDate, formatMoney, formatPercent, relativeTime } from '@/lib/format';
import { adminPage } from '@/server/page';
import { dailyCounts, officeAttendanceStats } from '@/server/queries/attendance';
import { getSettings, officeNow } from '@/server/queries/common';
import { officeBalances, officeObligationTotals, officeTotals } from '@/server/queries/finance';
import { listGoals } from '@/server/queries/goals';
import { taskCounts } from '@/server/queries/tasks';

export const metadata = { title: 'Overview' };

export default async function AdminOverview() {
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const now = await officeNow(tx, session.officeId);
    const settings = await getSettings(tx, session.officeId);
    const month = startOfMonth(now.today);
    const [today] = await tx`select count(*) filter (where m.status = 'active')::int as active,
        count(a.*) filter (where a.status = 'present')::int as present, count(a.*) filter (where a.status = 'late')::int as late,
        count(a.*) filter (where a.status = 'absent')::int as absent, count(a.*) filter (where a.status = 'excused')::int as excused
      from memberships m left join attendance_records a on a.user_id = m.user_id and a.office_id = m.office_id and a.att_date = ${now.today}
      where m.office_id = ${session.officeId} and m.status = 'active'`;
    const stats = await officeAttendanceStats(tx, session.officeId, settings, month, now.today, now.today, now.time);
    const from = addDays(now.today, -27);
    const daily = await dailyCounts(tx, session.officeId, from, now.today);
    const chart = eachDay(from, now.today).filter((x) => settings.workingDays.includes(isoWeekday(x)))
      .map((x) => ({ day: formatDate(x, fmt.locale, 'short'), ...(daily.get(x) ?? { present: 0, late: 0, absent: 0, excused: 0 }) }));
    const tasks = await taskCounts(tx, session.officeId, now.today, month);
    const money = await officeTotals(tx, session.officeId, month, now.today);
    const balances = await officeBalances(tx, session.officeId);
    const obligations = await officeObligationTotals(tx, session.officeId);
    const goals = (await listGoals(tx, session.officeId, { scope: 'office', status: 'active' })).slice(0, 4);
    const [ap] = await tx`select
      (select count(*) from personal_transactions where office_id = ${session.officeId} and status = 'pending')::int as finance,
      (select count(*) from expenses where office_id = ${session.officeId} and status = 'pending')::int as expenses,
      (select count(*) from fine_payments where office_id = ${session.officeId} and status = 'pending')::int as payments,
      (select count(*) from fine_disputes where office_id = ${session.officeId} and status = 'open')::int as disputes,
      (select count(*) from challenge_submissions where office_id = ${session.officeId} and status = 'pending')::int as submissions,
      (select count(*) from prospects where office_id = ${session.officeId} and archived_at is null and stage not in ('converted','not_interested') and next_follow_up < ${now.today}::date - 7)::int as neglected`;
    const audit = await tx`select a.summary, a.created_at, u.full_name from audit_logs a left join users u on u.id = a.actor_id where a.office_id = ${session.officeId} order by a.created_at desc limit 6`;
    return { now, today, stats, chart, tasks, money, balances, obligations, goals, ap, audit };
  });
  const cash = d.balances.reduce((s, b) => s + Number(b.balance), 0);
  const notYet = d.today.active - d.today.present - d.today.late - d.today.absent - d.today.excused;
  const flagged = d.stats.filter((s) => s.stats.late >= 3 || s.stats.absent + s.stats.unrecorded >= 3);
  const rates = d.stats.map((s) => s.stats.rate).filter((r): r is number => r !== null);
  const avgRate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
  const approvals = [
    { label: 'Member financial records to verify', n: d.ap.finance, href: '/admin/finances?tab=verifications' },
    { label: 'Expenses awaiting approval', n: d.ap.expenses, href: '/admin/expenses?status=pending' },
    { label: 'Fine payments to confirm', n: d.ap.payments, href: '/admin/fines?tab=payments' },
    { label: 'Open fine disputes', n: d.ap.disputes, href: '/admin/fines?tab=disputes' },
    { label: 'Challenge submissions to review', n: d.ap.submissions, href: '/admin/challenges' },
    { label: 'Prospects with follow-ups >7 days overdue', n: d.ap.neglected, href: '/admin/prospects?view=neglected' },
  ].filter((a) => a.n > 0);
  return (
    <>
      <PageHeader eyebrow={formatDate(d.now.today, fmt.locale, 'long')} title="Office overview" description={`${session.office.name} at a glance — office time ${d.now.time}.`} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Checked in today" value={`${d.today.present + d.today.late} / ${d.today.active}`} icon={CalendarCheck} tone="brand" href="/admin/attendance"
          hint={`${d.today.late} late · ${d.today.absent} absent · ${d.today.excused} excused · ${notYet} no record`} />
        <StatCard label="Avg attendance rate (month)" value={formatPercent(avgRate)} icon={Users} hint={`${flagged.length} member${flagged.length === 1 ? '' : 's'} flagged`} />
        <StatCard label="Open tasks" value={d.tasks.open} icon={ClipboardList} tone={d.tasks.overdue ? 'critical' : 'neutral'} href="/admin/tasks" hint={`${d.tasks.overdue} overdue · on-time ${formatPercent(d.tasks.onTimeRate)}`} />
        <StatCard label="Recorded cash balance" value={formatMoney(cash, fmt)} icon={Landmark} tone="good" href="/admin/finances"
          hint={`Month: +${formatMoney(d.money.income, fmt, { compact: true })} / −${formatMoney(d.money.expenses, fmt, { compact: true })}`} />
      </div>
      <MetricNote>Average attendance rate = mean of each active member’s rate this month. Cash balance = opening balances + all office book entries (see Office Finances).</MetricNote>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Attendance — last 4 weeks" description="Members per working day by status" action={<LinkButton href="/admin/attendance" variant="ghost" size="sm">Details</LinkButton>} />
          <CardBody>
            <BarsChart ariaLabel="Daily attendance by status" stacked data={d.chart} xKey="day" xLabel="Day" height={230}
              series={[{ key: 'present', label: 'Present', color: STATUS_COLORS.good }, { key: 'late', label: 'Late', color: STATUS_COLORS.warning }, { key: 'excused', label: 'Excused', color: STATUS_COLORS.neutral }, { key: 'absent', label: 'Absent', color: STATUS_COLORS.critical }]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Needs your attention" />
          {approvals.length === 0 ? <EmptyState compact title="Nothing waiting" description="All approvals are up to date." /> : (
            <ul className="divide-y divide-slate-100">
              {approvals.map((a) => (
                <li key={a.label}><Link href={a.href} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                  <span className="text-slate-700">{a.label}</span><span className="rounded-full bg-brand-600 px-2 text-xs font-semibold text-white">{a.n}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Office goals" action={<LinkButton href="/admin/goals" variant="ghost" size="sm">Manage</LinkButton>} />
          <CardBody className="space-y-3">{d.goals.length === 0 ? <EmptyState compact title="No active office goals" action={<LinkButton href="/admin/goals" size="sm">Create a goal</LinkButton>} /> : d.goals.map((g) => <GoalSummary key={g.id} g={g} today={d.now.today} fmt={fmt} />)}</CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Money owed" />
            <CardBody className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-600">Outstanding fines</span><span className="tabular font-medium">{formatMoney(d.obligations.fines_outstanding, fmt)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Other receivables</span><span className="tabular font-medium">{formatMoney(d.obligations.receivables, fmt)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">Payables</span><span className="tabular font-medium">{formatMoney(Number(d.obligations.payables) + Number(d.obligations.approved_unpaid), fmt)}</span></div>
              <Link href="/admin/fines" className="inline-flex items-center gap-1 pt-1 text-xs text-brand-700 hover:underline"><Gavel className="size-3.5" />Fines</Link>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Attendance flags (month)" />
            {flagged.length === 0 ? <EmptyState compact title="No repeated lateness or absence" /> : (
              <ul className="divide-y divide-slate-100">{flagged.slice(0, 5).map((f) => (
                <li key={f.userId} className="flex items-center justify-between px-5 py-2.5 text-sm"><Link href={`/admin/members/${f.userId}`} className="hover:underline">{f.name}</Link>
                  <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="size-3.5" />{f.stats.late} late · {f.stats.absent + f.stats.unrecorded} absent</span></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
      <Card className="mt-6">
        <CardHeader title="Recent administrative activity" action={<LinkButton href="/admin/audit" variant="ghost" size="sm">Audit log</LinkButton>} />
        <ul className="divide-y divide-slate-100">{d.audit.map((a, i) => (
          <li key={i} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span className="text-slate-700"><span className="font-medium text-slate-900">{a.full_name ?? 'System'}</span> — {a.summary}</span><span className="shrink-0 text-xs text-slate-400">{relativeTime(a.created_at)}</span></li>
        ))}</ul>
      </Card>
    </>
  );
}
