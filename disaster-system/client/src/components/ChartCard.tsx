import type { ReactNode } from 'react';
import type { ChartPayload } from '../lib/api';
import ChartView from './ChartView';

interface Props {
  chart: ChartPayload;
  span?: number;
  height?: number;
  subtitle?: string;
  aside?: ReactNode;
}

/** Panel wrapper: title, live tooltip/legend area and the chart itself. */
export default function ChartCard({ chart, span = 6, height = 280, subtitle, aside }: Props) {
  const count = chart.type === 'heatmap'
    ? `${chart.cells?.length || 0} cells`
    : chart.type === 'scatter'
      ? `${(chart.datasets || []).reduce((s, d) => s + (d.data?.length || 0), 0)} points`
      : `${chart.labels?.length || 0} ${chart.type === 'line' || chart.type === 'area' ? 'points' : 'categories'}`;

  return (
    <section className={`panel chart-card span-${span}`}>
      <header className="panel-head">
        <div className="grow">
          <div className="chart-title">{chart.title}</div>
          <div className="chart-sub">{subtitle || `${chart.type.toUpperCase()} · ${count}${chart.empty ? ' · no data' : ''}`}</div>
        </div>
        {aside}
      </header>
      <div className="chart-body">
        <ChartView chart={chart} height={height} />
      </div>
    </section>
  );
}
