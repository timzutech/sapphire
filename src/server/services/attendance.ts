import 'server-only';
import type { z } from 'zod';
import { isoWeekday } from '@/lib/dates';
import { UserError } from '@/lib/errors';
import type { adminAttendanceSchema, correctAttendanceSchema, markAbsencesSchema } from '@/lib/validation/attendance';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';

/** Member self check-in. Date, time and status are computed by the database in the office timezone. */
export async function checkIn(tx: Tx, note?: string) {
  const [r] = await tx`select * from app.self_check_in(${note ?? null})`;
  return r as { id: string; status: 'present' | 'late'; att_date: string };
}

export async function officeToday(tx: Tx, officeId: string): Promise<string> {
  const [{ d }] = await tx`select app.office_today(${officeId})::text as d`;
  return d;
}

/** Admin records attendance for a member on a date that has no record yet. */
export async function recordAttendance(tx: Tx, actor: Actor, d: z.infer<typeof adminAttendanceSchema>) {
  const today = await officeToday(tx, actor.officeId);
  if (d.date > today) throw new UserError('Attendance cannot be recorded for a future date.', { date: 'Future date' });
  const [r] = await tx`
    insert into attendance_records (office_id, user_id, att_date, status, source, note, check_in_at)
    values (${actor.officeId}, ${d.userId}, ${d.date}, ${d.status}, 'admin', ${d.note ?? null}, ${d.status === 'present' || d.status === 'late' ? tx`now()` : null})
    on conflict (office_id, user_id, att_date) do nothing returning id`;
  if (!r) throw new UserError('A record already exists for this member on that date. Use “Correct” to change it.');
  await audit(tx, actor, { action: 'attendance.record', entityType: 'attendance', entityId: r.id, summary: `Recorded ${d.status} for ${d.date}`, after: d });
}

/** Corrections keep the original record id and write both a correction row and an audit entry. */
export async function correctAttendance(tx: Tx, actor: Actor, d: z.infer<typeof correctAttendanceSchema>) {
  const [r] = await tx`select id, status, att_date, user_id from attendance_records where id = ${d.recordId} for update`;
  if (!r) throw new UserError('Attendance record not found.');
  if (r.status === d.status) throw new UserError('The status is unchanged.');
  await tx`update attendance_records set status = ${d.status}, source = 'admin' where id = ${d.recordId}`;
  await tx`insert into attendance_corrections (office_id, record_id, previous_status, new_status, reason, corrected_by)
           values (${actor.officeId}, ${d.recordId}, ${r.status}, ${d.status}, ${d.reason}, ${actor.userId})`;
  await audit(tx, actor, {
    action: 'attendance.correct', entityType: 'attendance', entityId: d.recordId,
    summary: `Changed attendance on ${r.att_date} from ${r.status} to ${d.status}`, before: { status: r.status }, after: { status: d.status }, reason: d.reason,
  });
}

/** Marks every active member without a record on a past/closed working day as absent. Explicit admin action only. */
export async function markAbsences(tx: Tx, actor: Actor, d: z.infer<typeof markAbsencesSchema>) {
  const [s] = await tx`select working_days, checkin_closes from office_settings where office_id = ${actor.officeId}`;
  const today = await officeToday(tx, actor.officeId);
  if (d.date > today) throw new UserError('Cannot mark absences for a future date.');
  if (!(s.working_days as number[]).includes(isoWeekday(d.date))) throw new UserError('That date is not a configured working day.');
  if (d.date === today) {
    const [{ closed }] = await tx`select (app.clock() at time zone (select timezone from offices where id = ${actor.officeId}))::time > ${s.checkin_closes}::time as closed`;
    if (!closed) throw new UserError('Check-in is still open today. Mark absences after it closes.');
  }
  const rows = await tx`
    insert into attendance_records (office_id, user_id, att_date, status, source, note)
    select m.office_id, m.user_id, ${d.date}::date, 'absent', 'admin', 'Marked absent: no check-in'
    from memberships m
    where m.office_id = ${actor.officeId} and m.status = 'active' and m.joined_on <= ${d.date}::date
    on conflict (office_id, user_id, att_date) do nothing returning id`;
  await audit(tx, actor, { action: 'attendance.mark_absences', entityType: 'attendance', summary: `Marked ${rows.length} member(s) absent for ${d.date}` });
  return rows.length;
}
