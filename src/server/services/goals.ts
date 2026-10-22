import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import { crossedMilestones } from '@/lib/logic/goals';
import type { goalProgressSchema, goalSchema, goalStatusSchema } from '@/lib/validation/goals';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { activeMemberIds, notify } from '../notify';

export async function saveGoal(tx: Tx, actor: Actor, d: z.infer<typeof goalSchema>) {
  const f = {
    scope: d.scope,
    user_id: d.scope === 'individual' ? d.userId! : null,
    team_id: d.scope === 'team' ? d.teamId! : null,
    title: d.title,
    description: d.description ?? null,
    category: d.category,
    unit: d.unit,
    target_value: d.targetValue,
    start_date: d.startDate,
    end_date: d.endDate,
    responsible_user_id: d.responsibleUserId ?? (d.scope === 'individual' ? d.userId! : null),
    progress_mode: d.progressMode,
    metric: d.progressMode === 'auto' ? d.metric! : null,
    metric_param: d.progressMode === 'auto' ? (d.metricParam ?? null) : null,
  };
  if (d.goalId) {
    const [before] = await tx`select * from goals where id = ${d.goalId} for update`;
    if (!before) throw new UserError('Goal not found.');
    await tx`update goals set ${tx(f)} where id = ${d.goalId}`;
    if (before.target_value !== d.targetValue) {
      // keep history: snapshot the value against the new target
      await tx`insert into goal_progress (office_id, goal_id, value, target_value, note, recorded_by)
        values (${actor.officeId}, ${d.goalId}, ${before.current_value}, ${d.targetValue}, ${`Target changed from ${before.target_value} to ${d.targetValue}`}, ${actor.userId})`;
    }
    await audit(tx, actor, { action: 'goal.update', entityType: 'goal', entityId: d.goalId, summary: `Updated goal “${d.title}”`, before, after: f });
    if (d.progressMode === 'auto') await syncGoal(tx, actor, d.goalId);
    return d.goalId;
  }
  const [g] = await tx`insert into goals ${tx({ ...f, office_id: actor.officeId, created_by: actor.userId })} returning id`;
  await tx`insert into goal_progress (office_id, goal_id, value, target_value, note, recorded_by) values (${actor.officeId}, ${g.id}, 0, ${d.targetValue}, 'Goal created', ${actor.userId})`;
  const audience = d.scope === 'individual' ? [d.userId!] : d.scope === 'team'
    ? (await tx`select user_id from memberships where office_id = ${actor.officeId} and team_id = ${d.teamId!} and status = 'active'`).map((r) => r.user_id as string)
    : await activeMemberIds(tx, actor.officeId);
  await notify(tx, actor.officeId, audience, { kind: 'goal', title: `New ${d.scope} goal: ${d.title}`, link: '/goals' });
  await audit(tx, actor, { action: 'goal.create', entityType: 'goal', entityId: g.id, summary: `Created ${d.scope} goal “${d.title}”`, after: f });
  if (d.progressMode === 'auto') await syncGoal(tx, actor, g.id);
  return g.id as string;
}

async function applyValue(tx: Tx, actor: Actor, goalId: string, value: string, note: string | null, recordedBy: string | null) {
  const [g] = await tx`select id, title, scope, user_id, team_id, target_value, current_value, status from goals where id = ${goalId} for update`;
  if (!g) throw new UserError('Goal not found.');
  if (Number(g.current_value) === Number(value) && note === null) return false;
  await tx`update goals set current_value = ${value} where id = ${goalId}`;
  await tx`insert into goal_progress (office_id, goal_id, value, target_value, note, recorded_by) values (${actor.officeId}, ${goalId}, ${value}, ${g.target_value}, ${note}, ${recordedBy})`;
  const crossed = crossedMilestones(Number(g.current_value), Number(value), Number(g.target_value));
  if (crossed.length) {
    const m = Math.max(...crossed);
    const users = g.scope === 'individual' ? [g.user_id] : await activeMemberIds(tx, actor.officeId);
    await notify(tx, actor.officeId, users, {
      kind: 'goal_milestone', title: m >= 100 ? `Goal achieved: ${g.title}` : `${m}% reached: ${g.title}`, link: '/goals', dedupeKey: `goal:${goalId}:${m}`,
    });
  }
  return true;
}

export async function recordProgress(tx: Tx, actor: Actor, d: z.infer<typeof goalProgressSchema>) {
  const [g] = await tx`select progress_mode, title, current_value from goals where id = ${d.goalId}`;
  if (!g) throw new UserError('Goal not found.');
  if (g.progress_mode === 'auto') throw new UserError('This goal is calculated automatically from office records.');
  await applyValue(tx, actor, d.goalId, d.value, d.note ?? 'Manual update', actor.userId);
  await audit(tx, actor, { action: 'goal.progress', entityType: 'goal', entityId: d.goalId, summary: `Progress on “${g.title}” set to ${d.value}`, before: { value: g.current_value }, after: { value: d.value } });
}

/** Recomputes an automatic goal from stored records (app.goal_metric_value) and stores a history point if changed. */
export async function syncGoal(tx: Tx, actor: Actor, goalId: string) {
  const [{ v }] = await tx`select app.goal_metric_value(${goalId})::text as v`;
  if (v === null) return false;
  return applyValue(tx, actor, goalId, v, null, null);
}

export async function syncAllAutoGoals(tx: Tx, actor: Actor) {
  const goals = await tx`select id from goals where office_id = ${actor.officeId} and progress_mode = 'auto' and status = 'active'`;
  let changed = 0;
  for (const g of goals) if (await syncGoal(tx, actor, g.id)) changed++;
  return changed;
}

export async function setGoalStatus(tx: Tx, actor: Actor, d: z.infer<typeof goalStatusSchema>) {
  const [g] = await tx`update goals set status = ${d.status} where id = ${d.goalId} returning title`;
  if (!g) throw new UserError('Goal not found.');
  await audit(tx, actor, { action: 'goal.status', entityType: 'goal', entityId: d.goalId, summary: `Marked goal “${g.title}” as ${d.status}` });
}
