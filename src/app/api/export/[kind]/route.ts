import { NextResponse, type NextRequest } from 'next/server';
import { toCsv } from '@/lib/csv';
import { addDays, isValidDate } from '@/lib/dates';
import { getSession } from '@/server/auth';
import { withCtx, type Tx } from '@/server/db';
import { officeNow } from '@/server/queries/common';

type Exporter = (tx: Tx, officeId: string, from: string, to: string, tz: string) => Promise<{ headers: string[]; rows: unknown[][] }>;

// Every export runs under the requesting admin's RLS context; the route additionally requires the admin role.
const EXPORTS: Record<string, Exporter> = {
  members: async (tx, o) => {
    const r = await tx`select u.full_name, u.email, u.phone, m.role, m.status, m.title, t.name as team, m.joined_on::text, m.deactivated_at
      from memberships m join users u on u.id = m.user_id left join teams t on t.id = m.team_id where m.office_id = ${o} order by u.full_name`;
    return { headers: ['Name', 'Email', 'Phone', 'Role', 'Status', 'Title', 'Team', 'Joined', 'Deactivated at'], rows: r.map((x) => Object.values(x)) };
  },
  attendance: async (tx, o, from, to) => {
    const r = await tx`select a.att_date::text, u.full_name, a.status, a.check_in_at, a.source, a.note from attendance_records a join users u on u.id = a.user_id
      where a.office_id = ${o} and a.att_date between ${from} and ${to} order by a.att_date, u.full_name`;
    return { headers: ['Date', 'Member', 'Status', 'Check-in (UTC)', 'Source', 'Note'], rows: r.map((x) => Object.values(x)) };
  },
  prospects: async (tx, o) => {
    const r = await tx`select p.name, p.phone, p.email, p.source, p.stage, p.estimated_value, u.full_name, p.visibility, p.last_contact_on::text, p.next_follow_up::text, p.next_action, p.created_at, p.converted_at, p.archived_at
      from prospects p left join users u on u.id = p.owner_id where p.office_id = ${o} order by p.created_at`;
    return { headers: ['Name', 'Phone', 'Email', 'Source', 'Stage', 'Estimated value', 'Owner', 'Visibility', 'Last contact', 'Next follow-up', 'Next action', 'Created', 'Converted', 'Archived'], rows: r.map((x) => Object.values(x)) };
  },
  tasks: async (tx, o) => {
    const r = await tx`select t.title, a.full_name, c.full_name, t.kind, t.priority, t.status, t.progress, t.start_date::text, t.due_date::text, t.completed_at
      from tasks t join users a on a.id = t.assignee_id join users c on c.id = t.created_by where t.office_id = ${o} order by t.created_at`;
    return { headers: ['Title', 'Assignee', 'Assigned by', 'Type', 'Priority', 'Status', 'Progress %', 'Start', 'Deadline', 'Completed at'], rows: r.map((x) => Object.values(x)) };
  },
  'office-transactions': async (tx, o, from, to) => {
    const r = await tx`select t.txn_date::text, t.type, case when t.type in ('expense','transfer') then -1 else 1 end * t.direction * t.amount, a.name, ta.name, c.name, t.description, t.counterparty, t.reference, t.reverses_id, u.full_name, t.created_at
      from office_transactions t join office_accounts a on a.id = t.account_id left join office_accounts ta on ta.id = t.to_account_id left join finance_categories c on c.id = t.category_id
      join users u on u.id = t.recorded_by where t.office_id = ${o} and t.txn_date between ${from} and ${to} order by t.txn_date, t.created_at`;
    return { headers: ['Date', 'Type', 'Signed amount', 'Account', 'To account', 'Category', 'Description', 'Counterparty', 'Reference', 'Reverses', 'Recorded by', 'Recorded at'], rows: r.map((x) => Object.values(x)) };
  },
  expenses: async (tx, o, from, to) => {
    const r = await tx`select e.expense_date::text, e.title, c.name, e.amount, e.status, e.vendor, e.payment_method, s.full_name, r.full_name
      from expenses e join finance_categories c on c.id = e.category_id join users s on s.id = e.submitted_by left join users r on r.id = e.responsible_user_id
      where e.office_id = ${o} and e.expense_date between ${from} and ${to} order by e.expense_date`;
    return { headers: ['Date', 'Title', 'Category', 'Amount', 'Status', 'Vendor', 'Payment method', 'Submitted by', 'Responsible'], rows: r.map((x) => Object.values(x)) };
  },
  fines: async (tx, o) => {
    const r = await tx`select f.issued_on::text, u.full_name, f.reason, f.amount, app.fine_paid_total(f.id), case when f.status = 'waived' then 0 else f.amount - app.fine_paid_total(f.id) end,
        f.status, f.due_date::text, i.full_name, f.waive_reason from fines f join users u on u.id = f.user_id join users i on i.id = f.issued_by where f.office_id = ${o} order by f.issued_on`;
    return { headers: ['Issued', 'Member', 'Reason', 'Amount', 'Paid', 'Outstanding', 'Status', 'Due', 'Issued by', 'Waive reason'], rows: r.map((x) => Object.values(x)) };
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
  const exporter = EXPORTS[kind];
  if (!exporter) return NextResponse.json({ error: 'Unknown export' }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const csv = await withCtx({ userId: session.userId, officeId: session.officeId }, async (tx) => {
    const { today } = await officeNow(tx, session.officeId);
    const from = isValidDate(sp.get('from') ?? '') ? sp.get('from')! : addDays(today, -365);
    const to = isValidDate(sp.get('to') ?? '') ? sp.get('to')! : today;
    const { headers, rows } = await exporter(tx, session.officeId, from, to, session.office.timezone);
    await tx`insert into audit_logs (office_id, actor_id, action, entity_type, summary) values (${session.officeId}, ${session.userId}, 'export', ${kind}, ${`Exported ${kind} CSV (${rows.length} rows, ${from} to ${to})`})`;
    return toCsv(headers, rows);
  });
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
