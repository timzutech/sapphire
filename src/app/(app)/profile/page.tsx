import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ActionForm, FormGrid, Input, SubmitButton } from '@/components/ui/form';
import { DefinitionList, Notice, PageHeader } from '@/components/ui/misc';
import { formatDate } from '@/lib/format';
import { changePasswordAction, updateProfileAction } from '@/server/actions/account';
import { memberPage, type SearchParams } from '@/server/page';

export const metadata = { title: 'My Profile' };

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await memberPage();
  const d = await load(async (tx) => {
    const [u] = await tx`select full_name, email, phone from users where id = ${session.userId}`;
    const [m] = await tx`select m.role, m.title, m.joined_on::text as joined, t.name as team,
        (select l.name from member_levels ml join levels l on l.id = ml.level_id where ml.user_id = m.user_id and ml.office_id = m.office_id order by ml.achieved_on desc, ml.created_at desc limit 1) as level
      from memberships m left join teams t on t.id = m.team_id where m.office_id = ${session.officeId} and m.user_id = ${session.userId}`;
    return { u, m };
  });
  return (
    <>
      <PageHeader title="My Profile" />
      {session.mustChangePassword || sp.setup ? (
        <div className="mb-6"><Notice tone="warning" title="Please set a new password">You signed in with a temporary password. Choose a new password to continue using OfficeHub.</Notice></div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal details" />
          <CardBody>
            <ActionForm action={updateProfileAction} resetOnSuccess={false} className="space-y-4">
              <FormGrid>
                <Input name="fullName" label="Full name" required defaultValue={d.u.full_name} />
                <Input name="phone" type="tel" label="Phone" defaultValue={d.u.phone ?? ''} />
              </FormGrid>
              <Input name="email" label="Email (sign-in)" defaultValue={d.u.email} disabled hint="Ask an administrator to change your email." />
              <SubmitButton>Save changes</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change password" description="At least 8 characters with a letter and a number. Other devices will be signed out." />
          <CardBody>
            <ActionForm action={changePasswordAction} className="space-y-4">
              <Input name="currentPassword" type="password" label="Current password" required autoComplete="current-password" />
              <FormGrid>
                <Input name="newPassword" type="password" label="New password" required autoComplete="new-password" />
                <Input name="confirmPassword" type="password" label="Confirm new password" required autoComplete="new-password" />
              </FormGrid>
              <SubmitButton>Update password</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Office membership" />
          <CardBody>
            <DefinitionList items={[
              { label: 'Office', value: session.office.name }, { label: 'Role', value: d.m.role === 'admin' ? 'Administrator' : 'Member' },
              { label: 'Title', value: d.m.title ?? '—' }, { label: 'Team', value: d.m.team ?? '—' }, { label: 'Level', value: d.m.level ?? '—' },
              { label: 'Joined', value: formatDate(d.m.joined, fmt.locale) }, { label: 'Office timezone', value: fmt.timezone }, { label: 'Currency', value: fmt.currency },
            ]} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
