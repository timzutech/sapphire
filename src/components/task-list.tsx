import { ClipboardList, MessageSquare } from 'lucide-react';
import { TaskFields, TaskStatusFields } from '@/components/forms/task-forms';
import { ActionButton } from '@/components/ui/action-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { FormDialog } from '@/components/ui/dialog';
import { ActionForm, Input, SubmitButton } from '@/components/ui/form';
import { EmptyState, ProgressBar } from '@/components/ui/misc';
import { formatDate, formatDateTime } from '@/lib/format';
import { addTaskCommentAction, deleteTaskAction, editAssignedTaskAction, savePersonalTaskAction, updateTaskStatusAction } from '@/server/actions/tasks';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function TaskList({ tasks, comments, today, fmt, userId, isAdminView, members }: {
  tasks: Row[]; comments: Map<string, Row[]>; today: string; fmt: { locale: string; timezone: string }; userId: string; isAdminView?: boolean;
  members?: { value: string; label: string }[];
}) {
  if (tasks.length === 0) return <EmptyState icon={ClipboardList} title="No tasks here" description="Nothing matches this view." />;
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const overdue = t.due && t.due < today && ['pending', 'in_progress'].includes(t.status);
        const cs = comments.get(t.id) ?? [];
        const canUpdate = t.assignee_id === userId || isAdminView;
        return (
          <li key={t.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className={`text-sm font-semibold ${t.status === 'completed' ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{t.title}</h3>
                  <StatusBadge status={t.priority} />
                  {t.kind === 'personal' ? <Badge>Personal</Badge> : null}
                  {overdue ? <StatusBadge status="overdue" /> : null}
                </div>
                {t.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{t.description}</p> : null}
                <p className="mt-1 text-xs text-slate-500">
                  {isAdminView ? `${t.assignee_name} · ` : t.kind === 'assigned' ? `Assigned by ${t.creator_name} · ` : ''}
                  {t.start ? `Start ${formatDate(t.start, fmt.locale, 'short')} · ` : ''}
                  {t.due ? `Deadline ${formatDate(t.due, fmt.locale, 'short')}` : 'No deadline'}
                  {t.completed_at ? ` · Completed ${formatDateTime(t.completed_at, fmt)}` : ''}
                </p>
                {t.status === 'in_progress' ? <div className="mt-2 max-w-xs"><ProgressBar value={t.progress} size="sm" label={`${t.title} progress`} /><span className="text-[11px] text-slate-500">{t.progress}%</span></div> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                <StatusBadge status={t.status} />
                {canUpdate && t.status !== 'cancelled' ? (
                  t.status !== 'completed' ? (
                    <>
                      <ActionButton action={updateTaskStatusAction} fields={{ taskId: t.id, status: 'completed' }} variant="secondary">Mark done</ActionButton>
                      <FormDialog action={updateTaskStatusAction} title="Update task" trigger="Update" triggerVariant="ghost" triggerSize="sm" hidden={{ taskId: t.id }} size="sm">
                        <TaskStatusFields status={t.status} progress={t.progress} allowCancel={isAdminView || t.kind === 'personal'} />
                      </FormDialog>
                    </>
                  ) : <ActionButton action={updateTaskStatusAction} fields={{ taskId: t.id, status: 'in_progress' }} variant="ghost">Reopen</ActionButton>
                ) : null}
                {t.kind === 'personal' && t.created_by === userId ? (
                  <FormDialog action={savePersonalTaskAction} title="Edit task" trigger="Edit" triggerVariant="ghost" triggerSize="sm">
                    <TaskFields defaults={{ taskId: t.id, title: t.title, description: t.description, startDate: t.start, dueDate: t.due, priority: t.priority }} />
                  </FormDialog>
                ) : null}
                {isAdminView && t.kind === 'assigned' ? (
                  <FormDialog action={editAssignedTaskAction} title="Edit assigned task" trigger="Edit" triggerVariant="ghost" triggerSize="sm">
                    <TaskFields members={members} defaults={{ taskId: t.id, title: t.title, description: t.description, startDate: t.start, dueDate: t.due, priority: t.priority, assigneeId: t.assignee_id }} />
                  </FormDialog>
                ) : null}
                {(t.kind === 'personal' && t.created_by === userId) || (isAdminView && t.kind === 'assigned') ? (
                  <ActionButton action={deleteTaskAction} fields={{ taskId: t.id }} variant="ghost" confirm="Delete this task permanently?" confirmLabel="Delete">Delete</ActionButton>
                ) : null}
              </div>
            </div>
            {t.kind === 'assigned' ? (
              <details className="group mt-2">
                <summary className="inline-flex cursor-pointer select-none items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
                  <MessageSquare className="size-3.5" />{cs.length ? `${cs.length} comment${cs.length === 1 ? '' : 's'}` : 'Add a comment'}
                </summary>
                <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3">
                  {cs.map((c) => (
                    <div key={c.id} className="text-sm"><span className="font-medium text-slate-900">{c.full_name}</span> <span className="text-xs text-slate-400">{formatDateTime(c.created_at, fmt)}</span><p className="whitespace-pre-line text-slate-700">{c.body}</p></div>
                  ))}
                  <ActionForm action={addTaskCommentAction} hidden={{ taskId: t.id }} className="flex items-end gap-2">
                    <Input name="body" placeholder="Write a comment…" aria-label="Comment" wrapperClassName="flex-1" maxLength={2000} />
                    <SubmitButton size="sm" variant="secondary">Post</SubmitButton>
                  </ActionForm>
                </div>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
