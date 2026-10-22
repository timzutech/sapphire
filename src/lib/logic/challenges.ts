export interface RawScore {
  userId: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  score: number;
  lastActivityAt: string | Date | null;
  joinedAt: string | Date;
}

export interface RankedEntry {
  key: string;
  name: string;
  score: number;
  rank: number;
  remaining: number | null;
  percent: number | null;
  memberCount?: number;
}

const ts = (v: string | Date | null) => (v === null ? Number.POSITIVE_INFINITY : new Date(v).getTime());

/**
 * Ranking rules (shown to participants):
 *  1. Higher score ranks first.
 *  2. Ties: whoever reached their score first (earlier latest qualifying activity) ranks higher.
 *  3. Still tied: earlier join time ranks higher. Entries with identical score AND timestamps share a rank.
 * Participants with a score of 0 are listed but ranked after everyone with progress.
 */
export function rankIndividuals(scores: RawScore[], target?: number | null): RankedEntry[] {
  const sorted = [...scores].sort(
    (a, b) => b.score - a.score || ts(a.lastActivityAt) - ts(b.lastActivityAt) || ts(a.joinedAt) - ts(b.joinedAt) || a.name.localeCompare(b.name),
  );
  return assignRanks(
    sorted.map((s) => ({ key: s.userId, name: s.name, score: s.score, tie: `${s.score}|${ts(s.lastActivityAt)}|${ts(s.joinedAt)}` })),
    target,
  );
}

/** Team score = sum of member scores; tie-break on the team's most recent qualifying activity, then name. */
export function rankTeams(scores: RawScore[], target?: number | null): RankedEntry[] {
  const teams = new Map<string, { name: string; score: number; last: number; members: number }>();
  for (const s of scores) {
    const key = s.teamId ?? 'none';
    const t = teams.get(key) ?? { name: s.teamName ?? 'No team', score: 0, last: 0, members: 0 };
    t.score += s.score;
    t.members += 1;
    if (s.lastActivityAt) t.last = Math.max(t.last, ts(s.lastActivityAt));
    teams.set(key, t);
  }
  const sorted = [...teams.entries()].sort(
    (a, b) => b[1].score - a[1].score || (a[1].last || Infinity) - (b[1].last || Infinity) || a[1].name.localeCompare(b[1].name),
  );
  return assignRanks(
    sorted.map(([key, t]) => ({ key, name: t.name, score: t.score, tie: `${t.score}|${t.last}`, memberCount: t.members })),
    target,
  );
}

function assignRanks(rows: { key: string; name: string; score: number; tie: string; memberCount?: number }[], target?: number | null): RankedEntry[] {
  let prevTie = '';
  let prevRank = 0;
  return rows.map((r, i) => {
    const rank = r.tie === prevTie ? prevRank : i + 1;
    prevTie = r.tie;
    prevRank = rank;
    const hasTarget = target !== null && target !== undefined && target > 0;
    return {
      key: r.key,
      name: r.name,
      score: r.score,
      rank,
      memberCount: r.memberCount,
      remaining: hasTarget ? Math.max(0, target - r.score) : null,
      percent: hasTarget ? Math.min(100, Math.round((r.score / target) * 1000) / 10) : null,
    };
  });
}

export type ChallengePhase = 'draft' | 'cancelled' | 'upcoming' | 'active' | 'ended';

export function challengePhase(c: { status: string; startDate: string; endDate: string }, today: string): ChallengePhase {
  if (c.status === 'draft') return 'draft';
  if (c.status === 'cancelled') return 'cancelled';
  if (today < c.startDate) return 'upcoming';
  if (today > c.endDate) return 'ended';
  return 'active';
}

export interface EligibilityInput {
  eligibility: 'all' | 'team' | 'min_level';
  eligibleTeamId: string | null;
  eligibleMinRank: number | null;
}

export function isEligible(rule: EligibilityInput, member: { teamId: string | null; levelRank: number | null }): { ok: boolean; reason?: string } {
  if (rule.eligibility === 'team' && member.teamId !== rule.eligibleTeamId) return { ok: false, reason: 'This challenge is limited to a specific team.' };
  if (rule.eligibility === 'min_level' && (member.levelRank ?? -1) < (rule.eligibleMinRank ?? 0))
    return { ok: false, reason: 'You have not reached the minimum level for this challenge.' };
  return { ok: true };
}
