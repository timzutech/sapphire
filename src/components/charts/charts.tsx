'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis, type TooltipContentProps,
} from 'recharts';
import { SERIES_COLORS } from '@/lib/chart-colors';

export type ValueFormat = 'number' | 'money' | 'percent';
export interface Series { key: string; label: string; color: string }
export interface ChartFormat { kind: ValueFormat; currency?: string; locale?: string }


const INK_MUTED = '#64748b';
const GRID = '#e2e8f0';

/** Measures its own width and renders the chart at that explicit size (more reliable than ResponsiveContainer). */
function Sized({ height, label, children }: { height: number; label: string; children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ height }} role="img" aria-label={label} className="w-full min-w-0">
      {width > 0 ? children(width) : null}
    </div>
  );
}

function fmt(v: number, f: ChartFormat, compact = false) {
  const locale = f.locale ?? 'en-NG';
  if (f.kind === 'percent') return `${Math.round(v * 10) / 10}%`;
  if (f.kind === 'money') {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: f.currency ?? 'NGN', notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }).format(v);
    } catch {
      return String(v);
    }
  }
  return new Intl.NumberFormat(locale, { notation: compact ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(v);
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TooltipBox({ active, payload, label, series, format }: TooltipContentProps<number, string> & { series: Series[]; format: ChartFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-medium text-slate-900">{label}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        if (!p) return null;
        return (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-600"><span className="size-2 rounded-sm" style={{ background: s.color }} />{s.label}</span>
            <span className="tabular font-medium text-slate-900">{fmt(Number(p.value ?? 0), format)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DataTable({ data, xKey, xLabel, series, format }: { data: Record<string, string | number>[]; xKey: string; xLabel: string; series: Series[]; format: ChartFormat }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">View as table</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left">
          <thead className="text-slate-500"><tr><th className="py-1 pr-3 font-medium">{xLabel}</th>{series.map((s) => <th key={s.key} className="py-1 pr-3 text-right font-medium">{s.label}</th>)}</tr></thead>
          <tbody className="tabular text-slate-700">
            {data.map((d, i) => (
              <tr key={i} className="border-t border-slate-100"><td className="py-1 pr-3">{d[xKey]}</td>{series.map((s) => <td key={s.key} className="py-1 pr-3 text-right">{fmt(Number(d[s.key] ?? 0), format)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function BarsChart({ data, xKey, xLabel = 'Period', series, format = { kind: 'number' }, stacked = false, height = 240, ariaLabel }: {
  data: Record<string, string | number>[]; xKey: string; xLabel?: string; series: Series[]; format?: ChartFormat; stacked?: boolean; height?: number; ariaLabel: string;
}) {
  return (
    <figure aria-label={ariaLabel}>
      <Legend series={series} />
      <Sized height={height} label={ariaLabel}>
        {(width) => (
          <BarChart width={width} height={height} data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: INK_MUTED }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: INK_MUTED }} width={56} tickFormatter={(v) => fmt(Number(v), format, true)} allowDecimals={format.kind !== 'number'} />
            <Tooltip cursor={{ fill: 'rgba(148,163,184,0.12)' }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={series} format={format} />} />
            {series.map((s, i) => (
              <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? 'a' : undefined} maxBarSize={28}
                stroke="#fcfcfb" strokeWidth={stacked ? 1 : 0}
                radius={!stacked || i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        )}
      </Sized>
      <DataTable data={data} xKey={xKey} xLabel={xLabel} series={series} format={format} />
    </figure>
  );
}

export function LinesChart({ data, xKey, xLabel = 'Period', series, format = { kind: 'number' }, height = 240, ariaLabel, yDomain }: {
  data: Record<string, string | number>[]; xKey: string; xLabel?: string; series: Series[]; format?: ChartFormat; height?: number; ariaLabel: string; yDomain?: [number, number];
}) {
  return (
    <figure aria-label={ariaLabel}>
      <Legend series={series} />
      <Sized height={height} label={ariaLabel}>
        {(width) => (
          <LineChart width={width} height={height} data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: INK_MUTED }} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: INK_MUTED }} width={56} domain={yDomain} tickFormatter={(v) => fmt(Number(v), format, true)} />
            <Tooltip cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }} content={(p) => <TooltipBox {...(p as TooltipContentProps<number, string>)} series={series} format={format} />} />
            {series.map((s) => (
              <Line key={s.key} isAnimationActive={false} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2}
                dot={data.length <= 16 ? { r: 3.5, strokeWidth: 2, stroke: '#fcfcfb', fill: s.color } : false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fcfcfb' }} connectNulls />
            ))}
          </LineChart>
        )}
      </Sized>
      <DataTable data={data} xKey={xKey} xLabel={xLabel} series={series} format={format} />
    </figure>
  );
}

/** Horizontal bars for ranked categories (pipeline stages, expense categories). Values are direct-labelled. */
export function RankBars({ items, format = { kind: 'number' }, color = SERIES_COLORS[0], ariaLabel, compare }: {
  items: { label: string; value: number; compare?: number }[]; format?: ChartFormat; color?: string; ariaLabel: string; compare?: { label: string; valueLabel: string };
}) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.value, i.compare ?? 0)));
  return (
    <figure aria-label={ariaLabel}>
      {compare ? (
        <ul className="mb-3 flex flex-wrap gap-x-4 text-xs text-slate-600" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />{compare.valueLabel}</li>
          <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 bg-slate-700" />{compare.label}</li>
        </ul>
      ) : null}
      <ul className="space-y-2.5">
        {items.map((i) => (
          <li key={i.label} className="grid grid-cols-[minmax(80px,140px)_1fr_auto] items-center gap-3 text-xs" title={`${i.label}: ${fmt(i.value, format)}${i.compare !== undefined ? ` · ${compare?.label}: ${fmt(i.compare, format)}` : ''}`}>
            <span className="truncate text-slate-600">{i.label}</span>
            <span className="relative h-2.5 rounded-sm bg-slate-100">
              <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${(i.value / max) * 100}%`, background: color, minWidth: i.value > 0 ? 3 : 0 }} />
              {i.compare !== undefined ? <span className="absolute -inset-y-1 w-0.5 bg-slate-700" style={{ left: `${(i.compare / max) * 100}%` }} aria-hidden /> : null}
            </span>
            <span className="tabular text-right font-medium text-slate-900">{fmt(i.value, format)}{i.compare !== undefined ? <span className="font-normal text-slate-500"> / {fmt(i.compare, format)}</span> : null}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
