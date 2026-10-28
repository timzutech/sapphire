import { Bell } from 'lucide-react';
import { ActionButton } from '@/components/ui/action-button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { LinkTabs, Pagination, pageOf, str } from '@/components/ui/nav';
import { cn } from '@/lib/cn';
import { formatDateTime, relativeTime } from '@/lib/format';
import { markAllReadAction, markNotificationReadAction, openNotificationAction } from '@/server/actions/account';
import { memberPage, type SearchParams } from '@/server/page';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filter = str(sp, 'filter') ?? 'all';
  const { session, fmt, load } = await memberPage();
  const { page, limit, offset } = pageOf(sp, 25);
  const d = await load(async (tx) => {
    const where = tx`user_id = ${session.userId} and office_id = ${session.officeId} ${filter === 'unread' ? tx`and read_at is null` : tx``}`;
    const [{ total }] = await tx`select count(*)::int as total from notifications where ${where}`;
    const [{ unread }] = await tx`select count(*)::int as unread from notifications where user_id = ${session.userId} and office_id = ${session.officeId} and read_at is null`;
    const rows = await tx`select * from notifications where ${where} order by created_at desc limit ${limit} offset ${offset}`;
    return { total, unread, rows };
  });
  return (
    <>
      <PageHeader title="Notifications" description="Assignments, reminders, approvals and announcements."
        actions={d.unread ? <ActionButton action={markAllReadAction} fields={{}} variant="secondary" size="md">Mark all as read</ActionButton> : null} />
      <LinkTabs base="/notifications" params={sp} param="filter" current={filter} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: d.unread }]} />
      <Card>
        {d.rows.length === 0 ? <EmptyState icon={Bell} title="Nothing here" description="You're all caught up." /> : (
          <ul className="divide-y divide-slate-100">
            {d.rows.map((n) => (
              <li key={n.id} className={cn('flex items-start gap-3 px-5 py-3.5', !n.read_at && 'bg-brand-50/40')}>
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-slate-200' : 'bg-brand-500')} aria-hidden />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <form action={openNotificationAction}><input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="text-left text-sm font-medium text-slate-900 hover:text-brand-700 hover:underline">{n.title}</button>
                    </form>
                  ) : <p className="text-sm font-medium text-slate-900">{n.title}</p>}
                  {n.body ? <p className="mt-0.5 text-sm text-slate-600">{n.body}</p> : null}
                  <p className="mt-0.5 text-xs text-slate-400" title={formatDateTime(n.created_at, fmt)}>{relativeTime(n.created_at)}{!n.read_at ? ' · unread' : ''}</p>
                </div>
                {!n.read_at ? <ActionButton action={markNotificationReadAction} fields={{ id: n.id }} variant="ghost">Mark read</ActionButton> : null}
              </li>
            ))}
          </ul>
        )}
        <Pagination base="/notifications" params={sp} page={page} pageSize={25} total={d.total} />
      </Card>
    </>
  );
}
