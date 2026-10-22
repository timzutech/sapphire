import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChallengeRules, Leaderboard, PhaseBadge } from '@/components/challenge-parts';
import { ChallengeFields } from '@/components/forms/challenge-forms';
import { ActionButton } from '@/components/ui/action-button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FormGrid, Input, Select, Textarea } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { challengePhase, rankIndividuals, rankTeams } from '@/lib/logic/challenges';
import { formatDate, formatNumber } from '@/lib/format';
import { awardRewardAction, reviewSubmissionAction, saveChallengeAction, setChallengeStatusAction } from '@/server/actions/challenges';
import { adminPage } from '@/server/page';
import { getChallenge } from '@/server/queries/challenges';
import { officeNow, teamOptions } from '@/server/queries/common';
import { challengeScores } from '@/server/services/challenges';

export const metadata = { title: 'Challenge' };

export default async function AdminChallenge({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const c = await getChallenge(tx, id);
    if (!c) return null;
    const subs = await tx`select s.*, s.occurred_on::text as d, u.full_name from challenge_submissions s join users u on u.id = s.user_id where s.challenge_id = ${id} order by s.status = 'pending' desc, s.created_at desc limit 200`;
    const rewards = await tx`select r.*, u.full_name from challenge_rewards r join users u on u.id = r.user_id where r.challenge_id = ${id}`;
    return {
      c, subs, rewards, now: await officeNow(tx, session.officeId), scores: await challengeScores(tx, id), teams: await teamOptions(tx, session.officeId),
      levels: (await tx`select rank, name from levels where office_id = ${session.officeId} order by rank`).map((l) => ({ value: String(l.rank), label: l.name as string })),
    };
  });
  if (!d) notFound();
  const { c } = d;
  const phase = challengePhase({ status: c.status, startDate: c.sd, endDate: c.ed }, d.now.today);
  const target = c.target_value ? Number(c.target_value) : null;
  const ranked = rankIndividuals(d.scores, target);
  const rewarded = new Set(d.rewards.map((r) => r.user_id));
  return (
    <>
      <PageHeader eyebrow={<Link href="/admin/challenges" className="hover:underline">← Challenges</Link>} title={c.name} description={c.description}
        actions={<>
          <PhaseBadge phase={phase} />
          <FormDialog action={saveChallengeAction} title="Edit challenge" trigger="Edit" triggerVariant="secondary" size="lg">
            <ChallengeFields teams={d.teams} levels={d.levels} start={c.sd} end={c.ed} defaults={{ challengeId: id, name: c.name, description: c.description, startDate: c.sd, endDate: c.ed, participation: c.participation, metric: c.metric, unit: c.unit, targetValue: c.target_value, requiresVerification: c.requires_verification, eligibility: c.eligibility, eligibleTeamId: c.eligible_team_id, eligibleMinRank: c.eligible_min_rank, reward: c.reward, leaderboardEnabled: c.leaderboard_enabled, published: c.status === 'published' }} />
          </FormDialog>
          {c.status === 'draft' ? <ActionButton action={setChallengeStatusAction} fields={{ challengeId: id, status: 'published' }} variant="primary" size="md" confirm="Members will be notified and can join." confirmTitle="Publish challenge?">Publish</ActionButton> : null}
          {c.status === 'published' ? <ActionButton action={setChallengeStatusAction} fields={{ challengeId: id, status: 'cancelled' }} variant="danger" size="md" confirm="Cancel this challenge? Scores are kept for the record." confirmTitle="Cancel challenge?">Cancel challenge</ActionButton> : null}
        </>} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {c.participation === 'team' ? <Card><CardHeader title="Team standings" /><Leaderboard entries={rankTeams(d.scores, target)} unit={c.unit} locale={fmt.locale} teams /></Card> : null}
          <Card>
            <CardHeader title="Leaderboard" description="Verified results only" />
            <Leaderboard entries={ranked} unit={c.unit} locale={fmt.locale} />
            {ranked.length ? (
              <CardBody className="border-t border-slate-100">
                <FormDialog action={awardRewardAction} title="Record a reward" trigger="Record reward" triggerVariant="secondary" triggerSize="sm" hidden={{ challengeId: id }} description="Each participant can receive one reward per challenge.">
                  <FormGrid>
                    <Select name="userId" label="Participant" required placeholder="Choose…" options={ranked.filter((r) => !rewarded.has(r.key)).map((r) => ({ value: r.key, label: `#${r.rank} ${r.name} (${r.score})` }))} />
                    <Input name="rank" type="number" min={1} label="Final rank" />
                  </FormGrid>
                  <Input name="reward" label="Reward" required defaultValue={c.reward ?? ''} />
                </FormDialog>
                {d.rewards.length ? <ul className="mt-3 space-y-1 text-sm">{d.rewards.map((r) => <li key={r.id}>🎁 <span className="font-medium">{r.full_name}</span>{r.rank ? ` (#${r.rank})` : ''} — {r.reward}</li>)}</ul> : null}
              </CardBody>
            ) : null}
          </Card>
          {c.metric === 'manual' ? (
            <Card>
              <CardHeader title="Submissions" description={c.requires_verification ? 'Approve only results you can verify' : 'Verification not required for this challenge'} />
              {d.subs.length === 0 ? <EmptyState compact title="No submissions yet" /> : (
                <Table>
                  <THead><tr><Th>Member</Th><Th>Date</Th><Th align="right">Value</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
                  <TBody>{d.subs.map((s) => (
                    <Tr key={s.id}>
                      <Td><div className="font-medium text-slate-900">{s.full_name}</div><div className="text-xs text-slate-500">{s.description}</div></Td>
                      <Td className="text-xs">{formatDate(s.d, fmt.locale, 'short')}</Td><Td align="right">{formatNumber(s.value, fmt.locale, 2)}</Td><Td><StatusBadge status={s.status} /></Td>
                      <Td align="right">{s.status === 'pending' ? (
                        <div className="flex justify-end gap-1">
                          <ActionButton action={reviewSubmissionAction} fields={{ submissionId: s.id, decision: 'approved' }} variant="success">Approve</ActionButton>
                          <FormDialog action={reviewSubmissionAction} title="Reject submission" trigger="Reject" triggerVariant="ghost" triggerSize="sm" hidden={{ submissionId: s.id, decision: 'rejected' }} submitVariant="danger" submitLabel="Reject" size="sm">
                            <Textarea name="note" label="Reason (shared with the member)" required rows={2} />
                          </FormDialog>
                        </div>
                      ) : null}</Td>
                    </Tr>
                  ))}</TBody>
                </Table>
              )}
            </Card>
          ) : null}
        </div>
        <Card className="lg:col-span-2"><CardHeader title="Rules (visible to members)" /><CardBody><ChallengeRules c={c} locale={fmt.locale} /></CardBody></Card>
      </div>
    </>
  );
}
