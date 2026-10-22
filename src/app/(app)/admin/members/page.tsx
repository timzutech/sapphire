import { Download, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { MemberFields } from '@/components/forms/member-forms';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { FormGrid, Input, Textarea } from '@/components/ui/form';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { str } from '@/components/ui/nav';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { startOfMonth } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { createMemberAction, saveLevelAction, saveTeamAction } from '@/server/actions/members';
import { adminPage, type SearchParams } from '@/server/page';
import { officeNow, teamOptions } from '@/server/queries/common';
import { memberDirectory } from '@/server/queries/members';

export const metadata = { title: 'Members' };

export default async function MembersPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const teams = await teamOptions(tx, session.officeId);
    const levels = await tx`select id, name, rank, criteria from levels where office_id = ${session.officeId} order by rank`;
    const rows = await memberDirectory(tx, session.officeId, { q: str(sp, 'q'), status: str(sp, 'status') ?? 'active', teamId: str(sp, 'team'), role: str(sp, 'role'), month: startOfMonth(today), today });
    const [c] = await tx`select count(*) filter (where status = 'active')::int as active, count(*) filter (where status = 'inactive')::int as inactive,
      count(*) filter (where status = 'active' and role = 'admin')::int as admins from memberships where office_id = ${session.officeId}`;
    return { today, teams, levels, rows, c };
  });
  return (
    <>
      <PageHeader title="Members" description="Directory, roles, teams and progression levels. Deactivating a member keeps all of their history."
        actions={<>
          <LinkButton href="/api/export/members" variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={createMemberAction} title="Add member" trigger={<><Plus className="size-4" />Add member</>} submitLabel="Create account" size="lg"
            description="If the email already has an account (e.g. in another office), it is added to this office instead.">
            <MemberFields teams={d.teams} create today={d.today} />
          </FormDialog>
        </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active members" value={d.c.active} icon={Users} tone="brand" />
        <StatCard label="Administrators" value={d.c.admins} />
        <StatCard label="Inactive" value={d.c.inactive} href="/admin/members?status=inactive" />
        <StatCard label="Teams" value={d.teams.length} />
      </div>
      <FilterBar className="my-5">
        <SearchInput defaultValue={str(sp, 'q')} placeholder="Search name, email, phone" />
        <FilterSelect name="status" label="Status" defaultValue={str(sp, 'status') ?? 'active'} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} allLabel="" />
        <FilterSelect name="team" label="Team" defaultValue={str(sp, 'team')} options={d.teams} />
        <FilterSelect name="role" label="Role" defaultValue={str(sp, 'role')} options={[{ value: 'admin', label: 'Admins' }, { value: 'member', label: 'Members' }]} />
      </FilterBar>
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={Users} title="No members found" /> : (
          <Table>
            <THead><tr><Th>Member</Th><Th>Team · level</Th><Th align="right">Attended (month)</Th><Th align="right">Open tasks</Th><Th align="right">Prospects</Th><Th align="right">Fines due</Th><Th>Status</Th></tr></THead>
            <TBody>
              {d.rows.map((m) => (
                <Tr key={m.membership_id}>
                  <Td>
                    <Link href={`/admin/members/${m.user_id}`} className="flex items-center gap-2.5">
                      <Avatar name={m.full_name} size="sm" />
                      <span className="min-w-0"><span className="block font-medium text-slate-900 hover:text-brand-700">{m.full_name}</span><span className="block text-xs text-slate-500">{m.email}</span></span>
                    </Link>
                  </Td>
                  <Td className="text-xs">{m.team ?? '—'} · {m.level ?? '—'}{m.role === 'admin' ? <Badge tone="brand" className="ml-1.5">Admin</Badge> : null}</Td>
                  <Td align="right">{m.attended}{m.late ? <span className="text-xs text-amber-700"> ({m.late} late)</span> : null}</Td>
                  <Td align="right">{m.open_tasks}{m.overdue_tasks ? <span className="text-xs text-red-700"> ({m.overdue_tasks} overdue)</span> : null}</Td>
                  <Td align="right">{m.prospects} <span className="text-xs text-slate-500">· {m.converted} conv.</span></Td>
                  <Td align="right">{Number(m.fines_due) ? formatMoney(m.fines_due, fmt) : '—'}</Td>
                  <Td><StatusBadge status={m.status} /></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Teams" action={<FormDialog action={saveTeamAction} title="New team" trigger={<><Plus className="size-4" />Team</>} triggerVariant="secondary" triggerSize="sm" size="sm">
            <Input name="name" label="Name" required /><Textarea name="description" label="Description" rows={2} />
          </FormDialog>} />
          {d.teams.length === 0 ? <EmptyState compact title="No teams yet" /> : (
            <ul className="divide-y divide-slate-100">{d.teams.map((t) => (
              <li key={t.value} className="flex items-center justify-between px-5 py-2.5 text-sm">{t.label}
                <FormDialog action={saveTeamAction} title="Rename team" trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="sm" hidden={{ teamId: t.value }}>
                  <Input name="name" label="Name" required defaultValue={t.label} /><Textarea name="description" label="Description" rows={2} />
                </FormDialog>
              </li>))}</ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Progression levels" description="Define what “stepping up” means for your office" action={
            <FormDialog action={saveLevelAction} title="New level" trigger={<><Plus className="size-4" />Level</>} triggerVariant="secondary" triggerSize="sm" size="sm">
              <FormGrid><Input name="name" label="Name" required /><Input name="rank" type="number" min={0} label="Rank (higher = more senior)" required /></FormGrid>
              <Textarea name="criteria" label="Criteria" rows={3} hint="e.g. ₦500k personal sales in a quarter and 90% attendance" />
            </FormDialog>
          } />
          <ul className="divide-y divide-slate-100">{d.levels.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 px-5 py-2.5 text-sm">
              <div><span className="font-medium">{l.name}</span> <span className="text-xs text-slate-500">rank {l.rank}</span><p className="text-xs text-slate-500">{l.criteria}</p></div>
              <FormDialog action={saveLevelAction} title="Edit level" trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="sm" hidden={{ levelId: l.id }}>
                <FormGrid><Input name="name" label="Name" required defaultValue={l.name} /><Input name="rank" type="number" min={0} label="Rank" required defaultValue={l.rank} /></FormGrid>
                <Textarea name="criteria" label="Criteria" rows={3} defaultValue={l.criteria ?? ''} />
              </FormDialog>
            </li>))}</ul>
        </Card>
      </div>
    </>
  );
}
