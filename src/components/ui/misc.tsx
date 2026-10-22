import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{eyebrow}</div> : null}
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, href, tone = 'neutral' }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; href?: string; tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'brand';
}) {
  const body = (
    <div className="flex h-full items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors hover:border-slate-300">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-500">{label}</div>
        <div className="tabular mt-1.5 break-words text-lg leading-tight font-semibold tracking-tight text-slate-900 sm:text-2xl">{value}</div>
        {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      </div>
      {Icon ? (
        <div className={cn('hidden size-9 shrink-0 place-items-center rounded-lg sm:grid',
          tone === 'good' && 'bg-emerald-50 text-emerald-600', tone === 'warning' && 'bg-amber-50 text-amber-600',
          tone === 'critical' && 'bg-red-50 text-red-600', tone === 'brand' && 'bg-brand-50 text-brand-600', tone === 'neutral' && 'bg-slate-100 text-slate-600')}>
          <Icon className="size-4.5" aria-hidden />
        </div>
      ) : null}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-xl">{body}</Link> : body;
}

export function ProgressBar({ value, tone = 'brand', label, size = 'md', marker }: { value: number; tone?: 'brand' | 'good' | 'warning' | 'critical'; label?: string; size?: 'sm' | 'md'; marker?: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('relative w-full overflow-hidden rounded-full bg-slate-100', size === 'sm' ? 'h-1.5' : 'h-2')} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width]', tone === 'brand' && 'bg-brand-500', tone === 'good' && 'bg-emerald-500', tone === 'warning' && 'bg-amber-400', tone === 'critical' && 'bg-red-500')} style={{ width: `${v}%` }} />
      {marker !== undefined ? <div className="absolute inset-y-0 w-0.5 bg-slate-500/70" style={{ left: `${Math.max(0, Math.min(100, marker))}%` }} title="Expected by today" /> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, compact }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-6' : 'py-12')}>
      {Icon ? <div className="mb-3 grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500"><Icon className="size-5" aria-hidden /></div> : null}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span aria-hidden className={cn('grid shrink-0 place-items-center rounded-full bg-brand-100 font-semibold text-brand-700', size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs')}>
      {initials(name)}
    </span>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warning' | 'critical' | 'good'; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === 'critical' ? 'alert' : 'status'} className={cn('rounded-lg border px-3.5 py-2.5 text-sm',
      tone === 'info' && 'border-sky-200 bg-sky-50 text-sky-900', tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
      tone === 'critical' && 'border-red-200 bg-red-50 text-red-900', tone === 'good' && 'border-emerald-200 bg-emerald-50 text-emerald-900')}>
      {title ? <div className="font-medium">{title}</div> : null}
      {children ? <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div> : null}
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i, idx) => (
        <div key={idx}>
          <dt className="text-xs font-medium text-slate-500">{i.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-900">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small "how is this calculated" note shown under ambiguous metrics. */
export function MetricNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs leading-relaxed text-slate-500">{children}</p>;
}
