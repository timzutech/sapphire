import { z } from 'zod';
import { date, decimal, enumOf, id, optId, optText, reqText } from './common';

export const GOAL_CATEGORIES = ['progression', 'earnings', 'active_members', 'prospecting', 'conversion', 'training', 'tools', 'personal_development', 'team_performance', 'challenges', 'attendance', 'tasks', 'other'] as const;
export const GOAL_METRICS = ['attendance_days', 'prospects_added', 'prospects_converted', 'tasks_completed', 'personal_income', 'office_income', 'active_members', 'training_attended', 'members_at_level', 'challenge_score'] as const;

export const METRIC_LABELS: Record<(typeof GOAL_METRICS)[number], string> = {
  attendance_days: 'Days attended (present or late) in the goal period',
  prospects_added: 'Prospects added in the goal period',
  prospects_converted: 'Prospects moved to “Converted” in the goal period',
  tasks_completed: 'Tasks completed in the goal period',
  personal_income: 'Recorded personal income (excluding rejected) in the goal period',
  office_income: 'Office income transactions in the goal period',
  active_members: 'Currently active members in scope',
  training_attended: 'Training/workshop sessions marked attended in the goal period',
  members_at_level: 'Active members whose current level is at or above the chosen level',
  challenge_score: 'Total verified score in the chosen challenge',
};

export const goalSchema = z
  .object({
    goalId: optId(),
    scope: enumOf(['office', 'team', 'individual'] as const, 'Scope'),
    userId: optId(),
    teamId: optId(),
    title: reqText('Title', 160),
    description: optText(2000),
    category: enumOf(GOAL_CATEGORIES, 'Category'),
    unit: reqText('Unit', 30),
    targetValue: decimal('Target').refine((v) => Number(v) >= 0, 'Target cannot be negative'),
    startDate: date('Start date'),
    endDate: date('End date'),
    responsibleUserId: optId(),
    progressMode: enumOf(['manual', 'auto'] as const, 'Progress mode'),
    metric: z.preprocess((v) => (v === '' ? undefined : v), z.enum(GOAL_METRICS).optional()),
    metricParam: optText(80),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] })
  .refine((v) => v.scope !== 'individual' || v.userId, { message: 'Choose a member', path: ['userId'] })
  .refine((v) => v.scope !== 'team' || v.teamId, { message: 'Choose a team', path: ['teamId'] })
  .refine((v) => v.progressMode === 'manual' || v.metric, { message: 'Choose how progress is calculated', path: ['metric'] })
  .refine((v) => !(v.metric === 'members_at_level' || v.metric === 'challenge_score') || v.metricParam, { message: 'Choose the level or challenge', path: ['metricParam'] });

export const goalProgressSchema = z.object({ goalId: id('Goal'), value: decimal('Current value'), note: optText(500) });
export const goalStatusSchema = z.object({ goalId: id('Goal'), status: enumOf(['active', 'achieved', 'missed', 'cancelled'] as const, 'Status') });

