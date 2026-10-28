import { Plus } from 'lucide-react';
import { ProspectFields, STAGE_OPTIONS } from '@/components/forms/prospect-forms';
import { ProspectTable } from '@/components/prospect-table';
import { Card } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { formatMoney, formatPercent } from '@/lib/format';
import { PROSPECT_SORT_OPTIONS as SORT_OPTIONS } from '@/lib/constants';
import { saveProspectAction } from '@/server/actions/prospects';
import { memberPage, type SearchParams } from '@/server/page';
import { officeNow } from '@/server/queries/common';
import { listProspects, prospectSummary } from '@/server/queries/prospects';

export const metadata = { title: 'My Prospects' };


export default async function ProspectsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const view = str(sp, 'view') ?? 'active';
  const { session, fmt, load } = await memberPage();
  const { page, limit, offset } = pageOf(sp, 25);
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const summary = await prospectSummary(tx, session.officeId, today, session.userId);
    const list = await listProspects(tx, { officeId: session.officeId, mineOnlyFor: session.userId, view, stage: str(sp, 'stage'), q: str(sp, 'q'), sort: str(sp, 'sort'), today, limit, offset });
    return { today, summary, list };
  });
  const add = (
    <FormDialog action={saveProspectAction} title="Add prospect" trigger={<><Plus className="size-4" />Add prospect</>} size="lg" submitLabel="Add prospect">
      <ProspectFields currency={fmt.currency} />
    </FormDialog>
  );
  return (
    <>
      <PageHeader title="My Prospects" description="Your private pipeline. Only you and office administrators can see your prospects’ contact details." actions={add} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active prospects" value={d.summary.active} />
        <StatCard label="Follow-ups due" value={d.summary.due} tone={d.summary.due ? 'warning' : 'neutral'} href="/prospects?view=followups" />
        <StatCard label="Conversion rate" value={formatPercent(d.summary.conversionRate)} hint={`${d.summary.converted} converted of ${d.summary.total}`} />
        <StatCard label="Pipeline value" value={formatMoney(d.summary.pipeline, fmt, { compact: true })} hint="Estimated, active prospects" />
      </div>
      <MetricNote>Conversion rate = converted ÷ all your non-archived prospects (converted ones included).</MetricNote>
      <div className="mt-6">
        <LinkTabs base="/prospects" params={sp} param="view" current={view} tabs={[
          { value: 'active', label: 'Active' }, { value: 'followups', label: 'Follow-ups due', count: d.summary.due }, { value: 'converted', label: 'Converted' },
          { value: 'all', label: 'All' }, { value: 'archived', label: 'Archived' }, { value: 'shared', label: 'Shared office list' },
        ]} />
        <FilterBar className="mb-4">
          <SearchInput defaultValue={str(sp, 'q')} placeholder="Search name, phone, email, source" />
          <FilterSelect name="stage" label="Stage" defaultValue={str(sp, 'stage')} options={STAGE_OPTIONS} />
          <FilterSelect name="sort" label="Sort by" defaultValue={str(sp, 'sort') ?? 'followup'} options={SORT_OPTIONS} allLabel="" />
        </FilterBar>
        <Card>
          <ProspectTable rows={d.list.rows} today={d.today} fmt={fmt} userId={session.userId} isAdmin={false} showOwner={view === 'shared'} basePath="/prospects" />
          <Pagination base="/prospects" params={sp} page={page} pageSize={25} total={d.list.total} />
        </Card>
      </div>
    </>
  );
}
