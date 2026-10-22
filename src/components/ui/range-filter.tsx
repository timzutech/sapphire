import { RANGE_OPTIONS } from '@/lib/constants';
import { FilterBar, FilterDate, FilterSelect } from './filters';

/** Date-range filter (presets + custom). Pages resolve it with resolveRange(). */
export function RangeFilter({ range, from, to, children }: { range: string; from: string; to: string; children?: React.ReactNode }) {
  return (
    <FilterBar className="mb-5">
      <FilterSelect name="range" label="Period" defaultValue={range} options={RANGE_OPTIONS} allLabel="" />
      {range === 'custom' ? (
        <>
          <FilterDate name="from" label="From" defaultValue={from} />
          <FilterDate name="to" label="To" defaultValue={to} />
        </>
      ) : null}
      {children}
    </FilterBar>
  );
}
