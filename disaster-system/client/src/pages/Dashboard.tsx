import Layout from '../components/Layout';
import FilterBar from '../components/FilterBar';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import MapView from '../components/MapView';
import EmptyState from '../components/EmptyState';
import { useApi } from '../hooks/useApi';
import { useModuleFilters } from '../hooks/useModuleFilters';
import type { MapPayload, ModulePayload } from '../lib/api';
import { fmtDate, fmtNumber } from '../lib/format';

export default function Dashboard() {
  const { filters, set, reset, options, path, activeCount } = useModuleFilters('dashboard', '/analytics/dashboard');
  const mapPath = `/analytics/map${path.split('?')[1] ? `?${path.split('?')[1]}` : ''}`;
  const { data, loading, error, refetch } = useApi<ModulePayload>(path);
  const { data: map } = useApi<MapPayload>(mapPath);

  const byId = new Map((data?.charts || []).map((c) => [c.id, c]));
  const slots: { id: string; span: number; height?: number; subtitle: string }[] = [
    { id: 'disaster_trend', span: 8, subtitle: 'Events and casualties over time' },
    { id: 'severity_donut', span: 4, height: 300, subtitle: 'Severity mix across all events' },
    { id: 'disaster_types', span: 5, subtitle: 'Events per disaster type' },
    { id: 'affected_trend', span: 7, subtitle: 'People affected over time' },
    { id: 'sos_trend', span: 6, subtitle: 'SOS volume with critical share' },
    { id: 'region_bar', span: 6, subtitle: 'Events per region' },
    { id: 'status_stack', span: 6, height: 320, subtitle: 'Response status inside each type' },
    { id: 'alerts_status', span: 3, height: 320, subtitle: 'Alert workflow' },
    { id: 'top_locations', span: 3, height: 320, subtitle: 'Most affected places' },
  ];

  return (
    <Layout
      title="Disaster Intelligence Dashboard"
      subtitle="Live analytics across disasters, alerts, SOS, camps, volunteers and donations"
      actions={<button className="icon-btn" onClick={refetch} title="Re-run every query">↻ Refresh</button>}
    >
      <FilterBar
        filters={filters}
        set={set}
        reset={reset}
        options={options}
        activeCount={activeCount}
        show={{ status: false }}
        typeLabel="Disaster type"
      />

      {error ? <div className="notice err"><span>⚠️</span><div><b>Could not load the dashboard.</b><br />{error}</div></div> : null}

      {data ? (
        <>
          <div className="kpi-grid">
            {data.kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
          </div>

          <section className="panel">
            <header className="panel-head">
              <div className="grow">
                <h2>Disaster Locations</h2>
                <p>Marker size = affected population · colour = severity · diamonds = relief camps</p>
              </div>
              <span className="chip">{fmtNumber(map?.points?.length || 0)} events</span>
              <span className="chip">{fmtNumber(map?.camps?.length || 0)} camps</span>
            </header>
            <div className="panel-body">
              {map ? (
                <MapView points={map.points} camps={map.camps} sos={map.sosPoints} height={480} />
              ) : (
                <div className="skeleton" style={{ height: 480 }} />
              )}
            </div>
          </section>

          {data.kpis.every((k) => !k.value) && (data.charts || []).every((c) => c.empty) ? (
            <EmptyState title="No data available" message="No disaster records match the selected filters. Reset the filters or upload a dataset." />
          ) : null}

          <div className="chart-grid">
            {slots.map((slot) => {
              const chart = byId.get(slot.id);
              if (!chart) return null;
              return <ChartCard key={slot.id} chart={chart} span={slot.span} height={slot.height || 300} subtitle={slot.subtitle} />;
            })}
          </div>

          <div className="notice">
            <span>🗓️</span>
            <div>
              <b>Range:</b> {fmtDate(data.meta.from)} → {fmtDate(data.meta.to)}
              {data.meta.bucket ? <> · <b>bucket:</b> {data.meta.bucket}</> : null}
              {typeof data.meta.matched === 'number' ? <> · <b>events matched:</b> {fmtNumber(data.meta.matched)}</> : null}
              {' '}· every figure is aggregated from the SQLite database on each request.
            </div>
          </div>
        </>
      ) : loading && !error ? (
        <div className="chart-grid">
          <div className="panel span-12" style={{ padding: 16 }}>
            <div className="skeleton" style={{ height: 480 }} />
          </div>
          {slots.slice(0, 4).map((s) => (
            <div key={s.id} className={`panel span-${s.span}`} style={{ padding: 16 }}>
              <div className="skeleton" style={{ height: 16, width: '40%', marginBottom: 14 }} />
              <div className="skeleton" style={{ height: 280 }} />
            </div>
          ))}
        </div>
      ) : null}
    </Layout>
  );
}
