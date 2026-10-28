import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { ActionForm, Checkbox, FormGrid, Input, Select, SubmitButton } from '@/components/ui/form';
import { MetricNote, PageHeader } from '@/components/ui/misc';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { WEEKDAYS } from '@/lib/constants';
import { saveCategoryAction } from '@/server/actions/finance';
import { updateSettingsAction } from '@/server/actions/members';
import { adminPage } from '@/server/page';
import { getSettings } from '@/server/queries/common';

export const metadata = { title: 'Settings' };

export default async function Settings() {
  const { session, load } = await adminPage();
  const d = await load(async (tx) => ({
    s: await getSettings(tx, session.officeId),
    o: (await tx`select name, timezone, currency, locale from offices where id = ${session.officeId}`)[0],
    cats: await tx`select * from finance_categories where office_id = ${session.officeId} order by scope, kind, name`,
  }));
  return (
    <>
      <PageHeader title="Settings" description="Office profile, attendance rules, permissions and financial categories. Changes are recorded in the audit log." />
      <Card>
        <CardHeader title="Office & attendance rules" />
        <CardBody>
          <ActionForm action={updateSettingsAction} resetOnSuccess={false} className="space-y-6">
            <FormGrid cols={2}>
              <Input name="name" label="Office name" required defaultValue={d.o.name} />
              <Input name="timezone" label="Timezone (IANA)" required defaultValue={d.o.timezone} list="tz-list" hint="Attendance dates and times use this timezone." />
              <datalist id="tz-list">{['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London', 'America/New_York'].map((t) => <option key={t} value={t} />)}</datalist>
              <Input name="currency" label="Currency (ISO code)" required maxLength={3} defaultValue={d.o.currency} />
              <Input name="locale" label="Number/date format locale" required defaultValue={d.o.locale} hint="e.g. en-NG, en-GB" />
            </FormGrid>
            <FormGrid cols={3}>
              <Input name="checkinOpens" type="time" label="Check-in opens" required defaultValue={d.s.checkinOpens} />
              <Input name="lateAfter" type="time" label="Late after" required defaultValue={d.s.lateAfter} />
              <Input name="checkinCloses" type="time" label="Check-in closes" required defaultValue={d.s.checkinCloses} />
            </FormGrid>
            <fieldset>
              <legend className="mb-2 text-xs font-medium text-slate-700">Working days (used for attendance rates and reminders)</legend>
              <div className="flex flex-wrap gap-4">{WEEKDAYS.map((w) => <Checkbox key={w.value} name="workingDays[]" value={w.value} label={w.label} defaultChecked={d.s.workingDays.includes(Number(w.value))} />)}</div>
            </fieldset>
            <div className="space-y-3">
              <Checkbox name="attendanceReminders" label="Send check-in reminders" defaultChecked={d.s.attendanceReminders} hint="In-app reminder between opening and the late threshold on working days." />
              <Checkbox name="membersSubmitFinePayments" label="Members can submit fine payment confirmations" defaultChecked={d.s.membersSubmitFinePayments} hint="Submissions stay pending until an administrator confirms them." />
              <Checkbox name="adminViewMemberFinances" label="Administrators can view members’ personal finance records" defaultChecked={d.s.adminViewMemberFinances} hint="Enforced by the database. When off, admins cannot read personal records or verify them." />
            </div>
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card className="mt-6">
        <CardHeader title="Financial categories" description="Office categories are used in the office ledger and budgets; personal categories in members’ money trackers." action={
          <FormDialog action={saveCategoryAction} title="New category" trigger={<><Plus className="size-4" />Category</>} triggerVariant="secondary" triggerSize="sm" size="sm">
            <Select name="scope" label="Used for" options={[{ value: 'office', label: 'Office books' }, { value: 'personal', label: 'Members’ personal tracking' }]} />
            <Select name="kind" label="Kind" options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
            <Input name="name" label="Name" required />
          </FormDialog>} />
        <Table>
          <THead><tr><Th>Name</Th><Th>Used for</Th><Th>Kind</Th><Th>Status</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
          <TBody>{d.cats.map((c) => (
            <Tr key={c.id}><Td className="font-medium text-slate-900">{c.name}{c.system_key ? <Badge className="ml-2">System</Badge> : null}</Td><Td>{c.scope === 'office' ? 'Office' : 'Personal'}</Td><Td>{c.kind}</Td>
              <Td>{c.is_active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>}</Td>
              <Td align="right"><FormDialog action={saveCategoryAction} title="Edit category" trigger="Edit" triggerVariant="ghost" triggerSize="sm" size="sm" hidden={{ categoryId: c.id, scope: c.scope, kind: c.kind }}>
                <Input name="name" label="Name" required defaultValue={c.name} disabled={!!c.system_key} hint={c.system_key ? 'System categories cannot be renamed.' : undefined} />
                {c.system_key ? <input type="hidden" name="name" value={c.name} /> : null}
                <Select name="isActive" label="Status" options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive (hidden from new entries)' }]} defaultValue={String(c.is_active)} />
              </FormDialog></Td></Tr>
          ))}</TBody>
        </Table>
      </Card>
      <MetricNote>Teams and progression levels are managed on the Members page; fine rules on the Fines page.</MetricNote>
    </>
  );
}
