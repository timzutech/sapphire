'use client';

import { useState } from 'react';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { GOAL_CATEGORY_LABELS } from '@/lib/constants';
import { GOAL_METRICS, METRIC_LABELS } from '@/lib/validation/goals';

type Opt = { value: string; label: string };

export interface GoalDefaults {
  goalId?: string; scope?: string; userId?: string | null; teamId?: string | null; title?: string; description?: string | null; category?: string; unit?: string;
  targetValue?: number; startDate?: string; endDate?: string; responsibleUserId?: string | null; progressMode?: string; metric?: string | null; metricParam?: string | null;
}

export function GoalFields({ members, teams, levels, challenges, defaults = {}, start, end }: {
  members: Opt[]; teams: Opt[]; levels: Opt[]; challenges: Opt[]; defaults?: GoalDefaults; start: string; end: string;
}) {
  const [scope, setScope] = useState(defaults.scope ?? 'office');
  const [mode, setMode] = useState(defaults.progressMode ?? 'manual');
  const [metric, setMetric] = useState(defaults.metric ?? '');
  return (
    <>
      {defaults.goalId ? <input type="hidden" name="goalId" value={defaults.goalId} /> : null}
      <FormGrid>
        <Input name="title" label="Title" required defaultValue={defaults.title} wrapperClassName="sm:col-span-2" />
        <Select name="scope" label="Scope" value={scope} onChange={(e) => setScope(e.target.value)} options={[{ value: 'office', label: 'Whole office' }, { value: 'team', label: 'Team' }, { value: 'individual', label: 'Individual target' }]} />
        {scope === 'individual' ? <Select name="userId" label="Member" required options={members} placeholder="Choose…" defaultValue={defaults.userId ?? ''} /> : null}
        {scope === 'team' ? <Select name="teamId" label="Team" required options={teams} placeholder="Choose…" defaultValue={defaults.teamId ?? ''} /> : null}
        {scope === 'office' ? <Select name="responsibleUserId" label="Responsible person" options={members} placeholder="—" defaultValue={defaults.responsibleUserId ?? ''} /> : null}
        <Select name="category" label="Category" options={Object.entries(GOAL_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} defaultValue={defaults.category ?? 'other'} />
        <Input name="unit" label="Unit" required defaultValue={defaults.unit ?? 'count'} hint="Use your currency code (e.g. NGN) for money goals" />
        <Input name="targetValue" label="Target value" required inputMode="decimal" defaultValue={defaults.targetValue ?? ''} />
        <Input name="startDate" type="date" label="Start" required defaultValue={defaults.startDate ?? start} />
        <Input name="endDate" type="date" label="End" required defaultValue={defaults.endDate ?? end} />
        <Select name="progressMode" label="How progress is updated" value={mode} onChange={(e) => setMode(e.target.value)}
          options={[{ value: 'manual', label: 'Manually by an administrator' }, { value: 'auto', label: 'Automatically from office records' }]} wrapperClassName="sm:col-span-2" />
        {mode === 'auto' ? (
          <Select name="metric" label="Calculated from" required value={metric} onChange={(e) => setMetric(e.target.value)} placeholder="Choose a metric…" wrapperClassName="sm:col-span-2"
            options={GOAL_METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))} />
        ) : null}
        {mode === 'auto' && metric === 'members_at_level' ? <Select name="metricParam" label="Minimum level" required options={levels} placeholder="Choose…" defaultValue={defaults.metricParam ?? ''} /> : null}
        {mode === 'auto' && metric === 'challenge_score' ? <Select name="metricParam" label="Challenge" required options={challenges} placeholder="Choose…" defaultValue={defaults.metricParam ?? ''} /> : null}
      </FormGrid>
      <Textarea name="description" label="Description" rows={2} defaultValue={defaults.description ?? ''} />
    </>
  );
}
