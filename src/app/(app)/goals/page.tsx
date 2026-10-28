import { Target } from 'lucide-react';
import { GoalSummary } from '@/components/goal-card';
import { BarsChart, LinesChart } from '@/components/charts/charts';
import { SERIES_COLORS } from '@/lib/chart-colors';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { addMonths, startOfMonth } from '@/lib/dates';
import { formatDate, formatPercent } from '@/lib/format';
import { memberPage } from '@/server/page';
import { memberStats } from '@/server/queries/attendance';
import { getSettings, officeNow } from '@/server/queries/common';
import { personalMonthly } from '@/server/queries/finance';
import { goalHistory, listGoals } from '@/server/queries/goals';
import { currentLevel, weeklyActivity } from '@/server/queries/performance';

export const metadata = { title: 'My Goals & Performance' };

export default async function GoalsPage() {
  const { session, fmt, load } = await memberPage();
  const d = await load(async (tx) => {
    const now = await officeNow(tx, session.officeId);
    const settings = await getSettings(tx, session.officeId);
    const [m] = await tx`select team_id from memberships where office_id = ${session.officeId} and user_id = ${session.userId}`;
    const goals = await listGoals(tx, session.officeId, { visibleTo: session.userId, teamId: m?.team_id ?? null });
    const mine = goals.filter((g) => g.scope === 'individual');
    const history = await goalHistory(tx, mine.map((g) => g.id));
    const weekly = await weeklyActivity(tx, session.officeId, now.today, fmt.timezone, 8, session.userId);
    const levels = await currentLevel(tx, session.officeId, session.userId);
    const att = await memberStats(tx, session.officeId, session.userId, settings, startOfMonth(now.today), now.today, now.today, now.time);
    const income = await personalMonthly(tx, session.officeId, session.userId, addMonths(now.today, -5), now.today);
    const [ch] = await tx`select count(*)::int as joined, (select count(*)::int from challenge_rewards where user_id = ${session.userId} and office_id = ${session.officeId}) as rewards
      from challenge_participants where user_id = ${session.userId} and office_id = ${session.officeId}`;
    return { now, goals, mine, history, weekly, levels, att, income, ch };
  });
  const active = d.goals.filter((g) => g.status === 'active');
  const past = d.goals.filter((g) => g.status !== 'active');
  const weekly = d.weekly.map((w) => ({ ...w, label: formatDate(w.week, fmt.locale, 'short') }));
  const lvl = d.levels[0];
  return (
    <>
      <PageHeader title="My Goals & Performance" description="Targets set by your office and how your activity is trending. Every figure comes from your recorded activity." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Current level" value={lvl?.name ?? 'Not set'} hint={lvl ? `Since ${formatDate(lvl.achieved_on, fmt.locale)}` : 'Ask your administrator'} />
        <StatCard label="Attendance this month" value={formatPercent(d.att.rate)} hint={`${d.att.present + d.att.late} days attended`} />
        <StatCard label="Active goals" value={active.length} hint={`${active.filter((g) => g.current >= g.target && g.target > 0).length} on target`} />
        <StatCard label="Challenges joined" value={d.ch.joined} hint={`${d.ch.rewards} reward${d.ch.rewards === 1 ? '' : 's'} earned`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Active goals" description="Individual, team and office targets that include you" />
          <CardBody className="space-y-3">
            {active.length === 0 ? <EmptyState compact icon={Target} title="No active goals" description="Your administrator hasn't set any targets yet." /> : active.map((g) => <GoalSummary key={g.id} g={g} today={d.now.today} fmt={fmt} />)}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Weekly activity" description="Last 8 weeks (week starting Monday)" />
            <CardBody className="grid gap-6 sm:grid-cols-3">
              <div><p className="mb-1 text-xs font-medium text-slate-600">Days attended</p><BarsChart ariaLabel="Days attended per week" height={140} data={weekly} xKey="label" xLabel="Week" series={[{ key: 'attendance', label: 'Days attended', color: SERIES_COLORS[0] }]} /></div>
              <div><p className="mb-1 text-xs font-medium text-slate-600">Prospects added</p><BarsChart ariaLabel="Prospects added per week" height={140} data={weekly} xKey="label" xLabel="Week" series={[{ key: 'prospects', label: 'Prospects added', color: SERIES_COLORS[0] }]} /></div>
              <div><p className="mb-1 text-xs font-medium text-slate-600">Tasks completed</p><BarsChart ariaLabel="Tasks completed per week" height={140} data={weekly} xKey="label" xLabel="Week" series={[{ key: 'tasks', label: 'Tasks completed', color: SERIES_COLORS[0] }]} /></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Monthly income" description="Recorded personal income, last 6 months" />
            <CardBody>
              {d.income.length === 0 ? <EmptyState compact title="No income recorded" /> : (
                <LinesChart ariaLabel="Monthly personal income" height={180} data={d.income.map((m) => ({ month: m.month, income: m.income }))} xKey="month" xLabel="Month"
                  format={{ kind: 'money', currency: fmt.currency, locale: fmt.locale }} series={[{ key: 'income', label: 'Income', color: SERIES_COLORS[0] }]} />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {d.mine.length ? (
        <Card className="mt-6">
          <CardHeader title="Progress history" description="Recorded snapshots for your individual goals (value vs target at the time)" />
          <CardBody className="grid gap-6 md:grid-cols-2">
            {d.mine.map((g) => {
              const h = d.history.get(g.id) ?? [];
              return (
                <div key={g.id}>
                  <p className="mb-1 text-xs font-medium text-slate-600">{g.title}</p>
                  {h.length < 2 ? <p className="text-xs text-slate-500">Not enough history yet — snapshots are recorded when progress is updated.</p> : (
                    <LinesChart ariaLabel={`${g.title} history`} height={150} xKey="at" xLabel="Recorded"
                      data={h.map((x) => ({ at: formatDate(x.at.toISOString().slice(0, 10), fmt.locale, 'short'), value: x.value, target: x.target }))}
                      series={[{ key: 'value', label: 'Value', color: SERIES_COLORS[0] }, { key: 'target', label: 'Target', color: SERIES_COLORS[1] }]} />
                  )}
                </div>
              );
            })}
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Level history" description="Progression levels are defined by your office" />
          {d.levels.length === 0 ? <EmptyState compact title="No level recorded" /> : (
            <ul className="divide-y divide-slate-100">
              {d.levels.map((l, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div><span className="font-medium text-slate-900">{l.name}</span>{i === 0 ? <Badge tone="brand" className="ml-2">Current</Badge> : null}<p className="text-xs text-slate-500">{l.criteria ?? ''}</p></div>
                  <span className="text-xs text-slate-500">{formatDate(l.achieved_on, fmt.locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Completed & past goals" />
          <CardBody className="space-y-3">
            {past.length === 0 ? <EmptyState compact title="No past goals yet" /> : past.map((g) => <GoalSummary key={g.id} g={g} today={d.now.today} fmt={fmt} />)}
          </CardBody>
        </Card>
      </div>
      <MetricNote>Progress % = current value ÷ target × 100 (capped at 100% on the bar; over-achievement is shown in the label). Automatic goals show live values calculated from office records; snapshots for the history chart are stored when an administrator recalculates goals.</MetricNote>
    </>
  );
}
