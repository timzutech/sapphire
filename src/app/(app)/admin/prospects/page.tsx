import { Download, Plus } from 'lucide-react';
import { RankBars } from '@/components/charts/charts';
import { ProspectFields, STAGE_OPTIONS } from '@/components/forms/prospect-forms';
import { ProspectTable } from '@/components/prospect-table';
import { LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { ActionForm, Select, SubmitButton } from '@/components/ui/form';
import { MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { PROSPECT_SORT_OPTIONS } from '@/lib/constants';
import { formatMoney, formatPercent } from '@/lib/format';
import { PROSPECT_STAGES, STAGE_LABELS } from '@/lib/validation/prospects';
import { assignProspectsAction, saveProspectAction } from '@/server/actions/prospects';
import { adminPage, type SearchParams } from '@/server/page';
import { memberOptions, officeNow } from '@/server/queries/common';
import { listProspects, prospectSummary, stageCounts } from '@/server/queries/prospects';

export const metadata = { title: 'Prospects' };

export default async function AdminProspects({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = str(sp, 'view') ?? 'active';
  const owner = str(sp, 'owner');
  const { session, fmt, load } = await adminPage();
  const { page, limit, offset } = pageOf(sp, 25);
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const summary = await prospectSummary(tx, session.officeId, today);
    const stages = await stageCounts(tx, session.officeId);
    const members = await memberOptions(tx, session.officeId);
    const list = await listProspects(tx, { officeId: session.officeId, view: view === 'pool' ? 'active' : view, ownerId: view === 'pool' ? null : owner, stage: str(sp, 'stage'), q: str(sp, 'q'), sort: str(sp, 'sort'), today, limit, offset });
    const perMember = await tx`select u.id, u.full_name, count(p.*) filter (where p.archived_at is null and p.stage not in ('converted','not_interested'))::int as active,
        count(p.*) filter (where p.stage = 'converted')::int as converted, count(p.*) filter (where p.archived_at is null or p.stage = 'converted')::int as total,
        count(p.*) filter (where p.archived_at is null and p.next_follow_up < ${today} and p.stage not in ('converted','not_interested'))::int as overdue
      from memberships m join users u on u.id = m.user_id left join prospects p on p.owner_id = m.user_id and p.office_id = m.office_id
      where m.office_id = ${session.officeId} and m.status = 'active' group by u.id, u.full_name order by converted desc, u.full_name`;
    const [{ pool }] = await tx`select count(*)::int as pool from prospects where office_id = ${session.officeId} and owner_id is null and archived_at is null`;
    return { today, summary, stages, members, list, perMember, pool };
  });
  const memberOpts = d.members.map((m) => ({ value: m.value, label: m.label }));
  const stageMap = new Map(d.stages.map((s) => [s.stage, s.n as number]));
  return (
    <>
      <PageHeader title="Prospects" description="Office-wide pipeline: assign leads, watch follow-ups and conversion."
        actions={<>
          <LinkButton href="/api/export/prospects" variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={saveProspectAction} title="Add prospect" trigger={<><Plus className="size-4" />Add prospect</>} size="lg" submitLabel="Add">
            <ProspectFields currency={fmt.currency} isAdmin members={memberOpts} defaults={{ visibility: 'office' }} />
          </FormDialog>
        </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active prospects" value={d.summary.active} hint={`${d.pool} in the shared pool`} />
        <StatCard label="Follow-ups overdue/due" value={d.summary.due} tone={d.summary.due ? 'warning' : 'neutral'} href="/admin/prospects?view=followups" />
        <StatCard label="Conversion rate" value={formatPercent(d.summary.conversionRate)} hint={`${d.summary.converted} of ${d.summary.total}`} />
        <StatCard label="Pipeline value" value={formatMoney(d.summary.pipeline, fmt, { compact: true })} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline by stage" description="Non-archived prospects" />
          <CardBody><RankBars ariaLabel="Prospects per stage" items={PROSPECT_STAGES.map((s) => ({ label: STAGE_LABELS[s], value: stageMap.get(s) ?? 0 }))} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="By member" />
          <Table>
            <THead><tr><Th>Member</Th><Th align="right">Active</Th><Th align="right">Converted</Th><Th align="right">Conv. rate</Th><Th align="right">Overdue follow-ups</Th></tr></THead>
            <TBody>{d.perMember.map((m) => (
              <Tr key={m.id}><Td className="font-medium text-slate-900">{m.full_name}</Td><Td align="right">{m.active}</Td><Td align="right">{m.converted}</Td>
                <Td align="right">{m.total ? formatPercent(Math.round((m.converted / m.total) * 1000) / 10) : '—'}</Td><Td align="right" className={m.overdue ? 'text-red-700' : ''}>{m.overdue}</Td></Tr>
            ))}</TBody>
          </Table>
        </Card>
      </div>
      <MetricNote>Conversion rate = converted ÷ all non-archived prospects (including converted). Neglected = open prospects with an overdue follow-up or no contact for 14+ days.</MetricNote>
      <div className="mt-6">
        <LinkTabs base="/admin/prospects" params={sp} param="view" current={view} tabs={[
          { value: 'active', label: 'Active' }, { value: 'followups', label: 'Follow-ups due', count: d.summary.due }, { value: 'neglected', label: 'Neglected' },
          { value: 'pool', label: 'Unassigned pool', count: d.pool }, { value: 'converted', label: 'Converted' }, { value: 'all', label: 'All' }, { value: 'archived', label: 'Archived' },
        ]} />
        <FilterBar className="mb-4">
          <SearchInput defaultValue={str(sp, 'q')} placeholder="Search name, phone, email, source" />
          {view !== 'pool' ? <FilterSelect name="owner" label="Owner" defaultValue={owner} options={memberOpts} /> : null}
          <FilterSelect name="stage" label="Stage" defaultValue={str(sp, 'stage')} options={STAGE_OPTIONS} />
          <FilterSelect name="sort" label="Sort by" defaultValue={str(sp, 'sort') ?? 'followup'} options={PROSPECT_SORT_OPTIONS} allLabel="" />
        </FilterBar>
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <p className="text-xs text-slate-500">Select prospects below, then assign or reassign them.</p>
            <ActionForm action={assignProspectsAction} id="assign-form" className="flex items-end gap-2">
              <Select name="ownerId" aria-label="Assign to" options={memberOpts} placeholder="Return to shared pool" />
              <SubmitButton size="md" variant="secondary">Assign selected</SubmitButton>
            </ActionForm>
          </div>
          <ProspectTable rows={d.list.rows} today={d.today} fmt={fmt} userId={session.userId} isAdmin showOwner members={memberOpts} selectable="assign-form" basePath="/admin/prospects" />
          <Pagination base="/admin/prospects" params={sp} page={page} pageSize={25} total={d.list.total} />
        </Card>
      </div>
    </>
  );
}
