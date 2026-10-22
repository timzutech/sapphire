'use server';

import {
  adjustFineSchema, budgetSchema, cancelObligationSchema, categorySchema, correctionSchema, disputeSchema, expenseActionSchema, expenseSchema,
  fineCategorySchema, finePaymentSchema, issueFineSchema, obligationSchema, officeAccountSchema, officeTxnSchema, personalAccountSchema,
  personalTxnSchema, resolveDisputeSchema, reverseSchema, reviewFinePaymentSchema, reviewTxnSchema, settleObligationSchema, txnIdSchema, waiveFineSchema,
} from '@/lib/validation/finance';
import { runAction, type ActionState } from '../action';
import * as expenses from '../services/expenses';
import * as fines from '../services/fines';
import * as office from '../services/office-finance';
import * as personal from '../services/personal-finance';

const PR = ['/money', '/dashboard', '/admin/finances', '/admin'];
const OR = ['/admin/finances', '/admin/expenses', '/admin', '/money'];
const FR = ['/fines', '/admin/fines', '/admin/finances', '/dashboard', '/admin'];

// ---- personal
export async function savePersonalTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: personalTxnSchema, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.saveTransaction(tx, session, data);
    return data.txnId ? 'Transaction updated' : data.submit ? 'Recorded and submitted for verification' : 'Transaction recorded';
  });
}
export async function savePersonalAccountAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: personalAccountSchema, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.saveAccount(tx, session, data);
    return 'Account saved';
  });
}
export async function deletePersonalTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: txnIdSchema, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.deleteTransaction(tx, session, data.txnId);
    return 'Transaction deleted';
  });
}
export async function submitPersonalTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: txnIdSchema, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.setSubmission(tx, session, data.txnId, true);
    return 'Submitted for verification';
  });
}
export async function withdrawPersonalTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: txnIdSchema, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.setSubmission(tx, session, data.txnId, false);
    return 'Submission withdrawn';
  });
}
export async function correctPersonalTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: correctionSchema, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.correctTransaction(tx, session, data);
    return 'Correction recorded — the original entry is now netted to zero';
  });
}
export async function reviewPersonalTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: reviewTxnSchema, admin: true, revalidate: PR }, async ({ tx, session, data }) => {
    await personal.reviewTransaction(tx, session, data);
    return `Record ${data.decision}`;
  });
}

// ---- office books
export async function saveOfficeAccountAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: officeAccountSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.saveOfficeAccount(tx, session, data);
    return 'Account saved';
  });
}
export async function recordOfficeTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: officeTxnSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.recordOfficeTxn(tx, session, data);
    return 'Transaction recorded';
  });
}
export async function reverseOfficeTxnAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: reverseSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.reverseOfficeTxn(tx, session, data);
    return 'Reversal recorded';
  });
}
export async function createObligationAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: obligationSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.createObligation(tx, session, data);
    return 'Recorded';
  });
}
export async function settleObligationAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: settleObligationSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.settleObligation(tx, session, data);
    return 'Settled and posted to the books';
  });
}
export async function cancelObligationAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: cancelObligationSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.cancelObligation(tx, session, data);
    return 'Cancelled';
  });
}
export async function saveBudgetAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: budgetSchema, admin: true, revalidate: OR }, async ({ tx, session, data }) => {
    await office.saveBudget(tx, session, data);
    return 'Budget saved';
  });
}
export async function saveCategoryAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: categorySchema, admin: true, revalidate: ['/admin/settings', ...OR] }, async ({ tx, session, data }) => {
    await office.saveCategory(tx, session, data);
    return 'Category saved';
  });
}

// ---- expenses
export async function saveExpenseAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: expenseSchema, revalidate: OR }, async ({ tx, session, data, formData }) => {
    const receipt = formData.get('receipt');
    await expenses.saveExpense(tx, session, data, receipt instanceof File ? receipt : null);
    return data.submit ? 'Expense submitted for approval' : 'Expense saved as draft';
  });
}
export async function expenseActionAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: expenseActionSchema, revalidate: OR }, async ({ tx, session, data }) => {
    return (await expenses.expenseAction(tx, session, data)) ?? 'Done';
  });
}

// ---- fines
export async function saveFineCategoryAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: fineCategorySchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.saveFineCategory(tx, session, data);
    return 'Fine rule saved';
  });
}
export async function issueFineAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: issueFineSchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    const n = await fines.issueFines(tx, session, data);
    return `Fine issued to ${n} member${n === 1 ? '' : 's'}`;
  });
}
export async function adjustFineAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: adjustFineSchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.adjustFine(tx, session, data);
    return 'Fine adjusted';
  });
}
export async function waiveFineAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: waiveFineSchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.waiveFine(tx, session, data);
    return 'Fine waived';
  });
}
export async function recordFinePaymentAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: finePaymentSchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.recordFinePayment(tx, session, data);
    return 'Payment recorded';
  });
}
export async function submitFinePaymentAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: finePaymentSchema, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.submitFinePayment(tx, session, data);
    return 'Payment submitted for confirmation';
  });
}
export async function reviewFinePaymentAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: reviewFinePaymentSchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.reviewFinePayment(tx, session, data);
    return `Payment ${data.decision}`;
  });
}
export async function raiseDisputeAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: disputeSchema, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.raiseDispute(tx, session, data);
    return 'Dispute submitted — an administrator will review it';
  });
}
export async function resolveDisputeAction(_: ActionState, fd: FormData) {
  return runAction({ formData: fd, schema: resolveDisputeSchema, admin: true, revalidate: FR }, async ({ tx, session, data }) => {
    await fines.resolveDispute(tx, session, data);
    return `Dispute ${data.decision}`;
  });
}
