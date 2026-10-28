import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { officeCreateSchema, officeSettingsSchema } from '@/lib/validation/members';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';

export const DEFAULT_CATEGORIES: { scope: 'office' | 'personal'; kind: 'income' | 'expense'; name: string; systemKey?: string }[] = [
  { scope: 'office', kind: 'income', name: 'Fine collections', systemKey: 'fine_collections' },
  { scope: 'office', kind: 'income', name: 'Member contributions' },
  { scope: 'office', kind: 'income', name: 'Sales & commissions' },
  { scope: 'office', kind: 'income', name: 'Other income' },
  { scope: 'office', kind: 'expense', name: 'Operations' },
  { scope: 'office', kind: 'expense', name: 'Training' },
  { scope: 'office', kind: 'expense', name: 'Incentives & rewards' },
  { scope: 'office', kind: 'expense', name: 'Rent & utilities' },
  { scope: 'office', kind: 'expense', name: 'Transport' },
  { scope: 'office', kind: 'expense', name: 'Other expenses' },
  { scope: 'personal', kind: 'income', name: 'Commission' },
  { scope: 'personal', kind: 'income', name: 'Sales' },
  { scope: 'personal', kind: 'income', name: 'Bonus' },
  { scope: 'personal', kind: 'income', name: 'Other income' },
  { scope: 'personal', kind: 'expense', name: 'Transport' },
  { scope: 'personal', kind: 'expense', name: 'Food' },
  { scope: 'personal', kind: 'expense', name: 'Business tools' },
  { scope: 'personal', kind: 'expense', name: 'Training' },
  { scope: 'personal', kind: 'expense', name: 'Other expenses' },
];

/** Creates default settings, categories and accounts for a new office. */
export async function bootstrapOffice(tx: Tx, officeId: string) {
  await tx`insert into office_settings (office_id) values (${officeId}) on conflict do nothing`;
  for (const c of DEFAULT_CATEGORIES) {
    await tx`insert into finance_categories (office_id, scope, kind, name, system_key)
             values (${officeId}, ${c.scope}, ${c.kind}, ${c.name}, ${c.systemKey ?? null}) on conflict do nothing`;
  }
  await tx`insert into office_accounts (office_id, name, kind) values (${officeId}, 'Cash box', 'cash'), (${officeId}, 'Bank account', 'bank') on conflict do nothing`;
  await tx`insert into fine_categories (office_id, name, default_amount, description) values
    (${officeId}, 'Lateness', 500, 'Checked in after the late threshold'),
    (${officeId}, 'Unexcused absence', 1000, 'Absent on a working day without an excuse'),
    (${officeId}, 'Missed deadline', 1000, 'Assigned task not completed by its deadline') on conflict do nothing`;
  await tx`insert into levels (office_id, name, rank, criteria) values
    (${officeId}, 'Starter', 0, 'New member'),
    (${officeId}, 'Level 1', 1, 'Defined by the office administrator') on conflict do nothing`;
}

export async function updateSettings(tx: Tx, actor: Actor, d: z.infer<typeof officeSettingsSchema>) {
  const [before] = await tx`select o.name, o.timezone, o.currency, o.locale, s.* from offices o join office_settings s on s.office_id = o.id where o.id = ${actor.officeId}`;
  await tx`update offices set name = ${d.name}, timezone = ${d.timezone}, currency = ${d.currency}, locale = ${d.locale} where id = ${actor.officeId}`;
  await tx`update office_settings set checkin_opens = ${d.checkinOpens}, late_after = ${d.lateAfter}, checkin_closes = ${d.checkinCloses},
    working_days = ${[...new Set(d.workingDays)].sort()}::smallint[], attendance_reminders = ${d.attendanceReminders},
    members_submit_fine_payments = ${d.membersSubmitFinePayments}, admin_view_member_finances = ${d.adminViewMemberFinances}
    where office_id = ${actor.officeId}`;
  await audit(tx, actor, { action: 'settings.update', entityType: 'office', entityId: actor.officeId, summary: 'Updated office settings', before, after: d });
}

export async function createOffice(tx: Tx, actor: Actor, d: z.infer<typeof officeCreateSchema>) {
  const [office] = await tx`insert into offices (name, slug, timezone, currency) values (${d.name}, ${d.slug}, ${d.timezone}, ${d.currency}) returning id`;
  await bootstrapOfficeAsSuper(tx, office.id);
  const [u] = await tx`select * from app.create_user(${d.adminEmail}, ${d.adminName}, ${null}, ${d.tempPassword})`;
  await tx`insert into memberships (office_id, user_id, role) values (${office.id}, ${u.user_id}, 'admin')`;
  await audit(tx, { ...actor, officeId: actor.officeId }, {
    action: 'office.create', entityType: 'office', entityId: office.id, summary: `Created office ${d.name} with administrator ${d.adminEmail}`,
  });
  return office.id as string;
}

async function bootstrapOfficeAsSuper(tx: Tx, officeId: string) {
  // RLS evaluates is_admin() against the *current* office, so temporarily scope the context to the new office.
  const [{ prev }] = await tx`select current_setting('app.office_id', true) as prev`;
  await tx`select set_config('app.office_id', ${officeId}, true)`;
  try {
    await bootstrapOffice(tx, officeId);
  } finally {
    await tx`select set_config('app.office_id', ${prev ?? ''}, true)`;
  }
}

export function assertAdmin(role: string) {
  if (role !== 'admin') throw new UserError('Administrator access is required.');
}
