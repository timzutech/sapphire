import 'server-only';
import type { Tx } from '../db';

export interface OfficeSettings {
  checkinOpens: string;
  lateAfter: string;
  checkinCloses: string;
  workingDays: number[];
  attendanceReminders: boolean;
  membersSubmitFinePayments: boolean;
  adminViewMemberFinances: boolean;
}

export async function getSettings(tx: Tx, officeId: string): Promise<OfficeSettings> {
  const [s] = await tx`select to_char(checkin_opens, 'HH24:MI') as o, to_char(late_after, 'HH24:MI') as l, to_char(checkin_closes, 'HH24:MI') as c,
    working_days, attendance_reminders, members_submit_fine_payments, admin_view_member_finances from office_settings where office_id = ${officeId}`;
  return {
    checkinOpens: s.o, lateAfter: s.l, checkinCloses: s.c, workingDays: (s.working_days as number[]).map(Number),
    attendanceReminders: s.attendance_reminders, membersSubmitFinePayments: s.members_submit_fine_payments, adminViewMemberFinances: s.admin_view_member_finances,
  };
}

export async function officeNow(tx: Tx, officeId: string) {
  const [r] = await tx`select app.office_today(${officeId})::text as today,
    to_char(app.clock() at time zone (select timezone from offices where id = ${officeId}), 'HH24:MI') as time`;
  return { today: r.today as string, time: r.time as string };
}

export interface MemberOption { value: string; label: string; teamId: string | null; role: string; status: string }

export async function memberOptions(tx: Tx, officeId: string, includeInactive = false): Promise<MemberOption[]> {
  const rows = await tx`select u.id, u.full_name, m.team_id, m.role, m.status from memberships m join users u on u.id = m.user_id
    where m.office_id = ${officeId} ${includeInactive ? tx`` : tx`and m.status = 'active'`} order by u.full_name`;
  return rows.map((r) => ({ value: r.id, label: r.full_name + (r.status === 'inactive' ? ' (inactive)' : ''), teamId: r.team_id, role: r.role, status: r.status }));
}

export async function teamOptions(tx: Tx, officeId: string) {
  const rows = await tx`select id, name from teams where office_id = ${officeId} order by name`;
  return rows.map((r) => ({ value: r.id as string, label: r.name as string }));
}

export async function categoryOptions(tx: Tx, officeId: string, scope: 'office' | 'personal', kind?: 'income' | 'expense') {
  const rows = await tx`select id, name, kind from finance_categories where office_id = ${officeId} and scope = ${scope} and is_active
    ${kind ? tx`and kind = ${kind}` : tx``} order by kind, name`;
  return rows.map((r) => ({ value: r.id as string, label: kind ? (r.name as string) : `${r.name} (${r.kind})`, kind: r.kind as string }));
}

export async function officeAccountOptions(tx: Tx, officeId: string) {
  const rows = await tx`select id, name from office_accounts where office_id = ${officeId} and not archived order by name`;
  return rows.map((r) => ({ value: r.id as string, label: r.name as string }));
}
