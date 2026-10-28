import { z } from 'zod';
import { date, enumOf, id, money, moneyOrZero, optId, optText, reqText } from './common';

export const personalTxnSchema = z
  .object({
    txnId: optId(),
    type: enumOf(['income', 'expense', 'transfer'] as const, 'Type'),
    accountId: id('Account'),
    toAccountId: optId(),
    amount: money(),
    categoryId: optId(),
    txnDate: date(),
    description: reqText('Description', 200),
    notes: optText(1000),
    submit: z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean()),
    clientToken: z.guid(),
  })
  .refine((v) => v.type !== 'transfer' || (v.toAccountId && v.toAccountId !== v.accountId), { message: 'Choose a different destination account', path: ['toAccountId'] });

export const personalAccountSchema = z.object({
  accountId: optId(),
  name: reqText('Name', 60),
  kind: enumOf(['cash', 'savings', 'other'] as const, 'Kind'),
  openingBalance: moneyOrZero('Opening balance'),
  openingDate: date('Opening date'),
});

export const txnIdSchema = z.object({ txnId: id('Transaction') });
export const correctionSchema = z.object({ txnId: id('Transaction'), reason: reqText('Reason', 300, 3), clientToken: z.guid() });
export const reviewTxnSchema = z.object({ txnId: id('Transaction'), decision: enumOf(['approved', 'rejected'] as const, 'Decision'), note: optText(500) });

export const officeAccountSchema = z.object({
  accountId: optId(),
  name: reqText('Name', 60),
  kind: enumOf(['cash', 'bank', 'mobile_money', 'other'] as const, 'Kind'),
  openingBalance: moneyOrZero('Opening balance'),
  openingDate: date('Opening date'),
});

export const officeTxnSchema = z
  .object({
    type: enumOf(['income', 'expense', 'transfer', 'adjustment'] as const, 'Type'),
    direction: z.preprocess((v) => (v === '-1' ? -1 : 1), z.union([z.literal(1), z.literal(-1)])),
    accountId: id('Account'),
    toAccountId: optId(),
    amount: money(),
    categoryId: optId(),
    txnDate: date(),
    reference: optText(80),
    counterparty: optText(120),
    description: reqText('Description', 200),
    notes: optText(1000),
  })
  .refine((v) => v.type !== 'transfer' || (v.toAccountId && v.toAccountId !== v.accountId), { message: 'Choose a different destination account', path: ['toAccountId'] })
  .refine((v) => !(v.type === 'income' || v.type === 'expense') || v.categoryId, { message: 'Choose a category', path: ['categoryId'] });

export const reverseSchema = z.object({ txnId: id('Transaction'), reason: reqText('Reason', 300, 3) });

export const obligationSchema = z.object({
  kind: enumOf(['receivable', 'payable'] as const, 'Kind'),
  counterparty: reqText('Counterparty', 120),
  description: reqText('Description', 200),
  amount: money(),
  dueDate: z.preprocess((v) => (v === '' ? undefined : v), date().optional()),
});
export const settleObligationSchema = z.object({ obligationId: id('Obligation'), accountId: id('Account'), txnDate: date(), categoryId: id('Category') });
export const cancelObligationSchema = z.object({ obligationId: id('Obligation'), reason: reqText('Reason', 300, 3) });

export const budgetSchema = z.object({ categoryId: id('Category'), month: z.string().regex(/^\d{4}-\d{2}$/, 'Choose a month'), amount: moneyOrZero('Budget') });
export const categorySchema = z.object({
  categoryId: optId(),
  scope: enumOf(['office', 'personal'] as const, 'Scope'),
  kind: enumOf(['income', 'expense'] as const, 'Kind'),
  name: reqText('Name', 60),
  isActive: z.preprocess((v) => v !== 'false' && v !== '0', z.boolean()),
});

export const expenseSchema = z.object({
  expenseId: optId(),
  title: reqText('Title', 160, 2),
  categoryId: id('Category'),
  amount: money(),
  expenseDate: date(),
  paymentMethod: optText(40),
  responsibleUserId: optId(),
  vendor: optText(120),
  description: optText(2000),
  submit: z.preprocess((v) => v === 'on' || v === '1' || v === 'true', z.boolean()),
});
export const expenseActionSchema = z.object({
  expenseId: id('Expense'),
  action: enumOf(['submit', 'withdraw', 'approve', 'reject', 'pay', 'delete'] as const, 'Action'),
  note: optText(500),
  accountId: optId(),
  paidOn: z.preprocess((v) => (v === '' ? undefined : v), date().optional()),
});

export const fineCategorySchema = z.object({
  categoryId: optId(),
  name: reqText('Name', 80),
  defaultAmount: z.preprocess((v) => (v === '' ? undefined : v), money('Default amount').optional()),
  description: optText(300),
  isActive: z.preprocess((v) => v !== 'false' && v !== '0', z.boolean()),
});
export const issueFineSchema = z.object({
  userIds: z.array(z.guid()).min(1, 'Choose at least one member'),
  categoryId: optId(),
  reason: reqText('Reason', 500, 3),
  amount: money(),
  issuedOn: date('Issue date'),
  dueDate: z.preprocess((v) => (v === '' ? undefined : v), date('Due date').optional()),
  attendanceRecordId: optId(),
});
export const adjustFineSchema = z.object({ fineId: id('Fine'), amount: money('New amount'), reason: reqText('Reason', 300, 3) });
export const waiveFineSchema = z.object({ fineId: id('Fine'), reason: reqText('Reason', 300, 3) });
export const finePaymentSchema = z.object({
  fineId: id('Fine'),
  amount: money(),
  paidOn: date('Payment date'),
  method: optText(40),
  reference: optText(80),
  note: optText(300),
  accountId: optId(),
});
export const reviewFinePaymentSchema = z.object({
  paymentId: id('Payment'),
  decision: enumOf(['confirmed', 'rejected'] as const, 'Decision'),
  accountId: optId(),
  note: optText(300),
});
export const disputeSchema = z.object({ fineId: id('Fine'), reason: reqText('Reason', 1000, 5) });
export const resolveDisputeSchema = z.object({
  disputeId: id('Dispute'),
  decision: enumOf(['upheld', 'rejected'] as const, 'Decision'),
  note: reqText('Resolution note', 500, 3),
});

export const reconcileSchema = z.object({
  accountId: id('Account'),
  countedBalance: moneyOrZero('Counted balance'),
  txnDate: date(),
  note: reqText('Note', 300, 3),
});
