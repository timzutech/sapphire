import { describe, expect, it } from 'vitest';
import { attendanceFlags, attendanceStats, decideCheckIn, eligibleDays } from '@/lib/logic/attendance';
import { challengePhase, isEligible, rankIndividuals, rankTeams, type RawScore } from '@/lib/logic/challenges';
import { deriveFineStatus, fineOutstanding, validateFinePayment } from '@/lib/logic/fines';
import { crossedMilestones, expectedProgressPercent, goalProgress } from '@/lib/logic/goals';
import { addDays, endOfMonth, presetRange, resolveRange, startOfWeek } from '@/lib/dates';
import { toCsv } from '@/lib/csv';

const rules = { checkinOpens: '06:00', lateAfter: '09:00', checkinCloses: '13:00', workingDays: [1, 2, 3, 4, 5] };

describe('attendance', () => {
  it('decides present/late/closed using the configured window', () => {
    expect(decideCheckIn(rules, '2026-10-21', '08:59')).toEqual({ ok: true, status: 'present' });
    expect(decideCheckIn(rules, '2026-10-21', '09:00')).toEqual({ ok: true, status: 'present' });
    expect(decideCheckIn(rules, '2026-10-21', '09:01')).toEqual({ ok: true, status: 'late' });
    expect(decideCheckIn(rules, '2026-10-21', '05:59')).toEqual({ ok: false, reason: 'too_early' });
    expect(decideCheckIn(rules, '2026-10-21', '13:01')).toEqual({ ok: false, reason: 'closed' });
    expect(decideCheckIn(rules, '2026-10-24', '08:00')).toEqual({ ok: false, reason: 'not_working_day' });
  });

  it('eligible days respect joining date, today and working days', () => {
    expect(eligibleDays('2026-10-01', '2026-10-31', [1, 2, 3, 4, 5], '2026-10-15', '2026-10-21')).toEqual(['2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21']);
    expect(eligibleDays('2026-10-01', '2026-10-05', [1], '2026-11-01')).toEqual([]);
  });

  it('rate = (present+late)/(eligible−excused); unrecorded days count against the member', () => {
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const s = attendanceStats([
      { date: '2026-10-19', status: 'present' }, { date: '2026-10-20', status: 'late' }, { date: '2026-10-21', status: 'excused' },
      { date: '2026-10-22', status: 'absent' }, { date: '2026-10-25', status: 'present' }, // outside the eligible set
    ], days);
    expect(s).toMatchObject({ present: 1, late: 1, excused: 1, absent: 1, unrecorded: 1, rate: 50, punctuality: 50 });
    expect(attendanceStats([], []).rate).toBeNull();
    expect(attendanceFlags({ ...s, late: 3 })).toContain('Late 3×');
  });
});

describe('goals', () => {
  it('computes progress safely', () => {
    expect(goalProgress(5, 10)).toMatchObject({ percent: 50, achieved: false, remaining: 5, label: '50%' });
    expect(goalProgress(15, 10)).toMatchObject({ percent: 100, rawPercent: 150, achieved: true, remaining: 0 });
    expect(goalProgress(3, 0)).toMatchObject({ percent: 100, rawPercent: null, achieved: true });
    expect(goalProgress(-4, 10)).toMatchObject({ percent: 0, achieved: false });
    expect(goalProgress(1, -5).label).toBe('Invalid target');
    expect(goalProgress('2.5', '10').label).toBe('25%');
  });
  it('detects milestone crossings once', () => {
    expect(crossedMilestones(4, 6, 10)).toEqual([50]);
    expect(crossedMilestones(4, 12, 10)).toEqual([50, 100]);
    expect(crossedMilestones(6, 7, 10)).toEqual([]);
    expect(crossedMilestones(0, 5, 0)).toEqual([]);
  });
  it('expected pace is linear over the goal period', () => {
    expect(expectedProgressPercent('2026-10-01', '2026-10-31', '2026-10-16')).toBe(50);
    expect(expectedProgressPercent('2026-10-01', '2026-10-31', '2026-09-01')).toBe(0);
  });
});

describe('challenges', () => {
  const s = (userId: string, score: number, last: string | null, joined = '2026-10-01T08:00:00Z', team: string | null = null): RawScore =>
    ({ userId, name: userId, teamId: team, teamName: team, score, lastActivityAt: last, joinedAt: joined });

  it('ranks by score, then earliest last activity, then join time', () => {
    const r = rankIndividuals([
      s('late', 5, '2026-10-10T10:00:00Z'), s('early', 5, '2026-10-05T10:00:00Z'), s('top', 9, '2026-10-20T10:00:00Z'), s('zero', 0, null),
    ], 10);
    expect(r.map((x) => [x.key, x.rank])).toEqual([['top', 1], ['early', 2], ['late', 3], ['zero', 4]]);
    expect(r[0]).toMatchObject({ remaining: 1, percent: 90 });
  });

  it('shares a rank only on an exact tie', () => {
    const r = rankIndividuals([s('a', 3, '2026-10-05T10:00:00Z'), s('b', 3, '2026-10-05T10:00:00Z')]);
    expect(r.map((x) => x.rank)).toEqual([1, 1]);
    expect(r[0]!.remaining).toBeNull();
  });

  it('aggregates team scores', () => {
    const r = rankTeams([s('a', 3, '2026-10-05T10:00:00Z', undefined, 'T1'), s('b', 4, '2026-10-06T10:00:00Z', undefined, 'T1'), s('c', 6, '2026-10-04T10:00:00Z', undefined, 'T2')]);
    expect(r.map((x) => [x.name, x.score, x.rank, x.memberCount])).toEqual([['T1', 7, 1, 2], ['T2', 6, 2, 1]]);
  });

  it('phases and eligibility', () => {
    const c = { status: 'published', startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(challengePhase(c, '2026-09-30')).toBe('upcoming');
    expect(challengePhase(c, '2026-10-31')).toBe('active');
    expect(challengePhase(c, '2026-11-01')).toBe('ended');
    expect(challengePhase({ ...c, status: 'draft' }, '2026-10-10')).toBe('draft');
    expect(isEligible({ eligibility: 'min_level', eligibleTeamId: null, eligibleMinRank: 2 }, { teamId: null, levelRank: 1 }).ok).toBe(false);
    expect(isEligible({ eligibility: 'team', eligibleTeamId: 't', eligibleMinRank: null }, { teamId: 't', levelRank: null }).ok).toBe(true);
  });
});

describe('fines', () => {
  const pays = [{ amount: '400', status: 'confirmed' as const }, { amount: '100', status: 'pending' as const }, { amount: '50', status: 'rejected' as const }];
  it('outstanding counts confirmed payments only', () => {
    expect(fineOutstanding('1000', pays)).toBe('600.00');
    expect(fineOutstanding('1000', pays, true)).toBe('0.00');
  });
  it('derives status with the same precedence as the database', () => {
    expect(deriveFineStatus('1000', pays)).toBe('partially_paid');
    expect(deriveFineStatus('1000', pays, { openDispute: true })).toBe('disputed');
    expect(deriveFineStatus('400', pays, { openDispute: true })).toBe('paid');
    expect(deriveFineStatus('1000', [])).toBe('pending');
    expect(deriveFineStatus('1000', pays, { waived: true })).toBe('waived');
  });
  it('rejects overpayments and payments on settled/waived fines', () => {
    expect(validateFinePayment('1000', pays, '600')).toBeNull();
    expect(validateFinePayment('1000', pays, '600.01')).toMatch(/exceeds/);
    expect(validateFinePayment('400', pays, '1')).toMatch(/fully paid/);
    expect(validateFinePayment('1000', pays, '1', true)).toMatch(/waived/);
  });
});

describe('dates and CSV', () => {
  it('handles calendar math in UTC', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19');
    expect(presetRange('last_month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(resolveRange({ range: 'custom', from: '2026-10-09', to: '2026-10-01' }, '2026-10-21')).toMatchObject({ preset: 'this_month', from: '2026-10-01' });
  });
  it('escapes CSV and neutralises spreadsheet formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', '=HYPERLINK("evil")'], [-5, null]])).toBe('a,b\r\n"x,y","\'=HYPERLINK(""evil"")"\r\n-5,\r\n');
  });
});
