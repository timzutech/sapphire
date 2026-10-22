import { Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ProgressBar } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDate, formatNumber } from '@/lib/format';
import type { ChallengePhase, RankedEntry } from '@/lib/logic/challenges';
import { CHALLENGE_METRIC_LABELS } from '@/lib/validation/challenges';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PHASE_TONE = { draft: 'neutral', cancelled: 'neutral', upcoming: 'info', active: 'good', ended: 'neutral' } as const;

export function PhaseBadge({ phase }: { phase: ChallengePhase }) {
  return <Badge tone={PHASE_TONE[phase]}>{phase === 'active' ? 'Active' : phase.charAt(0).toUpperCase() + phase.slice(1)}</Badge>;
}

export function ChallengeRules({ c, locale }: { c: Row; locale: string }) {
  const eligibility = c.eligibility === 'team' ? `Members of team ${c.team_name ?? ''}` : c.eligibility === 'min_level' ? `Members at ${c.level_name ?? `rank ${c.eligible_min_rank}`} or above` : 'All active members';
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs font-medium text-slate-500">Period</dt><dd>{formatDate(c.sd, locale)} – {formatDate(c.ed, locale)} (inclusive, office time)</dd></div>
      <div><dt className="text-xs font-medium text-slate-500">Participation</dt><dd>{c.participation === 'team' ? 'Team (member scores add up per team)' : 'Individual'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Scoring</dt><dd>{CHALLENGE_METRIC_LABELS[c.metric as keyof typeof CHALLENGE_METRIC_LABELS]}</dd></div>
      <div><dt className="text-xs font-medium text-slate-500">Target</dt><dd>{c.target_value ? `${formatNumber(c.target_value, locale, 2)} ${c.unit}` : 'No fixed target — highest score wins'}</dd></div>
      <div><dt className="text-xs font-medium text-slate-500">Verification</dt><dd>{c.requires_verification ? 'Only administrator-verified results count' : 'Results count when submitted'}</dd></div>
      <div><dt className="text-xs font-medium text-slate-500">Eligibility</dt><dd>{eligibility}</dd></div>
      <div><dt className="text-xs font-medium text-slate-500">Reward</dt><dd>{c.reward ?? '—'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs font-medium text-slate-500">Ranking & ties</dt><dd>Higher score ranks first. Ties go to whoever reached their score first (earliest latest qualifying activity), then to who joined first.</dd></div>
    </dl>
  );
}

export function Leaderboard({ entries, unit, highlight, locale, teams }: { entries: RankedEntry[]; unit: string; highlight?: string; locale: string; teams?: boolean }) {
  if (entries.length === 0) return <EmptyState compact icon={Medal} title="No participants yet" />;
  return (
    <Table>
      <THead><tr><Th>Rank</Th><Th>{teams ? 'Team' : 'Participant'}</Th><Th align="right">Score</Th><Th>Progress to target</Th></tr></THead>
      <TBody>
        {entries.map((e) => (
          <Tr key={e.key} className={e.key === highlight ? 'bg-brand-50/60' : ''}>
            <Td className="w-16 font-semibold tabular">{e.rank <= 3 && e.score > 0 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}</Td>
            <Td className="font-medium text-slate-900">{e.name}{e.key === highlight ? <Badge tone="brand" className="ml-2">You</Badge> : null}{teams && e.memberCount ? <span className="ml-2 text-xs font-normal text-slate-500">{e.memberCount} members</span> : null}</Td>
            <Td align="right">{formatNumber(e.score, locale, 2)} {unit}</Td>
            <Td className="min-w-40">{e.percent !== null ? <div className="flex items-center gap-2"><ProgressBar value={e.percent} size="sm" label={`${e.name} progress`} /><span className="w-12 text-right text-xs tabular text-slate-500">{e.percent}%</span></div> : <span className="text-xs text-slate-400">—</span>}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
