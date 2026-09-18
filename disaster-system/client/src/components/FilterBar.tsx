import type { FilterOptions } from '../lib/api';
import type { FilterState } from '../hooks/useModuleFilters';

interface Props {
  filters: FilterState;
  set: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  reset: () => void;
  options?: FilterOptions | null;
  activeCount: number;
  show?: {
    severity?: boolean;
    status?: boolean;
    location?: boolean;
    bucket?: boolean;
  };
  typeLabel?: string;
  extra?: React.ReactNode;
}

const BUCKETS = [
  { v: 'auto', l: 'Auto' },
  { v: 'day', l: 'Daily' },
  { v: 'week', l: 'Weekly' },
  { v: 'month', l: 'Monthly' },
  { v: 'quarter', l: 'Quarterly' },
  { v: 'year', l: 'Yearly' },
];

function MultiSelect({ label, values, options, onChange }: {
  label: string; values: string[]; options: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={`f-${label}`}>{label}</label>
      <select
        id={`f-${label}`}
        multiple
        value={values}
        onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}
        title="Ctrl / ⌘ + click to select several"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/** Date range + categorical filters. Changing anything re-queries the API. */
export default function FilterBar({ filters, set, reset, options, activeCount, show = {}, typeLabel = 'Disaster type', extra }: Props) {
  return (
    <div className="panel filters">
      <div className="field">
        <label htmlFor="f-from">From</label>
        <input
          id="f-from"
          type="date"
          value={filters.from}
          min={options?.range?.from || undefined}
          max={filters.to || options?.range?.to || undefined}
          onChange={(e) => set('from', e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="f-to">To</label>
        <input
          id="f-to"
          type="date"
          value={filters.to}
          min={filters.from || options?.range?.from || undefined}
          max={options?.range?.to || undefined}
          onChange={(e) => set('to', e.target.value)}
        />
      </div>

      {options?.types?.length ? (
        <MultiSelect label={typeLabel} values={filters.type} options={options.types} onChange={(v) => set('type', v)} />
      ) : null}

      {show.severity !== false && options?.severities?.length ? (
        <MultiSelect label="Severity" values={filters.severity} options={options.severities} onChange={(v) => set('severity', v)} />
      ) : null}

      {options?.regions?.length ? (
        <MultiSelect label="Region" values={filters.region} options={options.regions} onChange={(v) => set('region', v)} />
      ) : null}

      {show.location !== false && options?.locations?.length ? (
        <MultiSelect label="Location" values={filters.location} options={options.locations} onChange={(v) => set('location', v)} />
      ) : null}

      {show.status !== false && options?.statuses?.length ? (
        <MultiSelect label="Status" values={filters.status} options={options.statuses} onChange={(v) => set('status', v)} />
      ) : null}

      {show.bucket !== false ? (
        <div className="field">
          <label htmlFor="f-bucket">Time bucket</label>
          <select id="f-bucket" value={filters.bucket} onChange={(e) => set('bucket', e.target.value)}>
            {BUCKETS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
          </select>
        </div>
      ) : null}

      <div className="btn-row" style={{ marginLeft: 'auto' }}>
        {activeCount ? <span className="chip">{activeCount} filter{activeCount > 1 ? 's' : ''} active</span> : null}
        <button type="button" className="btn ghost" onClick={reset} disabled={!activeCount}>Reset</button>
        {extra}
      </div>
    </div>
  );
}
