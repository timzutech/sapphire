import { z } from 'zod';
import { isValidDate } from '../dates';

const blankToUndefined = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v);

export const reqText = (label: string, max = 200, min = 1) =>
  z.preprocess(
    blankToUndefined,
    z
      .string({ error: `${label} is required` })
      .min(min, `${label} must be at least ${min} characters`)
      .max(max, `${label} must be at most ${max} characters`),
  );

export const optText = (max = 2000) => z.preprocess(blankToUndefined, z.string().max(max, `Must be at most ${max} characters`).optional());

export const id = (label = 'Selection') => z.preprocess(blankToUndefined, z.guid({ error: `${label} is required` }));
export const optId = () => z.preprocess(blankToUndefined, z.guid().optional());

export const date = (label = 'Date') =>
  z.preprocess(blankToUndefined, z.string({ error: `${label} is required` }).refine(isValidDate, `${label} must be a valid date`));
export const optDate = () => z.preprocess(blankToUndefined, z.string().refine(isValidDate, 'Must be a valid date').optional());

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;
const cleanMoney = (v: unknown) => (typeof v === 'string' ? (v.replace(/[,\s₦]/g, '') === '' ? undefined : v.replace(/[,\s₦]/g, '')) : v);

/** Positive money amount as a decimal string (max 2 dp). */
export const money = (label = 'Amount') =>
  z.preprocess(
    cleanMoney,
    z
      .string({ error: `${label} is required` })
      .regex(MONEY, `${label} must be a number with up to 2 decimal places`)
      .refine((v) => Number(v) > 0, `${label} must be greater than zero`),
  );
export const moneyOrZero = (label = 'Amount') =>
  z.preprocess(
    (v) => cleanMoney(v) ?? '0',
    z.string().regex(/^-?\d{1,12}(\.\d{1,2})?$/, `${label} must be a number with up to 2 decimal places`),
  );
export const optMoney = (label = 'Amount') =>
  z.preprocess(cleanMoney, z.string().regex(MONEY, `${label} must be a number with up to 2 decimal places`).optional());

export const decimal = (label = 'Value') =>
  z.preprocess(cleanMoney, z.string({ error: `${label} is required` }).regex(/^-?\d{1,12}(\.\d{1,2})?$/, `${label} must be a number`));

export const checkbox = () => z.preprocess((v) => v === 'on' || v === 'true' || v === true || v === '1', z.boolean());

export const int = (label: string, min = 0, max = 1_000_000) =>
  z.preprocess(blankToUndefined, z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min).max(max));
export const optInt = (min = 0, max = 1_000_000) =>
  z.preprocess(blankToUndefined, z.coerce.number().int('Must be a whole number').min(min).max(max).optional());

export const time = (label: string) => z.preprocess(blankToUndefined, z.string({ error: `${label} is required` }).regex(/^\d{2}:\d{2}(:\d{2})?$/, `${label} must be HH:MM`));

export const enumOf = <T extends readonly [string, ...string[]]>(values: T, label = 'Value') =>
  z.preprocess(blankToUndefined, z.enum(values, { error: `Choose a valid ${label.toLowerCase()}` }));

export const email = () =>
  z.preprocess(blankToUndefined, z.string({ error: 'Email is required' }).toLowerCase().pipe(z.email('Enter a valid email address')));
export const optEmail = () => z.preprocess(blankToUndefined, z.string().toLowerCase().pipe(z.email('Enter a valid email address')).optional());

export const phone = () =>
  z.preprocess(blankToUndefined, z.string().regex(/^[+()\d\s-]{7,20}$/, 'Enter a valid phone number').optional());

export const password = () =>
  z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Password must include a letter')
    .regex(/\d/, 'Password must include a number');

/** Converts FormData to a plain object; repeated keys or keys ending in [] become arrays. Files are skipped. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith('$ACTION')) continue;
    const values = fd.getAll(key).filter((v) => typeof v === 'string') as string[];
    if (key.endsWith('[]')) out[key.slice(0, -2)] = values.filter((v) => v !== '');
    else if (values.length > 0) out[key] = values[values.length - 1];
  }
  return out;
}

export function issuesToFieldErrors(issues: z.core.$ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.length ? String(i.path[0]) : '_form';
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
