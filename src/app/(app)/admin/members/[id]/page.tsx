import { notFound } from 'next/navigation';
import Link from 'next/link';
import { MemberFields, TempPasswordInput } from '@/components/forms/member-forms';
import { BarsChart } from '@/components/charts/charts';
import { SERIES_COLORS } from '@/lib/chart-colors';
import { GoalSummary } from '@/components/goal-card';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { DefinitionList, EmptyState, MetricNote, Notice, PageHeader, StatCard } from '@/components/ui/misc';
import { startOfMonth } from '@/lib/dates';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { resetPasswordAction, setLevelAction, setMemberStatusAction, updateMemberAction } from '@/server/actions/members';
import { adminPage } from '@/server/page';
import { memberStats } from '@/server/queries/attendance';
import { getSettings, officeNow, teamOptions } from '@/server/queries/common';
import { personalTotals } from '@/server/queries/finance';
import { listGoals } from '@/server/queries/goals';
import { currentLevel, weeklyActivity } from '@/server/queries/performance';
import { taskCounts } from '@/server/queries/tasks';

export const metadata = { title: 'Member' };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const [m] = await tx`select m.*, m.id as membership_id, m.joined_on::text as joined, u.full_name, u.email, u.phone, t.name as team
      from memberships m join users u on u.id = m.user_id left join teams t on t.id = m.team_id where m.office_id = ${session.officeId} and m.user_id = ${id}`;
    if (!m) return null;
    const now = await officeNow(tx, session.officeId);
    const settings = await getSettings(tx, session.officeId);
    const month = startOfMonth(now.today);
    const att = await memberStats(tx, session.officeId, id, settings, month, now.today, now.today, now.time);
    const tasks = await taskCounts(tx, session.officeId, now.today, month, id);
    const [pros] = await tx`select count(*) filter (where archived_at is null and stage not in ('converted','not_interested'))::int as active,
      count(*) filter (where stage = 'converted')::int as converted, count(*)::int as total from prospects where office_id = ${session.officeId} and owner_id = ${id}`;
    const money = settings.adminViewMemberFinances ? await personalTotals(tx, session.officeId, id, month, now.today) : null;
    const [fines] = await tx`select coalesce(sum(amount - app.fine_paid_total(id)) filter (where status in ('pending','partially_paid','disputed')), 0) as due, count(*)::int as n from fines where office_id = ${session.officeId} and user_id = ${id}`;
    const goals = await listGoals(tx, session.officeId, { userId: id });
    const levels = await currentLevel(tx, session.officeId, id);
    const allLevels = await tx`select id, name, rank from levels where office_id = ${session.officeId} order by rank`;
    const weekly = await weeklyActivity(tx, session.officeId, now.today, fmt.timezone, 8, id);
    const teams = await teamOptions(tx, session.officeId);
    return { m, now, att, tasks, pros, money, fines, goals, levels, allLevels, weekly, teams };
  });
  if (!d) notFound();
  const { m } = d;
  const self = id === session.userId;
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/members" className="hover:underline">← Members</Link>} title={m.full_name}
        description={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={m.status} /> {m.role === 'admin' ? 'Administrator' : 'Member'}{m.title ? ` · ${m.title}` : ''}</span>}
        actions={<>
          <FormDialog action={updateMemberAction} title="Edit member" trigger="Edit" triggerVariant="secondary" size="lg">
            <MemberFields teams={d.teams} today={d.now.today} defaults={{ membershipId: m.membership_id, fullName: m.full_name, email: m.email, phone: m.phone, role: m.role, teamId: m.team_id, title: m.title, joinedOn: m.joined }} />
          </FormDialog>
          <FormDialog action={setLevelAction} title="Set progression level" trigger="Set level" triggerVariant="secondary" hidden={{ userId: id }} size="sm">
            <Select name="levelId" label="Level" required options={d.allLevels.map((l) => ({ value: l.id, label: `${l.name} (rank ${l.rank})` }))} />
            <Input name="achievedOn" type="date" label="Achieved on" required defaultValue={d.now.today} />
            <Textarea name="note" label="Note" rows={2} />
          </FormDialog>
          {!self ? (
            <FormDialog action={resetPasswordAction} title="Issue temporary password" trigger="Reset password" triggerVariant="secondary" hidden={{ userId: id }} submitLabel="Set temporary password"
              description="Use this when a member forgets their password. They are signed out everywhere and must choose a new password at next sign-in.">
              <TempPasswordInput />
            </FormDialog>
          ) : null}
          {!self ? (
            <ActionButton action={setMemberStatusAction} fields={{ membershipId: m.membership_id, status: m.status === 'active' ? 'inactive' : 'active' }} size="md"
              variant={m.status === 'active' ? 'danger' : 'primary'} reasonName="reason" confirmTitle={m.status === 'active' ? 'Deactivate member' : 'Reactivate member'}
              confirm={m.status === 'active' ? 'They will be signed out and lose access. Attendance, finances, tasks and audit history are kept.' : 'They will be able to sign in again.'}>
              {m.status === 'active' ? 'Deactivate' : 'Reactivate'}
            </ActionButton>
          ) : null}
        </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Attendance (month)" value={formatPercent(d.att.rate)} hint={`${d.att.present} on time · ${d.att.late} late · ${d.att.absent + d.att.unrecorded} absent`} />
        <StatCard label="Tasks" value={`${d.tasks.open} open`} hint={`${d.tasks.overdue} overdue · on-time ${formatPercent(d.tasks.onTimeRate)}`} tone={d.tasks.overdue ? 'critical' : 'neutral'} />
        <StatCard label="Prospects" value={d.pros.active} hint={`${d.pros.converted} converted of ${d.pros.total}`} />
        <StatCard label="Fines outstanding" value={formatMoney(d.fines.due, fmt)} hint={`${d.fines.n} fines total`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <DefinitionList items={[
              { label: 'Email', value: m.email }, { label: 'Phone', value: m.phone ?? '—' }, { label: 'Team', value: m.team ?? '—' },
              { label: 'Joined', value: formatDate(m.joined, fmt.locale) }, { label: 'Level', value: d.levels[0]?.name ?? '—' },
              { label: 'Deactivated', value: m.deactivated_at ? formatDate(m.deactivated_at.toISOString().slice(0, 10), fmt.locale) : '—' },
            ]} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Weekly activity" description="Last 8 weeks" />
          <CardBody>
            <BarsChart ariaLabel="Weekly activity" height={200} data={d.weekly.map((w) => ({ ...w, label: formatDate(w.week, fmt.locale, 'short') }))} xKey="label" xLabel="Week"
              series={[{ key: 'attendance', label: 'Days attended', color: SERIES_COLORS[0] }, { key: 'prospects', label: 'Prospects added', color: SERIES_COLORS[1] }, { key: 'tasks', label: 'Tasks completed', color: SERIES_COLORS[2] }]} />
          </CardBody>
        </Card>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Individual goals" action={<Link className="text-xs text-brand-700 hover:underline" href="/admin/goals">Manage goals</Link>} />
          <CardBody className="space-y-3">{d.goals.length === 0 ? <EmptyState compact title="No individual goals" /> : d.goals.map((g) => <GoalSummary key={g.id} g={g} today={d.now.today} fmt={fmt} />)}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Personal finances (month)" />
          <CardBody>
            {d.money ? (
              <>
                <FormGrid cols={3}>
                  <div><div className="text-xs text-slate-500">Income</div><div className="tabular font-semibold">{formatMoney(d.money.income, fmt)}</div></div>
                  <div><div className="text-xs text-slate-500">Expenses</div><div className="tabular font-semibold">{formatMoney(d.money.expenses, fmt)}</div></div>
                  <div><div className="text-xs text-slate-500">Verified income</div><div className="tabular font-semibold">{formatMoney(d.money.verifiedIncome, fmt)}</div></div>
                </FormGrid>
                <MetricNote>Member-recorded personal figures. Never counted as office revenue.</MetricNote>
              </>
            ) : <Notice tone="info">Administrator access to member finances is turned off in Settings.</Notice>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
