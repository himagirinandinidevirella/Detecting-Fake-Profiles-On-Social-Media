/**
 * End-to-end verification of the Natural Disaster Management System API.
 *
 * `npm run verify` starts the server if it is not already running, then walks the
 * whole data pipeline: seeded database → module analytics → filters → dataset
 * upload → profiling → analysis → comparison → applying a dataset to a module →
 * the "No data available" path. Exits non-zero on the first failed assertion.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:4000';

let failures = 0;
let checks = 0;

function ok(condition, label, extra = '') {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}${extra ? ` — ${extra}` : ''}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function json(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, options);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`${url} → ${res.status} ${body?.error || ''}`);
  return body;
}

async function health() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function upload(file, name) {
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  if (name) form.append('name', name);
  const res = await fetch(`${BASE}/api/datasets/upload`, { method: 'POST', body: form });
  const body = await res.json();
  if (!res.ok) throw new Error(`upload failed: ${body.error}`);
  return body;
}

async function main() {
  let child = null;
  if (!(await health())) {
    console.log('Server not running — starting it…');
    child = spawn(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 40 && !(await health()); i++) await new Promise((r) => setTimeout(r, 250));
  }
  if (!(await health())) throw new Error('Could not reach the API on ' + BASE);

  /* -------------------------------------------------- 1. health + seed */
  section('1. Database health');
  const status = await json('/api/meta/status');
  ok(status.database.includes('SQLite'), 'SQLite database reachable', status.path);
  ok(status.tables.disasters > 0, 'disasters table populated', `${status.tables.disasters} rows`);
  ok(status.tables.sos_requests > 0, 'sos_requests table populated', `${status.tables.sos_requests} rows`);
  ok(status.tables.relief_camps > 0, 'relief_camps table populated', `${status.tables.relief_camps} rows`);

  /* -------------------------------------------------- 2. every module */
  section('2. Module analytics (KPIs + charts)');
  const modules = ['dashboard', 'disasters', 'alerts', 'sos', 'camps', 'volunteers', 'donations', 'helplines', 'safety', 'map'];
  const payloads = {};
  for (const m of modules) {
    const data = await json(`/api/analytics/${m}`);
    payloads[m] = data;
    const kpisWithValue = (data.kpis || []).filter((k) => k.value !== null && k.value !== 0);
    const chartsWithData = (data.charts || []).filter((c) => !c.empty);
    ok(kpisWithValue.length > 0, `${m}: KPI cards have values`, `${kpisWithValue.length}/${(data.kpis || []).length}`);
    ok(
      chartsWithData.length === (data.charts || []).length,
      `${m}: all charts have data`,
      `${chartsWithData.length}/${(data.charts || []).length} non-empty`,
    );
  }

  section('3. Dashboard requirements');
  const dash = payloads.dashboard;
  const dashIds = dash.charts.map((c) => c.id);
  for (const required of ['disaster_trend', 'disaster_types', 'severity_donut', 'affected_trend']) {
    ok(dashIds.includes(required), `dashboard chart present: ${required}`);
  }
  ok(dash.charts.find((c) => c.id === 'disaster_trend').type === 'line', 'disaster trend is a line chart');
  ok(dash.charts.find((c) => c.id === 'severity_donut').type === 'donut', 'severity mix is a donut chart');
  const dashKpiIds = dash.kpis.map((k) => k.id);
  for (const required of ['total_disasters', 'active_disasters', 'affected_population', 'sos_requests']) {
    ok(dashKpiIds.includes(required), `dashboard KPI present: ${required}`);
  }
  ok(payloads.map.points.length > 0, 'map returns geo-located disasters', `${payloads.map.points.length} points`);
  ok(payloads.map.charts.some((c) => c.type === 'heatmap'), 'map includes a density visualisation');

  /* -------------------------------------------------- 4. filters */
  section('4. Filters change the aggregations');
  const allTypes = await json('/api/analytics/disasters');
  const floods = await json('/api/analytics/disasters?type=Flood');
  ok(floods.meta.matched < allTypes.meta.matched, 'type filter narrows the result', `${floods.meta.matched} vs ${allTypes.meta.matched}`);
  const typeBar = floods.charts.find((c) => c.id === 'type_bar');
  ok(typeBar.labels.every((l) => l === 'Flood'), 'type filter reflected in the chart labels', typeBar.labels.join('/'));

  const narrow = await json('/api/analytics/disasters?from=2025-06-01&to=2025-06-30');
  ok(narrow.meta.matched < allTypes.meta.matched, 'date range narrows the result', `${narrow.meta.matched} events in June 2025`);
  ok(narrow.meta.bucket === 'day', 'short ranges switch to daily buckets', narrow.meta.bucket);

  const south = await json('/api/analytics/sos?region=South%20India');
  const regionChart = south.charts.find((c) => c.id === 'priority_by_region');
  ok(regionChart.labels.every((l) => l === 'South India'), 'region filter reflected in charts', regionChart.labels.join('/'));

  const empty = await json('/api/analytics/disasters?from=1999-01-01&to=1999-12-31');
  ok(empty.charts.every((c) => c.empty), 'empty range flags every chart as empty', `${empty.charts.length} charts`);
  ok(empty.charts[0].emptyReason.length > 0, 'empty charts carry a reason', empty.charts[0].emptyReason);

  /* -------------------------------------------------- 5. upload + profile */
  section('5. Dataset upload and automatic profiling');
  const samples = path.join(ROOT, 'client', 'public', 'samples');
  const a = await upload(path.join(samples, 'disasters_2024.csv'), 'Disasters 2024');
  const b = await upload(path.join(samples, 'disasters_2025.csv'), 'Disasters 2025');
  ok(a.rowCount === 260, 'CSV rows parsed', `${a.rowCount} rows`);
  const byName = Object.fromEntries(a.profile.columns.map((c) => [c.name, c]));
  ok(byName.Date?.type === 'date', 'date column detected', `min ${byName.Date?.stats?.min}`);
  ok(byName.Affected_People?.type === 'numeric', 'numeric column detected', `sum ${byName.Affected_People?.stats?.sum}`);
  ok(byName.Disaster?.type === 'categorical', 'categorical column detected', `${byName.Disaster?.distinct} categories`);
  ok(a.profile.columns.every((c) => c.missing >= 0), 'missing values computed', `${a.profile.columns.reduce((s, c) => s + c.missing, 0)} missing cells`);
  ok(a.suggestions.length > 5, 'automatic chart suggestions generated', `${a.suggestions.length} suggestions`);

  /* -------------------------------------------------- 6. analysis */
  section('6. Dataset analysis — every chart type');
  const specs = [
    { chartType: 'bar', labelKey: 'Disaster', metric: 'count' },
    { chartType: 'line', dateKey: 'Date', metric: 'count', bucket: 'month' },
    { chartType: 'area', dateKey: 'Date', metric: 'sum', valueKey: 'Affected_People', bucket: 'month' },
    { chartType: 'donut', labelKey: 'Severity', metric: 'sum', valueKey: 'Affected_People' },
    { chartType: 'pie', labelKey: 'Region', metric: 'count' },
    { chartType: 'scatter', xKey: 'Affected_People', yKey: 'Casualties', colorKey: 'Severity' },
    { chartType: 'histogram', valueKey: 'Affected_People', bins: 10 },
    { chartType: 'heatmap', rowKey: 'Region', colKey: 'Severity', metric: 'count' },
    { chartType: 'scatter', xKey: 'Severity', yKey: 'Affected_People' },
  ];
  for (const spec of specs) {
    const res = await json(`/api/datasets/${a.id}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spec),
    });
    const hasData = res.type === 'heatmap'
      ? (res.cells || []).length > 0
      : res.type === 'scatter'
        ? res.datasets.some((d) => d.data.length > 0)
        : (res.labels || []).length > 0;
    ok(!res.empty && hasData, `${spec.chartType} chart generated from uploaded rows`,
      res.type === 'heatmap' ? `${res.cells.length} cells` : `${(res.labels || res.datasets[0]?.data || []).length} values`);
    if (spec.chartType === 'scatter' && spec.xKey === 'Severity') {
      ok(res.meta.xNumeric === false && res.meta.xLabels.length === 4,
        'categorical X axis gets text labels', (res.meta.xLabels || []).join('/'));
    }
  }

  /* -------------------------------------------------- 7. comparison */
  section('7. Dataset comparison (2024 vs 2025)');
  const cmp = await json('/api/datasets/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ a: a.id, b: b.id }),
  });
  ok(cmp.sharedColumns.length >= 5, 'shared columns detected', cmp.sharedColumns.join(', '));
  ok(cmp.kpis.length === cmp.sharedColumns.length, 'KPI comparison cards computed', `${cmp.kpis.length} KPIs`);
  const affected = cmp.kpis.find((k) => k.label === 'Affected_People');
  ok(affected && affected.a > 0 && affected.b > 0, 'affected population compared', `A=${affected.a} B=${affected.b} (${affected.pct}%)`);
  const chartTypes = new Set(cmp.charts.map((c) => c.type));
  for (const t of ['bar', 'line', 'donut', 'area', 'scatter', 'heatmap']) {
    ok(chartTypes.has(t), `comparison includes ${t} charts`);
  }
  ok(cmp.charts.every((c) => !c.empty), 'no comparison chart is empty');

  /* -------------------------------------------------- 8. apply to module */
  section('8. Applying a dataset updates module charts');
  const applied = await json(`/api/datasets/${b.id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'disasters', mode: 'replace' }),
  });
  ok(applied.inserted === b.rowCount, 'rows loaded into the disasters table', `${applied.inserted} rows`);
  ok(applied.mapping.type === 'Disaster', 'Disaster column mapped to type', JSON.stringify(applied.mapping.type));
  ok(applied.mapping.occurred_on === 'Date', 'Date column mapped to occurred_on');
  ok(applied.unmatchedColumns.length === 0, 'all sample columns matched', applied.unmatchedColumns.join(',') || 'none left over');

  const after = await json('/api/analytics/disasters');
  ok(after.meta.matched === b.rowCount, 'disaster module now reflects only the uploaded dataset', `${after.meta.matched} events`);
  ok(after.meta.to.startsWith('2025'), 'date range follows the uploaded rows', `${after.meta.from} → ${after.meta.to}`);
  const affectedKpi = after.kpis.find((k) => k.id === 'affected');
  ok(affectedKpi.value === affected.b, 'affected-population KPI equals the dataset total', `${affectedKpi.value}`);

  /* -------------------------------------------------- 9. no-data path */
  section('9. "No data available" path');
  await json('/api/meta/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table: 'helpline_calls' }),
  });
  const cleared = await json('/api/analytics/helplines');
  ok(cleared.meta.noCallData === true, 'helpline module reports missing call statistics');
  ok(cleared.charts.every((c) => c.empty), 'helpline charts render empty states', `${cleared.charts.length} charts`);
  ok(cleared.charts[0].emptyReason.includes('No emergency call records'), 'empty reason is explicit', cleared.charts[0].emptyReason);

  /* -------------------------------------------------- 10. restore */
  section('10. Restore demo dataset');
  const reseed = await json('/api/meta/reseed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  ok(reseed.reseeded.disasters > 500, 'demo dataset rebuilt', `${reseed.reseeded.disasters} disasters`);
  const restored = await json('/api/analytics/helplines');
  ok(!restored.meta.noCallData, 'helpline charts have data again', `${restored.kpis[0].value} calls`);
  for (const id of [a.id, b.id]) {
    await fetch(`${BASE}/api/datasets/${id}`, { method: 'DELETE' });
  }
  const list = await json('/api/datasets');
  ok(list.length === 0, 'verification datasets cleaned up', `${list.length} remaining`);

  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed`);
  if (child) child.kill();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nVerification crashed:', err.message);
  process.exit(1);
});
