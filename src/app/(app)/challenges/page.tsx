import { Trophy } from 'lucide-react';
import Link from 'next/link';
import { PhaseBadge } from '@/components/challenge-parts';
import { ActionButton } from '@/components/ui/action-button';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { LinkTabs, str } from '@/components/ui/nav';
import { challengePhase } from '@/lib/logic/challenges';
import { formatDate, formatNumber } from '@/lib/format';
import { CHALLENGE_METRIC_LABELS } from '@/lib/validation/challenges';
import { joinChallengeAction } from '@/server/actions/challenges';
import { memberPage, type SearchParams } from '@/server/page';
import { listChallenges } from '@/server/queries/challenges';
import { officeNow } from '@/server/queries/common';

export const metadata = { title: 'Challenges' };

export default async function ChallengesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = str(sp, 'tab') ?? 'active';
  const { session, fmt, load } = await memberPage();
  const d = await load(async (tx) => ({ now: await officeNow(tx, session.officeId), list: await listChallenges(tx, session.officeId, session.userId) }));
  const withPhase = d.list.filter((c) => c.status !== 'draft').map((c) => ({ c, phase: challengePhase({ status: c.status, startDate: c.sd, endDate: c.ed }, d.now.today) }));
  const shown = withPhase.filter(({ phase, c }) => (tab === 'mine' ? c.joined : tab === 'ended' ? phase === 'ended' || phase === 'cancelled' : tab === 'upcoming' ? phase === 'upcoming' : phase === 'active'));
  return (
    <>
      <PageHeader title="Money-making challenges" description="Compete individually or as a team. Scoring rules and tie-breaks are visible on every challenge." />
      <LinkTabs base="/challenges" params={sp} current={tab} tabs={[
        { value: 'active', label: 'Active', count: withPhase.filter((x) => x.phase === 'active').length }, { value: 'upcoming', label: 'Upcoming' },
        { value: 'mine', label: 'Joined' }, { value: 'ended', label: 'Ended' },
      ]} />
      {shown.length === 0 ? <Card><EmptyState icon={Trophy} title="No challenges here" description="New challenges are announced by your administrator." /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ c, phase }) => (
            <Card key={c.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/challenges/${c.id}`} className="text-base font-semibold text-slate-900 hover:text-brand-700">{c.name}</Link>
                <PhaseBadge phase={phase} />
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-slate-600">{c.description}</p>
              <dl className="mt-3 space-y-1 text-xs text-slate-500">
                <div>{formatDate(c.sd, fmt.locale, 'short')} – {formatDate(c.ed, fmt.locale, 'short')} · {c.participation === 'team' ? 'Team' : 'Individual'} · {c.participants} joined</div>
                <div>{CHALLENGE_METRIC_LABELS[c.metric as keyof typeof CHALLENGE_METRIC_LABELS]}</div>
                {c.target_value ? <div>Target: {formatNumber(c.target_value, fmt.locale, 2)} {c.unit}</div> : null}
                {c.reward ? <div className="font-medium text-slate-700">🎁 {c.reward}</div> : null}
              </dl>
              <div className="mt-auto flex items-center gap-2 pt-4">
                {c.joined ? <Badge tone="good">Joined</Badge> : phase === 'active' || phase === 'upcoming' ? <ActionButton action={joinChallengeAction} fields={{ challengeId: c.id }} variant="primary">Join challenge</ActionButton> : null}
                <LinkButton href={`/challenges/${c.id}`} variant="ghost" size="sm">Details & leaderboard</LinkButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
