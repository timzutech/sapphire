import 'server-only';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import { challengePhase, isEligible, type RawScore } from '@/lib/logic/challenges';
import type { challengeSchema, challengeStatusSchema, rewardSchema, reviewSubmissionSchema, submissionSchema } from '@/lib/validation/challenges';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { activeMemberIds, notify, notifyAdmins } from '../notify';
import { officeToday } from './attendance';

export async function saveChallenge(tx: Tx, actor: Actor, d: z.infer<typeof challengeSchema>) {
  const f = {
    name: d.name,
    description: d.description ?? null,
    start_date: d.startDate,
    end_date: d.endDate,
    participation: d.participation,
    metric: d.metric,
    unit: d.unit,
    target_value: d.targetValue ?? null,
    requires_verification: d.requiresVerification,
    eligibility: d.eligibility,
    eligible_team_id: d.eligibility === 'team' ? d.eligibleTeamId! : null,
    eligible_min_rank: d.eligibility === 'min_level' ? d.eligibleMinRank! : null,
    reward: d.reward ?? null,
    leaderboard_enabled: d.leaderboardEnabled,
  };
  if (d.challengeId) {
    const [before] = await tx`select * from challenges where id = ${d.challengeId} for update`;
    if (!before) throw new UserError('Challenge not found.');
    if (before.status === 'published' && (before.metric !== d.metric || before.requires_verification !== d.requiresVerification)) {
      throw new UserError('Scoring rules cannot change after a challenge is published.');
    }
    await tx`update challenges set ${tx(f)} where id = ${d.challengeId}`;
    await audit(tx, actor, { action: 'challenge.update', entityType: 'challenge', entityId: d.challengeId, summary: `Updated challenge “${d.name}”`, before, after: f });
    return d.challengeId;
  }
  const [c] = await tx`insert into challenges ${tx({ ...f, office_id: actor.officeId, created_by: actor.userId })} returning id`;
  await audit(tx, actor, { action: 'challenge.create', entityType: 'challenge', entityId: c.id, summary: `Created challenge “${d.name}”`, after: f });
  return c.id as string;
}

export async function setChallengeStatus(tx: Tx, actor: Actor, d: z.infer<typeof challengeStatusSchema>) {
  const [c] = await tx`update challenges set status = ${d.status} where id = ${d.challengeId} returning name`;
  if (!c) throw new UserError('Challenge not found.');
  if (d.status === 'published') {
    await notify(tx, actor.officeId, await activeMemberIds(tx, actor.officeId), {
      kind: 'challenge', title: `New challenge: ${c.name}`, link: `/challenges/${d.challengeId}`, dedupeKey: `challenge:${d.challengeId}`,
    });
  }
  await audit(tx, actor, { action: `challenge.${d.status}`, entityType: 'challenge', entityId: d.challengeId, summary: `Challenge “${c.name}” set to ${d.status}` });
}

async function memberContext(tx: Tx, actor: Actor) {
  const [m] = await tx`
    select m.team_id, (select l.rank from member_levels ml join levels l on l.id = ml.level_id
       where ml.office_id = m.office_id and ml.user_id = m.user_id order by ml.achieved_on desc, ml.created_at desc limit 1) as level_rank
    from memberships m where m.office_id = ${actor.officeId} and m.user_id = ${actor.userId} and m.status = 'active'`;
  if (!m) throw new UserError('Only active members can take part in challenges.');
  return { teamId: m.team_id as string | null, levelRank: m.level_rank as number | null };
}

export async function joinChallenge(tx: Tx, actor: Actor, challengeId: string) {
  const [c] = await tx`select * from challenges where id = ${challengeId}`;
  if (!c || c.status !== 'published') throw new UserError('This challenge is not open.');
  const today = await officeToday(tx, actor.officeId);
  if (challengePhase({ status: c.status, startDate: c.start_date, endDate: c.end_date }, today) === 'ended') throw new UserError('This challenge has ended.');
  const me = await memberContext(tx, actor);
  const elig = isEligible({ eligibility: c.eligibility, eligibleTeamId: c.eligible_team_id, eligibleMinRank: c.eligible_min_rank }, me);
  if (!elig.ok) throw new UserError(elig.reason!);
  if (c.participation === 'team' && !me.teamId) throw new UserError('You need to be on a team to join a team challenge. Ask an administrator.');
  await tx`insert into challenge_participants (office_id, challenge_id, user_id, team_id) values (${actor.officeId}, ${challengeId}, ${actor.userId}, ${me.teamId})`;
}

export async function leaveChallenge(tx: Tx, actor: Actor, challengeId: string) {
  const [{ n }] = await tx`select count(*)::int as n from challenge_submissions where challenge_id = ${challengeId} and user_id = ${actor.userId}`;
  if (n > 0) throw new UserError('You cannot leave after submitting results.');
  await tx`delete from challenge_participants where challenge_id = ${challengeId} and user_id = ${actor.userId}`;
}

export async function submitResult(tx: Tx, actor: Actor, d: z.infer<typeof submissionSchema>) {
  const [c] = await tx`select * from challenges where id = ${d.challengeId}`;
  if (!c || c.status !== 'published') throw new UserError('This challenge is not open.');
  if (c.metric !== 'manual') throw new UserError('This challenge is scored automatically from your records.');
  if (d.occurredOn < c.start_date || d.occurredOn > c.end_date) throw new UserError('The date must fall within the challenge period.', { occurredOn: 'Outside challenge period' });
  const today = await officeToday(tx, actor.officeId);
  if (d.occurredOn > today) throw new UserError('The date cannot be in the future.', { occurredOn: 'Future date' });
  const [p] = await tx`select 1 from challenge_participants where challenge_id = ${d.challengeId} and user_id = ${actor.userId}`;
  if (!p) throw new UserError('Join the challenge before submitting results.');
  await tx`insert into challenge_submissions (office_id, challenge_id, user_id, value, description, occurred_on, client_token)
    values (${actor.officeId}, ${d.challengeId}, ${actor.userId}, ${d.value!}, ${d.description}, ${d.occurredOn}, ${d.clientToken})`;
  if (c.requires_verification) {
    await notifyAdmins(tx, actor.officeId, { kind: 'approval', title: `Challenge submission to review: ${c.name}`, link: `/admin/challenges/${c.id}` }, actor.userId);
  }
}

export async function reviewSubmission(tx: Tx, actor: Actor, d: z.infer<typeof reviewSubmissionSchema>) {
  const [s] = await tx`update challenge_submissions set status = ${d.decision}, reviewed_by = ${actor.userId}, reviewed_at = now(), review_note = ${d.note ?? null}
    where id = ${d.submissionId} and status = 'pending' returning challenge_id, user_id, value`;
  if (!s) throw new UserError('Submission not found or already reviewed.');
  await notify(tx, actor.officeId, [s.user_id], { kind: 'challenge', title: `Your challenge submission was ${d.decision}`, body: d.note ?? null, link: `/challenges/${s.challenge_id}` });
  await audit(tx, actor, { action: `challenge.submission_${d.decision}`, entityType: 'challenge_submission', entityId: d.submissionId, summary: `${d.decision === 'approved' ? 'Approved' : 'Rejected'} submission of ${s.value}`, reason: d.note });
}

export async function awardReward(tx: Tx, actor: Actor, d: z.infer<typeof rewardSchema>) {
  const [c] = await tx`select name from challenges where id = ${d.challengeId}`;
  if (!c) throw new UserError('Challenge not found.');
  const [p] = await tx`select 1 from challenge_participants where challenge_id = ${d.challengeId} and user_id = ${d.userId}`;
  if (!p) throw new UserError('Rewards can only be given to participants.');
  await tx`insert into challenge_rewards (office_id, challenge_id, user_id, rank, reward, awarded_by) values (${actor.officeId}, ${d.challengeId}, ${d.userId}, ${d.rank ?? null}, ${d.reward}, ${actor.userId})`;
  await notify(tx, actor.officeId, [d.userId], { kind: 'reward', title: `You earned a reward in ${c.name}`, body: d.reward, link: `/challenges/${d.challengeId}` });
  await audit(tx, actor, { action: 'challenge.reward', entityType: 'challenge', entityId: d.challengeId, summary: `Awarded “${d.reward}”`, after: d });
}

export async function challengeScores(tx: Tx, challengeId: string): Promise<RawScore[]> {
  const rows = await tx`select * from app.challenge_scores(${challengeId})`;
  return rows.map((r) => ({
    userId: r.user_id, name: r.full_name, teamId: r.team_id, teamName: r.team_name, score: Number(r.score), lastActivityAt: r.last_activity_at, joinedAt: r.joined_at,
  }));
}
