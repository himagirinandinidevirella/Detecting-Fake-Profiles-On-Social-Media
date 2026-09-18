import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import KpiCard from '../components/KpiCard';
import ChartCard from '../components/ChartCard';
import EmptyState from '../components/EmptyState';
import { del, get, post, uploadDataset, type ApplyResult, type ChartPayload, type DatasetDetail, type DatasetInfo, type Kpi } from '../lib/api';
import { fmtDateTime, fmtNumber } from '../lib/format';

const SAMPLES = [
  { file: 'disasters_2024.csv', label: 'Disasters 2024 (CSV)' },
  { file: 'disasters_2025.csv', label: 'Disasters 2025 (CSV)' },
  { file: 'sos_requests.csv', label: 'SOS requests (CSV)' },
  { file: 'donations.csv', label: 'Donations (CSV)' },
];

const MODULES = [
  { id: 'disasters', label: 'Disaster Management' },
  { id: 'alerts', label: 'Disaster Alerts' },
  { id: 'sos_requests', label: 'SOS Requests' },
  { id: 'relief_camps', label: 'Relief Camps' },
  { id: 'volunteers', label: 'Volunteers' },
  { id: 'donations', label: 'Donations' },
  { id: 'helpline_calls', label: 'Emergency Helplines' },
];

/** Profile-derived charts (rows, columns, missing values) for one dataset. */
function profileCharts(detail: DatasetDetail): ChartPayload[] {
  const cols = detail.profile?.columns || [];
  if (!cols.length) return [];
  const typeCounts = cols.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {});
  const sorted = [...cols].sort((a, b) => b.missing - a.missing).slice(0, 20);
  return [
    {
      id: 'col_types',
      title: 'Detected Column Types',
      type: 'donut',
      labels: Object.keys(typeCounts),
      datasets: [{ label: 'Columns', data: Object.values(typeCounts) }],
      empty: false,
    },
    {
      id: 'missing_values',
      title: 'Missing Values by Column',
      type: 'bar',
      labels: sorted.map((c) => c.name),
      datasets: [{ label: 'Missing cells', data: sorted.map((c) => c.missing) }],
      horizontal: true,
      yAxisTitle: 'cells',
      empty: cols.every((c) => c.missing === 0),
      emptyReason: 'This dataset has no missing values in any column.',
    },
    {
      id: 'distinct_values',
      title: 'Distinct Values by Column',
      type: 'bar',
      labels: [...cols].sort((a, b) => b.distinct - a.distinct).slice(0, 20).map((c) => c.name),
      datasets: [{ label: 'Distinct values', data: [...cols].sort((a, b) => b.distinct - a.distinct).slice(0, 20).map((c) => c.distinct) }],
      yAxisTitle: 'values',
      empty: false,
    },
    {
      id: 'top_values',
      title: 'Top Values — Most Frequent Category',
      type: 'bar',
      labels: (cols.find((c) => c.topValues?.length)?.topValues || []).map((t) => t.value),
      datasets: [{ label: 'Rows', data: (cols.find((c) => c.topValues?.length)?.topValues || []).map((t) => t.count) }],
      horizontal: true,
      empty: !cols.some((c) => c.topValues?.length),
      emptyReason: 'No categorical column with value counts detected.',
    },
  ];
}

export default function DatasetManagement() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [apply, setApply] = useState({ target: 'disasters', mode: 'append' });
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);
  const [status, setStatus] = useState<{ tables: Record<string, number>; database: string; path: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const [list, meta] = await Promise.all([
      get<DatasetInfo[]>('/datasets'),
      get<{ tables: Record<string, number>; database: string; path: string }>('/meta/status'),
    ]);
    setDatasets(list);
    setStatus(meta);
    setSelected((cur) => cur ?? (list[0]?.id ?? null));
  }, []);

  useEffect(() => {
    refresh().catch((e) => setMessage({ kind: 'err', text: e.message }));
  }, [refresh]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    setApplyResult(null);
    get<DatasetDetail>(`/datasets/${selected}`)
      .then(setDetail)
      .catch((e) => setMessage({ kind: 'err', text: e.message }));
  }, [selected]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('upload');
    setMessage(null);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadDataset(file);
        setMessage({ kind: 'ok', text: `Uploaded “${res.name}” — ${fmtNumber(res.rowCount)} rows, ${fmtNumber(res.columnCount)} columns detected and profiled.` });
        setSelected(res.id);
      }
      await refresh();
    } catch (err) {
      setMessage({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [refresh]);

  const remove = useCallback(async (id: number) => {
    setBusy('delete');
    try {
      await del(`/datasets/${id}`);
      setMessage({ kind: 'info', text: `Dataset ${id} deleted.` });
      if (selected === id) setSelected(null);
      await refresh();
    } catch (err) {
      setMessage({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }, [refresh, selected]);

  const applyToModule = useCallback(async () => {
    if (!selected) return;
    setBusy('apply');
    setMessage(null);
    try {
      const res = await post<ApplyResult>(`/datasets/${selected}/apply`, apply);
      setApplyResult(res);
      setMessage({
        kind: 'ok',
        text: `Loaded ${fmtNumber(res.inserted)} rows into ${res.target} (${res.mode}). Every chart on that page now reflects this dataset.`,
      });
      await refresh();
    } catch (err) {
      setMessage({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }, [apply, refresh, selected]);

  const reseed = useCallback(async () => {
    setBusy('reseed');
    try {
      const res = await post<{ reseeded: Record<string, number> }>('/meta/reseed', {});
      setMessage({ kind: 'ok', text: `Demo dataset rebuilt: ${fmtNumber(res.reseeded.disasters)} disasters, ${fmtNumber(res.reseeded.sos_requests)} SOS requests.` });
      await refresh();
    } catch (err) {
      setMessage({ kind: 'err', text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const kpis = useMemo<Kpi[]>(() => {
    const rows = datasets.reduce((s, d) => s + d.row_count, 0);
    const cols = datasets.reduce((s, d) => s + d.column_count, 0);
    const missing = datasets.reduce((s, d) => s + d.missing, 0);
    return [
      { id: 'n', label: 'Datasets Uploaded', value: datasets.length, icon: 'box', hint: 'CSV · XLSX · JSON' },
      { id: 'rows', label: 'Total Rows', value: rows, format: 'compact', icon: 'people' },
      { id: 'cols', label: 'Total Columns', value: cols, icon: 'gauge' },
      { id: 'missing', label: 'Missing Values', value: missing, icon: 'alert', tone: missing ? 'warning' : 'success', hint: missing ? 'cells without a value' : 'no gaps detected' },
      {
        id: 'active',
        label: 'Applied to Module',
        value: datasets.filter((d) => d.applied_to).length,
        icon: 'flag',
        hint: 'datasets driving module charts',
      },
    ];
  }, [datasets]);

  const charts = detail ? profileCharts(detail) : [];

  return (
    <Layout title="Dataset Management" subtitle="Upload CSV / XLSX / JSON, inspect the detected schema, then push it into any module">
      <div className="kpi-grid">
        {kpis.map((k) => <KpiCard key={k.id} kpi={k} />)}
      </div>

      {message ? (
        <div className={`notice ${message.kind === 'err' ? 'err' : message.kind === 'ok' ? '' : 'warn'}`}>
          <span>{message.kind === 'err' ? '⚠️' : message.kind === 'ok' ? '✅' : 'ℹ️'}</span>
          <div>{message.text}</div>
        </div>
      ) : null}

      <section className="panel">
        <header className="panel-head">
          <div className="grow">
            <h2>Upload a dataset</h2>
            <p>Rows, columns, numeric / categorical / date fields and missing values are detected automatically, then visualisations are generated.</p>
          </div>
          <div className="btn-row">
            {SAMPLES.map((s) => (
              <a key={s.file} className="btn ghost" href={`/samples/${s.file}`} download>{s.label}</a>
            ))}
          </div>
        </header>
        <div className="panel-body">
          <div
            className={`dropzone ${dragging ? 'over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
          >
            <div className="glyph" aria-hidden>🗂️</div>
            <b>{busy === 'upload' ? 'Reading and profiling your file…' : 'Drop a CSV, XLSX or JSON file here'}</b>
            <span>or click to browse · up to 40 MB · up to 60,000 rows are profiled</span>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.json,text/csv,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <header className="panel-head">
          <div className="grow">
            <h2>Datasets</h2>
            <p>Select one to inspect its profile, generate charts, or load it into a module.</p>
          </div>
          <span className="chip">{datasets.length} stored</span>
        </header>
        <div className="panel-body">
          {datasets.length ? (
            <div className="chart-grid">
              {datasets.map((d) => (
                <div key={d.id} className={`panel dataset-card span-${selected === d.id ? 12 : 6}`}>
                  <div className="row">
                    <div className="grow">
                      <h3>{d.name}</h3>
                      <div className="hint">{d.filename} · {d.format.toUpperCase()} · {fmtDateTime(d.uploaded_at)}</div>
                    </div>
                    <button className={`btn ${selected === d.id ? 'primary' : 'ghost'}`} onClick={() => setSelected(d.id)}>
                      {selected === d.id ? 'Selected' : 'Inspect'}
                    </button>
                    <button className="btn ghost" onClick={() => void remove(d.id)} disabled={busy === 'delete'}>Delete</button>
                  </div>
                  <div className="dataset-meta">
                    <span className="chip">{fmtNumber(d.row_count)} rows</span>
                    <span className="chip">{d.column_count} columns</span>
                    <span className="chip">{d.numeric.length} numeric</span>
                    <span className="chip">{d.categorical.length} categorical</span>
                    <span className="chip">{d.date.length} date</span>
                    <span className="chip">{fmtNumber(d.missing)} missing</span>
                    {d.applied_to ? <span className="chip live">loaded into {d.applied_to}</span> : null}
                  </div>
                  <div className="col-list">
                    {d.numeric.map((c) => <span key={c} className="col-tag numeric">#{c}</span>)}
                    {d.date.map((c) => <span key={c} className="col-tag date">📅 {c}</span>)}
                    {d.categorical.map((c) => <span key={c} className="col-tag categorical">{c}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              glyph="📤"
              title="No datasets uploaded yet"
              message="Upload a CSV, XLSX or JSON file — or download one of the sample datasets above — and its profile plus visualisations appear here."
            />
          )}
        </div>
      </section>

      {detail ? (
        <>
          <section className="panel">
            <header className="panel-head">
              <div className="grow">
                <h2>Auto-detected profile — {detail.name}</h2>
                <p>{fmtNumber(detail.row_count)} rows · {detail.column_count} columns · generated from the uploaded rows only</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="chart-grid">
                {charts.map((c) => (
                  <ChartCard key={c.id} chart={c} span={c.id === 'missing_values' ? 6 : 6} height={280} />
                ))}
              </div>

              <h3 style={{ fontSize: 13.5, margin: '18px 0 8px' }}>Column details</h3>
              <div className="table-scroll">
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Column</th><th>Type</th><th>Rows</th><th>Missing</th><th>Missing %</th><th>Distinct</th><th>Min / earliest</th><th>Max / latest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.profile.columns.map((c) => (
                      <tr key={c.name}>
                        <td style={{ color: 'var(--text)' }}>{c.name}</td>
                        <td>{c.type}</td>
                        <td>{fmtNumber(c.count)}</td>
                        <td>{fmtNumber(c.missing)}</td>
                        <td>{c.missingPct}%</td>
                        <td>{fmtNumber(c.distinct)}</td>
                        <td>{c.stats?.min !== undefined ? String(c.stats.min) : '—'}</td>
                        <td>{c.stats?.max !== undefined ? String(c.stats.max) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="panel">
            <header className="panel-head">
              <div className="grow">
                <h2>Load this dataset into a module</h2>
                <p>Columns are matched automatically; every chart on the target page then re-aggregates from these rows.</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="row">
                <div className="field">
                  <label htmlFor="apply-target">Target module</label>
                  <select id="apply-target" value={apply.target} onChange={(e) => setApply((a) => ({ ...a, target: e.target.value }))}>
                    {MODULES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="apply-mode">Load mode</label>
                  <select id="apply-mode" value={apply.mode} onChange={(e) => setApply((a) => ({ ...a, mode: e.target.value }))}>
                    <option value="append">Append (keep existing records)</option>
                    <option value="replace">Replace (empty the module first)</option>
                  </select>
                </div>
                <button className="btn primary" onClick={() => void applyToModule()} disabled={busy === 'apply'}>
                  {busy === 'apply' ? 'Loading…' : 'Load into module'}
                </button>
              </div>

              {applyResult ? (
                <div style={{ marginTop: 14 }}>
                  <div className="dataset-meta" style={{ marginBottom: 10 }}>
                    <span className="chip">{applyResult.mode}</span>
                    <span className="chip">{fmtNumber(applyResult.removed)} previous rows removed</span>
                    <span className="chip live">{fmtNumber(applyResult.inserted)} rows loaded</span>
                    <span className="chip">date column: {applyResult.dateColumn || 'none — import date used'}</span>
                    {applyResult.undated ? <span className="chip">{applyResult.undated} rows without a date</span> : null}
                  </div>
                  {applyResult.note ? <div className="notice warn"><span>ℹ️</span><div>{applyResult.note}</div></div> : null}
                  <div className="table-scroll" style={{ marginTop: 10 }}>
                    <table className="mini-table">
                      <thead><tr><th>Module field</th><th>Dataset column</th></tr></thead>
                      <tbody>
                        {Object.entries(applyResult.mapping).map(([field, col]) => (
                          <tr key={field}><td style={{ color: 'var(--text)' }}>{field}</td><td>{col}</td></tr>
                        ))}
                        {applyResult.unmatchedColumns.map((col) => (
                          <tr key={col}><td style={{ color: 'var(--text-faint)' }}>— not mapped —</td><td>{col}</td></tr>
                        ))}
                        {Object.entries(applyResult.defaultsUsed).map(([field, n]) => (
                          <tr key={field}><td style={{ color: 'var(--text-faint)' }}>{field} (placeholder used)</td><td>{fmtNumber(n)} rows</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      <section className="panel">
        <header className="panel-head">
          <div className="grow">
            <h2>Database contents</h2>
            <p>Every chart in this app aggregates from these tables. Clearing one shows the real “No data available” state.</p>
          </div>
          <button className="btn ghost" onClick={() => void reseed()} disabled={busy === 'reseed'}>↺ Rebuild demo dataset</button>
        </header>
        <div className="panel-body">
          {status ? (
            <>
              <div className="dataset-meta">
                {Object.entries(status.tables).map(([table, count]) => (
                  <span key={table} className={`chip ${count ? 'live' : ''}`}>{table}: {fmtNumber(count)}</span>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 10 }}>{status.database} · {status.path}</div>
            </>
          ) : <div className="skeleton" style={{ height: 40 }} />}
        </div>
      </section>
    </Layout>
  );
}
