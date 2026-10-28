import { Download } from 'lucide-react';
import { BarsChart, LinesChart } from '@/components/charts/charts';
import { GoalSummary } from '@/components/goal-card';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { str } from '@/components/ui/nav';
import { RangeFilter } from '@/components/ui/range-filter';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { SERIES_COLORS, STATUS_COLORS } from '@/lib/chart-colors';
import { addMonths, endOfMonth, monthLabel, resolveRange, startOfMonth } from '@/lib/dates';
import { rankIndividuals } from '@/lib/logic/challenges';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { adminPage, type SearchParams } from '@/server/page';
import { memberLeaderboard, periodMetrics } from '@/server/queries/analytics';
import { getSettings, officeNow } from '@/server/queries/common';
import { officeMonthly } from '@/server/queries/finance';
import { listGoals } from '@/server/queries/goals';
import { weeklyActivity } from '@/server/queries/performance';
import { challengeScores } from '@/server/services/challenges';

export const metadata = { title: 'Analytics & Reports' };

const METRICS: [string, string, 'n' | 'm'][] = [
  ['attendance_days', 'Days attended (all members)', 'n'], ['late_days', 'Late check-ins', 'n'], ['prospects_added', 'Prospects added', 'n'], ['conversions', 'Conversions', 'n'],
  ['tasks_completed', 'Tasks completed', 'n'], ['training_attendances', 'Training attendances', 'n'], ['challenge_participants', 'Challenge participants', 'n'],
  ['office_income', 'Office income', 'm'], ['office_expenses', 'Office expenses', 'm'], ['fines_collected', 'Fines collected', 'm'],
];

export default async function Analytics({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const settings = await getSettings(tx, session.officeId);
    const range = resolveRange({ range: str(sp, 'range'), from: str(sp, 'from'), to: str(sp, 'to') }, today);
    const thisM = await periodMetrics(tx, session.officeId, fmt.timezone, startOfMonth(today), today);
    const lastStart = addMonths(today, -1);
    const lastM = await periodMetrics(tx, session.officeId, fmt.timezone, lastStart, endOfMonth(lastStart));
    const rangeM = await periodMetrics(tx, session.officeId, fmt.timezone, range.from, range.to);
    const weekly = await weeklyActivity(tx, session.officeId, today, fmt.timezone, 12);
    const attWeekly = await tx`select to_char(date_trunc('week', att_date), 'YYYY-MM-DD') as wk, count(*) filter (where status = 'present')::int as present,
        count(*) filter (where status = 'late')::int as late, count(*) filter (where status = 'absent')::int as absent, count(*) filter (where status = 'excused')::int as excused
      from attendance_records where office_id = ${session.officeId} and att_date between ${range.from} and ${range.to} group by 1 order by 1`;
    const monthly = await officeMonthly(tx, session.officeId, addMonths(today, -11), today);
    const memberMoney = settings.adminViewMemberFinances ? await tx`select to_char(date_trunc('month', txn_date), 'YYYY-MM') as month,
        coalesce(sum(direction * amount) filter (where type = 'income'), 0)::float8 as income, coalesce(sum(direction * amount) filter (where type = 'income' and status = 'approved'), 0)::float8 as verified
      from personal_transactions where office_id = ${session.officeId} and status <> 'rejected' and txn_date >= ${addMonths(today, -5)} group by 1 order by 1` : null;
    const finesMonthly = await tx`select to_char(date_trunc('month', d), 'YYYY-MM') as month, sum(issued)::float8 as issued, sum(collected)::float8 as collected from (
        select issued_on as d, amount as issued, 0 as collected from fines where office_id = ${session.officeId} and issued_on >= ${addMonths(today, -5)}
        union all select paid_on, 0, amount from fine_payments where office_id = ${session.officeId} and status = 'confirmed' and paid_on >= ${addMonths(today, -5)}) x group by 1 order by 1`;
    const goals = await listGoals(tx, session.officeId, { status: 'active' });
    const challenges = await tx`select id, name, unit, target_value from challenges where office_id = ${session.officeId} and status = 'published' and start_date <= ${range.to} and end_date >= ${range.from}`;
    const chal = [];
    for (const c of challenges) {
      const ranked = rankIndividuals(await challengeScores(tx, c.id), c.target_value ? Number(c.target_value) : null);
      chal.push({ id: c.id as string, name: c.name as string, unit: c.unit as string, participants: ranked.length, total: ranked.reduce((s, r) => s + r.score, 0), leader: ranked[0] });
    }
    const trainings = await tx`select a.title, a.starts_at, count(r.*) filter (where r.status = 'attended')::int as attended, count(r.*) filter (where r.status in ('registered','attended','absent'))::int as registered
      from plan_activities a left join activity_registrations r on r.activity_id = a.id where a.office_id = ${session.officeId} and a.kind in ('training','workshop')
        and (a.starts_at at time zone ${fmt.timezone})::date between ${range.from} and ${range.to} group by a.id order by a.starts_at`;
    const board = await memberLeaderboard(tx, session.officeId, fmt.timezone, range.from, range.to);
    return { today, range, thisM, lastM, rangeM, weekly, attWeekly, monthly, memberMoney, finesMonthly, goals, chal, trainings, board };
  });
  const money = { kind: 'money' as const, currency: fmt.currency, locale: fmt.locale };
  const v = (k: string, m: Record<string, number>, kind: 'n' | 'm') => (kind === 'm' ? formatMoney(m[k], fmt, { compact: true }) : formatNumber(m[k], fmt.locale));
  const weekly = d.weekly.map((w) => ({ ...w, label: formatDate(w.week, fmt.locale, 'short') }));
  return (
    <>
      <PageHeader title="Analytics & reports" description="Every chart is built from stored records. Use the period filter to focus the breakdowns; exports respect the same period where noted."
        actions={<div className="flex flex-wrap gap-2">
          {['attendance', 'prospects', 'tasks', 'office-transactions', 'expenses', 'fines', 'members'].map((k) => (
            <LinkButton key={k} href={`/api/export/${k}?from=${d.range.from}&to=${d.range.to}`} variant="secondary" size="sm"><Download className="size-3.5" />{k.replace('-', ' ')}</LinkButton>
          ))}
        </div>} />
      <RangeFilter range={d.range.preset} from={d.range.from} to={d.range.to} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Days attended" value={formatNumber(d.rangeM.attendance_days, fmt.locale)} hint={`${d.rangeM.late_days} late`} />
        <StatCard label="Prospects added" value={d.rangeM.prospects_added} hint={`${d.rangeM.conversions} conversions`} />
        <StatCard label="Tasks completed" value={d.rangeM.tasks_completed} />
        <StatCard label="Office net" value={formatMoney(d.rangeM.office_income - d.rangeM.office_expenses, fmt, { compact: true })} hint={`In ${formatMoney(d.rangeM.office_income, fmt, { compact: true })} · out ${formatMoney(d.rangeM.office_expenses, fmt, { compact: true })}`} />
        <StatCard label="Training attendances" value={d.rangeM.training_attendances} hint={`${d.rangeM.challenge_participants} challenge participants`} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Monthly comparison" description={`${monthLabel(d.today, fmt.locale)} to date vs all of ${monthLabel(addMonths(d.today, -1), fmt.locale)}`} />
        <Table>
          <THead><tr><Th>Metric</Th><Th align="right">Last month</Th><Th align="right">This month (to date)</Th><Th align="right">Change</Th></tr></THead>
          <TBody>{METRICS.map(([k, label, kind]) => {
            const a = d.lastM[k]; const b = d.thisM[k];
            const ch = a ? Math.round(((b - a) / a) * 1000) / 10 : null;
            return <Tr key={k}><Td>{label}</Td><Td align="right">{v(k, d.lastM, kind)}</Td><Td align="right" className="font-medium">{v(k, d.thisM, kind)}</Td>
              <Td align="right" className={ch === null ? '' : ch >= 0 ? 'text-emerald-700' : 'text-red-700'}>{ch === null ? '—' : `${ch > 0 ? '+' : ''}${ch}%`}</Td></Tr>;
          })}</TBody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attendance by week" description="Records per status in the selected period" />
          <CardBody>{d.attWeekly.length === 0 ? <EmptyState compact title="No attendance in this period" /> : (
            <BarsChart ariaLabel="Weekly attendance by status" stacked data={d.attWeekly.map((w) => ({ ...w, label: formatDate(w.wk, fmt.locale, 'short') }))} xKey="label" xLabel="Week starting"
              series={[{ key: 'present', label: 'Present', color: STATUS_COLORS.good }, { key: 'late', label: 'Late', color: STATUS_COLORS.warning }, { key: 'excused', label: 'Excused', color: STATUS_COLORS.neutral }, { key: 'absent', label: 'Absent', color: STATUS_COLORS.critical }]} />
          )}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Prospecting & conversions" description="Last 12 weeks" />
          <CardBody><LinesChart ariaLabel="Prospects added and converted per week" data={weekly} xKey="label" xLabel="Week" series={[{ key: 'prospects', label: 'Added', color: SERIES_COLORS[0] }, { key: 'converted', label: 'Converted', color: SERIES_COLORS[1] }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Tasks completed" description="Last 12 weeks" />
          <CardBody><BarsChart ariaLabel="Tasks completed per week" data={weekly} xKey="label" xLabel="Week" series={[{ key: 'tasks', label: 'Tasks completed', color: SERIES_COLORS[0] }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Office income vs expenses" description="Last 12 months" />
          <CardBody><BarsChart ariaLabel="Office income and expenses per month" data={d.monthly} xKey="month" xLabel="Month" format={money} series={[{ key: 'income', label: 'Income', color: SERIES_COLORS[0] }, { key: 'expenses', label: 'Expenses', color: SERIES_COLORS[1] }]} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Fines issued vs collected" description="Last 6 months" />
          <CardBody>{d.finesMonthly.length === 0 ? <EmptyState compact title="No fines" /> : <BarsChart ariaLabel="Fines issued and collected per month" data={d.finesMonthly} xKey="month" xLabel="Month" format={money} series={[{ key: 'issued', label: 'Issued', color: SERIES_COLORS[0] }, { key: 'collected', label: 'Collected', color: SERIES_COLORS[1] }]} />}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Member-recorded income" description="Sum of members’ personal income records — not office revenue" />
          <CardBody>{d.memberMoney === null ? <EmptyState compact title="Hidden" description="Administrator access to member finances is off in Settings." /> : d.memberMoney.length === 0 ? <EmptyState compact title="No records" /> : (
            <LinesChart ariaLabel="Member recorded income per month" data={d.memberMoney} xKey="month" xLabel="Month" format={money} series={[{ key: 'income', label: 'Recorded', color: SERIES_COLORS[0] }, { key: 'verified', label: 'Verified', color: SERIES_COLORS[1] }]} />
          )}</CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Member activity (period)" description="Raw counts — no composite score is calculated" />
        <Table>
          <THead><tr><Th>Member</Th><Th align="right">Days attended</Th><Th align="right">Tasks completed</Th><Th align="right">Prospects added</Th><Th align="right">Converted</Th><Th align="right">Trainings attended</Th></tr></THead>
          <TBody>{d.board.map((m) => <Tr key={m.id}><Td className="font-medium text-slate-900">{m.full_name}</Td><Td align="right">{m.attended}</Td><Td align="right">{m.tasks}</Td><Td align="right">{m.added}</Td><Td align="right">{m.converted}</Td><Td align="right">{m.trainings}</Td></Tr>)}</TBody>
        </Table>
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Challenges in this period" />
          {d.chal.length === 0 ? <EmptyState compact title="No published challenges overlap this period" /> : (
            <Table>
              <THead><tr><Th>Challenge</Th><Th align="right">Participants</Th><Th align="right">Total verified score</Th><Th>Leader</Th></tr></THead>
              <TBody>{d.chal.map((c) => <Tr key={c.id}><Td>{c.name}</Td><Td align="right">{c.participants}</Td><Td align="right">{formatNumber(c.total, fmt.locale, 2)} {c.unit}</Td><Td className="text-xs">{c.leader && c.leader.score > 0 ? `${c.leader.name} (${c.leader.score})` : '—'}</Td></Tr>)}</TBody>
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Training participation" />
          {d.trainings.length === 0 ? <EmptyState compact title="No trainings in this period" /> : (
            <Table>
              <THead><tr><Th>Session</Th><Th align="right">Registered</Th><Th align="right">Attended</Th><Th align="right">Turnout</Th></tr></THead>
              <TBody>{d.trainings.map((t, i) => <Tr key={i}><Td>{t.title}<div className="text-xs text-slate-500">{formatDate(new Date(t.starts_at).toISOString().slice(0, 10), fmt.locale, 'short')}</div></Td><Td align="right">{t.registered}</Td><Td align="right">{t.attended}</Td><Td align="right">{t.registered ? formatPercent(Math.round((t.attended / t.registered) * 1000) / 10) : '—'}</Td></Tr>)}</TBody>
            </Table>
          )}
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Goal progress" />
        <CardBody className="grid gap-3 lg:grid-cols-2">{d.goals.length === 0 ? <EmptyState compact title="No active goals" /> : d.goals.map((g) => <GoalSummary key={g.id} g={g} today={d.today} fmt={fmt} />)}</CardBody>
      </Card>
      <MetricNote>Conversions use the date a prospect moved to “Converted”. Tasks use completion time in office time. Office income/expenses come only from the office ledger. Turnout = attended ÷ registered.</MetricNote>
    </>
  );
}
