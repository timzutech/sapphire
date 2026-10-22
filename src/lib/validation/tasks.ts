import { z } from 'zod';
import { enumOf, id, int, optDate, optId, optText, reqText } from './common';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

const base = {
  title: reqText('Title', 160, 2),
  description: optText(4000),
  startDate: optDate(),
  dueDate: optDate(),
  priority: enumOf(PRIORITIES, 'Priority'),
};
const dateOrder = (v: { startDate?: string; dueDate?: string }) => !v.startDate || !v.dueDate || v.dueDate >= v.startDate;

export const personalTaskSchema = z.object({ taskId: optId(), ...base }).refine(dateOrder, { message: 'Deadline must be on or after the start date', path: ['dueDate'] });

export const assignTaskSchema = z
  .object({ ...base, assigneeIds: z.array(z.guid()).min(1, 'Choose at least one member') })
  .refine(dateOrder, { message: 'Deadline must be on or after the start date', path: ['dueDate'] });

export const editAssignedTaskSchema = z
  .object({ taskId: id('Task'), ...base, assigneeId: id('Assignee') })
  .refine(dateOrder, { message: 'Deadline must be on or after the start date', path: ['dueDate'] });

export const taskStatusSchema = z.object({
  taskId: id('Task'),
  status: enumOf(TASK_STATUSES, 'Status'),
  progress: int('Progress', 0, 100).optional(),
  note: optText(2000),
});

export const taskCommentSchema = z.object({ taskId: id('Task'), body: reqText('Comment', 2000) });
export const taskIdSchema = z.object({ taskId: id('Task') });
