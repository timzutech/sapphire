/**
 * Money is stored as numeric(14,2) and transported as decimal strings. Arithmetic in the app is done in integer
 * minor units (kobo/cents) so it is exact; authoritative totals are computed by PostgreSQL.
 */
const MONEY_RE = /^-?\d{1,12}(\.\d{1,2})?$/;

export function isMoneyString(v: string): boolean {
  return MONEY_RE.test(v.trim());
}

export function toMinor(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = typeof v === 'number' ? v.toFixed(2) : v.trim();
  if (!isMoneyString(s)) throw new Error(`Invalid money amount: ${s}`);
  const neg = s.startsWith('-');
  const [whole, frac = ''] = s.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -minor : minor;
}

export function fromMinor(minor: number): string {
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-${s}` : s;
}

export function addMoney(...values: (string | number | null | undefined)[]): string {
  return fromMinor(values.reduce<number>((sum, v) => sum + toMinor(v), 0));
}

export type TxnType = 'income' | 'expense' | 'transfer' | 'adjustment';

export interface LedgerTxn {
  type: TxnType;
  amount: string;
  direction: 1 | -1;
  accountId: string;
  toAccountId?: string | null;
  status?: string;
}

/** Signed effect of a transaction on one account. Mirrors the personal_ledger / office_ledger SQL views. */
export function signedEffect(t: LedgerTxn, accountId: string): number {
  if (t.status === 'rejected') return 0;
  const amt = toMinor(t.amount) * t.direction;
  let effect = 0;
  if (t.accountId === accountId) effect += t.type === 'income' || t.type === 'adjustment' ? amt : -amt;
  if (t.type === 'transfer' && t.toAccountId === accountId) effect += amt;
  return effect;
}

export interface PeriodSummary {
  income: string;
  expenses: string;
  net: string;
}

/** Income and expense totals exclude transfers (which only move money between own accounts) and rejected rows;
 *  corrections carry direction -1 and therefore cancel the original entry. */
export function summarize(txns: LedgerTxn[]): PeriodSummary {
  let income = 0;
  let expenses = 0;
  for (const t of txns) {
    if (t.status === 'rejected') continue;
    const amt = toMinor(t.amount) * t.direction;
    if (t.type === 'income') income += amt;
    else if (t.type === 'expense') expenses += amt;
  }
  return { income: fromMinor(income), expenses: fromMinor(expenses), net: fromMinor(income - expenses) };
}

/** Recorded balance = opening balance + signed effects of all non-rejected transactions on the account. */
export function accountBalance(opening: string, txns: LedgerTxn[], accountId: string): string {
  return fromMinor(txns.reduce((b, t) => b + signedEffect(t, accountId), toMinor(opening)));
}
