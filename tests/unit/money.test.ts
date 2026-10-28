import { describe, expect, it } from 'vitest';
import { accountBalance, addMoney, fromMinor, signedEffect, summarize, toMinor, type LedgerTxn } from '@/lib/logic/money';

describe('money arithmetic', () => {
  it('converts to and from minor units exactly', () => {
    expect(toMinor('1234.5')).toBe(123450);
    expect(toMinor('-0.07')).toBe(-7);
    expect(fromMinor(-123456)).toBe('-1234.56');
    expect(addMoney('0.1', '0.2')).toBe('0.30'); // no floating-point drift
    expect(() => toMinor('1.234')).toThrow();
  });
});

describe('ledger rules', () => {
  const cash = 'cash';
  const sav = 'sav';
  const txns: LedgerTxn[] = [
    { type: 'income', amount: '5000.50', direction: 1, accountId: cash },
    { type: 'expense', amount: '1200.25', direction: 1, accountId: cash },
    { type: 'transfer', amount: '2000', direction: 1, accountId: cash, toAccountId: sav },
    { type: 'income', amount: '999', direction: 1, accountId: cash, status: 'rejected' },
    { type: 'adjustment', amount: '10', direction: -1, accountId: cash },
  ];

  it('totals exclude transfers, adjustments and rejected entries', () => {
    expect(summarize(txns)).toEqual({ income: '5000.50', expenses: '1200.25', net: '3800.25' });
  });

  it('balance = opening + signed effects; transfers move between accounts without double counting', () => {
    expect(accountBalance('1000', txns, cash)).toBe('2790.25');
    expect(accountBalance('0', txns, sav)).toBe('2000.00');
  });

  it('a correction (direction −1) nets the original to zero', () => {
    const orig: LedgerTxn = { type: 'income', amount: '700', direction: 1, accountId: cash };
    const corr: LedgerTxn = { ...orig, direction: -1 };
    expect(signedEffect(orig, cash) + signedEffect(corr, cash)).toBe(0);
    expect(summarize([orig, corr]).income).toBe('0.00');
  });
});
