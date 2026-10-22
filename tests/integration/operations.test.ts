import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rankIndividuals } from '@/lib/logic/challenges';
import { as, expectDbError, setupDb, teardown, type Fixture } from '../helpers';
import * as tasks from '@/server/services/tasks';
import * as fines from '@/server/services/fines';
import * as expenses from '@/server/services/expenses';
import * as pf from '@/server/services/personal-finance';
import * as goals from '@/server/services/goals';
import * as ch from '@/server/services/challenges';

let f: Fixture;
const A = () => ({ userId: f.adminA, officeId: f.officeA });
const M1 = () => ({ userId: f.memberA1, officeId: f.officeA });
const M2 = () => ({ userId: f.memberA2, officeId: f.officeA });

beforeAll(async () => {
  f = await setupDb();
});
afterAll(async () => teardown(f));

// 2026-10-21 is a Wednesday. Lagos is UTC+1.
const at = (hhmm: string, d = '2026-10-21') => `${d}T${hhmm}:00+01:00`;

describe('attendance', () => {
  it('records present before the late threshold and blocks duplicates', async () => {
    const [r] = await as(f, f.memberA1, f.officeA, (tx) => tx`select * from app.self_check_in(null)`, at('08:30'));
    expect(r.status).toBe('present');
    expect(r.att_date).toBe('2026-10-21');
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`select * from app.self_check_in(null)`, at('08:40')), 'already been recorded');
  });

  it('marks late after the threshold and refuses outside the window or on non-working days', async () => {
    const [r] = await as(f, f.memberA2, f.officeA, (tx) => tx`select * from app.self_check_in('traffic')`, at('09:20'));
    expect(r.status).toBe('late');
    await expectDbError(as(f, f.memberA2, f.officeA, (tx) => tx`select * from app.self_check_in(null)`, at('05:00', '2026-10-22')), 'opens at 06:00');
    await expectDbError(as(f, f.memberA2, f.officeA, (tx) => tx`select * from app.self_check_in(null)`, at('14:00', '2026-10-22')), 'closed at 13:00');
    await expectDbError(as(f, f.memberA2, f.officeA, (tx) => tx`select * from app.self_check_in(null)`, at('08:00', '2026-10-24')), 'not a working day');
  });

  it('members cannot write attendance directly or see colleagues’ records', async () => {
    await expectDbError(
      as(f, f.memberA1, f.officeA, (tx) => tx`insert into attendance_records (office_id, user_id, att_date, status, source) values (${f.officeA}, ${f.memberA1}, '2026-10-20', 'present', 'self')`),
      'row-level security',
    );
    const upd = await as(f, f.memberA1, f.officeA, (tx) => tx`update attendance_records set status = 'present' where user_id = ${f.memberA1} returning id`);
    expect(upd).toHaveLength(0);
    const rows = await as(f, f.memberA1, f.officeA, (tx) => tx`select user_id from attendance_records`);
    expect(rows.every((r) => r.user_id === f.memberA1)).toBe(true);
  });
});

describe('tasks', () => {
  it('lets members progress assigned tasks but not rewrite them', async () => {
    await as(f, f.adminA, f.officeA, (tx) => tasks.assignTask(tx, A(), { title: 'Call 10 leads', priority: 'high', assigneeIds: [f.memberA1, f.memberA2], dueDate: '2026-10-25' }));
    const [t] = await f.owner`select id, batch_id from tasks where assignee_id = ${f.memberA1} and title = 'Call 10 leads'`;
    expect(t.batch_id).not.toBeNull();
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`update tasks set title = 'Easy' where id = ${t.id}`), 'Only status and progress');
    await as(f, f.memberA1, f.officeA, (tx) => tasks.updateTaskStatus(tx, M1(), { taskId: t.id, status: 'completed' }));
    const [done] = await f.owner`select status, progress, completed_at from tasks where id = ${t.id}`;
    expect(done.status).toBe('completed');
    expect(done.progress).toBe(100);
    expect(done.completed_at).not.toBeNull();
    const notes = await f.owner`select title from notifications where user_id = ${f.adminA} and kind = 'task_completed'`;
    expect(notes).toHaveLength(1);
    // the other member cannot touch member one's task
    const other = await as(f, f.memberA2, f.officeA, (tx) => tx`update tasks set status = 'pending' where id = ${t.id} returning id`);
    expect(other).toHaveLength(0);
  });

  it('allows personal tasks only for oneself', async () => {
    await as(f, f.memberA1, f.officeA, (tx) => tasks.savePersonalTask(tx, M1(), { title: 'Read sales book', priority: 'low' }));
    const [t] = await f.owner`select kind, assignee_id from tasks where title = 'Read sales book'`;
    expect(t).toMatchObject({ kind: 'personal', assignee_id: f.memberA1 });
  });
});

describe('personal finances', () => {
  it('computes balances and totals without double counting transfers', async () => {
    await as(f, f.memberA1, f.officeA, (tx) => pf.ensureDefaultAccounts(tx, M1()));
    const accts = await as(f, f.memberA1, f.officeA, (tx) => tx`select id, name from personal_accounts order by name`);
    const cash = accts.find((a) => a.name === 'Cash')!.id;
    const savings = accts.find((a) => a.name === 'Savings')!.id;
    await f.owner`update personal_accounts set opening_balance = 1000 where id = ${cash}`;
    const add = (type: 'income' | 'expense' | 'transfer', amount: string, extra: Record<string, unknown> = {}) =>
      as(f, f.memberA1, f.officeA, (tx) =>
        pf.saveTransaction(tx, M1(), { type, accountId: cash, amount, txnDate: '2026-10-10', description: type, submit: false, clientToken: randomUUID(), ...extra }));
    await add('income', '5000.50');
    await add('expense', '1200.25');
    await add('transfer', '2000', { toAccountId: savings });
    const [bal] = await as(f, f.memberA1, f.officeA, (tx) => tx`
      select a.name, a.opening_balance + coalesce((select sum(signed_amount) from personal_ledger l where l.account_id = a.id), 0) as balance
      from personal_accounts a where a.id = ${cash}`);
    expect(bal.balance).toBe('2800.25'); // 1000 + 5000.50 − 1200.25 − 2000
    const [sav] = await as(f, f.memberA1, f.officeA, (tx) => tx`select coalesce(sum(signed_amount),0) as b from personal_ledger where account_id = ${savings}`);
    expect(sav.b).toBe('2000.00');
    const [tot] = await as(f, f.memberA1, f.officeA, (tx) => tx`
      select sum(direction*amount) filter (where type='income') as income, sum(direction*amount) filter (where type='expense') as expense from personal_transactions`);
    expect(tot.income).toBe('5000.50');
    expect(tot.expense).toBe('1200.25');
  });

  it('locks approved records, supports append-only corrections, and blocks self-approval', async () => {
    const [cash] = await as(f, f.memberA1, f.officeA, (tx) => tx`select id from personal_accounts where name = 'Cash'`);
    const token = randomUUID();
    await as(f, f.memberA1, f.officeA, (tx) => pf.saveTransaction(tx, M1(), { type: 'income', accountId: cash.id, amount: '700', txnDate: '2026-10-12', description: 'Commission', submit: true, clientToken: token }));
    const [t] = await f.owner`select id, status from personal_transactions where client_token = ${token}`;
    expect(t.status).toBe('pending');
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`update personal_transactions set status = 'approved' where id = ${t.id}`), 'cannot approve or reject your own');
    await expectDbError(as(f, f.memberA2, f.officeA, (tx) => pf.reviewTransaction(tx, M2(), { txnId: t.id, decision: 'approved' })), 'not found');
    await as(f, f.adminA, f.officeA, (tx) => pf.reviewTransaction(tx, A(), { txnId: t.id, decision: 'approved' }));
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`update personal_transactions set amount = 1 where id = ${t.id}`), 'locked');
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`delete from personal_transactions where id = ${t.id}`), 'cannot be deleted');
    await as(f, f.memberA1, f.officeA, (tx) => pf.correctTransaction(tx, M1(), { txnId: t.id, reason: 'Entered twice', clientToken: randomUUID() }));
    const [net] = await f.owner`select sum(direction*amount) as v from personal_transactions where id = ${t.id} or reverses_id = ${t.id}`;
    expect(net.v).toBe('0.00');
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => pf.correctTransaction(tx, M1(), { txnId: t.id, reason: 'again', clientToken: randomUUID() })), 'personal_transactions_reverses_id_key');
  });

  it('hides member finances from admins when the office disables it, and always from other members', async () => {
    const other = await as(f, f.memberA2, f.officeA, (tx) => tx`select id from personal_transactions`);
    expect(other).toHaveLength(0);
    await f.owner`update office_settings set admin_view_member_finances = false where office_id = ${f.officeA}`;
    const adminView = await as(f, f.adminA, f.officeA, (tx) => tx`select id from personal_transactions where user_id = ${f.memberA1}`);
    expect(adminView).toHaveLength(0);
    await f.owner`update office_settings set admin_view_member_finances = true where office_id = ${f.officeA}`;
  });
});

describe('fines', () => {
  let fineId: string;
  let accountId: string;
  it('tracks partial and full payments and rejects overpayment', async () => {
    await as(f, f.adminA, f.officeA, (tx) => fines.issueFines(tx, A(), { userIds: [f.memberA1], reason: 'Late to meeting', amount: '1000', issuedOn: '2026-10-20' }));
    [{ id: fineId }] = await f.owner`select id from fines where reason = 'Late to meeting'`;
    [{ id: accountId }] = await f.owner`select id from office_accounts where office_id = ${f.officeA} and kind = 'cash'`;
    await as(f, f.adminA, f.officeA, (tx) => fines.recordFinePayment(tx, A(), { fineId, amount: '400', paidOn: '2026-10-20', accountId }));
    expect((await f.owner`select status from fines where id = ${fineId}`)[0].status).toBe('partially_paid');
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => fines.recordFinePayment(tx, A(), { fineId, amount: '600.01', paidOn: '2026-10-20', accountId })), 'exceeds the outstanding balance');
    // member submission stays pending until confirmed
    await as(f, f.memberA1, f.officeA, (tx) => fines.submitFinePayment(tx, M1(), { fineId, amount: '600', paidOn: '2026-10-21', reference: 'TRX-1' }));
    expect((await f.owner`select status from fines where id = ${fineId}`)[0].status).toBe('partially_paid');
    const [p] = await f.owner`select id from fine_payments where fine_id = ${fineId} and status = 'pending'`;
    await as(f, f.adminA, f.officeA, (tx) => fines.reviewFinePayment(tx, A(), { paymentId: p.id, decision: 'confirmed', accountId }));
    expect((await f.owner`select status from fines where id = ${fineId}`)[0].status).toBe('paid');
    const [books] = await f.owner`select count(*)::int as n, sum(amount) as total from office_transactions where fine_payment_id is not null and office_id = ${f.officeA}`;
    expect(books).toEqual({ n: 2, total: '1000.00' });
  });

  it('members cannot self-confirm payments or adjust fines', async () => {
    await as(f, f.adminA, f.officeA, (tx) => fines.issueFines(tx, A(), { userIds: [f.memberA1], reason: 'Unpaid fine', amount: '300', issuedOn: '2026-10-20' }));
    [{ id: fineId }] = await f.owner`select id from fines where reason = 'Unpaid fine'`;
    await expectDbError(
      as(f, f.memberA1, f.officeA, (tx) => tx`insert into fine_payments (office_id, fine_id, user_id, amount, paid_on, status, submitted_by) values (${f.officeA}, ${fineId}, ${f.memberA1}, 1, '2026-10-21', 'confirmed', ${f.memberA1})`),
      'row-level security',
    );
    const upd = await as(f, f.memberA1, f.officeA, (tx) => tx`update fines set amount = 1 where id = ${fineId} returning id`);
    expect(upd).toHaveLength(0);
  });

  it('handles disputes and waivers with a recorded reason', async () => {
    await as(f, f.adminA, f.officeA, (tx) => fines.issueFines(tx, A(), { userIds: [f.memberA2], reason: 'Missed deadline', amount: '500', issuedOn: '2026-10-20' }));
    const [{ id }] = await f.owner`select id from fines where reason = 'Missed deadline'`;
    await as(f, f.memberA2, f.officeA, (tx) => fines.raiseDispute(tx, M2(), { fineId: id, reason: 'The deadline was moved' }));
    expect((await f.owner`select status from fines where id = ${id}`)[0].status).toBe('disputed');
    const [d] = await f.owner`select id from fine_disputes where fine_id = ${id}`;
    await as(f, f.adminA, f.officeA, (tx) => fines.resolveDispute(tx, A(), { disputeId: d.id, decision: 'upheld', note: 'Confirmed deadline moved' }));
    const [fine] = await f.owner`select status, waive_reason, waived_by from fines where id = ${id}`;
    expect(fine.status).toBe('waived');
    expect(fine.waived_by).toBe(f.adminA);
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => tx`update fines set status = 'pending' where id = ${id}`), 'cannot be reinstated');
    const audits = await f.owner`select action from audit_logs where entity_id = ${id}`;
    expect(audits.map((a) => a.action)).toContain('fine.dispute_upheld');
  });
});

describe('expenses workflow', () => {
  it('moves draft → pending → approved → paid and posts to the books exactly once', async () => {
    const [cat] = await f.owner`select id from finance_categories where office_id = ${f.officeA} and scope = 'office' and kind = 'expense' limit 1`;
    const [acct] = await f.owner`select id from office_accounts where office_id = ${f.officeA} and kind = 'bank'`;
    const id = await as(f, f.memberA1, f.officeA, (tx) => expenses.saveExpense(tx, M1(), { title: 'Printer ink', categoryId: cat.id, amount: '4500', expenseDate: '2026-10-19', submit: false }));
    await as(f, f.memberA1, f.officeA, (tx) => expenses.expenseAction(tx, { ...M1(), role: 'member' }, { expenseId: id, action: 'submit' }));
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`update expenses set status = 'approved' where id = ${id}`), 'Cannot move an expense');
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => tx`update expenses set amount = 1 where id = ${id}`), 'Withdraw the submission');
    const hidden = await as(f, f.memberA2, f.officeA, (tx) => tx`select id from expenses where id = ${id}`);
    expect(hidden).toHaveLength(0);
    await as(f, f.adminA, f.officeA, (tx) => expenses.expenseAction(tx, { ...A(), role: 'admin' }, { expenseId: id, action: 'approve' }));
    await as(f, f.adminA, f.officeA, (tx) => expenses.expenseAction(tx, { ...A(), role: 'admin' }, { expenseId: id, action: 'pay', accountId: acct.id }));
    await expectDbError(as(f, f.adminA, f.officeA, (tx) => expenses.expenseAction(tx, { ...A(), role: 'admin' }, { expenseId: id, action: 'pay', accountId: acct.id })), 'Paid expenses are final');
    const posted = await f.owner`select amount, type from office_transactions where expense_id = ${id}`;
    expect(posted).toEqual([{ amount: '4500.00', type: 'expense' }]);
    const trail = await f.owner`select action from expense_approvals where expense_id = ${id} order by created_at`;
    expect(trail.map((t) => t.action)).toEqual(['submitted', 'approved', 'paid']);
  });

  it('rejects receipts whose content is not an allowed type', () => {
    expect(expenses.sniffMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    expect(expenses.sniffMime(Buffer.from('<html>'))).toBeNull();
  });
});

describe('goals and challenges', () => {
  it('computes automatic goal values from stored records', async () => {
    const id = await as(f, f.adminA, f.officeA, (tx) =>
      goals.saveGoal(tx, A(), {
        scope: 'individual', userId: f.memberA1, title: 'Attend 20 days', category: 'attendance', unit: 'days', targetValue: '20',
        startDate: '2026-10-01', endDate: '2026-10-31', progressMode: 'auto', metric: 'attendance_days',
      }));
    const [g] = await f.owner`select current_value from goals where id = ${id}`;
    expect(g.current_value).toBe('1.00'); // the check-in from the attendance suite
    const hist = await f.owner`select count(*)::int as n from goal_progress where goal_id = ${id}`;
    expect(hist[0].n).toBeGreaterThanOrEqual(2);
    const hidden = await as(f, f.memberA2, f.officeA, (tx) => tx`select app.goal_metric_value(${id}) as v`);
    expect(hidden[0].v).toBeNull();
  });

  it('scores only verified submissions and ranks with tie-breaks', async () => {
    const cid = await as(f, f.adminA, f.officeA, (tx) =>
      ch.saveChallenge(tx, A(), {
        name: 'October sprint', startDate: '2026-10-01', endDate: '2026-10-31', participation: 'individual', metric: 'manual', unit: 'sales',
        targetValue: '10', requiresVerification: true, eligibility: 'all', leaderboardEnabled: true,
      }));
    await as(f, f.adminA, f.officeA, (tx) => ch.setChallengeStatus(tx, A(), { challengeId: cid, status: 'published' }));
    for (const m of [M1(), M2()]) await as(f, m.userId, f.officeA, (tx) => ch.joinChallenge(tx, m, cid), at('10:00'));
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => ch.joinChallenge(tx, M1(), cid), at('10:00')), 'challenge_participants_challenge_id_user_id_key');
    const token = randomUUID();
    await as(f, f.memberA1, f.officeA, (tx) => ch.submitResult(tx, M1(), { challengeId: cid, value: '3', description: 'Closed 3 deals', occurredOn: '2026-10-20', clientToken: token }), at('10:00'));
    await expectDbError(as(f, f.memberA1, f.officeA, (tx) => ch.submitResult(tx, M1(), { challengeId: cid, value: '3', description: 'dup', occurredOn: '2026-10-20', clientToken: token }), at('10:00')), 'client_token');
    await as(f, f.memberA2, f.officeA, (tx) => ch.submitResult(tx, M2(), { challengeId: cid, value: '5', description: 'Claim', occurredOn: '2026-10-20', clientToken: randomUUID() }), at('10:00'));
    let scores = await as(f, f.memberA1, f.officeA, (tx) => ch.challengeScores(tx, cid));
    expect(scores.every((s) => s.score === 0)).toBe(true); // nothing verified yet
    const [s1] = await f.owner`select id from challenge_submissions where user_id = ${f.memberA1} and challenge_id = ${cid}`;
    await as(f, f.adminA, f.officeA, (tx) => ch.reviewSubmission(tx, A(), { submissionId: s1.id, decision: 'approved' }));
    scores = await as(f, f.memberA2, f.officeA, (tx) => ch.challengeScores(tx, cid));
    const ranked = rankIndividuals(scores, 10);
    expect(ranked[0]).toMatchObject({ name: 'Member One', score: 3, rank: 1, remaining: 7, percent: 30 });
    expect(ranked[1]).toMatchObject({ name: 'Member Two', score: 0, rank: 2 });
  });
});
