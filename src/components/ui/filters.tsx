'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** GET filter form that updates the URL (shareable, back-button friendly). Selects apply immediately. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = useSearchParams();
  const [pending, start] = useTransition();

  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    // keep params that are not part of this form (e.g. tab)
    for (const [k, v] of current.entries()) if (!form.elements.namedItem(k) && k !== 'page') params.set(k, v);
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && v !== '') params.set(k, v);
    start(() => router.push(`${pathname}${params.size ? `?${params}` : ''}`));
  }

  return (
    <form
      role="search"
      onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); apply(e.currentTarget); }}
      onChange={(e) => { const t = e.target as HTMLElement; if (t.tagName === 'SELECT' || (t as HTMLInputElement).type === 'date') apply(e.currentTarget); }}
      className={cn('flex flex-wrap items-end gap-2 transition-opacity', pending && 'opacity-60', className)}
    >
      {children}
    </form>
  );
}

export function SearchInput({ name = 'q', defaultValue, placeholder = 'Search…' }: { name?: string; defaultValue?: string; placeholder?: string }) {
  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input type="search" name={name} defaultValue={defaultValue} placeholder={placeholder} aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm shadow-xs placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
    </div>
  );
}

export function FilterSelect({ name, label, defaultValue, options, allLabel = 'All' }: { name: string; label: string; defaultValue?: string; options: { value: string; label: string }[]; allLabel?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ''} aria-label={label}
        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 pr-8 text-sm font-normal text-slate-800 shadow-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100">
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function FilterDate({ name, label, defaultValue }: { name: string; label: string; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
      <span>{label}</span>
      <input type="date" name={name} defaultValue={defaultValue}
        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm font-normal text-slate-800 shadow-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100" />
    </label>
  );
}
