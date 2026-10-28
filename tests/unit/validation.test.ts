import { describe, expect, it } from 'vitest';
import { formToObject } from '@/lib/validation/common';
import { goalSchema } from '@/lib/validation/goals';
import { officeTxnSchema, personalTxnSchema } from '@/lib/validation/finance';
import { changePasswordSchema, officeSettingsSchema } from '@/lib/validation/members';
import { assignTaskSchema } from '@/lib/validation/tasks';
import { toUserMessage, UserError } from '@/lib/errors';

const uuid = '0b7f3a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('form validation', () => {
  it('parses FormData including array fields', () => {
    const fd = new FormData();
    fd.append('title', '  Call clients ');
    fd.append('assigneeIds[]', uuid);
    fd.append('assigneeIds[]', '');
    expect(formToObject(fd)).toEqual({ title: '  Call clients ', assigneeIds: [uuid] });
  });

  it('validates money: positive, max 2 dp, commas and ₦ allowed', () => {
    const base = { type: 'income', accountId: uuid, txnDate: '2026-10-21', description: 'x', clientToken: uuid };
    expect(personalTxnSchema.safeParse({ ...base, amount: '₦1,250.50' }).data?.amount).toBe('1250.50');
    expect(personalTxnSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
    expect(personalTxnSchema.safeParse({ ...base, amount: '1.234' }).success).toBe(false);
    expect(personalTxnSchema.safeParse({ ...base, amount: '5', type: 'transfer' }).success).toBe(false); // destination required
    expect(personalTxnSchema.safeParse({ ...base, amount: '5', txnDate: '2026-02-30' }).success).toBe(false);
  });

  it('requires categories for office income/expense', () => {
    const r = officeTxnSchema.safeParse({ type: 'expense', accountId: uuid, amount: '10', txnDate: '2026-10-01', description: 'x' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['categoryId']);
  });

  it('enforces goal and task cross-field rules', () => {
    const g = { scope: 'individual', title: 'T', category: 'other', unit: 'count', targetValue: '5', startDate: '2026-10-10', endDate: '2026-10-01', progressMode: 'auto' };
    const issues = goalSchema.safeParse(g).error!.issues.map((i) => i.path[0]);
    expect(issues).toEqual(expect.arrayContaining(['endDate', 'userId', 'metric']));
    expect(assignTaskSchema.safeParse({ title: 'Do', priority: 'high', assigneeIds: [] }).success).toBe(false);
  });

  it('validates settings and passwords', () => {
    const s = { name: 'Office', timezone: 'Mars/Base', currency: 'ngn', locale: 'en-NG', checkinOpens: '09:00', lateAfter: '08:00', checkinCloses: '13:00', workingDays: ['1'] };
    const paths = officeSettingsSchema.safeParse(s).error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['timezone']));
    expect(officeSettingsSchema.safeParse({ ...s, timezone: 'Africa/Lagos' }).error!.issues[0]!.path).toEqual(['lateAfter']);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'abcdefgh', confirmPassword: 'abcdefgh' }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'abcdefg1', confirmPassword: 'abcdefg2' }).success).toBe(false);
  });

  it('maps database errors to safe messages', () => {
    expect(toUserMessage({ code: '23505', constraint_name: 'prospects_phone_unique' })).toMatch(/phone number already exists/);
    expect(toUserMessage({ code: 'P0001', message: 'Paid expenses are final' })).toBe('Paid expenses are final');
    expect(toUserMessage({ code: '42501', message: 'new row violates row-level security policy for table "fines"' })).toBe('You do not have permission to do that.');
    expect(toUserMessage(new Error('connection refused at 10.0.0.1'))).toBe('Something went wrong. Please try again.');
    expect(toUserMessage(new UserError('Nope'))).toBe('Nope');
  });
});
