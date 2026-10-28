'use server';

import { assignTaskSchema, editAssignedTaskSchema, personalTaskSchema, taskCommentSchema, taskIdSchema, taskStatusSchema } from '@/lib/validation/tasks';
import { runAction, type ActionState } from '../action';
import * as svc from '../services/tasks';

const R = ['/tasks', '/admin/tasks', '/dashboard', '/admin'];

export async function savePersonalTaskAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: personalTaskSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.savePersonalTask(tx, session, data);
    return data.taskId ? 'Task updated' : 'Task added';
  });
}
export async function assignTaskAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: assignTaskSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    const n = await svc.assignTask(tx, session, data);
    return `Task assigned to ${n} member${n === 1 ? '' : 's'}`;
  });
}
export async function editAssignedTaskAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: editAssignedTaskSchema, admin: true, revalidate: R }, async ({ tx, session, data }) => {
    await svc.editAssignedTask(tx, session, data);
    return 'Task updated';
  });
}
export async function updateTaskStatusAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: taskStatusSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.updateTaskStatus(tx, session, data);
    return data.status === 'completed' ? 'Task completed' : 'Task updated';
  });
}
export async function deleteTaskAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: taskIdSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.deleteTask(tx, session, data.taskId);
    return 'Task deleted';
  });
}
export async function addTaskCommentAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: taskCommentSchema, revalidate: R }, async ({ tx, session, data }) => {
    await svc.addComment(tx, session, data);
    return 'Comment added';
  });
}
