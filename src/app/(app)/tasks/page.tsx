import { Plus } from 'lucide-react';
import { TaskFields } from '@/components/forms/task-forms';
import { TaskList } from '@/components/task-list';
import { Card } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { PRIORITY_OPTIONS } from '@/lib/constants';
import { startOfMonth } from '@/lib/dates';
import { formatPercent } from '@/lib/format';
import { savePersonalTaskAction } from '@/server/actions/tasks';
import { memberPage, type SearchParams } from '@/server/page';
import { officeNow } from '@/server/queries/common';
import { listTasks, taskCounts } from '@/server/queries/tasks';

export const metadata = { title: 'My Tasks' };

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = str(sp, 'view') ?? 'open';
  const { session, fmt, load } = await memberPage();
  const { page, limit, offset } = pageOf(sp, 20);
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const counts = await taskCounts(tx, session.officeId, today, startOfMonth(today), session.userId);
    const list = await listTasks(tx, { officeId: session.officeId, today, assigneeId: session.userId, view, priority: str(sp, 'priority'), kind: str(sp, 'kind'), q: str(sp, 'q'), limit, offset });
    return { today, counts, list };
  });
  return (
    <>
      <PageHeader title="My Tasks" description="Tasks assigned to you and your own to-dos."
        actions={<FormDialog action={savePersonalTaskAction} title="New personal task" trigger={<><Plus className="size-4" />Add task</>} submitLabel="Add task"><TaskFields /></FormDialog>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open" value={d.counts.open} href="/tasks?view=open" />
        <StatCard label="Overdue" value={d.counts.overdue} tone={d.counts.overdue ? 'critical' : 'neutral'} href="/tasks?view=overdue" />
        <StatCard label="Due in the next 7 days" value={d.counts.upcoming} href="/tasks?view=upcoming" />
        <StatCard label="On-time completion (month)" value={formatPercent(d.counts.onTimeRate)} hint={`${d.counts.on_time} of ${d.counts.due_assigned} assigned tasks due so far`} />
      </div>
      <MetricNote>On-time completion = assigned tasks due this month (up to today) that were completed on or before their deadline ÷ all assigned tasks due in that window.</MetricNote>
      <div className="mt-6">
        <LinkTabs base="/tasks" params={sp} param="view" current={view} tabs={[
          { value: 'open', label: 'Open', count: d.counts.open }, { value: 'overdue', label: 'Overdue', count: d.counts.overdue }, { value: 'upcoming', label: 'Next 7 days' },
          { value: 'completed', label: 'Completed' }, { value: 'all', label: 'All' },
        ]} />
        <FilterBar className="mb-4">
          <SearchInput defaultValue={str(sp, 'q')} placeholder="Search tasks" />
          <FilterSelect name="priority" label="Priority" defaultValue={str(sp, 'priority')} options={PRIORITY_OPTIONS} />
          <FilterSelect name="kind" label="Type" defaultValue={str(sp, 'kind')} options={[{ value: 'assigned', label: 'Assigned to me' }, { value: 'personal', label: 'Personal' }]} />
        </FilterBar>
        <Card>
          <TaskList tasks={d.list.rows} comments={d.list.comments} today={d.today} fmt={fmt} userId={session.userId} />
          <Pagination base="/tasks" params={sp} page={page} pageSize={20} total={d.list.total} />
        </Card>
      </div>
    </>
  );
}
