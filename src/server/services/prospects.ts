import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import { STAGE_LABELS, type archiveSchema, type assignSchema, type interactionSchema, type prospectSchema, type stageSchema } from '@/lib/validation/prospects';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { notify } from '../notify';

type ProspectInput = z.infer<typeof prospectSchema>;

export async function saveProspect(tx: Tx, actor: Actor & { role: string }, d: ProspectInput) {
  const isAdmin = actor.role === 'admin';
  // Members always own the prospects they add; admins may add to the shared pool (no owner) or assign to a member.
  const ownerId = isAdmin ? (d.ownerId ?? null) : actor.userId;
  const visibility = ownerId === null ? 'office' : d.visibility;
  const fields = {
    name: d.name,
    phone: d.phone ?? null,
    email: d.email ?? null,
    source: d.source ?? null,
    stage: d.stage,
    estimated_value: d.estimatedValue ?? null,
    last_contact_on: d.lastContactOn ?? null,
    next_follow_up: d.nextFollowUp ?? null,
    next_action: d.nextAction ?? null,
    notes: d.notes ?? null,
    visibility,
  };
  if (d.prospectId) {
    const [before] = await tx`select * from prospects where id = ${d.prospectId} for update`;
    if (!before) throw new UserError('Prospect not found.');
    if (!isAdmin && before.owner_id !== actor.userId) throw new UserError('You can only edit your own prospects.');
    const owner = isAdmin ? ownerId : before.owner_id;
    await tx`update prospects set ${tx({ ...fields, owner_id: owner, visibility: owner === null ? 'office' : visibility })},
      converted_at = case when ${d.stage} = 'converted' and stage <> 'converted' then now() when ${d.stage} <> 'converted' then null else converted_at end
      where id = ${d.prospectId}`;
    if (before.stage !== d.stage) await logStage(tx, actor, d.prospectId, before.stage, d.stage);
    if (isAdmin && before.owner_id !== owner) await afterAssign(tx, actor, [d.prospectId], owner, d.name);
    return d.prospectId;
  }
  const [p] = await tx`insert into prospects ${tx({ ...fields, office_id: actor.officeId, owner_id: ownerId, created_by: actor.userId })}
    returning id`;
  if (d.stage === 'converted') await tx`update prospects set converted_at = now() where id = ${p.id}`;
  await tx`insert into prospect_interactions (office_id, prospect_id, user_id, kind, summary) values (${actor.officeId}, ${p.id}, ${actor.userId}, 'note', 'Prospect added')`;
  if (isAdmin && ownerId && ownerId !== actor.userId) await afterAssign(tx, actor, [p.id], ownerId, d.name);
  return p.id as string;
}

async function logStage(tx: Tx, actor: Actor, prospectId: string, from: string, to: string) {
  await tx`insert into prospect_interactions (office_id, prospect_id, user_id, kind, summary)
    values (${actor.officeId}, ${prospectId}, ${actor.userId}, 'stage_change',
      ${`Stage changed from ${STAGE_LABELS[from as keyof typeof STAGE_LABELS] ?? from} to ${STAGE_LABELS[to as keyof typeof STAGE_LABELS] ?? to}`})`;
}

export async function changeStage(tx: Tx, actor: Actor, d: z.infer<typeof stageSchema>) {
  const [p] = await tx`select stage from prospects where id = ${d.prospectId} for update`;
  if (!p) throw new UserError('Prospect not found.');
  if (p.stage === d.stage) return;
  const [u] = await tx`update prospects set stage = ${d.stage},
      converted_at = case when ${d.stage} = 'converted' then now() else null end
      where id = ${d.prospectId} returning id`;
  if (!u) throw new UserError('You can only update your own prospects.');
  await logStage(tx, actor, d.prospectId, p.stage, d.stage);
}

export async function addInteraction(tx: Tx, actor: Actor, d: z.infer<typeof interactionSchema>) {
  await tx`insert into prospect_interactions (office_id, prospect_id, user_id, kind, summary) values (${actor.officeId}, ${d.prospectId}, ${actor.userId}, ${d.kind}, ${d.summary})`;
  const [p] = await tx`select stage from prospects where id = ${d.prospectId}`;
  const stage = d.stage ?? (p.stage === 'new' ? 'contacted' : p.stage);
  const [u] = await tx`update prospects set last_contact_on = app.office_today(office_id),
      next_follow_up = ${d.nextFollowUp ?? null}, stage = ${stage},
      converted_at = case when ${stage} = 'converted' and stage <> 'converted' then now() when ${stage} <> 'converted' then null else converted_at end
    where id = ${d.prospectId} returning id`;
  if (!u) throw new UserError('You can only log activity on your own prospects.');
  if (stage !== p.stage) await logStage(tx, actor, d.prospectId, p.stage, stage);
}

export async function setArchived(tx: Tx, actor: Actor, d: z.infer<typeof archiveSchema>) {
  const [u] = await tx`update prospects set archived_at = ${d.archive === '1' ? tx`now()` : null} where id = ${d.prospectId} returning name`;
  if (!u) throw new UserError('Prospect not found or not yours.');
  await tx`insert into prospect_interactions (office_id, prospect_id, user_id, kind, summary) values (${actor.officeId}, ${d.prospectId}, ${actor.userId}, 'note', ${d.archive === '1' ? 'Archived' : 'Restored from archive'})`;
}

async function afterAssign(tx: Tx, actor: Actor, ids: string[], ownerId: string | null, name?: string) {
  for (const id of ids) {
    await tx`insert into prospect_interactions (office_id, prospect_id, user_id, kind, summary)
      values (${actor.officeId}, ${id}, ${actor.userId}, 'assignment', ${ownerId ? 'Assigned to a member' : 'Returned to the shared office pool'})`;
  }
  if (ownerId) {
    await notify(tx, actor.officeId, [ownerId], {
      kind: 'prospect_assigned',
      title: ids.length === 1 ? `New prospect assigned${name ? `: ${name}` : ''}` : `${ids.length} prospects assigned to you`,
      link: '/prospects',
    });
  }
  await audit(tx, actor, { action: 'prospect.assign', entityType: 'prospect', entityId: ids.length === 1 ? ids[0] : null, summary: `Assigned ${ids.length} prospect(s)`, after: { ids, ownerId } });
}

export async function assignProspects(tx: Tx, actor: Actor, d: z.infer<typeof assignSchema>) {
  const owner = d.ownerId ?? null;
  const rows = await tx`update prospects set owner_id = ${owner}, visibility = case when ${owner}::uuid is null then 'office' else visibility end
    where id in ${tx(d.prospectIds)} and office_id = ${actor.officeId} returning id`;
  if (!rows.length) throw new UserError('No prospects were updated.');
  await afterAssign(tx, actor, rows.map((r) => r.id), owner);
  return rows.length;
}
