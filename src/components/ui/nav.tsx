import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

type Params = Record<string, string | string[] | undefined>;

export function hrefWith(base: string, params: Params, patch: Record<string, string | number | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === 'string' && v !== '') p.set(k, v);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function LinkTabs({ base, params, param = 'tab', tabs, current }: {
  base: string; params: Params; param?: string; tabs: { value: string; label: string; count?: number }[]; current: string;
}) {
  return (
    <nav aria-label="Sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.value === current;
        return (
          <Link key={t.value} href={hrefWith(base, params, { [param]: t.value, page: null })} aria-current={active ? 'page' : undefined}
            className={cn('-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800')}>
            {t.label}
            {t.count !== undefined && t.count > 0 ? <span className={cn('rounded-full px-1.5 text-[11px]', active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600')}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Pagination({ base, params, page, pageSize, total }: { base: string; params: Params; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return total > 0 ? <p className="px-5 py-3 text-xs text-slate-500">{total} record{total === 1 ? '' : 's'}</p> : null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const cls = 'inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50';
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link className={cls} href={hrefWith(base, params, { page: page - 1 })}><ChevronLeft className="size-3.5" />Previous</Link> : <span className={cn(cls, 'opacity-50')} aria-disabled>Previous</span>}
        {page < pages ? <Link className={cls} href={hrefWith(base, params, { page: page + 1 })}>Next<ChevronRight className="size-3.5" /></Link> : <span className={cn(cls, 'opacity-50')} aria-disabled>Next</span>}
      </div>
    </nav>
  );
}

export function pageOf(params: Params, size = 20) {
  const n = Number(params.page);
  const page = Number.isInteger(n) && n > 0 ? n : 1;
  return { page, limit: size, offset: (page - 1) * size };
}

export function str(params: Params, key: string): string | undefined {
  const v = params[key];
  return typeof v === 'string' && v !== '' ? v : undefined;
}
