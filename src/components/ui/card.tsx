import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-slate-200 bg-white shadow-xs', className)}>{children}</section>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5', className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 py-4 sm:px-5', className)}>{children}</div>;
}
