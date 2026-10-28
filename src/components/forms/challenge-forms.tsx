'use client';

import { useState } from 'react';
import { Checkbox, FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { CHALLENGE_METRICS, CHALLENGE_METRIC_LABELS } from '@/lib/validation/challenges';

type Opt = { value: string; label: string };

export function ChallengeFields({ teams, levels, defaults = {}, start, end }: {
  teams: Opt[]; levels: Opt[]; start: string; end: string;
  defaults?: { challengeId?: string; name?: string; description?: string | null; startDate?: string; endDate?: string; participation?: string; metric?: string; unit?: string; targetValue?: string | null; requiresVerification?: boolean; eligibility?: string; eligibleTeamId?: string | null; eligibleMinRank?: number | null; reward?: string | null; leaderboardEnabled?: boolean; published?: boolean };
}) {
  const [elig, setElig] = useState(defaults.eligibility ?? 'all');
  return (
    <>
      {defaults.challengeId ? <input type="hidden" name="challengeId" value={defaults.challengeId} /> : null}
      <FormGrid>
        <Input name="name" label="Name" required defaultValue={defaults.name} wrapperClassName="sm:col-span-2" />
        <Input name="startDate" type="date" label="Start" required defaultValue={defaults.startDate ?? start} />
        <Input name="endDate" type="date" label="End" required defaultValue={defaults.endDate ?? end} />
        <Select name="metric" label="Scoring" options={CHALLENGE_METRICS.map((m) => ({ value: m, label: CHALLENGE_METRIC_LABELS[m] }))} defaultValue={defaults.metric ?? 'manual'} wrapperClassName="sm:col-span-2"
          disabled={defaults.published} hint={defaults.published ? 'Scoring cannot change after publishing.' : undefined} />
        {defaults.published ? <input type="hidden" name="metric" value={defaults.metric} /> : null}
        <Input name="unit" label="Unit" required defaultValue={defaults.unit ?? 'points'} />
        <Input name="targetValue" label="Target (optional)" inputMode="decimal" defaultValue={defaults.targetValue ?? ''} />
        <Select name="participation" label="Participation" options={[{ value: 'individual', label: 'Individual' }, { value: 'team', label: 'Team (scores add up per team)' }]} defaultValue={defaults.participation ?? 'individual'} />
        <Select name="eligibility" label="Who can join" value={elig} onChange={(e) => setElig(e.target.value)} options={[{ value: 'all', label: 'All active members' }, { value: 'team', label: 'One team' }, { value: 'min_level', label: 'Minimum level' }]} />
        {elig === 'team' ? <Select name="eligibleTeamId" label="Team" required options={teams} placeholder="Choose…" defaultValue={defaults.eligibleTeamId ?? ''} /> : null}
        {elig === 'min_level' ? <Select name="eligibleMinRank" label="Minimum level" required options={levels} placeholder="Choose…" defaultValue={defaults.eligibleMinRank != null ? String(defaults.eligibleMinRank) : ''} /> : null}
        <Input name="reward" label="Reward / incentive" defaultValue={defaults.reward ?? ''} wrapperClassName="sm:col-span-2" />
      </FormGrid>
      <Textarea name="description" label="Description" rows={3} defaultValue={defaults.description ?? ''} />
      {defaults.published ? <input type="hidden" name="requiresVerification" value={defaults.requiresVerification ? 'on' : ''} /> : (
        <Checkbox name="requiresVerification" label="Require administrator verification" defaultChecked={defaults.requiresVerification ?? true} hint="Unverified claims never earn points when this is on." />
      )}
      <Checkbox name="leaderboardEnabled" label="Show the leaderboard to participants" defaultChecked={defaults.leaderboardEnabled ?? true} />
    </>
  );
}
