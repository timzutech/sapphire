import 'server-only';
import type { Tx } from '../db';

export async function listChallenges(tx: Tx, officeId: string, userId: string) {
  return tx`select c.*, c.start_date::text as sd, c.end_date::text as ed, t.name as team_name,
      (select count(*)::int from challenge_participants p where p.challenge_id = c.id) as participants,
      exists (select 1 from challenge_participants p where p.challenge_id = c.id and p.user_id = ${userId}) as joined,
      (select count(*)::int from challenge_submissions s where s.challenge_id = c.id and s.status = 'pending') as pending
    from challenges c left join teams t on t.id = c.eligible_team_id
    where c.office_id = ${officeId} order by c.end_date desc`;
}

export async function getChallenge(tx: Tx, id: string) {
  const [c] = await tx`select c.*, c.start_date::text as sd, c.end_date::text as ed, t.name as team_name,
      (select name from levels l where l.office_id = c.office_id and l.rank = c.eligible_min_rank) as level_name
    from challenges c left join teams t on t.id = c.eligible_team_id where c.id = ${id}`;
  return c ?? null;
}
