import { Building2, Plus } from 'lucide-react';
import { TempPasswordInput } from '@/components/forms/member-forms';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FormGrid, Input } from '@/components/ui/form';
import { EmptyState, PageHeader, StatCard } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import { createOfficeAction } from '@/server/actions/members';
import { requireSuper } from '@/server/auth';
import { withCtx } from '@/server/db';

export const metadata = { title: 'Platform' };

export default async function SuperPage() {
  const s = await requireSuper();
  const offices = await withCtx({ userId: s.userId, officeId: s.officeId }, (tx) => tx`select *, created_at::date::text as d from app.platform_overview()`);
  return (
    <>
      <PageHeader title="Platform administration" description="Offices on this deployment. Use the office switcher in the sidebar to manage a specific office."
        actions={<FormDialog action={createOfficeAction} title="Create office" trigger={<><Plus className="size-4" />New office</>} submitLabel="Create office" size="lg">
          <FormGrid>
            <Input name="name" label="Office name" required /><Input name="slug" label="Slug" required hint="lowercase-with-dashes" />
            <Input name="timezone" label="Timezone" required defaultValue="Africa/Lagos" /><Input name="currency" label="Currency" required defaultValue="NGN" maxLength={3} />
            <Input name="adminName" label="First administrator’s name" required /><Input name="adminEmail" type="email" label="Administrator email" required />
          </FormGrid>
          <TempPasswordInput label="Administrator temporary password" />
        </FormDialog>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Offices" value={offices.length} icon={Building2} />
        <StatCard label="Active members (all offices)" value={offices.reduce((a, o) => a + Number(o.active_members), 0)} />
      </div>
      <Card>
        {offices.length === 0 ? <EmptyState title="No offices" /> : (
          <Table>
            <THead><tr><Th>Office</Th><Th>Slug</Th><Th align="right">Active members</Th><Th align="right">Admins</Th><Th>Created</Th></tr></THead>
            <TBody>{offices.map((o) => (
              <Tr key={o.office_id}><Td className="font-medium text-slate-900">{o.name}{o.is_demo ? <Badge tone="warning" className="ml-2">Demo</Badge> : null}</Td><Td className="text-xs">{o.slug}</Td>
                <Td align="right">{o.active_members}</Td><Td align="right">{o.admins}</Td><Td className="text-xs">{formatDate(o.d)}</Td></Tr>
            ))}</TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
