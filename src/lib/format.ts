export interface OfficeFormat {
  currency: string;
  locale: string;
  timezone: string;
}

export function formatMoney(value: string | number | null | undefined, f: Pick<OfficeFormat, 'currency' | 'locale'>, opts: { compact?: boolean } = {}): string {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(f.locale, {
      style: 'currency',
      currency: f.currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 2,
      minimumFractionDigits: opts.compact ? 0 : 2,
    }).format(n);
  } catch {
    return `${f.currency} ${n.toFixed(2)}`;
  }
}

export function formatNumber(value: number | string | null | undefined, locale = 'en-NG', digits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(Number(value ?? 0));
}

/** Formats an office-local calendar date ('YYYY-MM-DD'). */
export function formatDate(d: string | null | undefined, locale = 'en-NG', style: 'short' | 'medium' | 'long' = 'medium'): string {
  if (!d) return '—';
  const opts: Intl.DateTimeFormatOptions =
    style === 'short' ? { day: 'numeric', month: 'short' } : style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
}

/** Formats an instant in the office timezone. */
export function formatDateTime(ts: Date | string | null | undefined, f: Pick<OfficeFormat, 'locale' | 'timezone'>, withDate = true): string {
  if (!ts) return '—';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  return new Intl.DateTimeFormat(f.locale, {
    timeZone: f.timezone,
    ...(withDate ? { day: 'numeric', month: 'short', year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatPercent(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v.toFixed(v % 1 === 0 ? 0 : digits)}%`;
}

export function relativeTime(ts: Date | string, now: Date = new Date()): string {
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (86400 * 30)), 'month');
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function humanize(s: string | null | undefined): string {
  if (!s) return '—';
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
