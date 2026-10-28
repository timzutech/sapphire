'use server';

import { archiveSchema, assignSchema, interactionSchema, prospectSchema, stageSchema } from '@/lib/validation/prospects';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/prospects';

const R = ['/prospects', '/admin/prospects', '/dashboard'];

export async function saveProspectAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: prospectSchema, revalidate: R }, async ({ tx, session, data }) => {
    const id = await svc.saveProspect(tx, session, data);
    return { message: data.prospectId ? 'Prospect updated' : 'Prospect added', data: { id } };
  });
}
export async function changeStageAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: stageSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.changeStage(tx, session, data);
    return 'Stage updated';
  });
}
export async function addInteractionAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: interactionSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.addInteraction(tx, session, data);
    return 'Activity logged';
  });
}
export async function archiveProspectAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: archiveSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setArchived(tx, session, data);
    return data.archive === '1' ? 'Prospect archived' : 'Prospect restored';
  });
}
export async function assignProspectsAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: assignSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    const n = await svc.assignProspects(tx, session, data);
    return `${n} prospect(s) ${data.ownerId ? 'assigned' : 'moved to the shared pool'}`;
  });
}
