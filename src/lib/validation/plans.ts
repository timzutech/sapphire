import { z } from 'zod';
import { checkbox, enumOf, id, optId, optInt, optText, reqText } from './common';

export const ACTIVITY_KINDS = ['training', 'workshop', 'prospecting', 'meeting', 'incentive', 'challenge', 'development', 'deadline', 'announcement'] as const;

export const planSchema = z.object({
  planId: optId(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose a month'),
  title: reqText('Title', 160),
  summary: optText(4000),
});

const dt = (label: string) => z.string({ error: `${label} is required` }).regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `${label} must be a date and time`);

export const activitySchema = z
  .object({
    activityId: optId(),
    planId: id('Plan'),
    kind: enumOf(ACTIVITY_KINDS, 'Type'),
    title: reqText('Title', 160),
    description: optText(2000),
    startsAt: dt('Start'),
    endsAt: z.preprocess((v) => (v === '' ? undefined : v), dt('End').optional()),
    location: optText(160),
    requiresRegistration: checkbox(),
    capacity: optInt(1, 100000),
  })
  .refine((v) => !v.endsAt || v.endsAt >= v.startsAt, { message: 'End must be after start', path: ['endsAt'] });

export const registrationSchema = z.object({ activityId: id('Activity'), action: enumOf(['register', 'cancel'] as const, 'Action') });
export const participationSchema = z.object({
  activityId: id('Activity'),
  userId: id('Member'),
  status: enumOf(['registered', 'attended', 'absent'] as const, 'Status'),
});
