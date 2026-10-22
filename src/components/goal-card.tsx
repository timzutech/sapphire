import { Badge, StatusBadge } from '@/components/ui/badge';
import { ProgressBar } from '@/components/ui/misc';
import { GOAL_CATEGORY_LABELS } from '@/lib/constants';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { expectedProgressPercent, goalProgress } from '@/lib/logic/goals';
import { METRIC_LABELS } from '@/lib/validation/goals';
import type { GoalRow } from '@/server/queries/goals';

export function goalValue(v: number, unit: string, fmt: { currency: string; locale: string }) {
  return unit.toUpperCase() === fmt.currency.toUpperCase() ? formatMoney(v, fmt, { compact: v >= 100000 }) : `${formatNumber(v, fmt.locale, 2)} ${unit}`;
}

export function GoalSummary({ g, today, fmt, children }: { g: GoalRow; today: string; fmt: { currency: string; locale: string }; children?: React.ReactNode }) {
  const p = goalProgress(g.current, g.target);
  const expected = expectedProgressPercent(g.startDate, g.endDate, today);
  const behind = g.status === 'active' && !p.achieved && p.percent + 10 < expected;
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold text-slate-900">{g.title}</h3>
            {g.status !== 'active' ? <StatusBadge status={g.status} /> : p.achieved ? <Badge tone="good">Target met</Badge> : behind ? <Badge tone="warning">Behind pace</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {GOAL_CATEGORY_LABELS[g.category] ?? g.category} · {g.scope === 'office' ? 'Office goal' : g.scope === 'team' ? `Team ${g.teamName ?? ''}` : g.userName ?? 'Individual'} · {formatDate(g.startDate, fmt.locale, 'short')} – {formatDate(g.endDate, fmt.locale, 'short')}
          </p>
        </div>
        <div className="ml-auto text-right">
          <div className="tabular text-sm font-semibold text-slate-900">{p.label}</div>
          <div className="tabular text-xs text-slate-500">{goalValue(g.current, g.unit, fmt)} / {goalValue(g.target, g.unit, fmt)}</div>
        </div>
      </div>
      <div className="mt-3"><ProgressBar value={p.percent} tone={p.achieved ? 'good' : behind ? 'warning' : 'brand'} marker={g.status === 'active' ? expected : undefined} label={`${g.title} progress`} /></div>
      <p className="mt-2 text-xs text-slate-500">
        {g.progressMode === 'auto' && g.metric ? `Auto: ${METRIC_LABELS[g.metric as keyof typeof METRIC_LABELS]}.` : 'Updated manually by an administrator.'}
        {g.status === 'active' ? ` The marker shows expected progress by today (${Math.round(expected)}%).` : ''}
      </p>
      {children}
    </div>
  );
}
