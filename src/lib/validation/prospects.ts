import { z } from 'zod';
import { enumOf, id, optDate, optEmail, optId, optMoney, optText, phone, reqText } from './common';

export const PROSPECT_STAGES = ['new', 'contacted', 'follow_up', 'interested', 'in_progress', 'converted', 'not_interested'] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const STAGE_LABELS: Record<ProspectStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow-up required',
  interested: 'Interested',
  in_progress: 'In progress',
  converted: 'Converted',
  not_interested: 'Not interested',
};

export const prospectSchema = z.object({
  prospectId: optId(),
  name: reqText('Name', 120),
  phone: phone(),
  email: optEmail(),
  source: optText(80),
  stage: enumOf(PROSPECT_STAGES, 'Stage'),
  estimatedValue: optMoney('Estimated value'),
  lastContactOn: optDate(),
  nextFollowUp: optDate(),
  nextAction: optText(200),
  notes: optText(4000),
  visibility: enumOf(['private', 'office'] as const, 'Visibility').default('private'),
  ownerId: optId(),
});

export const interactionSchema = z.object({
  prospectId: id('Prospect'),
  kind: enumOf(['call', 'meeting', 'message', 'email', 'note'] as const, 'Type'),
  summary: reqText('Summary', 1000),
  nextFollowUp: optDate(),
  stage: z.preprocess((v) => (v === '' ? undefined : v), z.enum(PROSPECT_STAGES).optional()),
});

export const stageSchema = z.object({ prospectId: id('Prospect'), stage: enumOf(PROSPECT_STAGES, 'Stage') });
export const archiveSchema = z.object({ prospectId: id('Prospect'), archive: z.enum(['1', '0']) });
export const assignSchema = z.object({ prospectIds: z.array(z.guid()).min(1, 'Select at least one prospect'), ownerId: optId() });
