export interface GoalProgress {
  /** 0–100 clamped value for progress bars. */
  percent: number;
  /** Unclamped ratio × 100 (can exceed 100 for overachievement); null when it cannot be computed. */
  rawPercent: number | null;
  achieved: boolean;
  remaining: number;
  label: string;
}

/**
 * Progress % = current ÷ target × 100 when target > 0.
 * - target = 0: progress is "achieved" when current ≥ 0 (nothing required), rawPercent is null.
 * - negative target or current values are treated as "not computable"/zero progress rather than producing nonsense.
 * - overachievement is reported in rawPercent; the bar is capped at 100.
 */
export function goalProgress(current: number | string, target: number | string): GoalProgress {
  const c = Number(current);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t)) return { percent: 0, rawPercent: null, achieved: false, remaining: 0, label: '—' };
  if (t < 0) return { percent: 0, rawPercent: null, achieved: false, remaining: 0, label: 'Invalid target' };
  if (t === 0) {
    const achieved = c >= 0;
    return { percent: achieved ? 100 : 0, rawPercent: null, achieved, remaining: 0, label: achieved ? 'No target' : '—' };
  }
  const raw = (Math.max(c, 0) / t) * 100;
  const rounded = Math.round(raw * 10) / 10;
  return {
    percent: Math.min(100, rounded),
    rawPercent: rounded,
    achieved: c >= t,
    remaining: Math.max(0, t - c),
    label: `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`,
  };
}

/** Milestones (50/100%) newly crossed between two values — used for goal milestone notifications. */
export function crossedMilestones(previous: number, next: number, target: number, milestones = [50, 100]): number[] {
  if (!(target > 0)) return [];
  const before = (previous / target) * 100;
  const after = (next / target) * 100;
  return milestones.filter((m) => before < m && after >= m);
}

export function expectedProgressPercent(start: string, end: string, today: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (t <= s) return 0;
  if (t >= e) return 100;
  return Math.round(((t - s) / (e - s)) * 1000) / 10;
}
