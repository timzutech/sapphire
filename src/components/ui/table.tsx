import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('-mx-px overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">{children}</thead>;
}

export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return <th scope="col" className={cn('px-4 py-2.5 font-medium whitespace-nowrap first:pl-5 last:pr-5', align === 'right' && 'text-right', align === 'center' && 'text-center', className)}>{children}</th>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function Tr({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-slate-50/60', className)}>{children}</tr>;
}

export function Td({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return <td className={cn('px-4 py-3 align-middle text-slate-700 first:pl-5 last:pr-5', align === 'right' && 'text-right tabular', align === 'center' && 'text-center', className)}>{children}</td>;
}
