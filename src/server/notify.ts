import 'server-only';
import type { Tx } from './db';

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}

export async function notify(tx: Tx, officeId: string, userIds: string[], n: NotificationInput): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  await tx`select app.push_notifications(${officeId}, ${ids}::uuid[], ${n.kind}, ${n.title}, ${n.body ?? null}, ${n.link ?? null}, ${n.dedupeKey ?? null})`;
}

export async function adminIds(tx: Tx, officeId: string): Promise<string[]> {
  const rows = await tx<{ user_id: string }[]>`
    select user_id from memberships where office_id = ${officeId} and role = 'admin' and status = 'active'`;
  return rows.map((r) => r.user_id);
}

export async function activeMemberIds(tx: Tx, officeId: string): Promise<string[]> {
  const rows = await tx<{ user_id: string }[]>`select user_id from memberships where office_id = ${officeId} and status = 'active'`;
  return rows.map((r) => r.user_id);
}

export async function notifyAdmins(tx: Tx, officeId: string, n: NotificationInput, exceptUserId?: string): Promise<void> {
  const ids = (await adminIds(tx, officeId)).filter((id) => id !== exceptUserId);
  await notify(tx, officeId, ids, n);
}
