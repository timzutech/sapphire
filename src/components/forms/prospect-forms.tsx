'use client';

import { FormGrid, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { PROSPECT_STAGES, STAGE_LABELS } from '@/lib/validation/prospects';

export const STAGE_OPTIONS = PROSPECT_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }));

export interface ProspectDefaults {
  id?: string; name?: string; phone?: string | null; email?: string | null; source?: string | null; stage?: string; estimatedValue?: string | null;
  lastContactOn?: string | null; nextFollowUp?: string | null; nextAction?: string | null; notes?: string | null; visibility?: string; ownerId?: string | null;
}

export function ProspectFields({ defaults = {}, currency, members, isAdmin }: { defaults?: ProspectDefaults; currency: string; members?: { value: string; label: string }[]; isAdmin?: boolean }) {
  return (
    <>
      {defaults.id ? <input type="hidden" name="prospectId" value={defaults.id} /> : null}
      <FormGrid>
        <Input name="name" label="Name / identifier" required maxLength={120} defaultValue={defaults.name} wrapperClassName="sm:col-span-2" />
        <Input name="phone" type="tel" label="Phone" defaultValue={defaults.phone ?? ''} autoComplete="off" />
        <Input name="email" type="email" label="Email" defaultValue={defaults.email ?? ''} autoComplete="off" />
        <Input name="source" label="Source" defaultValue={defaults.source ?? ''} placeholder="Referral, market visit…" maxLength={80} list="prospect-sources" />
        <datalist id="prospect-sources">{['Referral', 'Market visit', 'Instagram', 'WhatsApp', 'Church event', 'Cold call', 'Walk-in'].map((s) => <option key={s} value={s} />)}</datalist>
        <Select name="stage" label="Stage" options={STAGE_OPTIONS} defaultValue={defaults.stage ?? 'new'} />
        <MoneyInput name="estimatedValue" label="Estimated value" currency={currency} defaultValue={defaults.estimatedValue ?? ''} />
        <Input name="lastContactOn" type="date" label="Last contact" defaultValue={defaults.lastContactOn ?? ''} />
        <Input name="nextFollowUp" type="date" label="Next follow-up" defaultValue={defaults.nextFollowUp ?? ''} />
        <Input name="nextAction" label="Next action" defaultValue={defaults.nextAction ?? ''} placeholder="e.g. Send price list" maxLength={200} />
        {isAdmin && members ? (
          <Select name="ownerId" label="Owner" options={members} placeholder="Shared office pool (unassigned)" defaultValue={defaults.ownerId ?? ''} />
        ) : null}
        <Select name="visibility" label="Visibility" defaultValue={defaults.visibility ?? 'private'}
          options={[{ value: 'private', label: 'Private (owner and admins)' }, { value: 'office', label: 'Shared with the office' }]} />
      </FormGrid>
      <Textarea name="notes" label="Notes" rows={3} defaultValue={defaults.notes ?? ''} />
    </>
  );
}

export function InteractionFields() {
  return (
    <FormGrid>
      <Select name="kind" label="Type" options={[{ value: 'call', label: 'Call' }, { value: 'meeting', label: 'Meeting' }, { value: 'message', label: 'Message / WhatsApp' }, { value: 'email', label: 'Email' }, { value: 'note', label: 'Note' }]} />
      <Select name="stage" label="Move to stage" options={STAGE_OPTIONS} placeholder="Keep current stage" />
      <Textarea name="summary" label="What happened?" required rows={3} wrapperClassName="sm:col-span-2" />
      <Input name="nextFollowUp" type="date" label="Next follow-up" wrapperClassName="sm:col-span-2" hint="Leave empty to clear the follow-up date." />
    </FormGrid>
  );
}
