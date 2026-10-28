import { CalendarCheck, Clock } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { ActionForm, Input, SubmitButton } from '@/components/ui/form';
import { EmptyState, MetricNote, Notice, PageHeader, StatCard } from '@/components/ui/misc';
import { Pagination, pageOf, str } from '@/components/ui/nav';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { eachDay, endOfMonth, isoWeekday, isValidDate, monthLabel, startOfMonth, startOfWeek, addMonths } from '@/lib/dates';
import { decideCheckIn } from '@/lib/logic/attendance';
import { formatDate, formatDateTime, formatPercent } from '@/lib/format';
import { checkInAction } from '@/server/actions/attendance';
import { memberPage, type SearchParams } from '@/server/page';
import { memberStats, myAttendance } from '@/server/queries/attendance';
import { getSettings, officeNow } from '@/server/queries/common';
import Link from 'next/link';

export const metadata = { title: 'Attendance' };

const REASONS: Record<string, string> = {
  not_working_day: 'Today is not a working day for this office.',
  too_early: 'Check-in has not opened yet.',
  closed: 'Check-in has closed for today. Ask an administrator to record your attendance.',
};

export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { session, fmt, load } = await memberPage();
  const data = await load(async (tx) => {
    const settings = await getSettings(tx, session.officeId);
    const now = await officeNow(tx, session.officeId);
    const monthParam = str(sp, 'month');
    const month = monthParam && isValidDate(`${monthParam}-01`) ? `${monthParam}-01` : startOfMonth(now.today);
    const monthEnd = endOfMonth(month);
    const [todayRec] = await myAttendance(tx, session.officeId, session.userId, now.today, now.today);
    const week = await memberStats(tx, session.officeId, session.userId, settings, startOfWeek(now.today), now.today, now.today, now.time);
    const monthStats = await memberStats(tx, session.officeId, session.userId, settings, month, monthEnd, now.today, now.time);
    const monthRecs = await myAttendance(tx, session.officeId, session.userId, month, monthEnd);
    const { page, limit, offset } = pageOf(sp, 15);
    const [{ total }] = await tx`select count(*)::int as total from attendance_records where office_id = ${session.officeId} and user_id = ${session.userId}`;
    const history = await tx`select r.id, r.att_date::text as date, r.status, r.check_in_at, r.source, r.note,
        (select c.reason from attendance_corrections c where c.record_id = r.id order by c.created_at desc limit 1) as correction
      from attendance_records r where r.office_id = ${session.officeId} and r.user_id = ${session.userId}
      order by r.att_date desc limit ${limit} offset ${offset}`;
    return { settings, now, todayRec, week, monthStats, monthRecs, month, history, total, page };
  });

  const decision = decideCheckIn(data.settings, data.now.today, data.now.time);
  const byDate = new Map(data.monthRecs.map((r) => [r.date, r.status]));
  const monthDays = eachDay(data.month, endOfMonth(data.month));
  const lead = isoWeekday(data.month) - 1;

  return (
    <>
      <PageHeader title="Attendance" description={`Office time ${data.now.time} · ${formatDate(data.now.today, fmt.locale, 'long')}`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Today" description={`Opens ${data.settings.checkinOpens} · late after ${data.settings.lateAfter} · closes ${data.settings.checkinCloses}`} />
          <CardBody>
            {data.todayRec ? (
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CalendarCheck className="size-5" /></div>
                <div>
                  <StatusBadge status={data.todayRec.status} />
                  <p className="mt-1 text-sm text-slate-600">
                    {data.todayRec.checkInAt ? `Checked in at ${formatDateTime(data.todayRec.checkInAt, fmt, false)}` : 'Recorded by an administrator'}
                  </p>
                </div>
              </div>
            ) : decision.ok ? (
              <ActionForm action={checkInAction} className="space-y-3">
                {decision.status === 'late' ? <Notice tone="warning">It is after {data.settings.lateAfter}; this check-in will be recorded as late.</Notice> : null}
                <Input name="note" label="Note (optional)" placeholder="e.g. Working from the field office" maxLength={300} />
                <SubmitButton className="w-full"><Clock className="size-4" />Check in now</SubmitButton>
              </ActionForm>
            ) : (
              <EmptyState compact icon={Clock} title="Check-in unavailable" description={REASONS[decision.reason]} />
            )}
          </CardBody>
        </Card>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2 lg:grid-cols-2">
          <StatCard label="This week" value={formatPercent(data.week.rate)} hint={`${data.week.present + data.week.late} of ${data.week.eligibleDays - data.week.excused} eligible days`} />
          <StatCard label="This month" value={formatPercent(data.monthStats.rate)} hint={`${data.monthStats.present} on time · ${data.monthStats.late} late`} />
          <StatCard label="Absences this month" value={data.monthStats.absent + data.monthStats.unrecorded} hint={`${data.monthStats.unrecorded} without any record`} tone={data.monthStats.absent + data.monthStats.unrecorded > 2 ? 'critical' : 'neutral'} />
          <StatCard label="Punctuality this month" value={formatPercent(data.monthStats.punctuality)} hint="On-time share of attended days" />
        </div>
      </div>
      <MetricNote>Attendance rate = (present + late) ÷ (configured working days since you joined, up to today − excused days). Days without a record count as absent.</MetricNote>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title={monthLabel(data.month, fmt.locale)} action={
            <div className="flex gap-1 text-xs">
              <Link className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" href={`/attendance?month=${addMonths(data.month, -1).slice(0, 7)}`}>‹ Prev</Link>
              <Link className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100" href={`/attendance?month=${addMonths(data.month, 1).slice(0, 7)}`}>Next ›</Link>
            </div>
          } />
          <CardBody>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: lead }).map((_, i) => <div key={`b${i}`} />)}
              {monthDays.map((d) => {
                const st = byDate.get(d);
                const working = data.settings.workingDays.includes(isoWeekday(d));
                return (
                  <div key={d} title={`${formatDate(d, fmt.locale)}: ${st ?? (working ? (d <= data.now.today ? 'no record' : 'upcoming') : 'non-working day')}`}
                    className={cn('flex aspect-square items-center justify-center rounded-md text-xs tabular',
                      st === 'present' && 'bg-emerald-100 font-medium text-emerald-800', st === 'late' && 'bg-amber-100 font-medium text-amber-800',
                      st === 'absent' && 'bg-red-100 font-medium text-red-800', st === 'excused' && 'bg-sky-100 font-medium text-sky-800',
                      !st && working && d <= data.now.today && 'bg-slate-100 text-slate-500', !st && (!working || d > data.now.today) && 'text-slate-300',
                      d === data.now.today && 'ring-2 ring-brand-400')}>
                    {Number(d.slice(8))}
                  </div>
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-600">
              {[['bg-emerald-100', 'Present'], ['bg-amber-100', 'Late'], ['bg-red-100', 'Absent'], ['bg-sky-100', 'Excused'], ['bg-slate-100', 'No record']].map(([c, l]) => (
                <li key={l} className="flex items-center gap-1.5"><span className={cn('size-2.5 rounded-sm', c)} />{l}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="History" description="Only administrators can correct records; every correction is logged." />
          {data.history.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No attendance yet" description="Your check-ins will appear here." />
          ) : (
            <>
              <Table>
                <THead><tr><Th>Date</Th><Th>Status</Th><Th>Check-in</Th><Th>Notes</Th></tr></THead>
                <TBody>
                  {data.history.map((r) => (
                    <Tr key={r.id}>
                      <Td>{formatDate(r.date, fmt.locale)}</Td>
                      <Td><StatusBadge status={r.status} /></Td>
                      <Td className="tabular">{r.check_in_at ? formatDateTime(r.check_in_at, fmt, false) : '—'}</Td>
                      <Td className="max-w-xs text-xs text-slate-500">{r.correction ? `Corrected: ${r.correction}` : r.note ?? (r.source === 'admin' ? 'Recorded by admin' : '')}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
              <Pagination base="/attendance" params={sp} page={data.page} pageSize={15} total={data.total} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}

