import Layout from '../components/Layout';
import FilterBar from '../components/FilterBar';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import MapView from '../components/MapView';
import { useApi } from '../hooks/useApi';
import { useModuleFilters } from '../hooks/useModuleFilters';
import type { MapPayload } from '../lib/api';
import { fmtDate, fmtNumber } from '../lib/format';

export default function DisasterMap() {
  const { filters, set, reset, options, path, activeCount } = useModuleFilters('map', '/analytics/map');
  const { data, loading, error, refetch } = useApi<MapPayload>(path);

  return (
    <Layout
      title="Disaster Map"
      subtitle="Geospatial view of disasters, camps and SOS requests with regional analytics"
      actions={<button className="icon-btn" onClick={refetch} title="Re-run every query">↻ Refresh</button>}
    >
      <FilterBar
        filters={filters}
        set={set}
        reset={reset}
        options={options}
        activeCount={activeCount}
        typeLabel="Disaster type"
      />

      {error ? <div className="notice err"><span>⚠️</span><div><b>Could not load map analytics.</b><br />{error}</div></div> : null}

      {data ? (
        <>
          <div className="kpi-grid">
            {data.kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
          </div>

          <section className="panel">
            <header className="panel-head">
              <div className="grow">
                <h2>Interactive Disaster Map</h2>
                <p>
                  Circles = disasters (size = affected population, colour = severity, thick ring = active) ·
                  diamonds = relief camps · toggle the SOS layer for live distress requests
                </p>
              </div>
              <span className="chip">{fmtNumber(data.points.length)} events</span>
              <span className="chip">{fmtNumber(data.sosPoints.length)} SOS</span>
              <span className="chip">{fmtNumber(data.camps.length)} camps</span>
            </header>
            <div className="panel-body">
              <MapView points={data.points} camps={data.camps} sos={data.sosPoints} height={560} />
            </div>
          </section>

          <div className="chart-grid">
            {data.charts.map((chart) => (
              <ChartCard
                key={chart.id}
                chart={chart}
                span={chart.type === 'heatmap' ? 12 : chart.id === 'regional_trend' ? 12 : 6}
                height={chart.type === 'heatmap' ? 320 : 300}
              />
            ))}
          </div>

          <div className="notice">
            <span>🗺️</span>
            <div>
              <b>Range:</b> {fmtDate(data.meta.from)} → {fmtDate(data.meta.to)}
              {' '}· <b>mapped events:</b> {fmtNumber(data.points.length)}
              {' '}· <b>regions:</b> {fmtNumber(data.kpis.find((k) => k.id === 'regions')?.value as number)}
              {' '}· basemap © OpenStreetMap contributors.
            </div>
          </div>
        </>
      ) : loading && !error ? (
        <div className="chart-grid">
          <div className="panel span-12" style={{ padding: 16 }}>
            <div className="skeleton" style={{ height: 560 }} />
          </div>
        </div>
      ) : null}
    </Layout>
  );
}
