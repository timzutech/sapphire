import 'server-only';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { UserError } from '@/lib/errors';
import type { assignTaskSchema, editAssignedTaskSchema, personalTaskSchema, taskCommentSchema, taskStatusSchema } from '@/lib/validation/tasks';
import { audit, type Actor } from '../audit';
import type { Tx } from '../db';
import { notify } from '../notify';

export async function savePersonalTask(tx: Tx, actor: Actor, d: z.infer<typeof personalTaskSchema>) {
  const f = { title: d.title, description: d.description ?? null, start_date: d.startDate ?? null, due_date: d.dueDate ?? null, priority: d.priority };
  if (d.taskId) {
    const [t] = await tx`update tasks set ${tx(f)} where id = ${d.taskId} and kind = 'personal' and created_by = ${actor.userId} returning id`;
    if (!t) throw new UserError('Only your own personal tasks can be edited.');
    return;
  }
  await tx`insert into tasks ${tx({ ...f, office_id: actor.officeId, assignee_id: actor.userId, created_by: actor.userId, kind: 'personal' })}`;
}

/** Assigns one task per selected member, linked by a batch id so completion can be tracked across the group. */
export async function assignTask(tx: Tx, actor: Actor, d: z.infer<typeof assignTaskSchema>) {
  const batchId = d.assigneeIds.length > 1 ? randomUUID() : null;
  const rows = d.assigneeIds.map((assignee) => ({
    office_id: actor.officeId,
    title: d.title,
    description: d.description ?? null,
    start_date: d.startDate ?? null,
    due_date: d.dueDate ?? null,
    priority: d.priority,
    assignee_id: assignee,
    created_by: actor.userId,
    kind: 'assigned',
    batch_id: batchId,
  }));
  const created = await tx`insert into tasks ${tx(rows)} returning id, assignee_id`;
  await notify(tx, actor.officeId, d.assigneeIds, {
    kind: 'task_assigned',
    title: `New task: ${d.title}`,
    body: d.dueDate ? `Due ${d.dueDate} · ${d.priority} priority` : `${d.priority} priority`,
    link: '/tasks',
  });
  await audit(tx, actor, { action: 'task.assign', entityType: 'task', entityId: created.length === 1 ? created[0].id : null, summary: `Assigned “${d.title}” to ${created.length} member(s)`, after: d });
  return created.length;
}

export async function editAssignedTask(tx: Tx, actor: Actor, d: z.infer<typeof editAssignedTaskSchema>) {
  const [before] = await tx`select * from tasks where id = ${d.taskId} for update`;
  if (!before) throw new UserError('Task not found.');
  await tx`update tasks set title = ${d.title}, description = ${d.description ?? null}, start_date = ${d.startDate ?? null},
    due_date = ${d.dueDate ?? null}, priority = ${d.priority}, assignee_id = ${d.assigneeId} where id = ${d.taskId}`;
  if (before.assignee_id !== d.assigneeId) {
    await notify(tx, actor.officeId, [d.assigneeId], { kind: 'task_assigned', title: `New task: ${d.title}`, link: '/tasks' });
  }
  await audit(tx, actor, { action: 'task.update', entityType: 'task', entityId: d.taskId, summary: `Updated task “${d.title}”`, before, after: d });
}

export async function updateTaskStatus(tx: Tx, actor: Actor, d: z.infer<typeof taskStatusSchema>) {
  const [before] = await tx`select id, title, status, kind, created_by, assignee_id, progress from tasks where id = ${d.taskId} for update`;
  if (!before) throw new UserError('Task not found.');
  const progress = d.status === 'completed' ? 100 : d.progress ?? (d.status === 'pending' ? 0 : before.progress);
  const [t] = await tx`update tasks set status = ${d.status}, progress = ${progress} where id = ${d.taskId} returning id`;
  if (!t) throw new UserError('You can only update your own tasks.');
  if (d.note) await tx`insert into task_comments (office_id, task_id, user_id, body) values (${actor.officeId}, ${d.taskId}, ${actor.userId}, ${d.note})`;
  if (before.kind === 'assigned' && d.status === 'completed' && before.status !== 'completed' && before.created_by !== actor.userId) {
    await notify(tx, actor.officeId, [before.created_by], { kind: 'task_completed', title: `Task completed: ${before.title}`, link: '/admin/tasks?status=completed' });
  }
  if (before.kind === 'assigned' && before.status !== d.status) {
    await audit(tx, actor, { action: 'task.status', entityType: 'task', entityId: d.taskId, summary: `“${before.title}” ${before.status} → ${d.status}` });
  }
}

export async function deleteTask(tx: Tx, actor: Actor & { role: string }, taskId: string) {
  const [t] = await tx`delete from tasks where id = ${taskId} returning title, kind`;
  if (!t) throw new UserError('Task not found or cannot be deleted.');
  if (t.kind === 'assigned') await audit(tx, actor, { action: 'task.delete', entityType: 'task', entityId: taskId, summary: `Deleted task “${t.title}”` });
}

export async function addComment(tx: Tx, actor: Actor, d: z.infer<typeof taskCommentSchema>) {
  const [t] = await tx`select title, created_by, assignee_id from tasks where id = ${d.taskId}`;
  if (!t) throw new UserError('Task not found.');
  await tx`insert into task_comments (office_id, task_id, user_id, body) values (${actor.officeId}, ${d.taskId}, ${actor.userId}, ${d.body})`;
  const other = actor.userId === t.assignee_id ? t.created_by : t.assignee_id;
  if (other !== actor.userId) await notify(tx, actor.officeId, [other], { kind: 'task_comment', title: `New comment on “${t.title}”`, body: d.body.slice(0, 140), link: '/tasks' });
}
