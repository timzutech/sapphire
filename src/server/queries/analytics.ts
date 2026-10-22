import 'server-only';
import type { Tx } from '../db';

/** Key office metrics for an arbitrary date range (office-local dates). Used for monthly comparisons. */
export async function periodMetrics(tx: Tx, officeId: string, tz: string, from: string, to: string) {
  const [r] = await tx`select
    (select count(*) from attendance_records where office_id = ${officeId} and status in ('present','late') and att_date between ${from} and ${to})::int as attendance_days,
    (select count(*) from attendance_records where office_id = ${officeId} and status = 'late' and att_date between ${from} and ${to})::int as late_days,
    (select count(*) from prospects where office_id = ${officeId} and (created_at at time zone ${tz})::date between ${from} and ${to})::int as prospects_added,
    (select count(*) from prospects where office_id = ${officeId} and stage = 'converted' and (converted_at at time zone ${tz})::date between ${from} and ${to})::int as conversions,
    (select count(*) from tasks where office_id = ${officeId} and status = 'completed' and (completed_at at time zone ${tz})::date between ${from} and ${to})::int as tasks_completed,
    (select coalesce(sum(direction * amount), 0) from office_transactions where office_id = ${officeId} and type = 'income' and txn_date between ${from} and ${to})::float8 as office_income,
    (select coalesce(sum(direction * amount), 0) from office_transactions where office_id = ${officeId} and type = 'expense' and txn_date between ${from} and ${to})::float8 as office_expenses,
    (select coalesce(sum(amount), 0) from fine_payments where office_id = ${officeId} and status = 'confirmed' and paid_on between ${from} and ${to})::float8 as fines_collected,
    (select count(*) from activity_registrations r join plan_activities a on a.id = r.activity_id where r.office_id = ${officeId} and r.status = 'attended' and a.kind in ('training','workshop') and (a.starts_at at time zone ${tz})::date between ${from} and ${to})::int as training_attendances,
    (select count(distinct p.user_id) from challenge_participants p join challenges c on c.id = p.challenge_id where c.office_id = ${officeId} and c.start_date <= ${to} and c.end_date >= ${from})::int as challenge_participants`;
  return r as Record<string, number>;
}

export async function memberLeaderboard(tx: Tx, officeId: string, tz: string, from: string, to: string) {
  return tx`select u.id, u.full_name,
      (select count(*) from attendance_records a where a.office_id = m.office_id and a.user_id = m.user_id and a.status in ('present','late') and a.att_date between ${from} and ${to})::int as attended,
      (select count(*) from tasks t where t.office_id = m.office_id and t.assignee_id = m.user_id and t.status = 'completed' and (t.completed_at at time zone ${tz})::date between ${from} and ${to})::int as tasks,
      (select count(*) from prospects p where p.office_id = m.office_id and p.created_by = m.user_id and (p.created_at at time zone ${tz})::date between ${from} and ${to})::int as added,
      (select count(*) from prospects p where p.office_id = m.office_id and p.owner_id = m.user_id and p.stage = 'converted' and (p.converted_at at time zone ${tz})::date between ${from} and ${to})::int as converted,
      (select count(*) from activity_registrations r join plan_activities a on a.id = r.activity_id where r.office_id = m.office_id and r.user_id = m.user_id and r.status = 'attended' and (a.starts_at at time zone ${tz})::date between ${from} and ${to})::int as trainings
    from memberships m join users u on u.id = m.user_id where m.office_id = ${officeId} and m.status = 'active' order by u.full_name`;
}
