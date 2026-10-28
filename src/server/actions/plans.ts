'use server';

import { z } from 'zod';
import { checkbox, id } from '@/lib/validation/common';
import { activitySchema, participationSchema, planSchema, registrationSchema } from '@/lib/validation/plans';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/plans';

const R = ['/plan', '/admin/plans', '/dashboard'];

export async function savePlanAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: planSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    const id = await svc.savePlan(tx, session, data);
    return { message: data.planId ? 'Plan updated' : 'Plan created', data: { id } };
  });
}
export async function saveActivityAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: activitySchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.saveActivity(tx, session, data);
    return data.activityId ? 'Activity updated' : 'Activity added';
  });
}
export async function deleteActivityAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: z.object({ activityId: id() }), admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.deleteActivity(tx, session, data.activityId);
    return 'Activity removed';
  });
}
export async function publishPlanAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: z.object({ planId: id(), publish: checkbox() }), admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setPlanPublished(tx, session, data.planId, data.publish);
    return data.publish ? 'Plan published — members have been notified' : 'Plan moved back to draft';
  });
}
export async function registrationAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: registrationSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setRegistration(tx, session, data);
    return data.action === 'register' ? 'You are registered' : 'Registration cancelled';
  });
}
export async function participationAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: participationSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.recordParticipation(tx, session, data);
    return 'Participation recorded';
  });
}
