'use client';

import { useState } from 'react';
import { CheckboxList, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/constants';

export function TaskFields({ defaults = {}, members, multi }: {
  defaults?: { taskId?: string; title?: string; description?: string | null; startDate?: string | null; dueDate?: string | null; priority?: string; assigneeId?: string };
  members?: { value: string; label: string; meta?: string }[];
  multi?: boolean;
}) {
  return (
    <>
      {defaults.taskId ? <input type="hidden" name="taskId" value={defaults.taskId} /> : null}
      <Input name="title" label="Title" required maxLength={160} defaultValue={defaults.title} />
      <Textarea name="description" label="Description" rows={3} defaultValue={defaults.description ?? ''} />
      <FormGrid cols={3}>
        <Input name="startDate" type="date" label="Start date" defaultValue={defaults.startDate ?? ''} />
        <Input name="dueDate" type="date" label="Deadline" defaultValue={defaults.dueDate ?? ''} />
        <Select name="priority" label="Priority" options={PRIORITY_OPTIONS} defaultValue={defaults.priority ?? 'medium'} />
      </FormGrid>
      {members && multi ? <CheckboxList name="assigneeIds" label="Assign to" required options={members} hint="Each selected member gets their own copy of the task." /> : null}
      {members && !multi ? <Select name="assigneeId" label="Assignee" required options={members} defaultValue={defaults.assigneeId} /> : null}
    </>
  );
}

export function TaskStatusFields({ status, progress, allowCancel }: { status: string; progress: number; allowCancel?: boolean }) {
  const [s, setS] = useState(status);
  return (
    <>
      <FormGrid>
        <Select name="status" label="Status" value={s} onChange={(e) => setS(e.target.value)}
          options={TASK_STATUS_OPTIONS.filter((o) => allowCancel || o.value !== 'cancelled')} />
        {s === 'in_progress' ? <Input name="progress" type="number" min={0} max={100} step={5} label="Progress (%)" defaultValue={progress} /> : <div />}
      </FormGrid>
      <Textarea name="note" label="Progress note (optional)" rows={2} placeholder="Shared with the person who assigned the task" />
    </>
  );
}
