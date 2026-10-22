import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { announcementSchema } from '@/lib/validation/misc';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { activeMemberIds, notify } from '../notify';

export async function saveAnnouncement(tx: Tx, actor: Actor, d: z.infer<typeof announcementSchema>) {
  const expires = d.expiresAt ? tx`(${d.expiresAt}::date + 1)::timestamp at time zone (select timezone from offices where id = ${actor.officeId})` : null;
  let id = d.announcementId;
  if (id) {
    const [a] = await tx`update announcements set title = ${d.title}, body = ${d.body}, pinned = ${d.pinned}, expires_at = ${expires} where id = ${id} returning id`;
    if (!a) throw new UserError('Announcement not found.');
  } else {
    const [a] = await tx`insert into announcements (office_id, title, body, pinned, expires_at, created_by) values (${actor.officeId}, ${d.title}, ${d.body}, ${d.pinned}, ${expires}, ${actor.userId}) returning id`;
    id = a.id;
  }
  if (d.notifyMembers) {
    await notify(tx, actor.officeId, (await activeMemberIds(tx, actor.officeId)).filter((u) => u !== actor.userId), {
      kind: 'announcement', title: d.title, body: d.body.slice(0, 160), link: '/dashboard', dedupeKey: `announcement:${id}`,
    });
  }
  await audit(tx, actor, { action: d.announcementId ? 'announcement.update' : 'announcement.create', entityType: 'announcement', entityId: id, summary: `Published announcement “${d.title}”` });
}

export async function deleteAnnouncement(tx: Tx, actor: Actor, id: string) {
  const [a] = await tx`delete from announcements where id = ${id} returning title`;
  if (!a) throw new UserError('Announcement not found.');
  await audit(tx, actor, { action: 'announcement.delete', entityType: 'announcement', entityId: id, summary: `Deleted announcement “${a.title}”` });
}
