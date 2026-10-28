import { fromMinor, toMinor } from './money';

export type FineStatus = 'pending' | 'partially_paid' | 'paid' | 'waived' | 'disputed';

export interface FinePaymentLike {
  amount: string;
  status: 'pending' | 'confirmed' | 'rejected';
}

export function finePaid(payments: FinePaymentLike[]): string {
  return fromMinor(payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + toMinor(p.amount), 0));
}

/** Outstanding = amount − confirmed payments; a waived fine has nothing outstanding. Never negative. */
export function fineOutstanding(amount: string, payments: FinePaymentLike[], waived = false): string {
  if (waived) return '0.00';
  return fromMinor(Math.max(0, toMinor(amount) - toMinor(finePaid(payments))));
}

/** Same precedence as app.refresh_fine_status in SQL. */
export function deriveFineStatus(amount: string, payments: FinePaymentLike[], opts: { waived?: boolean; openDispute?: boolean } = {}): FineStatus {
  if (opts.waived) return 'waived';
  const paid = toMinor(finePaid(payments));
  if (paid >= toMinor(amount)) return 'paid';
  if (opts.openDispute) return 'disputed';
  return paid > 0 ? 'partially_paid' : 'pending';
}

/** Returns an error message when a payment cannot be accepted, otherwise null. Overpayments are not supported. */
export function validateFinePayment(amount: string, payments: FinePaymentLike[], paymentAmount: string, waived = false): string | null {
  if (waived) return 'This fine has been waived.';
  const pay = toMinor(paymentAmount);
  if (pay <= 0) return 'Payment must be greater than zero.';
  const outstanding = toMinor(fineOutstanding(amount, payments));
  if (outstanding === 0) return 'This fine is already fully paid.';
  if (pay > outstanding) return `Payment exceeds the outstanding balance of ${fromMinor(outstanding)}.`;
  return null;
}
