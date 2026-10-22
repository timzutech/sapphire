'use server';

import { goalProgressSchema, goalSchema, goalStatusSchema } from '@/lib/validation/goals';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/goals';

const R = ['/goals', '/admin/goals', '/dashboard', '/admin'];

export async function saveGoalAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: goalSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.saveGoal(tx, session, data);
    return data.goalId ? 'Goal updated' : 'Goal created';
  });
}
export async function recordGoalProgressAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: goalProgressSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.recordProgress(tx, session, data);
    return 'Progress recorded';
  });
}
export async function syncGoalsAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, admin: true, revalidate: R }, async ({ tx, session }) => {
    const n = await svc.syncAllAutoGoals(tx, session);
    return n ? `${n} automatic goal(s) updated from office records` : 'Automatic goals are already up to date';
  });
}
export async function setGoalStatusAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: goalStatusSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.setGoalStatus(tx, session, data);
    return 'Goal status updated';
  });
}
