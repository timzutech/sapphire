import 'server-only';
import { addDays } from '@/lib/dates';
import { attendanceStats, eligibleDays, type AttendanceStatus } from '@/lib/logic/attendance';
import type { Tx } from '../db';
import type { OfficeSettings } from './common';

export interface AttendanceRow { id: string; date: string; status: AttendanceStatus; checkInAt: Date | null; source: string; note: string | null }

export async function myAttendance(tx: Tx, officeId: string, userId: string, from: string, to: string): Promise<AttendanceRow[]> {
  const rows = await tx`select id, att_date::text as date, status, check_in_at, source, note from attendance_records
    where office_id = ${officeId} and user_id = ${userId} and att_date between ${from} and ${to} order by att_date desc`;
  return rows.map((r) => ({ id: r.id, date: r.date, status: r.status, checkInAt: r.check_in_at, source: r.source, note: r.note }));
}

export async function joinedOn(tx: Tx, officeId: string, userId: string): Promise<string | null> {
  const [m] = await tx`select joined_on::text as j from memberships where office_id = ${officeId} and user_id = ${userId}`;
  return m?.j ?? null;
}

/** Today only counts as an eligible day once it has a record or check-in has closed (otherwise it isn't missed yet). */
function lastEligibleDay(today: string, nowTime: string | undefined, settings: OfficeSettings, hasTodayRecord: boolean) {
  if (!nowTime || hasTodayRecord || nowTime > settings.checkinCloses) return today;
  return addDays(today, -1);
}

export async function memberStats(tx: Tx, officeId: string, userId: string, settings: OfficeSettings, from: string, to: string, today: string, nowTime?: string) {
  const recs = await myAttendance(tx, officeId, userId, from, to);
  const end = lastEligibleDay(today, nowTime, settings, recs.some((r) => r.date === today));
  const days = eligibleDays(from, to, settings.workingDays, await joinedOn(tx, officeId, userId), end);
  return attendanceStats(recs.map((r) => ({ date: r.date, status: r.status })), days);
}

/** Office-wide per-member stats for a period (admin). */
export async function officeAttendanceStats(tx: Tx, officeId: string, settings: OfficeSettings, from: string, to: string, today: string, nowTime?: string) {
  const members = await tx`select u.id, u.full_name, m.joined_on::text as joined, t.name as team from memberships m join users u on u.id = m.user_id
    left join teams t on t.id = m.team_id where m.office_id = ${officeId} and m.status = 'active' order by u.full_name`;
  const recs = await tx`select user_id, att_date::text as date, status from attendance_records where office_id = ${officeId} and att_date between ${from} and ${to}`;
  const byUser = new Map<string, { date: string; status: AttendanceStatus }[]>();
  for (const r of recs) {
    const list = byUser.get(r.user_id) ?? [];
    list.push({ date: r.date, status: r.status });
    byUser.set(r.user_id, list);
  }
  return members.map((m) => ({
    userId: m.id as string,
    name: m.full_name as string,
    team: m.team as string | null,
    stats: attendanceStats(byUser.get(m.id) ?? [], eligibleDays(from, to, settings.workingDays, m.joined,
      lastEligibleDay(today, nowTime, settings, (byUser.get(m.id) ?? []).some((r) => r.date === today)))),
  }));
}

/** Daily counts by status for trend charts. */
export async function dailyCounts(tx: Tx, officeId: string, from: string, to: string, userId?: string) {
  const rows = await tx`select att_date::text as date, status, count(*)::int as n from attendance_records
    where office_id = ${officeId} and att_date between ${from} and ${to} ${userId ? tx`and user_id = ${userId}` : tx``}
    group by att_date, status order by att_date`;
  const map = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const d = map.get(r.date) ?? { present: 0, late: 0, absent: 0, excused: 0 };
    d[r.status] = r.n;
    map.set(r.date, d);
  }
  return map;
}
