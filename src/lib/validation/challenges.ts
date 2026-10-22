import { z } from 'zod';
import { checkbox, date, enumOf, id, optId, optInt, optMoney, optText, reqText } from './common';

export const CHALLENGE_METRICS = ['manual', 'prospects_added', 'prospects_converted', 'personal_income', 'tasks_completed', 'training_attended', 'attendance_days'] as const;

export const CHALLENGE_METRIC_LABELS: Record<(typeof CHALLENGE_METRICS)[number], string> = {
  manual: 'Submitted results (each submission adds its value; verified by an admin if required)',
  prospects_added: '1 point per prospect you add during the challenge',
  prospects_converted: '1 point per prospect you convert during the challenge',
  personal_income: 'Income you record during the challenge (only admin-approved income counts when verification is required)',
  tasks_completed: '1 point per admin-assigned task completed during the challenge',
  training_attended: '1 point per training or workshop attended (marked by an admin)',
  attendance_days: '1 point per day present or late during the challenge',
};

export const challengeSchema = z
  .object({
    challengeId: optId(),
    name: reqText('Name', 120),
    description: optText(4000),
    startDate: date('Start date'),
    endDate: date('End date'),
    participation: enumOf(['individual', 'team'] as const, 'Participation'),
    metric: enumOf(CHALLENGE_METRICS, 'Scoring'),
    unit: reqText('Unit', 30),
    targetValue: optMoney('Target'),
    requiresVerification: checkbox(),
    eligibility: enumOf(['all', 'team', 'min_level'] as const, 'Eligibility'),
    eligibleTeamId: optId(),
    eligibleMinRank: optInt(0, 1000),
    reward: optText(500),
    leaderboardEnabled: checkbox(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] })
  .refine((v) => v.eligibility !== 'team' || v.eligibleTeamId, { message: 'Choose the eligible team', path: ['eligibleTeamId'] })
  .refine((v) => v.eligibility !== 'min_level' || v.eligibleMinRank !== undefined, { message: 'Choose the minimum level', path: ['eligibleMinRank'] });

export const challengeStatusSchema = z.object({ challengeId: id('Challenge'), status: enumOf(['draft', 'published', 'cancelled'] as const, 'Status') });
export const joinSchema = z.object({ challengeId: id('Challenge') });
export const submissionSchema = z.object({
  challengeId: id('Challenge'),
  value: optMoney('Value').refine((v) => v !== undefined, 'Value is required'),
  description: reqText('Description', 500),
  occurredOn: date('Date'),
  clientToken: z.guid(),
});
export const reviewSubmissionSchema = z.object({
  submissionId: id('Submission'),
  decision: enumOf(['approved', 'rejected'] as const, 'Decision'),
  note: optText(500),
});
export const rewardSchema = z.object({ challengeId: id('Challenge'), userId: id('Member'), rank: optInt(1, 1000), reward: reqText('Reward', 300) });
