import { createContext, useContext, useMemo } from 'react';
import { Bar, Line, Doughnut, Pie, Scatter } from 'react-chartjs-2';
import type { ChartPayload } from '../lib/api';
import { buildChartData, buildChartOptions } from '../lib/charts';
import EmptyState from './EmptyState';
import Heatmap from './Heatmap';

export const ThemeContext = createContext<'dark' | 'light'>('dark');

const GLYPHS: Record<string, string> = {
  line: '📈', area: '📉', bar: '📊', donut: '🍩', pie: '🥧', scatter: '🎯', heatmap: '🔥',
};

interface Props {
  chart: ChartPayload;
  height?: number;
}

/**
 * Renders any chart payload produced by the API. Chart.js instances are keyed
 * on the active theme so colours and gridlines follow dark/light mode.
 */
export default function ChartView({ chart, height = 280 }: Props) {
  const theme = useContext(ThemeContext);

  const hasData = useMemo(() => {
    if (chart.empty) return false;
    if (chart.type === 'heatmap') return (chart.cells?.length || 0) > 0;
    if (chart.type === 'scatter') return (chart.datasets || []).some((d) => (d.data?.length || 0) > 0);
    return (chart.labels?.length || 0) > 0 && (chart.datasets || []).some((d) => (d.data?.length || 0) > 0);
  }, [chart]);

  if (!hasData) {
    return (
      <EmptyState
        glyph={GLYPHS[chart.type] || '📭'}
        title="No data available"
        message={chart.emptyReason || 'Nothing to plot for the current filters or dataset.'}
        compact={height < 200}
      />
    );
  }

  if (chart.type === 'heatmap') {
    return <Heatmap rows={chart.rows || []} columns={chart.columns || []} cells={chart.cells || []} valueLabel={chart.valueLabel} />;
  }

  const input = {
    type: chart.type,
    labels: chart.labels,
    datasets: chart.datasets || [],
    stacked: chart.stacked,
    horizontal: chart.horizontal,
    yAxisTitle: chart.yAxisTitle,
    axisTitles: chart.axisTitles,
    xLabels: (chart.meta?.xLabels as string[] | undefined),
  };
  const data = buildChartData(input);
  const options = buildChartOptions(input);
  const key = `${chart.id}-${theme}-${chart.labels?.length || 0}-${(chart.datasets || []).length}`;

  const holder = (
    <div className="chart-holder" style={{ height }}>
      {chart.type === 'bar' ? <Bar key={key} data={data as never} options={options as never} /> : null}
      {chart.type === 'line' ? <Line key={key} data={data as never} options={options as never} /> : null}
      {chart.type === 'area' ? <Line key={key} data={data as never} options={options as never} /> : null}
      {chart.type === 'donut' ? <Doughnut key={key} data={data as never} options={options as never} /> : null}
      {chart.type === 'pie' ? <Pie key={key} data={data as never} options={options as never} /> : null}
      {chart.type === 'scatter' ? <Scatter key={key} data={data as never} options={options as never} /> : null}
    </div>
  );
  return holder;
}
