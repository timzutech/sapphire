import 'server-only';
import type { Tx } from '../db';

export interface TaskFilter {
  officeId: string; today: string; assigneeId?: string; view?: string; priority?: string; kind?: string; q?: string; batchOnly?: boolean; limit: number; offset: number;
}

export async function listTasks(tx: Tx, f: TaskFilter) {
  const q = f.q ? `%${f.q.replace(/[%_]/g, '')}%` : null;
  const where = tx`t.office_id = ${f.officeId}
    ${f.assigneeId ? tx`and t.assignee_id = ${f.assigneeId}` : tx``}
    ${f.view === 'open' || !f.view ? tx`and t.status in ('pending','in_progress')` : tx``}
    ${f.view === 'overdue' ? tx`and t.status in ('pending','in_progress') and t.due_date < ${f.today}` : tx``}
    ${f.view === 'upcoming' ? tx`and t.status in ('pending','in_progress') and t.due_date between ${f.today} and ${f.today}::date + 7` : tx``}
    ${f.view === 'completed' ? tx`and t.status = 'completed'` : tx``}
    ${f.priority ? tx`and t.priority = ${f.priority}` : tx``}
    ${f.kind ? tx`and t.kind = ${f.kind}` : tx``}
    ${q ? tx`and (t.title ilike ${q} or t.description ilike ${q})` : tx``}`;
  const [{ total }] = await tx`select count(*)::int as total from tasks t where ${where}`;
  const rows = await tx`select t.*, t.due_date::text as due, t.start_date::text as start, a.full_name as assignee_name, c.full_name as creator_name
    from tasks t join users a on a.id = t.assignee_id join users c on c.id = t.created_by where ${where}
    order by ${f.view === 'completed' ? tx`t.completed_at desc` : tx`t.due_date asc nulls last, case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`}
    limit ${f.limit} offset ${f.offset}`;
  const ids = rows.map((r) => r.id as string);
  const comments = ids.length
    ? await tx`select c.*, u.full_name from task_comments c join users u on u.id = c.user_id where c.task_id in ${tx(ids)} order by c.created_at`
    : [];
  const map = new Map<string, Record<string, unknown>[]>();
  for (const c of comments) {
    const l = map.get(c.task_id) ?? [];
    l.push(c);
    map.set(c.task_id, l);
  }
  return { total: total as number, rows, comments: map };
}

export async function taskCounts(tx: Tx, officeId: string, today: string, month: string, assigneeId?: string) {
  const [r] = await tx`select
      count(*) filter (where status in ('pending','in_progress'))::int as open,
      count(*) filter (where status in ('pending','in_progress') and due_date < ${today})::int as overdue,
      count(*) filter (where status in ('pending','in_progress') and due_date between ${today} and ${today}::date + 7)::int as upcoming,
      count(*) filter (where status = 'completed' and completed_at >= ${month}::date)::int as completed_month,
      count(*) filter (where kind = 'assigned' and due_date between ${month} and ${today} and status <> 'cancelled')::int as due_assigned,
      count(*) filter (where kind = 'assigned' and due_date between ${month} and ${today} and status = 'completed' and (completed_at)::date <= due_date)::int as on_time
    from tasks where office_id = ${officeId} ${assigneeId ? tx`and assignee_id = ${assigneeId}` : tx``}`;
  return { ...r, onTimeRate: r.due_assigned > 0 ? Math.round((r.on_time / r.due_assigned) * 1000) / 10 : null } as {
    open: number; overdue: number; upcoming: number; completed_month: number; due_assigned: number; on_time: number; onTimeRate: number | null;
  };
}
