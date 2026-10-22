import { Plus, Trophy } from 'lucide-react';
import Link from 'next/link';
import { PhaseBadge } from '@/components/challenge-parts';
import { ChallengeFields } from '@/components/forms/challenge-forms';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { endOfMonth, startOfMonth } from '@/lib/dates';
import { challengePhase } from '@/lib/logic/challenges';
import { formatDate } from '@/lib/format';
import { saveChallengeAction } from '@/server/actions/challenges';
import { adminPage } from '@/server/page';
import { listChallenges } from '@/server/queries/challenges';
import { officeNow, teamOptions } from '@/server/queries/common';

export const metadata = { title: 'Challenges' };

export default async function AdminChallenges() {
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => ({
    now: await officeNow(tx, session.officeId),
    list: await listChallenges(tx, session.officeId, session.userId),
    teams: await teamOptions(tx, session.officeId),
    levels: (await tx`select rank, name from levels where office_id = ${session.officeId} order by rank`).map((l) => ({ value: String(l.rank), label: l.name as string })),
  }));
  return (
    <>
      <PageHeader title="Money-making challenges" description="Create challenges, verify submissions, follow leaderboards and record rewards."
        actions={<FormDialog action={saveChallengeAction} title="New challenge" trigger={<><Plus className="size-4" />New challenge</>} size="lg" submitLabel="Save as draft">
          <ChallengeFields teams={d.teams} levels={d.levels} start={startOfMonth(d.now.today)} end={endOfMonth(d.now.today)} />
        </FormDialog>} />
      <Card>
        {d.list.length === 0 ? <EmptyState icon={Trophy} title="No challenges yet" /> : (
          <Table>
            <THead><tr><Th>Challenge</Th><Th>Period</Th><Th align="right">Participants</Th><Th align="right">To review</Th><Th>Status</Th></tr></THead>
            <TBody>{d.list.map((c) => (
              <Tr key={c.id}>
                <Td><Link href={`/admin/challenges/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">{c.name}</Link><div className="text-xs text-slate-500">{c.participation === 'team' ? 'Team' : 'Individual'} · {c.unit}</div></Td>
                <Td className="text-xs">{formatDate(c.sd, fmt.locale, 'short')} – {formatDate(c.ed, fmt.locale, 'short')}</Td>
                <Td align="right">{c.participants}</Td>
                <Td align="right">{c.pending ? <Badge tone="warning">{c.pending}</Badge> : '—'}</Td>
                <Td><PhaseBadge phase={challengePhase({ status: c.status, startDate: c.sd, endDate: c.ed }, d.now.today)} /></Td>
              </Tr>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
