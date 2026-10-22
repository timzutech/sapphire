import type postgres from 'postgres';

// Mirrors bootstrapOffice() in src/server/services/office.ts without importing server-only code.
const CATS: [string, string, string, string | null][] = [
  ['office', 'income', 'Fine collections', 'fine_collections'], ['office', 'income', 'Member contributions', null], ['office', 'income', 'Sales & commissions', null],
  ['office', 'income', 'Other income', null], ['office', 'expense', 'Operations', null], ['office', 'expense', 'Training', null], ['office', 'expense', 'Incentives & rewards', null],
  ['office', 'expense', 'Rent & utilities', null], ['office', 'expense', 'Transport', null], ['office', 'expense', 'Other expenses', null],
  ['personal', 'income', 'Commission', null], ['personal', 'income', 'Sales', null], ['personal', 'income', 'Bonus', null], ['personal', 'income', 'Other income', null],
  ['personal', 'expense', 'Transport', null], ['personal', 'expense', 'Food', null], ['personal', 'expense', 'Business tools', null], ['personal', 'expense', 'Training', null],
  ['personal', 'expense', 'Other expenses', null],
];

export async function bootstrapOfficeRaw(tx: postgres.TransactionSql, officeId: string) {
  await tx`insert into office_settings (office_id) values (${officeId}) on conflict do nothing`;
  for (const [scope, kind, name, key] of CATS) {
    await tx`insert into finance_categories (office_id, scope, kind, name, system_key) values (${officeId}, ${scope}, ${kind}, ${name}, ${key}) on conflict do nothing`;
  }
  await tx`insert into office_accounts (office_id, name, kind) values (${officeId}, 'Cash box', 'cash'), (${officeId}, 'Bank account', 'bank') on conflict do nothing`;
  await tx`insert into fine_categories (office_id, name, default_amount, description) values
    (${officeId}, 'Lateness', 500, 'Checked in after the late threshold'),
    (${officeId}, 'Unexcused absence', 1000, 'Absent on a working day without an excuse'),
    (${officeId}, 'Missed deadline', 1000, 'Assigned task not completed by its deadline') on conflict do nothing`;
  await tx`insert into levels (office_id, name, rank, criteria) values (${officeId}, 'Starter', 0, 'New member'), (${officeId}, 'Level 1', 1, 'Defined by the office administrator') on conflict do nothing`;
}
