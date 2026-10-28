import { Megaphone, Plus } from 'lucide-react';
import { ActionButton } from '@/components/ui/action-button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { Checkbox, Input, Textarea } from '@/components/ui/form';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { formatDateTime } from '@/lib/format';
import { deleteAnnouncementAction, saveAnnouncementAction } from '@/server/actions/announcements';
import { adminPage } from '@/server/page';

export const metadata = { title: 'Announcements' };

export default async function Announcements() {
  const { session, fmt, load } = await adminPage();
  const rows = await load((tx) => tx`select a.*, to_char(a.expires_at at time zone ${fmt.timezone} - interval '1 day', 'YYYY-MM-DD') as exp, u.full_name from announcements a join users u on u.id = a.created_by
    where a.office_id = ${session.officeId} order by a.pinned desc, a.published_at desc`);
  const now = new Date();
  return (
    <>
      <PageHeader title="Announcements" description="Shown on every member’s dashboard; optionally sent as a notification."
        actions={<FormDialog action={saveAnnouncementAction} title="New announcement" trigger={<><Plus className="size-4" />New announcement</>} submitLabel="Publish">
          <Input name="title" label="Title" required /><Textarea name="body" label="Message" required rows={5} />
          <Input name="expiresAt" type="date" label="Show until (optional)" />
          <Checkbox name="pinned" label="Pin to the top" /><Checkbox name="notifyMembers" label="Notify all members" defaultChecked />
        </FormDialog>} />
      <Card>
        {rows.length === 0 ? <EmptyState icon={Megaphone} title="No announcements" /> : (
          <ul className="divide-y divide-slate-100">{rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-slate-900">{a.title}</h3>{a.pinned ? <Badge tone="brand">Pinned</Badge> : null}{a.expires_at && new Date(a.expires_at) < now ? <Badge>Expired</Badge> : null}</div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
                <p className="mt-1 text-xs text-slate-400">{a.full_name} · {formatDateTime(a.published_at, fmt)}{a.exp ? ` · until ${a.exp}` : ''}</p>
              </div>
              <div className="flex gap-1">
                <FormDialog action={saveAnnouncementAction} title="Edit announcement" trigger="Edit" triggerVariant="ghost" triggerSize="sm" hidden={{ announcementId: a.id }}>
                  <Input name="title" label="Title" required defaultValue={a.title} /><Textarea name="body" label="Message" required rows={5} defaultValue={a.body} />
                  <Input name="expiresAt" type="date" label="Show until" defaultValue={a.exp ?? ''} />
                  <Checkbox name="pinned" label="Pin to the top" defaultChecked={a.pinned} /><Checkbox name="notifyMembers" label="Notify members again" />
                </FormDialog>
                <ActionButton action={deleteAnnouncementAction} fields={{ id: a.id }} variant="ghost" confirm="Delete this announcement?" confirmLabel="Delete">Delete</ActionButton>
              </div>
            </li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}
