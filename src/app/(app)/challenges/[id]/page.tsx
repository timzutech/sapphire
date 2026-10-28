import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChallengeRules, Leaderboard, PhaseBadge } from '@/components/challenge-parts';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FormGrid, Input, MoneyInput, Textarea } from '@/components/ui/form';
import { EmptyState, Notice, PageHeader, ProgressBar, StatCard } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { challengePhase, rankIndividuals, rankTeams } from '@/lib/logic/challenges';
import { formatDate, formatNumber } from '@/lib/format';
import { joinChallengeAction, leaveChallengeAction, submitResultAction } from '@/server/actions/challenges';
import { memberPage } from '@/server/page';
import { getChallenge } from '@/server/queries/challenges';
import { officeNow } from '@/server/queries/common';
import { challengeScores } from '@/server/services/challenges';

export const metadata = { title: 'Challenge' };

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, fmt, load } = await memberPage();
  const d = await load(async (tx) => {
    const c = await getChallenge(tx, id);
    if (!c || c.status === 'draft') return null;
    const now = await officeNow(tx, session.officeId);
    const scores = await challengeScores(tx, id);
    const [joined] = await tx`select 1 from challenge_participants where challenge_id = ${id} and user_id = ${session.userId}`;
    const subs = await tx`select *, occurred_on::text as d from challenge_submissions where challenge_id = ${id} and user_id = ${session.userId} order by created_at desc`;
    const rewards = await tx`select r.*, u.full_name from challenge_rewards r join users u on u.id = r.user_id where r.challenge_id = ${id} order by r.rank nulls last`;
    return { c, now, scores, joined: !!joined, subs, rewards };
  });
  if (!d) notFound();
  const { c } = d;
  const phase = challengePhase({ status: c.status, startDate: c.sd, endDate: c.ed }, d.now.today);
  const target = c.target_value ? Number(c.target_value) : null;
  const ranked = rankIndividuals(d.scores, target);
  const teams = c.participation === 'team' ? rankTeams(d.scores, target) : [];
  const mine = ranked.find((r) => r.key === session.userId);
  return (
    <>
      <PageHeader eyebrow={<Link href="/challenges" className="hover:underline">← Challenges</Link>} title={c.name} description={c.description}
        actions={<>
          <PhaseBadge phase={phase} />
          {!d.joined && (phase === 'active' || phase === 'upcoming') ? <ActionButton action={joinChallengeAction} fields={{ challengeId: id }} variant="primary" size="md">Join challenge</ActionButton> : null}
          {d.joined && c.metric === 'manual' && phase === 'active' ? (
            <FormDialog action={submitResultAction} title="Submit a result" trigger="Submit result" hidden={{ challengeId: id, clientToken: randomUUID() }}
              description={c.requires_verification ? 'An administrator will verify this before it counts.' : undefined}>
              <FormGrid>
                <MoneyInput name="value" label={`Value (${c.unit})`} required />
                <Input name="occurredOn" type="date" label="Date" required defaultValue={d.now.today} min={c.sd} max={d.now.today < c.ed ? d.now.today : c.ed} />
              </FormGrid>
              <Textarea name="description" label="What did you achieve?" required rows={3} hint="Include enough detail for verification (e.g. client, receipt number)." />
            </FormDialog>
          ) : null}
          {d.joined && d.subs.length === 0 && phase !== 'ended' ? <ActionButton action={leaveChallengeAction} fields={{ challengeId: id }} variant="ghost" confirm="Leave this challenge?" confirmLabel="Leave">Leave</ActionButton> : null}
        </>} />
      {phase === 'cancelled' ? <div className="mb-4"><Notice tone="warning">This challenge was cancelled.</Notice></div> : null}
      {d.joined ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="My rank" value={mine ? `#${mine.rank}` : '—'} hint={`of ${ranked.length} participants`} />
          <StatCard label="My score" value={`${formatNumber(mine?.score ?? 0, fmt.locale, 2)} ${c.unit}`} hint={c.requires_verification ? 'Verified results only' : undefined} />
          <StatCard label="Remaining to target" value={mine?.remaining != null ? `${formatNumber(mine.remaining, fmt.locale, 2)} ${c.unit}` : '—'} />
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-medium text-slate-500">Progress</div>
            <div className="tabular mt-1.5 text-2xl font-semibold">{mine?.percent != null ? `${mine.percent}%` : '—'}</div>
            {mine?.percent != null ? <div className="mt-2"><ProgressBar value={mine.percent} label="My challenge progress" /></div> : null}
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {teams.length ? (
            <Card><CardHeader title="Team standings" /><Leaderboard entries={teams} unit={c.unit} locale={fmt.locale} teams /></Card>
          ) : null}
          <Card>
            <CardHeader title="Leaderboard" description={c.leaderboard_enabled ? 'Updated live from verified records' : 'The leaderboard is hidden for this challenge — only your own position is shown'} />
            <Leaderboard entries={ranked} unit={c.unit} highlight={session.userId} locale={fmt.locale} />
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Rules" /><CardBody><ChallengeRules c={c} locale={fmt.locale} /></CardBody></Card>
          {c.metric === 'manual' && d.joined ? (
            <Card>
              <CardHeader title="My submissions" />
              {d.subs.length === 0 ? <EmptyState compact title="Nothing submitted yet" /> : (
                <Table>
                  <THead><tr><Th>Date</Th><Th align="right">Value</Th><Th>Status</Th></tr></THead>
                  <TBody>{d.subs.map((s) => (
                    <Tr key={s.id}><Td>{formatDate(s.d, fmt.locale, 'short')}<div className="text-xs text-slate-500">{s.description}{s.review_note ? ` · “${s.review_note}”` : ''}</div></Td><Td align="right">{formatNumber(s.value, fmt.locale, 2)}</Td><Td><StatusBadge status={s.status} /></Td></Tr>
                  ))}</TBody>
                </Table>
              )}
            </Card>
          ) : null}
          {d.rewards.length ? (
            <Card><CardHeader title="Rewards awarded" />
              <ul className="divide-y divide-slate-100">{d.rewards.map((r) => <li key={r.id} className="px-5 py-3 text-sm"><span className="font-medium">{r.full_name}</span>{r.rank ? ` (#${r.rank})` : ''} — {r.reward}</li>)}</ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
