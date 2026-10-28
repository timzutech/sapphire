'use server';

import { announcementSchema, idOnly } from '@/lib/validation/misc';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/announcements';

const R = ['/admin/announcements', '/dashboard', '/admin'];

export async function saveAnnouncementAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: announcementSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.saveAnnouncement(tx, session, data);
    return 'Announcement published';
  });
}
export async function deleteAnnouncementAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: idOnly, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.deleteAnnouncement(tx, session, data.id);
    return 'Announcement deleted';
  });
}
