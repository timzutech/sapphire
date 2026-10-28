import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md';

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap',
    size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
    variant === 'primary' && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
    variant === 'secondary' && 'border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50',
    variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    variant === 'danger' && 'bg-red-600 text-white shadow-sm hover:bg-red-700',
    variant === 'success' && 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
    extra,
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type="button" {...props} className={buttonClass(variant, size, className)} />;
}

export function LinkButton({ href, variant, size, className, children }: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}
