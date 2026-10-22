import { z } from 'zod';
import { date, enumOf, id, optText, reqText } from './common';

export const checkInSchema = z.object({ note: optText(300) });

export const adminAttendanceSchema = z.object({
  userId: id('Member'),
  date: date(),
  status: enumOf(['present', 'late', 'absent', 'excused'] as const, 'Status'),
  note: optText(300),
});

export const correctAttendanceSchema = z.object({
  recordId: id('Record'),
  status: enumOf(['present', 'late', 'absent', 'excused'] as const, 'Status'),
  reason: reqText('Reason', 300, 3),
});

export const markAbsencesSchema = z.object({ date: date() });
