import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title,
  type ChartOptions,
  type ChartData,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  ArcElement, Filler, Tooltip, Legend, Title,
);

export const PALETTE = [
  '#38bdf8', '#f59e0b', '#34d399', '#a78bfa', '#fb7185',
  '#22d3ee', '#facc15', '#fb923c', '#4ade80', '#60a5fa',
  '#e879f9', '#f43f5e',
];

/** Fallbacks used when a CSS variable is unavailable (SSR, first paint). */
const SEVERITY_VARS: Record<string, { css: string; fallback: string }> = {
  Low: { css: '--sev-low', fallback: '#34d399' },
  Moderate: { css: '--sev-moderate', fallback: '#38bdf8' },
  High: { css: '--sev-high', fallback: '#f59e0b' },
  Critical: { css: '--sev-critical', fallback: '#fb5a5a' },
  Unknown: { css: '--text-faint', fallback: '#94a3b8' },
};

export const STATUS_COLORS: Record<string, string> = {
  Active: '#fb5a5a',
  Monitoring: '#f59e0b',
  Resolved: '#34d399',
  Pending: '#fbbf24',
  Dispatched: '#38bdf8',
  'In Progress': '#a78bfa',
  Cancelled: '#64748b',
  Critical: '#fb5a5a',
  Normal: '#38bdf8',
  Available: '#34d399',
  Assigned: '#38bdf8',
  'On Leave': '#94a3b8',
  Answered: '#34d399',
  Missed: '#fb5a5a',
  Busy: '#f59e0b',
  Operational: '#34d399',
  Full: '#fb5a5a',
  Closed: '#64748b',
  Unspecified: '#94a3b8',
};

/** Severity colour for the active theme (undefined when the label is not a severity). */
export function severityColor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const entry = SEVERITY_VARS[name];
  return entry ? cssVar(entry.css, entry.fallback) : undefined;
}

export function seriesColor(label: string | undefined, index: number): string {
  const sev = severityColor(label);
  if (sev) return sev;
  if (label && STATUS_COLORS[label]) return STATUS_COLORS[label];
  // generic series take the theme's own palette, falling back to PALETTE
  return cssVar(`--chart-${(index % 6) + 1}`, PALETTE[index % PALETTE.length]);
}

/** Reads a CSS variable from the active theme. */
export function cssVar(name: string, fallback = '#94a3b8'): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function themeColors() {
  return {
    text: cssVar('--text-dim'),
    faint: cssVar('--text-faint'),
    grid: cssVar('--border'),
    panel: cssVar('--panel-solid', '#111a2b'),
    border: cssVar('--border-strong'),
  };
}

function alpha(hex: string, amount: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return hex;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${amount})`;
}

export function hexAlpha(hex: string, amount: number): string {
  return alpha(hex, amount);
}

const baseTooltip = (theme: ReturnType<typeof themeColors>) => ({
  backgroundColor: theme.panel,
  titleColor: cssVar('--text'),
  bodyColor: theme.text,
  borderColor: theme.border,
  borderWidth: 1,
  padding: 11,
  cornerRadius: 9,
  displayColors: true,
  boxPadding: 4,
});

const baseLegend = (theme: ReturnType<typeof themeColors>) => ({
  labels: { color: theme.text, boxWidth: 11, boxHeight: 11, usePointStyle: true, pointStyle: 'circle' as const, padding: 14, font: { size: 11 } },
});

const scales = (theme: ReturnType<typeof themeColors>, opts: { yAxisTitle?: string; stacked?: boolean; beginAtZero?: boolean } = {}) => ({
  x: {
    stacked: !!opts.stacked,
    grid: { color: 'transparent', drawTicks: false },
    border: { color: theme.grid },
    ticks: { color: theme.faint, font: { size: 10.5 }, maxRotation: 45, minRotation: 0, autoSkip: true, maxTicksLimit: 18 },
  },
  y: {
    stacked: !!opts.stacked,
    beginAtZero: opts.beginAtZero !== false,
    grid: { color: theme.grid },
    border: { display: false },
    ticks: { color: theme.faint, font: { size: 10.5 }, maxTicksLimit: 7 },
    ...(opts.yAxisTitle ? { title: { display: true, text: opts.yAxisTitle, color: theme.faint, font: { size: 10.5 } } } : {}),
  },
});

export interface BuildOptions {
  type: 'bar' | 'line' | 'area' | 'donut' | 'pie' | 'scatter';
  labels?: string[];
  datasets: { label: string; data: number[] | { x: number; y: number }[]; fill?: boolean; borderDash?: number[] }[];
  stacked?: boolean;
  horizontal?: boolean;
  yAxisTitle?: string;
  axisTitles?: { x: string; y: string };
  legend?: boolean;
  percentStack?: boolean;
  /** Category names for a scatter plot whose X axis is categorical. */
  xLabels?: string[];
}

export function buildChartData(input: BuildOptions): ChartData<'bar' | 'line' | 'scatter'> {
  const isPie = input.type === 'donut' || input.type === 'pie';
  const isScatter = input.type === 'scatter';
  return {
    labels: input.labels as string[],
    datasets: input.datasets.map((ds, i) => {
      const color = seriesColor(ds.label, i);
      const pieColors = (input.labels || []).map((l, j) => seriesColor(l, j));
      if (isPie) {
        return {
          label: ds.label,
          data: ds.data as number[],
          backgroundColor: pieColors.map((c) => alpha(c, 0.86)),
          borderColor: pieColors,
          borderWidth: 2,
          hoverOffset: 8,
        } as never;
      }
      if (isScatter) {
        return {
          label: ds.label,
          data: ds.data as { x: number; y: number }[],
          backgroundColor: alpha(color, 0.62),
          borderColor: color,
          borderWidth: 1,
          pointRadius: 3.2,
          pointHoverRadius: 5.5,
        } as never;
      }
      const filled = input.type === 'area' || ds.fill;
      return {
        label: ds.label,
        data: ds.data as number[],
        backgroundColor: input.type === 'bar' ? alpha(color, 0.82) : alpha(color, filled ? 0.22 : 1),
        borderColor: color,
        borderWidth: input.type === 'bar' ? 0 : 2.2,
        borderRadius: input.type === 'bar' ? 6 : 0,
        borderSkipped: false,
        tension: 0.34,
        fill: filled ? 'origin' : false,
        pointRadius: input.type === 'bar' ? 0 : 2.4,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        borderDash: ds.borderDash,
        maxBarThickness: 42,
      } as never;
    }),
  };
}

export function buildChartOptions(input: BuildOptions): ChartOptions<'bar' | 'line' | 'scatter'> {
  const theme = themeColors();
  const isPie = input.type === 'donut' || input.type === 'pie';
  const isScatter = input.type === 'scatter';
  const showLegend = input.legend !== false && (isPie || input.datasets.length > 1);

  const options: ChartOptions<'bar' | 'line' | 'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 480 },
    interaction: { mode: isPie ? 'nearest' : 'index', intersect: false },
    layout: { padding: { top: 6, right: 8, bottom: 0, left: 0 } },
    plugins: {
      legend: {
        display: showLegend,
        position: isPie ? 'right' : 'top',
        align: 'start',
        ...baseLegend(theme),
      },
      tooltip: {
        ...baseTooltip(theme),
        ...(isScatter
          ? {
              callbacks: {
                label: (ctx) => {
                  const p = ctx.raw as { x: number; y: number };
                  const x = input.axisTitles?.x || 'x';
                  const y = input.axisTitles?.y || 'y';
                  return `${ctx.dataset.label}: ${x}=${p.x}, ${y}=${p.y}`;
                },
              },
            }
          : {}),
        ...(isPie
          ? {
              callbacks: {
                label: (ctx) => {
                  const values = (ctx.dataset.data as number[]) || [];
                  const total = values.reduce((a, b) => a + (Number(b) || 0), 0);
                  const v = Number(ctx.parsed) || 0;
                  const pct = total ? ((v / total) * 100).toFixed(1) : '0';
                  return ` ${ctx.label}: ${v.toLocaleString('en-IN')} (${pct}%)`;
                },
              },
            }
          : {}),
      },
      title: { display: false },
    },
  } as ChartOptions<'bar' | 'line' | 'scatter'>;

  if (isPie) {
    (options as ChartOptions<'doughnut'> & Record<string, unknown>).cutout = input.type === 'donut' ? '62%' : '0%';
    (options as Record<string, unknown>).scales = {};
    return options;
  }

  (options as Record<string, unknown>).scales = isScatter
    ? {
        x: {
          type: 'linear',
          grid: { color: theme.grid },
          border: { color: theme.grid },
          min: input.xLabels?.length ? -0.6 : undefined,
          max: input.xLabels?.length ? input.xLabels.length - 0.4 : undefined,
          ticks: {
            color: theme.faint,
            font: { size: 10.5 },
            ...(input.xLabels?.length
              ? {
                  stepSize: 1,
                  callback: (value: number | string) => {
                    const i = Math.round(Number(value));
                    return input.xLabels?.[i] ?? '';
                  },
                }
              : {}),
          },
          title: { display: true, text: input.axisTitles?.x || 'x', color: theme.faint, font: { size: 10.5 } },
        },
        y: {
          grid: { color: theme.grid },
          border: { display: false },
          ticks: { color: theme.faint, font: { size: 10.5 } },
          title: { display: true, text: input.axisTitles?.y || 'y', color: theme.faint, font: { size: 10.5 } },
        },
      }
    : scales(theme, {
        yAxisTitle: input.yAxisTitle,
        stacked: input.stacked,
      });

  if (input.horizontal) {
    (options as ChartOptions<'bar'>).indexAxis = 'y';
  }
  return options;
}
