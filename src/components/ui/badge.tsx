import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { humanize } from '@/lib/format';

export type Tone = 'neutral' | 'brand' | 'good' | 'warning' | 'critical' | 'info' | 'violet';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  critical: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  // attendance
  present: 'good', late: 'warning', absent: 'critical', excused: 'info',
  // tasks
  pending: 'warning', in_progress: 'brand', completed: 'good', cancelled: 'neutral', overdue: 'critical',
  // generic workflow
  draft: 'neutral', approved: 'good', rejected: 'critical', paid: 'good', published: 'good', recorded: 'neutral',
  active: 'good', inactive: 'neutral', achieved: 'good', missed: 'critical', upcoming: 'info', ended: 'neutral',
  confirmed: 'good', partially_paid: 'warning', waived: 'info', disputed: 'violet', open: 'warning', upheld: 'good', settled: 'good',
  registered: 'brand', attended: 'good',
  // prospects
  new: 'neutral', contacted: 'brand', follow_up: 'warning', interested: 'info', converted: 'good', not_interested: 'neutral',
  // priority
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'critical',
};

const STATUS_LABELS: Record<string, string> = {
  recorded: 'Unverified',
  pending: 'Pending',
  follow_up: 'Follow-up',
  partially_paid: 'Partly paid',
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{label ?? STATUS_LABELS[status] ?? humanize(status)}</Badge>;
}
