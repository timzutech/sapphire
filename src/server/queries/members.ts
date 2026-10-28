import 'server-only';
import type { Tx } from '../db';

export async function memberDirectory(tx: Tx, officeId: string, opts: { q?: string; status?: string; teamId?: string; role?: string; month: string; today: string }) {
  const q = opts.q ? `%${opts.q.replace(/[%_]/g, '')}%` : null;
  return tx`
    select m.id as membership_id, m.user_id, m.role, m.status, m.title, m.joined_on::text as joined, m.team_id, t.name as team,
      u.full_name, u.email, u.phone,
      (select l.name from member_levels ml join levels l on l.id = ml.level_id where ml.user_id = m.user_id and ml.office_id = m.office_id order by ml.achieved_on desc, ml.created_at desc limit 1) as level,
      (select count(*) from attendance_records a where a.office_id = m.office_id and a.user_id = m.user_id and a.att_date >= ${opts.month} and a.status in ('present','late'))::int as attended,
      (select count(*) from attendance_records a where a.office_id = m.office_id and a.user_id = m.user_id and a.att_date >= ${opts.month} and a.status = 'late')::int as late,
      (select count(*) from tasks k where k.office_id = m.office_id and k.assignee_id = m.user_id and k.status in ('pending','in_progress'))::int as open_tasks,
      (select count(*) from tasks k where k.office_id = m.office_id and k.assignee_id = m.user_id and k.status in ('pending','in_progress') and k.due_date < ${opts.today})::int as overdue_tasks,
      (select count(*) from prospects p where p.office_id = m.office_id and p.owner_id = m.user_id and p.archived_at is null and p.stage not in ('converted','not_interested'))::int as prospects,
      (select count(*) from prospects p where p.office_id = m.office_id and p.owner_id = m.user_id and p.stage = 'converted')::int as converted,
      (select coalesce(sum(f.amount - app.fine_paid_total(f.id)), 0) from fines f where f.office_id = m.office_id and f.user_id = m.user_id and f.status in ('pending','partially_paid','disputed')) as fines_due,
      (select count(*) from goals g where g.office_id = m.office_id and g.user_id = m.user_id and g.status = 'active')::int as goals
    from memberships m join users u on u.id = m.user_id left join teams t on t.id = m.team_id
    where m.office_id = ${officeId}
      ${opts.status ? tx`and m.status = ${opts.status}` : tx``}
      ${opts.teamId ? tx`and m.team_id = ${opts.teamId}` : tx``}
      ${opts.role ? tx`and m.role = ${opts.role}` : tx``}
      ${q ? tx`and (u.full_name ilike ${q} or u.email ilike ${q} or u.phone ilike ${q})` : tx``}
    order by m.status, u.full_name`;
}
