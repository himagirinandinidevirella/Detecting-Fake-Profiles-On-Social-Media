import type { ReactNode } from 'react';
import Layout from './Layout';
import FilterBar from './FilterBar';
import KpiCard from './KpiCard';
import ChartCard from './ChartCard';
import EmptyState from './EmptyState';
import { useApi } from '../hooks/useApi';
import { useModuleFilters } from '../hooks/useModuleFilters';
import type { ModulePayload } from '../lib/api';
import { fmtDate, fmtNumber } from '../lib/format';

export interface Slot {
  id: string;
  span?: number;
  height?: number;
  subtitle?: string;
}

interface Props {
  title: string;
  subtitle: string;
  module: string;
  endpoint: string;
  slots: Slot[];
  filterProps?: Parameters<typeof FilterBar>[0] extends never ? never : {
    show?: { severity?: boolean; status?: boolean; location?: boolean; bucket?: boolean };
    typeLabel?: string;
  };
  intro?: ReactNode;
  actions?: ReactNode;
}

/**
 * Generic visualization-first page: KPI strip + chart grid, all data pulled
 * from one analytics endpoint and re-fetched whenever a filter changes.
 */
export default function ModulePage({ title, subtitle, module, endpoint, slots, filterProps, intro, actions }: Props) {
  const { filters, set, reset, options, path, activeCount } = useModuleFilters(module, endpoint);
  const { data, loading, error, refetch } = useApi<ModulePayload>(path);

  const byId = new Map((data?.charts || []).map((c) => [c.id, c]));
  const known = new Set(slots.map((s) => s.id));
  const extras = (data?.charts || []).filter((c) => !known.has(c.id));

  return (
    <Layout
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {actions}
          <button className="icon-btn" onClick={refetch} title="Re-run every query">↻ Refresh</button>
        </>
      }
    >
      {intro}

      <FilterBar
        filters={filters}
        set={set}
        reset={reset}
        options={options}
        activeCount={activeCount}
        show={filterProps?.show}
        typeLabel={filterProps?.typeLabel}
      />

      {error ? <div className="notice err"><span>⚠️</span><div><b>Could not load analytics.</b><br />{error}</div></div> : null}

      {data ? (
        <>
          <div className="kpi-grid">
            {data.kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
          </div>

          <div className="notice">
            <span>🗓️</span>
            <div>
              <b>Range:</b> {fmtDate(data.meta.from)} → {fmtDate(data.meta.to)}
              {data.meta.bucket ? <> · <b>bucket:</b> {data.meta.bucket}</> : null}
              {typeof data.meta.matched === 'number' ? <> · <b>records matched:</b> {fmtNumber(data.meta.matched)}</> : null}
              {' '}· all figures aggregated from the database for the filters above.
            </div>
          </div>

          {data.kpis.every((k) => !k.value) && (data.charts || []).every((c) => c.empty) ? (
            <EmptyState title="No data available" message="This module has no records for the selected filters. Upload a dataset or reset the filters." />
          ) : null}

          <div className="chart-grid">
            {slots.map((slot) => {
              const chart = byId.get(slot.id);
              if (!chart) return null;
              return (
                <ChartCard
                  key={slot.id}
                  chart={chart}
                  span={slot.span || 6}
                  height={slot.height || 280}
                  subtitle={slot.subtitle}
                />
              );
            })}
            {extras.map((chart) => (
              <ChartCard key={chart.id} chart={chart} span={chart.type === 'heatmap' ? 12 : 6} height={280} />
            ))}
          </div>
        </>
      ) : loading && !error ? (
        <div className="chart-grid">
          {slots.map((s) => (
            <div key={s.id} className={`panel span-${s.span || 6}`} style={{ padding: 16 }}>
              <div className="skeleton" style={{ height: 16, width: '45%', marginBottom: 14 }} />
              <div className="skeleton" style={{ height: s.height || 280 }} />
            </div>
          ))}
        </div>
      ) : null}
    </Layout>
  );
}
