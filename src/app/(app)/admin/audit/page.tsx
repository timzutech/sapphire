import { ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { FilterBar, FilterSelect, SearchInput } from '@/components/ui/filters';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Pagination, pageOf, str } from '@/components/ui/nav';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { adminPage, type SearchParams } from '@/server/page';

export const metadata = { title: 'Audit Log' };

export default async function Audit({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await adminPage();
  const { page, limit, offset } = pageOf(sp, 50);
  const d = await load(async (tx) => {
    const q = str(sp, 'q') ? `%${str(sp, 'q')!.replace(/[%_]/g, '')}%` : null;
    const type = str(sp, 'type');
    const where = tx`a.office_id = ${session.officeId} ${type ? tx`and a.entity_type = ${type}` : tx``} ${q ? tx`and (a.summary ilike ${q} or a.action ilike ${q} or a.reason ilike ${q})` : tx``}`;
    const [{ total }] = await tx`select count(*)::int as total from audit_logs a where ${where}`;
    const rows = await tx`select a.*, u.full_name from audit_logs a left join users u on u.id = a.actor_id where ${where} order by a.created_at desc limit ${limit} offset ${offset}`;
    const types = await tx`select distinct entity_type from audit_logs where office_id = ${session.officeId} order by 1`;
    return { total, rows, types };
  });
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of administrative actions affecting members, money and official records. It cannot be edited or deleted." />
      <FilterBar className="mb-4">
        <SearchInput defaultValue={str(sp, 'q')} placeholder="Search actions, summaries, reasons" />
        <FilterSelect name="type" label="Record type" defaultValue={str(sp, 'type')} options={d.types.map((t) => ({ value: t.entity_type, label: t.entity_type.replace(/_/g, ' ') }))} />
      </FilterBar>
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={ScrollText} title="No entries" /> : (
          <>
            <Table>
              <THead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Summary</Th><Th>Details</Th></tr></THead>
              <TBody>{d.rows.map((a) => (
                <Tr key={a.id}>
                  <Td className="whitespace-nowrap text-xs">{formatDateTime(a.created_at, fmt)}</Td><Td className="text-sm">{a.full_name ?? 'System'}</Td>
                  <Td><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.action}</code></Td>
                  <Td className="text-sm">{a.summary}{a.reason ? <div className="text-xs text-slate-500">Reason: {a.reason}</div> : null}</Td>
                  <Td>{a.before || a.after ? (
                    <details className="text-xs"><summary className="cursor-pointer text-slate-500">View</summary>
                      <pre className="mt-1 max-w-md overflow-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre></details>
                  ) : null}</Td>
                </Tr>
              ))}</TBody>
            </Table>
            <Pagination base="/admin/audit" params={sp} page={page} pageSize={50} total={d.total} />
          </>
        )}
      </Card>
    </>
  );
}
