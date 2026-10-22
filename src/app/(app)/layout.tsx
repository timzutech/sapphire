import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/shell/sidebar';
import { requireSession } from '@/server/auth';
import { withCtx } from '@/server/db';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const path = (await headers()).get('x-pathname') ?? '';
  if (s.mustChangePassword && path !== '/profile') redirect('/profile?setup=1');

  const data = await withCtx({ userId: s.userId, officeId: s.officeId }, async (tx) => {
    // Idempotent, throttled (15 min) reminder generation; the cron endpoint does the same on a schedule.
    await tx`select app.generate_reminders(${s.officeId})`;
    const [{ unread }] = await tx`select count(*)::int as unread from notifications where user_id = ${s.userId} and office_id = ${s.officeId} and read_at is null`;
    const offices = await tx`select id, name from offices order by name`;
    let pending = 0;
    if (s.role === 'admin') {
      const [r] = await tx`select
        (select count(*) from personal_transactions where office_id = ${s.officeId} and status = 'pending' and user_id <> ${s.userId}) +
        (select count(*) from expenses where office_id = ${s.officeId} and status = 'pending') +
        (select count(*) from fine_payments where office_id = ${s.officeId} and status = 'pending') +
        (select count(*) from fine_disputes where office_id = ${s.officeId} and status = 'open') +
        (select count(*) from challenge_submissions where office_id = ${s.officeId} and status = 'pending') as n`;
      pending = Number(r.n);
    }
    return { unread: unread as number, offices: offices.map((o) => ({ id: o.id as string, name: o.name as string })), pending };
  });

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow">Skip to content</a>
      <Sidebar fullName={s.fullName} email={s.email} role={s.role} isSuper={s.isSuper} officeName={s.office.name} officeId={s.officeId}
        offices={data.offices} unread={data.unread} pendingApprovals={data.pending} isDemo={s.office.isDemo} />
      <main id="main" className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
