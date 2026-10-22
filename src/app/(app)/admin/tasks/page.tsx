import { Download, Plus } from 'lucide-react';
import { TaskFields } from '@/components/forms/task-forms';
import { TaskList } from '@/components/task-list';
import { StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { EmptyState, MetricNote, PageHeader, ProgressBar, StatCard } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { PRIORITY_OPTIONS } from '@/lib/constants';
import { addDays, eachDay, startOfMonth } from '@/lib/dates';
import { formatDate, formatPercent } from '@/lib/format';
import { assignTaskAction } from '@/server/actions/tasks';
import { adminPage, type SearchParams } from '@/server/page';
import { memberOptions, officeNow } from '@/server/queries/common';
import { listTasks, taskCounts } from '@/server/queries/tasks';

export const metadata = { title: 'Tasks' };

export default async function AdminTasks({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const layout = str(sp, 'layout') ?? 'list';
  const view = str(sp, 'view') ?? (str(sp, 'status') === 'completed' ? 'completed' : 'open');
  const { session, fmt, load } = await adminPage();
  const { page, limit, offset } = pageOf(sp, 25);
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const month = startOfMonth(today);
    const counts = await taskCounts(tx, session.officeId, today, month);
    const members = await memberOptions(tx, session.officeId);
    const list = layout === 'list' ? await listTasks(tx, { officeId: session.officeId, today, assigneeId: str(sp, 'member'), view, priority: str(sp, 'priority'), kind: str(sp, 'kind') ?? 'assigned', q: str(sp, 'q'), limit, offset }) : null;
    const board = layout === 'board' ? await tx`select t.id, t.title, t.status, t.priority, t.due_date::text as due, u.full_name from tasks t join users u on u.id = t.assignee_id
        where t.office_id = ${session.officeId} and t.kind = 'assigned' and (t.status in ('pending','in_progress') or t.completed_at > now() - interval '14 days')
        ${str(sp, 'member') ? tx`and t.assignee_id = ${str(sp, 'member')!}` : tx``} order by t.due_date nulls last limit 300` : [];
    const timeline = layout === 'timeline' ? await tx`select t.id, t.title, t.priority, t.status, t.due_date::text as due, u.full_name from tasks t join users u on u.id = t.assignee_id
        where t.office_id = ${session.officeId} and t.status in ('pending','in_progress') and t.due_date between ${addDays(today, -7)} and ${addDays(today, 14)} order by t.due_date` : [];
    const perMember = await tx`select u.id, u.full_name,
        count(t.*) filter (where t.kind = 'assigned' and t.due_date between ${month} and ${today} and t.status <> 'cancelled')::int as due,
        count(t.*) filter (where t.kind = 'assigned' and t.due_date between ${month} and ${today} and t.status = 'completed')::int as done,
        count(t.*) filter (where t.status in ('pending','in_progress') and t.due_date < ${today})::int as overdue
      from memberships m join users u on u.id = m.user_id left join tasks t on t.assignee_id = m.user_id and t.office_id = m.office_id
      where m.office_id = ${session.officeId} and m.status = 'active' group by u.id, u.full_name order by u.full_name`;
    return { today, counts, members, list, board, timeline, perMember };
  });
  const memberOpts = d.members.map((m) => ({ value: m.value, label: m.label }));
  return (
    <>
      <PageHeader title="Tasks" description="Assign work, track progress and spot overdue items."
        actions={<>
          <LinkButton href="/api/export/tasks" variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={assignTaskAction} title="Assign a task" trigger={<><Plus className="size-4" />Assign task</>} submitLabel="Assign" size="lg">
            <TaskFields members={memberOpts} multi />
          </FormDialog>
        </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open tasks" value={d.counts.open} />
        <StatCard label="Overdue" value={d.counts.overdue} tone={d.counts.overdue ? 'critical' : 'neutral'} />
        <StatCard label="Completed this month" value={d.counts.completed_month} />
        <StatCard label="On-time completion (month)" value={formatPercent(d.counts.onTimeRate)} hint={`${d.counts.on_time} of ${d.counts.due_assigned} due so far`} />
      </div>
      <div className="mt-6">
        <LinkTabs base="/admin/tasks" params={sp} param="layout" current={layout} tabs={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }, { value: 'timeline', label: 'Timeline' }, { value: 'members', label: 'By member' }]} />
        {layout === 'list' && d.list ? (
          <>
            <LinkTabs base="/admin/tasks" params={sp} param="view" current={view} tabs={[{ value: 'open', label: 'Open' }, { value: 'overdue', label: 'Overdue', count: d.counts.overdue }, { value: 'upcoming', label: 'Next 7 days' }, { value: 'completed', label: 'Completed' }, { value: 'all', label: 'All' }]} />
            <FilterBar className="mb-4">
              <SearchInput defaultValue={str(sp, 'q')} placeholder="Search tasks" />
              <FilterSelect name="member" label="Member" defaultValue={str(sp, 'member')} options={memberOpts} />
              <FilterSelect name="priority" label="Priority" defaultValue={str(sp, 'priority')} options={PRIORITY_OPTIONS} />
              <FilterSelect name="kind" label="Type" defaultValue={str(sp, 'kind') ?? 'assigned'} allLabel="" options={[{ value: 'assigned', label: 'Assigned' }, { value: 'personal', label: 'Personal (members’ own)' }]} />
            </FilterBar>
            <Card>
              <TaskList tasks={d.list.rows} comments={d.list.comments} today={d.today} fmt={fmt} userId={session.userId} isAdminView members={memberOpts} />
              <Pagination base="/admin/tasks" params={sp} page={page} pageSize={25} total={d.list.total} />
            </Card>
          </>
        ) : null}
        {layout === 'board' ? (
          <>
            <FilterBar className="mb-4"><FilterSelect name="member" label="Member" defaultValue={str(sp, 'member')} options={memberOpts} /></FilterBar>
            <div className="grid gap-4 md:grid-cols-3">
              {(['pending', 'in_progress', 'completed'] as const).map((st) => {
                const items = d.board.filter((t) => t.status === st);
                return (
                  <div key={st} className="rounded-xl bg-slate-100/70 p-3">
                    <div className="mb-2 flex items-center justify-between px-1"><StatusBadge status={st} /><span className="text-xs text-slate-500">{items.length}</span></div>
                    <ul className="space-y-2">
                      {items.map((t) => (
                        <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
                          <p className="text-sm font-medium text-slate-900">{t.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                            <span>{t.full_name}</span>·<span className={t.due && t.due < d.today && st !== 'completed' ? 'font-medium text-red-700' : ''}>{t.due ? formatDate(t.due, fmt.locale, 'short') : 'No deadline'}</span><StatusBadge status={t.priority} />
                          </div>
                        </li>
                      ))}
                      {items.length === 0 ? <li className="px-1 py-6 text-center text-xs text-slate-400">Empty</li> : null}
                    </ul>
                  </div>
                );
              })}
            </div>
            <MetricNote>Completed column shows tasks completed in the last 14 days.</MetricNote>
          </>
        ) : null}
        {layout === 'timeline' ? (
          <Card>
            <CardHeader title="Deadlines: last 7 days to next 14 days" description="Open tasks grouped by deadline" />
            <ol className="divide-y divide-slate-100">
              {eachDay(addDays(d.today, -7), addDays(d.today, 14)).map((day) => {
                const items = d.timeline.filter((t) => t.due === day);
                if (!items.length) return null;
                return (
                  <li key={day} className="grid gap-2 px-5 py-3 sm:grid-cols-[140px_1fr]">
                    <div className={`text-sm font-medium ${day < d.today ? 'text-red-700' : day === d.today ? 'text-brand-700' : 'text-slate-700'}`}>{formatDate(day, fmt.locale, 'short')}{day === d.today ? ' · today' : day < d.today ? ' · overdue' : ''}</div>
                    <ul className="space-y-1">{items.map((t) => <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm"><StatusBadge status={t.priority} /><span className="text-slate-900">{t.title}</span><span className="text-xs text-slate-500">— {t.full_name}</span></li>)}</ul>
                  </li>
                );
              })}
            </ol>
            {d.timeline.length === 0 ? <EmptyState compact title="No deadlines in this window" /> : null}
          </Card>
        ) : null}
        {layout === 'members' ? (
          <Card>
            <Table>
              <THead><tr><Th>Member</Th><Th align="right">Assigned due this month</Th><Th align="right">Completed</Th><Th>Completion rate</Th><Th align="right">Overdue now</Th></tr></THead>
              <TBody>{d.perMember.map((m) => {
                const rate = m.due ? Math.round((m.done / m.due) * 1000) / 10 : null;
                return (
                  <Tr key={m.id}><Td className="font-medium text-slate-900">{m.full_name}</Td><Td align="right">{m.due}</Td><Td align="right">{m.done}</Td>
                    <Td className="min-w-40">{rate !== null ? <div className="flex items-center gap-2"><ProgressBar value={rate} size="sm" tone={rate >= 80 ? 'good' : rate >= 50 ? 'brand' : 'warning'} /><span className="w-12 text-right text-xs tabular">{rate}%</span></div> : '—'}</Td>
                    <Td align="right" className={m.overdue ? 'font-medium text-red-700' : ''}>{m.overdue}</Td></Tr>
                );
              })}</TBody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
