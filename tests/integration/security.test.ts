import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { as, expectDbError, setupDb, teardown, type Fixture } from '../helpers';

let f: Fixture;
beforeAll(async () => {
  f = await setupDb();
});
afterAll(async () => teardown(f));

describe('authentication functions', () => {
  it('creates a session for valid credentials and rejects invalid ones', async () => {
    const ok = await f.app`select app.auth_login('M1.A@test.dev', 'Password123', 'hash-1', 3600, 'vitest') as id`;
    expect(ok[0].id).toBe(f.memberA1);
    const bad = await f.app`select app.auth_login('m1.a@test.dev', 'wrong', 'hash-2', 3600, 'vitest') as id`;
    expect(bad[0].id).toBeNull();
    const [s] = await f.app`select * from app.auth_session('hash-1')`;
    expect(s.role).toBe('member');
    expect(s.office_id).toBe(f.officeA);
  });

  it('never exposes password hashes or sessions to the app role', async () => {
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => tx`select password_hash from users`), 'permission denied');
    await expectDbError(f.app`select * from sessions`, 'permission denied');
  });

  it('blocks sign-in for members deactivated in every office', async () => {
    const [u] = await f.owner`insert into users (email, full_name, password_hash) values ('gone@test.dev', 'Gone', app.hash_password('Password123')) returning id`;
    await f.owner`insert into memberships (office_id, user_id, role, status) values (${f.officeA}, ${u.id}, 'member', 'inactive')`;
    const [r] = await f.app`select app.auth_login('gone@test.dev', 'Password123', 'hash-3', 3600, '') as id`;
    expect(r.id).toBeNull();
  });

  it('rate limits repeated attempts', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await f.app`select app.auth_rate_check('k:test', 3, 60) as ok`)[0].ok);
    expect(results).toEqual([true, true, true, false]);
  });
});

describe('role and office isolation', () => {
  it('members cannot read or modify other members’ private prospects', async () => {
    const [p] = await as(f, f.memberA1, f.officeA, (tx) =>
      tx`insert into prospects (office_id, owner_id, created_by, name, phone) values (${f.officeA}, ${f.memberA1}, ${f.memberA1}, 'Private Lead', '0801 111 2222') returning id`);
    const seen = await as(f, f.memberA2, f.officeA, (tx) => tx`select id from prospects where id = ${p.id}`);
    expect(seen).toHaveLength(0);
    const upd = await as(f, f.memberA2, f.officeA, (tx) => tx`update prospects set name = 'hijack' where id = ${p.id} returning id`);
    expect(upd).toHaveLength(0);
    const adminSees = await as(f, f.adminA, f.officeA, (tx) => tx`select id from prospects where id = ${p.id}`);
    expect(adminSees).toHaveLength(1);
  });

  it('prevents duplicate prospects by normalised phone within an office', async () => {
    await expectDbError(
      as(f, f.memberA2, f.officeA, (tx) =>
        tx`insert into prospects (office_id, owner_id, created_by, name, phone) values (${f.officeA}, ${f.memberA2}, ${f.memberA2}, 'Dup', '08011112222')`),
      'prospects_phone_unique',
    );
  });

  it('admins of another office see nothing, even when spoofing the office id', async () => {
    const rows = await as(f, f.adminB, f.officeA, (tx) => tx`select id from prospects`);
    expect(rows).toHaveLength(0);
    await expectDbError(
      as(f, f.adminB, f.officeA, (tx) => tx`insert into fines (office_id, user_id, reason, amount, issued_on, issued_by) values (${f.officeA}, ${f.memberA1}, 'spoof', 10, '2026-10-01', ${f.adminB})`),
      'row-level security',
    );
  });

  it('members cannot create fines, office transactions or assigned tasks', async () => {
    await expectDbError(
      as(f, f.memberA1, f.officeA, (tx) => tx`insert into fines (office_id, user_id, reason, amount, issued_on, issued_by) values (${f.officeA}, ${f.memberA2}, 'nope', 10, '2026-10-01', ${f.memberA1})`),
      'row-level security',
    );
    const [acct] = await f.owner`select id from office_accounts where office_id = ${f.officeA} limit 1`;
    await expectDbError(
      as(f, f.memberA1, f.officeA, (tx) => tx`insert into office_transactions (office_id, account_id, type, amount, txn_date, description, recorded_by) values (${f.officeA}, ${acct.id}, 'income', 5, '2026-10-01', 'x', ${f.memberA1})`),
      'row-level security',
    );
    await expectDbError(
      as(f, f.memberA1, f.officeA, (tx) => tx`insert into tasks (office_id, title, assignee_id, created_by, kind) values (${f.officeA}, 'Do it', ${f.memberA2}, ${f.memberA1}, 'assigned')`),
      'row-level security',
    );
    const visible = await as(f, f.memberA1, f.officeA, (tx) => tx`select id from office_transactions`);
    expect(visible).toHaveLength(0);
  });

  it('rejects references to records from another office', async () => {
    const [catB] = await f.owner`select id from finance_categories where office_id = ${f.officeB} and scope = 'office' and kind = 'expense' limit 1`;
    await expectDbError(
      as(f, f.adminA, f.officeA, (tx) => tx`insert into expenses (office_id, title, category_id, amount, expense_date, submitted_by) values (${f.officeA}, 'Cross', ${catB.id}, 10, '2026-10-01', ${f.adminA})`),
      'does not belong to this office',
    );
    await expectDbError(
      as(f, f.adminA, f.officeA, (tx) => tx`insert into tasks (office_id, title, assignee_id, created_by, kind) values (${f.officeA}, 'Outsider', ${f.adminB}, ${f.adminA}, 'assigned')`),
      'does not belong to this office',
    );
  });

  it('keeps the audit log and office books append-only', async () => {
    await as(f, f.adminA, f.officeA, (tx) => tx`insert into audit_logs (office_id, actor_id, action, entity_type, summary) values (${f.officeA}, ${f.adminA}, 't', 't', 't')`);
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => tx`update audit_logs set summary = 'x'`), 'permission denied');
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => tx`delete from audit_logs`), 'permission denied');
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => tx`delete from office_transactions`), 'permission denied');
    const memberAudit = await as(f, f.memberA1, f.officeA, (tx) => tx`select id from audit_logs`);
    expect(memberAudit).toHaveLength(0);
  });

  it('protects the last active administrator', async () => {
    await expectDbError(
      as(f, f.adminB, f.officeB, (tx) => tx`update memberships set status = 'inactive' where user_id = ${f.adminB} and office_id = ${f.officeB}`),
      'at least one active administrator',
    );
  });
});
