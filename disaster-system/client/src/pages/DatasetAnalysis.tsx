import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import ChartCard from '../components/ChartCard';
import ChartView from '../components/ChartView';
import EmptyState from '../components/EmptyState';
import { get, post, type ChartPayload, type ChartSpec, type DatasetDetail, type DatasetInfo } from '../lib/api';
import { fmtNumber } from '../lib/format';

const CHART_TYPES = [
  { v: 'bar', l: 'Bar Chart' },
  { v: 'line', l: 'Line Chart' },
  { v: 'area', l: 'Area Chart' },
  { v: 'donut', l: 'Donut Chart' },
  { v: 'pie', l: 'Pie Chart' },
  { v: 'scatter', l: 'Scatter Plot' },
  { v: 'histogram', l: 'Histogram' },
  { v: 'heatmap', l: 'Heatmap' },
];

const METRICS = [
  { v: 'count', l: 'Count of rows' },
  { v: 'sum', l: 'Sum' },
  { v: 'avg', l: 'Average' },
  { v: 'median', l: 'Median' },
  { v: 'min', l: 'Minimum' },
  { v: 'max', l: 'Maximum' },
];

interface Spec {
  chartType: string;
  labelKey: string;
  valueKey: string;
  dateKey: string;
  xKey: string;
  yKey: string;
  colorKey: string;
  rowKey: string;
  colKey: string;
  metric: string;
  bucket: string;
  bins: number;
  limit: number;
}

const EMPTY_SPEC: Spec = {
  chartType: 'bar', labelKey: '', valueKey: '', dateKey: '', xKey: '', yKey: '', colorKey: '',
  rowKey: '', colKey: '', metric: 'count', bucket: 'month', bins: 12, limit: 15,
};

export default function DatasetAnalysis() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [datasetId, setDatasetId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [spec, setSpec] = useState<Spec>(EMPTY_SPEC);
  const [result, setResult] = useState<ChartPayload | null>(null);
  const [autoCharts, setAutoCharts] = useState<ChartPayload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<DatasetInfo[]>('/datasets')
      .then((list) => {
        setDatasets(list);
        setDatasetId((cur) => cur ?? (list[0]?.id ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!datasetId) { setDetail(null); setAutoCharts([]); setResult(null); return; }
    setError(null);
    get<DatasetDetail>(`/datasets/${datasetId}`).then((d) => {
      setDetail(d);
      const cols = d.profile.columns;
      const categorical = cols.find((c) => c.type === 'categorical');
      const numeric = cols.find((c) => c.type === 'numeric');
      const date = cols.find((c) => c.type === 'date');
      setSpec((s) => ({
        ...EMPTY_SPEC,
        ...s,
        labelKey: categorical?.name || cols[0]?.name || '',
        valueKey: numeric?.name || '',
        dateKey: date?.name || '',
        xKey: numeric?.name || '',
        yKey: cols.filter((c) => c.type === 'numeric')[1]?.name || numeric?.name || '',
        rowKey: categorical?.name || '',
        colKey: cols.filter((c) => c.type === 'categorical')[1]?.name || '',
      }));
    }).catch((e) => setError(e.message));
  }, [datasetId]);

  const runAuto = useCallback(async () => {
    if (!datasetId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ charts: ChartPayload[] }>(`/datasets/${datasetId}/auto`, {});
      setAutoCharts(res.charts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [datasetId]);

  const runSpec = useCallback(async () => {
    if (!datasetId) return;
    setBusy(true);
    setError(null);
    try {
      const payload: ChartSpec = {
        chartType: spec.chartType,
        metric: spec.metric,
        bucket: spec.bucket,
        bins: spec.bins,
        limit: spec.limit,
        labelKey: spec.labelKey || undefined,
        valueKey: spec.valueKey || undefined,
        dateKey: spec.dateKey || undefined,
        xKey: spec.xKey || undefined,
        yKey: spec.yKey || undefined,
        colorKey: spec.colorKey || undefined,
        rowKey: spec.rowKey || undefined,
        colKey: spec.colKey || undefined,
      };
      const res = await post<ChartPayload>(`/datasets/${datasetId}/analyze`, payload);
      setResult({ ...res, id: 'custom', title: describe(spec, detail) } as ChartPayload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [datasetId, detail, spec]);

  const applySuggestion = useCallback((s: ChartSpec) => {
    setSpec((prev) => ({
      ...prev,
      chartType: s.chartType,
      labelKey: s.labelKey || prev.labelKey,
      valueKey: s.valueKey || '',
      dateKey: s.dateKey || prev.dateKey,
      xKey: s.xKey || prev.xKey,
      yKey: s.yKey || prev.yKey,
      colorKey: s.colorKey || '',
      rowKey: s.rowKey || prev.rowKey,
      colKey: s.colKey || prev.colKey,
      metric: s.metric || 'count',
      bucket: s.bucket || 'month',
      bins: s.bins || 12,
    }));
  }, []);

  const columns = detail?.profile.columns || [];
  const categorical = useMemo(() => columns.filter((c) => c.type === 'categorical' || c.type === 'boolean'), [columns]);
  const numeric = useMemo(() => columns.filter((c) => c.type === 'numeric'), [columns]);
  const dates = useMemo(() => columns.filter((c) => c.type === 'date'), [columns]);

  const needsLabel = ['bar', 'donut', 'pie'].includes(spec.chartType);
  const needsDate = ['line', 'area'].includes(spec.chartType);
  const needsXY = spec.chartType === 'scatter';
  const needsValue = spec.metric !== 'count' && !needsXY && spec.chartType !== 'heatmap';

  return (
    <Layout title="Dataset Analysis" subtitle="Pick a dataset → column → chart type and generate any visualisation">
      {!datasets.length ? (
        <EmptyState
          glyph="🗂️"
          title="No datasets to analyse"
          message="Upload a CSV, XLSX or JSON file in Dataset Management first — analysis is always computed from uploaded data."
        />
      ) : null}

      {error ? <div className="notice err"><span>⚠️</span><div>{error}</div></div> : null}

      <section className="panel">
        <header className="panel-head">
          <div className="grow">
            <h2>Chart builder</h2>
            <p>Aggregation runs on the server against the stored rows of the selected dataset.</p>
          </div>
          {detail ? <span className="chip">{fmtNumber(detail.row_count)} rows</span> : null}
        </header>
        <div className="panel-body">
          <div className="row">
            <div className="field">
              <label htmlFor="ds">Dataset</label>
              <select id="ds" value={datasetId ?? ''} onChange={(e) => setDatasetId(Number(e.target.value))}>
                {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({fmtNumber(d.row_count)} rows)</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ct">Chart type</label>
              <select id="ct" value={spec.chartType} onChange={(e) => setSpec((s) => ({ ...s, chartType: e.target.value }))}>
                {CHART_TYPES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>

            {needsLabel ? (
              <div className="field">
                <label htmlFor="lk">Category column</label>
                <select id="lk" value={spec.labelKey} onChange={(e) => setSpec((s) => ({ ...s, labelKey: e.target.value }))}>
                  <option value="">— select —</option>
                  {columns.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                </select>
              </div>
            ) : null}

            {needsDate ? (
              <div className="field">
                <label htmlFor="dk">Date column</label>
                <select id="dk" value={spec.dateKey} onChange={(e) => setSpec((s) => ({ ...s, dateKey: e.target.value }))}>
                  <option value="">— select —</option>
                  {(dates.length ? dates : columns).map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
                </select>
              </div>
            ) : null}

            {needsXY ? (
              <>
                <div className="field">
                  <label htmlFor="xk">X (numeric)</label>
                  <select id="xk" value={spec.xKey} onChange={(e) => setSpec((s) => ({ ...s, xKey: e.target.value }))}>
                    <option value="">— select —</option>
                    {(numeric.length ? numeric : columns).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="yk">Y (numeric)</label>
                  <select id="yk" value={spec.yKey} onChange={(e) => setSpec((s) => ({ ...s, yKey: e.target.value }))}>
                    <option value="">— select —</option>
                    {(numeric.length ? numeric : columns).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ck">Colour by</label>
                  <select id="ck" value={spec.colorKey} onChange={(e) => setSpec((s) => ({ ...s, colorKey: e.target.value }))}>
                    <option value="">— none —</option>
                    {categorical.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </>
            ) : null}

            {spec.chartType === 'histogram' ? (
              <>
                <div className="field">
                  <label htmlFor="vk-h">Numeric column</label>
                  <select id="vk-h" value={spec.valueKey} onChange={(e) => setSpec((s) => ({ ...s, valueKey: e.target.value }))}>
                    <option value="">— select —</option>
                    {(numeric.length ? numeric : columns).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="bins">Bins</label>
                  <input id="bins" type="number" min={2} max={40} value={spec.bins} onChange={(e) => setSpec((s) => ({ ...s, bins: Number(e.target.value) }))} />
                </div>
              </>
            ) : null}

            {spec.chartType === 'heatmap' ? (
              <>
                <div className="field">
                  <label htmlFor="rk">Row category</label>
                  <select id="rk" value={spec.rowKey} onChange={(e) => setSpec((s) => ({ ...s, rowKey: e.target.value }))}>
                    <option value="">— select —</option>
                    {categorical.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ck2">Column category</label>
                  <select id="ck2" value={spec.colKey} onChange={(e) => setSpec((s) => ({ ...s, colKey: e.target.value }))}>
                    <option value="">— select —</option>
                    {categorical.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </>
            ) : null}

            {!needsXY && spec.chartType !== 'histogram' ? (
              <div className="field">
                <label htmlFor="metric">Metric</label>
                <select id="metric" value={spec.metric} onChange={(e) => setSpec((s) => ({ ...s, metric: e.target.value }))}>
                  {METRICS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
              </div>
            ) : null}

            {needsValue ? (
              <div className="field">
                <label htmlFor="vk">Measure column</label>
                <select id="vk" value={spec.valueKey} onChange={(e) => setSpec((s) => ({ ...s, valueKey: e.target.value }))}>
                  <option value="">— none —</option>
                  {(numeric.length ? numeric : columns).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            ) : null}

            {needsDate || spec.chartType === 'heatmap' ? (
              <div className="field">
                <label htmlFor="bucket">Time bucket</label>
                <select id="bucket" value={spec.bucket} onChange={(e) => setSpec((s) => ({ ...s, bucket: e.target.value }))}>
                  {['day', 'week', 'month', 'quarter', 'year'].map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            ) : null}

            {needsLabel ? (
              <div className="field">
                <label htmlFor="limit">Top N</label>
                <input id="limit" type="number" min={3} max={100} value={spec.limit} onChange={(e) => setSpec((s) => ({ ...s, limit: Number(e.target.value) }))} />
              </div>
            ) : null}

            <button className="btn primary" onClick={() => void runSpec()} disabled={busy || !datasetId}>
              {busy ? 'Computing…' : 'Generate chart'}
            </button>
            <button className="btn ghost" onClick={() => void runAuto()} disabled={busy || !datasetId}>
              ✨ Auto-generate all charts
            </button>
          </div>
        </div>
      </section>

      {result ? (
        <section className="panel chart-card">
          <header className="panel-head">
            <div className="grow">
              <div className="chart-title">{result.title}</div>
              <div className="chart-sub">
                {spec.chartType} · metric {spec.metric}
                {spec.labelKey ? ` · ${spec.labelKey}` : ''}
                {spec.valueKey ? ` · ${spec.valueKey}` : ''}
                {spec.dateKey ? ` · ${spec.dateKey}` : ''}
                {spec.xKey ? ` · ${spec.xKey} vs ${spec.yKey}` : ''}
              </div>
            </div>
          </header>
          <div className="chart-body">
            <ChartView chart={result} height={400} />
          </div>
        </section>
      ) : null}

      {detail?.suggestions?.length ? (
        <section className="panel">
          <header className="panel-head">
            <div className="grow">
              <h2>Suggested visualisations</h2>
              <p>Derived from the detected column types of “{detail.name}”. Click to load into the builder.</p>
            </div>
          </header>
          <div className="panel-body">
            <div className="btn-row">
              {detail.suggestions.map((s, i) => (
                <button key={i} className="btn ghost" onClick={() => applySuggestion(s)} title={s.reason}>
                  {s.title}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {autoCharts.length ? (
        <div className="chart-grid">
          {autoCharts.map((c) => (
            <ChartCard key={c.id} chart={c} span={c.type === 'heatmap' || c.type === 'scatter' ? 6 : 4} height={270} subtitle={c.emptyReason} />
          ))}
        </div>
      ) : null}
    </Layout>
  );
}

function describe(spec: Spec, detail: DatasetDetail | null): string {
  const name = detail?.name || 'Dataset';
  switch (spec.chartType) {
    case 'scatter': return `${spec.yKey} vs ${spec.xKey} — ${name}`;
    case 'histogram': return `Distribution of ${spec.valueKey} — ${name}`;
    case 'heatmap': return `${spec.rowKey} × ${spec.colKey} — ${name}`;
    case 'line':
    case 'area': return `${spec.metric} by ${spec.dateKey} (${spec.bucket}) — ${name}`;
    default: return `${spec.metric === 'count' ? 'Count' : `${spec.metric} of ${spec.valueKey}`} by ${spec.labelKey} — ${name}`;
  }
}
