import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { activitySchema, participationSchema, planSchema, registrationSchema } from '@/lib/validation/plans';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { activeMemberIds, notify } from '../notify';

export async function savePlan(tx: Tx, actor: Actor, d: z.infer<typeof planSchema>) {
  const month = `${d.month}-01`;
  if (d.planId) {
    await tx`update office_plans set month = ${month}, title = ${d.title}, summary = ${d.summary ?? null} where id = ${d.planId}`;
    return d.planId;
  }
  const [p] = await tx`insert into office_plans (office_id, month, title, summary, created_by) values (${actor.officeId}, ${month}, ${d.title}, ${d.summary ?? null}, ${actor.userId}) returning id`;
  await audit(tx, actor, { action: 'plan.create', entityType: 'office_plan', entityId: p.id, summary: `Created plan “${d.title}” for ${d.month}` });
  return p.id as string;
}

/** Converts a datetime-local value (office wall-clock time) into a timestamptz using the office timezone. */
function localToTs(tx: Tx, officeId: string, v: string) {
  return tx`(${v.replace('T', ' ')}::timestamp at time zone (select timezone from offices where id = ${officeId}))`;
}

export async function saveActivity(tx: Tx, actor: Actor, d: z.infer<typeof activitySchema>) {
  const starts = localToTs(tx, actor.officeId, d.startsAt);
  const ends = d.endsAt ? localToTs(tx, actor.officeId, d.endsAt) : null;
  if (d.activityId) {
    await tx`update plan_activities set kind = ${d.kind}, title = ${d.title}, description = ${d.description ?? null}, starts_at = ${starts},
      ends_at = ${ends}, location = ${d.location ?? null}, requires_registration = ${d.requiresRegistration}, capacity = ${d.capacity ?? null}
      where id = ${d.activityId}`;
  } else {
    await tx`insert into plan_activities (office_id, plan_id, kind, title, description, starts_at, ends_at, location, requires_registration, capacity)
      values (${actor.officeId}, ${d.planId}, ${d.kind}, ${d.title}, ${d.description ?? null}, ${starts}, ${ends}, ${d.location ?? null}, ${d.requiresRegistration}, ${d.capacity ?? null})`;
  }
}

export async function deleteActivity(tx: Tx, actor: Actor, activityId: string) {
  const [a] = await tx`delete from plan_activities where id = ${activityId} returning title`;
  if (!a) throw new UserError('Activity not found.');
  await audit(tx, actor, { action: 'plan.activity_delete', entityType: 'plan_activity', entityId: activityId, summary: `Removed activity “${a.title}”` });
}

export async function setPlanPublished(tx: Tx, actor: Actor, planId: string, publish: boolean) {
  const [p] = await tx`update office_plans set status = ${publish ? 'published' : 'draft'}, published_at = ${publish ? tx`now()` : null}
    where id = ${planId} returning title, month`;
  if (!p) throw new UserError('Plan not found.');
  if (publish) {
    await notify(tx, actor.officeId, await activeMemberIds(tx, actor.officeId), {
      kind: 'plan_published', title: `Office plan published: ${p.title}`, link: '/plan', dedupeKey: `plan:${planId}`,
    });
  }
  await audit(tx, actor, { action: publish ? 'plan.publish' : 'plan.unpublish', entityType: 'office_plan', entityId: planId, summary: `${publish ? 'Published' : 'Unpublished'} plan “${p.title}”` });
}

export async function setRegistration(tx: Tx, actor: Actor, d: z.infer<typeof registrationSchema>) {
  const [a] = await tx`select a.id, a.starts_at < now() as started from plan_activities a where a.id = ${d.activityId} and a.requires_registration`;
  if (!a) throw new UserError('This activity does not take registrations.');
  if (a.started) throw new UserError('Registration has closed for this activity.');
  if (d.action === 'register') {
    await tx`insert into activity_registrations (office_id, activity_id, user_id) values (${actor.officeId}, ${d.activityId}, ${actor.userId})
      on conflict (activity_id, user_id) do update set status = 'registered'`;
  } else {
    const [r] = await tx`update activity_registrations set status = 'cancelled' where activity_id = ${d.activityId} and user_id = ${actor.userId} and status = 'registered' returning id`;
    if (!r) throw new UserError('You are not registered for this activity.');
  }
}

export async function recordParticipation(tx: Tx, actor: Actor, d: z.infer<typeof participationSchema>) {
  await tx`insert into activity_registrations (office_id, activity_id, user_id, status) values (${actor.officeId}, ${d.activityId}, ${d.userId}, ${d.status})
    on conflict (activity_id, user_id) do update set status = excluded.status`;
  await audit(tx, actor, { action: 'plan.participation', entityType: 'plan_activity', entityId: d.activityId, summary: `Marked participant as ${d.status}`, after: d });
}
