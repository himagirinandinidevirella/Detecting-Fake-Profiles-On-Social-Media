import { useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ChartCard from '../components/ChartCard';
import EmptyState from '../components/EmptyState';
import { get, post, type CompareResult, type DatasetInfo } from '../lib/api';
import { hexAlpha, PALETTE } from '../lib/charts';
import { fmtCompact, fmtNumber } from '../lib/format';

/** Bar pair used inside each KPI comparison card. */
function Pair({ a, b, nameA, nameB, max }: { a: number; b: number; nameA: string; nameB: string; max: number }) {
  const width = (v: number) => `${max ? Math.max(3, (v / max) * 100) : 0}%`;
  return (
    <div className="compare-bars">
      <div className="compare-bar">
        <span title={nameA}>{nameA.slice(0, 5)}</span>
        <div className="track"><div className="fill" style={{ width: width(a), background: hexAlpha(PALETTE[0], 0.85) }} /></div>
      </div>
      <div className="compare-bar">
        <span title={nameB}>{nameB.slice(0, 5)}</span>
        <div className="track"><div className="fill" style={{ width: width(b), background: hexAlpha(PALETTE[1], 0.85) }} /></div>
      </div>
    </div>
  );
}

export default function DatasetComparison() {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [a, setA] = useState<number | ''>('');
  const [b, setB] = useState<number | ''>('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    get<DatasetInfo[]>('/datasets')
      .then((list) => {
        setDatasets(list);
        setA((cur) => cur || (list[0]?.id ?? ''));
        setB((cur) => cur || (list[1]?.id ?? ''));
      })
      .catch((e) => setError(e.message));
  }, []);

  const compare = useCallback(async () => {
    if (!a || !b) { setError('Select two datasets to compare.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await post<CompareResult>('/datasets/compare', { a, b });
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [a, b]);

  useEffect(() => {
    if (a && b) void compare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b]);

  const nameA = datasets.find((d) => d.id === a)?.name || 'Dataset A';
  const nameB = datasets.find((d) => d.id === b)?.name || 'Dataset B';

  return (
    <Layout title="Dataset Comparison" subtitle="Two datasets side by side — every difference expressed as a chart">
      <section className="panel">
        <header className="panel-head">
          <div className="grow">
            <h2>Select datasets</h2>
            <p>Comparison metrics are computed from the rows of each dataset at request time (e.g. 2024 dataset vs 2025 dataset).</p>
          </div>
          <button className="btn primary" onClick={() => void compare()} disabled={busy || !a || !b}>
            {busy ? 'Comparing…' : 'Compare datasets'}
          </button>
        </header>
        <div className="panel-body">
          {datasets.length < 2 ? (
            <EmptyState
              glyph="⚖️"
              title="Two datasets required"
              message="Upload at least two datasets (for example disasters_2024.csv and disasters_2025.csv) in Dataset Management to compare them."
            />
          ) : (
            <div className="row">
              <div className="field">
                <label htmlFor="a">Dataset A</label>
                <select id="a" value={a} onChange={(e) => setA(Number(e.target.value))}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({fmtNumber(d.row_count)} rows)</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="b">Dataset B</label>
                <select id="b" value={b} onChange={(e) => setB(Number(e.target.value))}>
                  {datasets.map((d) => <option key={d.id} value={d.id}>{d.name} ({fmtNumber(d.row_count)} rows)</option>)}
                </select>
              </div>
              {result ? (
                <div className="dataset-meta">
                  <span className="chip">{result.sharedColumns.length} shared columns</span>
                  <span className="chip">{result.charts.length} comparison charts</span>
                  <span className="chip">{result.kpis.length} KPI comparisons</span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {error ? <div className="notice err"><span>⚠️</span><div>{error}</div></div> : null}

      {result ? (
        <>
          <section className="panel">
            <header className="panel-head">
              <div className="grow">
                <h2>KPI comparison — {nameA} vs {nameB}</h2>
                <p>Sum for numeric columns, record count for categorical and date columns.</p>
              </div>
              <span className="chip">{nameA}: {fmtNumber(result.a.rows)} rows</span>
              <span className="chip">{nameB}: {fmtNumber(result.b.rows)} rows</span>
            </header>
            <div className="panel-body">
              <div className="kpi-grid">
                {result.kpis.map((k) => {
                  const max = Math.max(Math.abs(k.a), Math.abs(k.b), 1);
                  return (
                    <div className="compare-kpi" key={k.id}>
                      <div className="label">{k.label}</div>
                      <div className="vals">
                        <b>{fmtCompact(k.a)}</b>
                        <span style={{ color: 'var(--text-faint)' }}>vs</span>
                        <b>{fmtCompact(k.b)}</b>
                        <span className={`delta ${k.direction}`}>
                          {k.direction === 'up' ? '▲' : k.direction === 'down' ? '▼' : '■'} {fmtCompact(Math.abs(k.delta))} ({k.pct}%)
                        </span>
                      </div>
                      <Pair a={Math.abs(k.a)} b={Math.abs(k.b)} nameA={nameA} nameB={nameB} max={max} />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="chart-grid">
            {result.charts.map((c) => {
              const span = c.type === 'heatmap' ? 6 : c.type === 'donut' ? 4 : c.type === 'scatter' ? 6 : 6;
              return <ChartCard key={c.id} chart={c} span={span} height={c.type === 'donut' ? 260 : 300} />;
            })}
          </div>

          <div className="notice">
            <span>⚖️</span>
            <div>
              Compared <b>{nameA}</b> ({fmtNumber(result.a.rows)} rows, {result.a.columns} columns) against
              <b> {nameB}</b> ({fmtNumber(result.b.rows)} rows, {result.b.columns} columns) using the
              {' '}{result.sharedColumns.length} columns they share: {result.sharedColumns.join(', ')}.
            </div>
          </div>
        </>
      ) : null}
    </Layout>
  );
}
