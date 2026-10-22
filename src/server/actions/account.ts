'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { UserError } from '@/lib/errors';
import { id } from '@/lib/validation/common';
import { changePasswordSchema, profileSchema } from '@/lib/validation/members';
import { runAction, type ActionState } from '../action';
import { currentTokenHash, getSession, logout } from '../auth';
import { withCtx } from '../db';

export async function logoutAction() {
  await logout();
  redirect('/login');
}

export async function switchOfficeAction(fd: FormData) {
  const officeId = String(fd.get('officeId') ?? '');
  const hash = await currentTokenHash();
  if (hash && /^[0-9a-f-]{36}$/i.test(officeId)) {
    await withCtx(null, (tx) => tx`select app.auth_switch_office(${hash}, ${officeId})`);
  }
  redirect('/');
}

export async function updateProfileAction(prev: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: profileSchema, revalidate: ['/'] }, async ({ tx, session, data }) => {
    await tx`update users set full_name = ${data.fullName}, phone = ${data.phone ?? null} where id = ${session.userId}`;
    return 'Profile updated';
  });
}

export async function changePasswordAction(prev: ActionState, fd: FormData) {
  const hash = await currentTokenHash();
  return runAction({ formData: fd, schema: changePasswordSchema, revalidate: ['/'] }, async ({ tx, data }) => {
    await tx`select set_config('app.session_hash', ${hash ?? ''}, true)`;
    const [{ ok }] = await tx`select app.change_own_password(${data.currentPassword}, ${data.newPassword}) as ok`;
    if (!ok) throw new UserError('Your current password is incorrect.', { currentPassword: 'Incorrect password' });
    return 'Password changed. Other devices have been signed out.';
  });
}

export async function markNotificationReadAction(prev: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: z.object({ id: id() }), revalidate: ['/'] }, async ({ tx, data }) => {
    await tx`update notifications set read_at = now() where id = ${data.id} and read_at is null`;
    return 'Marked as read';
  });
}

export async function markAllReadAction(prev: ActionState, fd: FormData) {
  return runAction({ formData: fd, revalidate: ['/'] }, async ({ tx, session }) => {
    const r = await tx`update notifications set read_at = now() where user_id = ${session.userId} and office_id = ${session.officeId} and read_at is null returning id`;
    return `${r.length} notification${r.length === 1 ? '' : 's'} marked as read`;
  });
}

/** Navigates to a notification's link after marking it read. Only relative app paths are followed. */
export async function openNotificationAction(fd: FormData) {
  const nid = String(fd.get('id') ?? '');
  const session = await getSession();
  if (!session) redirect('/login');
  let link = '/notifications';
  if (/^[0-9a-f-]{36}$/i.test(nid)) {
    const row = await withCtx({ userId: session.userId, officeId: session.officeId }, async (tx) => {
      const [n] = await tx`update notifications set read_at = coalesce(read_at, now()) where id = ${nid} returning link`;
      return n;
    });
    if (row?.link && /^\/[A-Za-z0-9/_?=&%.-]*$/.test(row.link)) link = row.link;
  }
  revalidatePath('/', 'layout');
  redirect(link);
}
