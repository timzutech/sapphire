import { z } from 'zod';
import { checkbox, date, email, enumOf, id, int, optDate, optId, optText, password, phone, reqText } from './common';

export const memberCreateSchema = z.object({
  fullName: reqText('Full name', 120, 2),
  email: email(),
  phone: phone(),
  role: enumOf(['admin', 'member'] as const, 'Role'),
  teamId: optId(),
  title: optText(80),
  joinedOn: optDate(),
  tempPassword: password(),
});

export const memberUpdateSchema = z.object({
  membershipId: id('Member'),
  fullName: reqText('Full name', 120, 2),
  email: email(),
  phone: phone(),
  role: enumOf(['admin', 'member'] as const, 'Role'),
  teamId: optId(),
  title: optText(80),
  joinedOn: date('Joining date'),
});

export const memberStatusSchema = z.object({
  membershipId: id('Member'),
  status: enumOf(['active', 'inactive'] as const, 'Status'),
  reason: reqText('Reason', 300, 3),
});

export const resetPasswordSchema = z.object({ userId: id('Member'), tempPassword: password() });

export const setLevelSchema = z.object({
  userId: id('Member'),
  levelId: id('Level'),
  achievedOn: date('Date achieved'),
  note: optText(300),
});

export const teamSchema = z.object({ teamId: optId(), name: reqText('Team name', 80), description: optText(300) });
export const levelSchema = z.object({ levelId: optId(), name: reqText('Level name', 80), rank: int('Rank', 0, 1000), criteria: optText(1000) });

export const profileSchema = z.object({ fullName: reqText('Full name', 120, 2), phone: phone() });
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, 'Current password is required'), newPassword: password(), confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

export const officeSettingsSchema = z.object({
  name: reqText('Office name', 120, 2),
  timezone: reqText('Timezone', 60).refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone'),
  currency: reqText('Currency', 3, 3).transform((v) => v.toUpperCase()),
  locale: reqText('Locale', 20),
  checkinOpens: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  lateAfter: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  checkinCloses: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  workingDays: z.array(z.coerce.number().int().min(1).max(7)).min(1, 'Choose at least one working day'),
  attendanceReminders: checkbox(),
  membersSubmitFinePayments: checkbox(),
  adminViewMemberFinances: checkbox(),
}).refine((v) => v.checkinOpens <= v.lateAfter && v.lateAfter <= v.checkinCloses, {
  message: 'Times must be in order: opens ≤ late after ≤ closes',
  path: ['lateAfter'],
});

export const officeCreateSchema = z.object({
  name: reqText('Office name', 120, 2),
  slug: reqText('Slug', 60, 2).refine((v) => /^[a-z0-9-]+$/.test(v), 'Use lowercase letters, numbers and dashes'),
  timezone: reqText('Timezone', 60),
  currency: reqText('Currency', 3, 3).transform((v) => v.toUpperCase()),
  adminName: reqText('Administrator name', 120, 2),
  adminEmail: email(),
  tempPassword: password(),
});
