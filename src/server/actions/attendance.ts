'use server';

import { adminAttendanceSchema, checkInSchema, correctAttendanceSchema, markAbsencesSchema } from '@/lib/validation/attendance';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/attendance';

const R = ['/attendance', '/dashboard', '/admin'];

export async function checkInAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: checkInSchema, revalidate: R }, async ({ tx, data }) => {
    const r = await svc.checkIn(tx, data.note);
    return r.status === 'late' ? 'Checked in — marked late (after the office late threshold)' : 'Checked in — you are on time';
  });
}
export async function recordAttendanceAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: adminAttendanceSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.recordAttendance(tx, session, data);
    return 'Attendance recorded';
  });
}
export async function correctAttendanceAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: correctAttendanceSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.correctAttendance(tx, session, data);
    return 'Attendance corrected and logged';
  });
}
export async function markAbsencesAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: markAbsencesSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    const n = await svc.markAbsences(tx, session, data);
    return n ? `${n} member(s) marked absent` : 'Everyone already has a record for that date';
  });
}
