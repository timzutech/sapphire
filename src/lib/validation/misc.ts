import { z } from 'zod';
import { checkbox, id, optId, reqText } from './common';

export const announcementSchema = z.object({
  announcementId: optId(),
  title: reqText('Title', 160),
  body: reqText('Message', 5000),
  pinned: checkbox(),
  expiresAt: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date').optional()),
  notifyMembers: checkbox(),
});
export const idOnly = z.object({ id: id() });
