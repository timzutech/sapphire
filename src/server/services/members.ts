import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type {
  levelSchema, memberCreateSchema, memberStatusSchema, memberUpdateSchema, resetPasswordSchema, setLevelSchema, teamSchema,
} from '@/lib/validation/members';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { notify } from '../notify';

export async function createMember(tx: Tx, actor: Actor, d: z.infer<typeof memberCreateSchema>) {
  const [u] = await tx`select * from app.create_user(${d.email}, ${d.fullName}, ${d.phone ?? null}, ${d.tempPassword})`;
  const [existing] = await tx`select id, status from memberships where office_id = ${actor.officeId} and user_id = ${u.user_id}`;
  if (existing) throw new UserError('This person is already a member of the office.', { email: 'Already a member' });
  const [m] = await tx`
    insert into memberships (office_id, user_id, role, team_id, title, joined_on)
    values (${actor.officeId}, ${u.user_id}, ${d.role}, ${d.teamId ?? null}, ${d.title ?? null}, ${d.joinedOn ?? tx`current_date`})
    returning id`;
  const [{ id: starter } = { id: null }] = await tx`select id from levels where office_id = ${actor.officeId} order by rank limit 1`;
  if (starter) {
    await tx`insert into member_levels (office_id, user_id, level_id, set_by, note) values (${actor.officeId}, ${u.user_id}, ${starter}, ${actor.userId}, 'Initial level')`;
  }
  await notify(tx, actor.officeId, [u.user_id], { kind: 'welcome', title: 'Welcome to the office workspace', body: 'Your account is ready. Please change your temporary password.', link: '/profile' });
  await audit(tx, actor, {
    action: 'member.create', entityType: 'membership', entityId: m.id,
    summary: `${u.existed ? 'Added existing account' : 'Created account'} ${d.email} as ${d.role}`,
    after: { email: d.email, role: d.role, teamId: d.teamId ?? null },
  });
  return { membershipId: m.id as string, existed: u.existed as boolean };
}

export async function updateMember(tx: Tx, actor: Actor, d: z.infer<typeof memberUpdateSchema>) {
  const [before] = await tx`
    select m.id, m.user_id, m.role, m.team_id, m.title, m.joined_on, u.full_name, u.email, u.phone
    from memberships m join users u on u.id = m.user_id where m.id = ${d.membershipId} and m.office_id = ${actor.officeId}`;
  if (!before) throw new UserError('Member not found.');
  if (before.user_id === actor.userId && d.role !== 'admin' && before.role === 'admin') {
    throw new UserError('You cannot remove your own administrator role.');
  }
  await tx`update users set full_name = ${d.fullName}, email = ${d.email}, phone = ${d.phone ?? null} where id = ${before.user_id}`;
  await tx`update memberships set role = ${d.role}, team_id = ${d.teamId ?? null}, title = ${d.title ?? null}, joined_on = ${d.joinedOn} where id = ${d.membershipId}`;
  await audit(tx, actor, { action: 'member.update', entityType: 'membership', entityId: d.membershipId, summary: `Updated member ${d.fullName}`, before, after: d });
}

export async function setMemberStatus(tx: Tx, actor: Actor, d: z.infer<typeof memberStatusSchema>) {
  const [m] = await tx`select m.id, m.user_id, m.status, u.full_name from memberships m join users u on u.id = m.user_id where m.id = ${d.membershipId}`;
  if (!m) throw new UserError('Member not found.');
  if (m.user_id === actor.userId) throw new UserError('You cannot change your own account status.');
  await tx`update memberships set status = ${d.status} where id = ${d.membershipId}`;
  await audit(tx, actor, {
    action: d.status === 'active' ? 'member.reactivate' : 'member.deactivate', entityType: 'membership', entityId: d.membershipId,
    summary: `${d.status === 'active' ? 'Reactivated' : 'Deactivated'} ${m.full_name}`, before: { status: m.status }, after: { status: d.status }, reason: d.reason,
  });
}

export async function resetPassword(tx: Tx, actor: Actor, d: z.infer<typeof resetPasswordSchema>) {
  if (d.userId === actor.userId) throw new UserError('Use your profile page to change your own password.');
  await tx`select app.admin_reset_password(${d.userId}, ${d.tempPassword})`;
  await audit(tx, actor, { action: 'member.password_reset', entityType: 'user', entityId: d.userId, summary: 'Issued a temporary password (member must change it at next sign-in)' });
}

export async function setLevel(tx: Tx, actor: Actor, d: z.infer<typeof setLevelSchema>) {
  const [l] = await tx`select name from levels where id = ${d.levelId}`;
  if (!l) throw new UserError('Level not found.');
  await tx`insert into member_levels (office_id, user_id, level_id, achieved_on, note, set_by) values (${actor.officeId}, ${d.userId}, ${d.levelId}, ${d.achievedOn}, ${d.note ?? null}, ${actor.userId})`;
  await notify(tx, actor.officeId, [d.userId], { kind: 'level', title: `You reached ${l.name}`, body: d.note ?? null, link: '/goals' });
  await audit(tx, actor, { action: 'member.level', entityType: 'user', entityId: d.userId, summary: `Set level to ${l.name}`, after: d });
}

export async function saveTeam(tx: Tx, actor: Actor, d: z.infer<typeof teamSchema>) {
  if (d.teamId) await tx`update teams set name = ${d.name}, description = ${d.description ?? null} where id = ${d.teamId}`;
  else await tx`insert into teams (office_id, name, description) values (${actor.officeId}, ${d.name}, ${d.description ?? null})`;
  await audit(tx, actor, { action: d.teamId ? 'team.update' : 'team.create', entityType: 'team', entityId: d.teamId, summary: `Saved team ${d.name}` });
}

export async function saveLevel(tx: Tx, actor: Actor, d: z.infer<typeof levelSchema>) {
  if (d.levelId) await tx`update levels set name = ${d.name}, rank = ${d.rank}, criteria = ${d.criteria ?? null} where id = ${d.levelId}`;
  else await tx`insert into levels (office_id, name, rank, criteria) values (${actor.officeId}, ${d.name}, ${d.rank}, ${d.criteria ?? null})`;
  await audit(tx, actor, { action: d.levelId ? 'level.update' : 'level.create', entityType: 'level', entityId: d.levelId, summary: `Saved progression level ${d.name} (rank ${d.rank})`, after: d });
}
