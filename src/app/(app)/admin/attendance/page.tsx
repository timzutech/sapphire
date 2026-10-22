import { Download } from 'lucide-react';
import Link from 'next/link';
import { ActionButton } from '@/components/ui/action-button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/dialog';
import { FilterBar, FilterDate } from '@/components/ui/filters';
import { Input, Select, Textarea } from '@/components/ui/form';
import { MetricNote, PageHeader, StatCard } from '@/components/ui/misc';
import { LinkTabs, str } from '@/components/ui/nav';
import { RangeFilter } from '@/components/ui/range-filter';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { ATTENDANCE_STATUS_OPTIONS } from '@/lib/constants';
import { isValidDate, resolveRange } from '@/lib/dates';
import { attendanceFlags } from '@/lib/logic/attendance';
import { formatDate, formatDateTime, formatPercent } from '@/lib/format';
import { correctAttendanceAction, markAbsencesAction, recordAttendanceAction } from '@/server/actions/attendance';
import { adminPage, type SearchParams } from '@/server/page';
import { officeAttendanceStats } from '@/server/queries/attendance';
import { getSettings, memberOptions, officeNow } from '@/server/queries/common';

export const metadata = { title: 'Attendance' };

export default async function AdminAttendance({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const tab = str(sp, 'tab') ?? 'day';
  const { session, fmt, load } = await adminPage();
  const d = await load(async (tx) => {
    const now = await officeNow(tx, session.officeId);
    const settings = await getSettings(tx, session.officeId);
    const day = str(sp, 'date') && isValidDate(str(sp, 'date')!) ? str(sp, 'date')! : now.today;
    const roster = await tx`select u.id, u.full_name, t.name as team, a.id as record_id, a.status, a.check_in_at, a.source, a.note,
        (select count(*)::int from attendance_corrections c where c.record_id = a.id) as corrections
      from memberships m join users u on u.id = m.user_id left join teams t on t.id = m.team_id
      left join attendance_records a on a.office_id = m.office_id and a.user_id = m.user_id and a.att_date = ${day}
      where m.office_id = ${session.officeId} and m.status = 'active' and m.joined_on <= ${day} order by u.full_name`;
    const range = resolveRange({ range: str(sp, 'range'), from: str(sp, 'from'), to: str(sp, 'to') }, now.today);
    const stats = tab === 'summary' ? await officeAttendanceStats(tx, session.officeId, settings, range.from, range.to, now.today, now.time) : [];
    const corrections = tab === 'corrections' ? await tx`select c.*, r.att_date::text as d, u.full_name as member, b.full_name as by
        from attendance_corrections c join attendance_records r on r.id = c.record_id join users u on u.id = r.user_id join users b on b.id = c.corrected_by
        where c.office_id = ${session.officeId} order by c.created_at desc limit 100` : [];
    const members = await memberOptions(tx, session.officeId);
    return { now, settings, day, roster, range, stats, corrections, members };
  });
  const counts = { present: 0, late: 0, absent: 0, excused: 0, none: 0 } as Record<string, number>;
  for (const r of d.roster) counts[r.status ?? 'none']++;
  return (
    <>
      <PageHeader title="Attendance" description={`Check-in opens ${d.settings.checkinOpens}, late after ${d.settings.lateAfter}, closes ${d.settings.checkinCloses} (office time). Fines for lateness are never applied automatically.`}
        actions={<>
          <LinkButton href={`/api/export/attendance?from=${d.range.from}&to=${d.range.to}`} variant="secondary"><Download className="size-4" />Export CSV</LinkButton>
          <FormDialog action={recordAttendanceAction} title="Record attendance" trigger="Record attendance" description="For members who could not check in themselves. Existing records must be corrected instead.">
            <Select name="userId" label="Member" required options={d.members} placeholder="Choose…" />
            <Input name="date" type="date" label="Date" required defaultValue={d.day} max={d.now.today} />
            <Select name="status" label="Status" options={ATTENDANCE_STATUS_OPTIONS} />
            <Textarea name="note" label="Note" rows={2} />
          </FormDialog>
        </>} />
      <LinkTabs base="/admin/attendance" params={sp} current={tab} tabs={[{ value: 'day', label: 'Daily register' }, { value: 'summary', label: 'Member summary' }, { value: 'corrections', label: 'Corrections log' }]} />
      {tab === 'day' ? (
        <>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <FilterBar><FilterDate name="date" label="Date" defaultValue={d.day} /></FilterBar>
            {d.day <= d.now.today ? (
              <ActionButton action={markAbsencesAction} fields={{ date: d.day }} variant="secondary" size="md" confirmTitle="Mark absences"
                confirm={`Every active member without a record on ${formatDate(d.day, fmt.locale)} will be marked absent. You can correct individual records afterwards.`}>Mark missing as absent</ActionButton>
            ) : null}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <StatCard label="Present" value={counts.present} /><StatCard label="Late" value={counts.late} /><StatCard label="Absent" value={counts.absent} />
            <StatCard label="Excused" value={counts.excused} /><StatCard label="No record" value={counts.none} />
          </div>
          <Card>
            <CardHeader title={formatDate(d.day, fmt.locale, 'long')} />
            <Table>
              <THead><tr><Th>Member</Th><Th>Status</Th><Th>Check-in</Th><Th>Notes</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>{d.roster.map((r) => (
                <Tr key={r.id}>
                  <Td><Link href={`/admin/members/${r.id}`} className="font-medium text-slate-900 hover:underline">{r.full_name}</Link><div className="text-xs text-slate-500">{r.team ?? ''}</div></Td>
                  <Td>{r.status ? <StatusBadge status={r.status} /> : <Badge>No record</Badge>}{r.corrections ? <span className="ml-1 text-xs text-slate-500">corrected</span> : null}</Td>
                  <Td className="tabular">{r.check_in_at ? formatDateTime(r.check_in_at, fmt, false) : '—'}</Td>
                  <Td className="text-xs text-slate-500">{r.note ?? (r.source === 'admin' ? 'Recorded by admin' : '')}</Td>
                  <Td align="right">
                    {r.record_id ? (
                      <FormDialog action={correctAttendanceAction} title={`Correct attendance — ${r.full_name}`} trigger="Correct" triggerVariant="ghost" triggerSize="sm" hidden={{ recordId: r.record_id }} size="sm" submitLabel="Save correction">
                        <Select name="status" label="New status" options={ATTENDANCE_STATUS_OPTIONS} defaultValue={r.status} />
                        <Textarea name="reason" label="Reason for correction" required rows={2} hint="Recorded in the corrections log and audit trail." />
                      </FormDialog>
                    ) : d.day <= d.now.today ? (
                      <FormDialog action={recordAttendanceAction} title={`Record attendance — ${r.full_name}`} trigger="Record" triggerVariant="ghost" triggerSize="sm" hidden={{ userId: r.id, date: d.day }} size="sm">
                        <Select name="status" label="Status" options={ATTENDANCE_STATUS_OPTIONS} />
                        <Textarea name="note" label="Note" rows={2} />
                      </FormDialog>
                    ) : null}
                  </Td>
                </Tr>
              ))}</TBody>
            </Table>
          </Card>
        </>
      ) : tab === 'summary' ? (
        <>
          <RangeFilter range={d.range.preset} from={d.range.from} to={d.range.to} />
          <Card>
            <Table>
              <THead><tr><Th>Member</Th><Th align="right">Eligible days</Th><Th align="right">Present</Th><Th align="right">Late</Th><Th align="right">Absent</Th><Th align="right">Excused</Th><Th align="right">No record</Th><Th align="right">Rate</Th><Th>Flags</Th></tr></THead>
              <TBody>{d.stats.map((s) => (
                <Tr key={s.userId}>
                  <Td><Link href={`/admin/members/${s.userId}`} className="font-medium text-slate-900 hover:underline">{s.name}</Link></Td>
                  <Td align="right">{s.stats.eligibleDays}</Td><Td align="right">{s.stats.present}</Td><Td align="right">{s.stats.late}</Td><Td align="right">{s.stats.absent}</Td>
                  <Td align="right">{s.stats.excused}</Td><Td align="right">{s.stats.unrecorded}</Td><Td align="right" className="font-medium">{formatPercent(s.stats.rate)}</Td>
                  <Td>{attendanceFlags(s.stats).map((f) => <Badge key={f} tone="warning" className="mr-1">{f}</Badge>)}</Td>
                </Tr>
              ))}</TBody>
            </Table>
          </Card>
          <MetricNote>Rate = (present + late) ÷ (eligible working days − excused). Eligible days run from the later of the period start and the member’s joining date to the earlier of the period end and today. Flags: 3+ late or 3+ absent/unrecorded days in the period.</MetricNote>
        </>
      ) : (
        <Card>
          <Table>
            <THead><tr><Th>When</Th><Th>Member · date</Th><Th>Change</Th><Th>Reason</Th><Th>By</Th></tr></THead>
            <TBody>{d.corrections.map((c) => (
              <Tr key={c.id}><Td className="text-xs">{formatDateTime(c.created_at, fmt)}</Td><Td>{c.member} · {formatDate(c.d, fmt.locale, 'short')}</Td>
                <Td><StatusBadge status={c.previous_status ?? 'none'} /> → <StatusBadge status={c.new_status} /></Td><Td className="text-sm">{c.reason}</Td><Td className="text-xs">{c.by}</Td></Tr>
            ))}</TBody>
          </Table>
          {d.corrections.length === 0 ? <p className="p-5 text-sm text-slate-500">No corrections have been made.</p> : null}
        </Card>
      )}
    </>
  );
}
