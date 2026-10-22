import { eachDay, isoWeekday, maxDate, minDate } from '../dates';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

export interface AttendanceRules {
  checkinOpens: string; // 'HH:MM'
  lateAfter: string;
  checkinCloses: string;
  workingDays: number[]; // ISO weekdays
}

export type CheckInDecision =
  | { ok: true; status: 'present' | 'late' }
  | { ok: false; reason: 'not_working_day' | 'too_early' | 'closed' };

/** Mirrors app.self_check_in(): decides the status for a self check-in at office-local `date`/`time`. */
export function decideCheckIn(rules: AttendanceRules, date: string, time: string): CheckInDecision {
  if (!rules.workingDays.includes(isoWeekday(date))) return { ok: false, reason: 'not_working_day' };
  const t = time.slice(0, 5);
  if (t < rules.checkinOpens.slice(0, 5)) return { ok: false, reason: 'too_early' };
  if (t > rules.checkinCloses.slice(0, 5)) return { ok: false, reason: 'closed' };
  return { ok: true, status: t > rules.lateAfter.slice(0, 5) ? 'late' : 'present' };
}

/** Eligible days = configured working days within [max(from, joinedOn), min(to, today)]. */
export function eligibleDays(from: string, to: string, workingDays: number[], joinedOn?: string | null, today?: string): string[] {
  const start = joinedOn ? maxDate(from, joinedOn) : from;
  const end = today ? minDate(to, today) : to;
  if (start > end) return [];
  return eachDay(start, end).filter((d) => workingDays.includes(isoWeekday(d)));
}

export interface AttendanceStats {
  eligibleDays: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unrecorded: number;
  /** (present + late) ÷ (eligible days − excused) × 100; null when the denominator is 0. */
  rate: number | null;
  /** present ÷ (present + late) × 100 — share of attended days that were on time. */
  punctuality: number | null;
}

export function attendanceStats(records: { date: string; status: AttendanceStatus }[], eligible: string[]): AttendanceStats {
  const set = new Set(eligible);
  const byDate = new Map(records.filter((r) => set.has(r.date)).map((r) => [r.date, r.status]));
  const count = (s: AttendanceStatus) => [...byDate.values()].filter((v) => v === s).length;
  const present = count('present');
  const late = count('late');
  const absent = count('absent');
  const excused = count('excused');
  const denom = eligible.length - excused;
  const attended = present + late;
  return {
    eligibleDays: eligible.length,
    present,
    late,
    absent,
    excused,
    unrecorded: eligible.length - byDate.size,
    rate: denom > 0 ? Math.round((attended / denom) * 1000) / 10 : null,
    punctuality: attended > 0 ? Math.round((present / attended) * 1000) / 10 : null,
  };
}

/** Flags members with repeated lateness/absence within the period (thresholds configurable by the caller). */
export function attendanceFlags(stats: AttendanceStats, lateThreshold = 3, absentThreshold = 3): string[] {
  const flags: string[] = [];
  if (stats.late >= lateThreshold) flags.push(`Late ${stats.late}×`);
  if (stats.absent + stats.unrecorded >= absentThreshold) flags.push(`Absent ${stats.absent + stats.unrecorded}×`);
  return flags;
}
