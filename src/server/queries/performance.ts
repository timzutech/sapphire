import 'server-only';
import { addDays, startOfWeek } from '@/lib/dates';
import type { Tx } from '../db';

/** Weekly activity counts for one member (or the whole office when userId is undefined) for the last `weeks` ISO weeks. */
export async function weeklyActivity(tx: Tx, officeId: string, today: string, tz: string, weeks = 8, userId?: string) {
  const start = addDays(startOfWeek(today), -7 * (weeks - 1));
  const u = (col: string) => (userId ? tx`and ${tx(col)} = ${userId}` : tx``);
  const rows = await tx`
    with w as (select generate_series(${start}::date, ${startOfWeek(today)}::date, interval '7 day')::date as wk)
    select to_char(w.wk, 'YYYY-MM-DD') as week,
      (select count(*) from attendance_records a where a.office_id = ${officeId} ${u('a.user_id')} and a.status in ('present','late') and a.att_date >= w.wk and a.att_date < w.wk + 7)::int as attendance,
      (select count(*) from prospects p where p.office_id = ${officeId} ${u('p.created_by')} and (p.created_at at time zone ${tz})::date >= w.wk and (p.created_at at time zone ${tz})::date < w.wk + 7)::int as prospects,
      (select count(*) from prospects p where p.office_id = ${officeId} ${u('p.owner_id')} and p.stage = 'converted' and (p.converted_at at time zone ${tz})::date >= w.wk and (p.converted_at at time zone ${tz})::date < w.wk + 7)::int as converted,
      (select count(*) from tasks t where t.office_id = ${officeId} ${u('t.assignee_id')} and t.status = 'completed' and (t.completed_at at time zone ${tz})::date >= w.wk and (t.completed_at at time zone ${tz})::date < w.wk + 7)::int as tasks
    from w order by w.wk`;
  return rows.map((r) => ({ week: r.week as string, attendance: r.attendance as number, prospects: r.prospects as number, converted: r.converted as number, tasks: r.tasks as number }));
}

export async function currentLevel(tx: Tx, officeId: string, userId: string) {
  return tx`select l.name, l.rank, l.criteria, ml.achieved_on::text as achieved_on, ml.note from member_levels ml join levels l on l.id = ml.level_id
    where ml.office_id = ${officeId} and ml.user_id = ${userId} order by ml.achieved_on desc, ml.created_at desc`;
}
