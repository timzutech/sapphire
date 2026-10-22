/** Calendar helpers. Office-local dates are 'YYYY-MM-DD' strings; arithmetic is done in UTC to avoid DST drift. */

export function todayInTz(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function timeInTz(tz: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

export function parseDate(d: string): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function fmtISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parseDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmtISO(x);
}

export function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: string): string {
  const x = parseDate(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + 1);
  x.setUTCDate(0);
  return fmtISO(x);
}

export function addMonths(d: string, n: number): string {
  const x = parseDate(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return fmtISO(x);
}

/** ISO weekday: 1 = Monday … 7 = Sunday */
export function isoWeekday(d: string): number {
  const w = parseDate(d).getUTCDay();
  return w === 0 ? 7 : w;
}

export function startOfWeek(d: string): string {
  return addDays(d, 1 - isoWeekday(d));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidDate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parseDate(d).getTime()) && fmtISO(parseDate(d)) === d;
}

export function monthLabel(d: string, locale = 'en-NG'): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseDate(startOfMonth(d)));
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export type RangePreset = 'this_week' | 'this_month' | 'last_month' | 'last_90' | 'this_year' | 'custom';

export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case 'this_week':
      return { from: startOfWeek(today), to: today };
    case 'last_month': {
      const s = addMonths(today, -1);
      return { from: s, to: endOfMonth(s) };
    }
    case 'last_90':
      return { from: addDays(today, -89), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'this_month':
    default:
      return { from: startOfMonth(today), to: today };
  }
}

/** Resolves ?range=&from=&to= search params into a validated range (defaults to this month). */
export function resolveRange(params: { range?: string; from?: string; to?: string }, today: string) {
  const preset = (params.range ?? 'this_month') as RangePreset;
  if (preset === 'custom' && params.from && params.to && isValidDate(params.from) && isValidDate(params.to) && params.from <= params.to) {
    return { preset, from: params.from, to: params.to };
  }
  const known: RangePreset[] = ['this_week', 'this_month', 'last_month', 'last_90', 'this_year'];
  const p = known.includes(preset) ? preset : 'this_month';
  return { preset: p, ...presetRange(p, today) };
}
