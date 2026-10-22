'use client';

import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { ACTIVITY_KIND_LABELS } from '@/lib/constants';

export function ActivityFields({ defaults = {} }: { defaults?: { activityId?: string; kind?: string; title?: string; description?: string | null; startsAt?: string; endsAt?: string | null; location?: string | null; requiresRegistration?: boolean; capacity?: number | null } }) {
  return (
    <>
      {defaults.activityId ? <input type="hidden" name="activityId" value={defaults.activityId} /> : null}
      <FormGrid>
        <Select name="kind" label="Type" options={Object.entries(ACTIVITY_KIND_LABELS).map(([value, label]) => ({ value, label }))} defaultValue={defaults.kind ?? 'training'} />
        <Input name="title" label="Title" required defaultValue={defaults.title} />
        <Input name="startsAt" type="datetime-local" label="Starts (office time)" required defaultValue={defaults.startsAt} />
        <Input name="endsAt" type="datetime-local" label="Ends" defaultValue={defaults.endsAt ?? ''} />
        <Input name="location" label="Location" defaultValue={defaults.location ?? ''} />
        <Input name="capacity" type="number" min={1} label="Capacity" defaultValue={defaults.capacity ?? ''} hint="Leave empty for unlimited" />
      </FormGrid>
      <Textarea name="description" label="Description" rows={3} defaultValue={defaults.description ?? ''} />
      <Checkbox name="requiresRegistration" label="Members register for this activity" defaultChecked={defaults.requiresRegistration} />
    </>
  );
}
