'use server';

import { levelSchema, memberCreateSchema, memberStatusSchema, memberUpdateSchema, officeCreateSchema, officeSettingsSchema, resetPasswordSchema, setLevelSchema, teamSchema } from '@/lib/validation/members';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/members';
import * as office from '../services/office';

const R = ['/admin', '/dashboard'];

export async function createMemberAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: memberCreateSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    const r = await svc.createMember(tx, session, data);
    return r.existed ? 'Existing account added to this office (their password is unchanged)' : `Member created. Share the temporary password with ${data.fullName}.`;
  });
}
export async function updateMemberAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: memberUpdateSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.updateMember(tx, session, data);
    return 'Member updated';
  });
}
export async function setMemberStatusAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: memberStatusSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setMemberStatus(tx, session, data);
    return data.status === 'active' ? 'Member reactivated' : 'Member deactivated — their history is preserved';
  });
}
export async function resetPasswordAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: resetPasswordSchema, admin: true }, async ({ tx, session, data }) => {
    await svc.resetPassword(tx, session, data);
    return 'Temporary password set. The member must change it at next sign-in.';
  });
}
export async function setLevelAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: setLevelSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setLevel(tx, session, data);
    return 'Level updated';
  });
}
export async function saveTeamAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: teamSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.saveTeam(tx, session, data);
    return 'Team saved';
  });
}
export async function saveLevelAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: levelSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.saveLevel(tx, session, data);
    return 'Level saved';
  });
}
export async function updateSettingsAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: officeSettingsSchema, admin: true, revalidate: ['/'] }, async ({ tx, session, data }) => {
    await office.updateSettings(tx, session, data);
    return 'Settings saved';
  });
}
export async function createOfficeAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: officeCreateSchema, revalidate: ['/super'] }, async ({ tx, session, data }) => {
    if (!session.isSuper) throw new (await import('@/lib/errors')).ForbiddenError();
    await office.createOffice(tx, session, data);
    return `Office created. ${data.adminEmail} can sign in with the temporary password.`;
  });
}
