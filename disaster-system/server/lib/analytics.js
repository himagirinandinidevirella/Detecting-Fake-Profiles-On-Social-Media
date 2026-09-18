/**
 * Analytics helpers shared by every module route.
 * All charts/KPIs are derived from SQL aggregations over the live database —
 * nothing is hardcoded. When a query returns no rows the chart payload is
 * flagged `empty: true` so the UI renders a "No data available" visual.
 */
import { query, queryOne } from './db.js';

export const SEVERITY_ORDER = ['Low', 'Moderate', 'High', 'Critical'];

/** Standard filters supported by every module. */
export function readFilters(q, { defaultFrom, defaultTo } = {}) {
  return {
    from: (q.from || defaultFrom || '').trim(),
    to: (q.to || defaultTo || '').trim(),
    type: multi(q.type),
    severity: multi(q.severity),
    region: multi(q.region),
    location: multi(q.location),
    status: multi(q.status),
  };
}

function multi(v) {
  if (v === undefined || v === null || v === '') return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Builds a WHERE clause for a table.
 * cols maps logical filter -> column name (omit to skip that filter).
 */
export function buildWhere(filters, cols) {
  const clauses = [];
  const params = [];
  const push = (sql, vals) => {
    if (!vals || !vals.length) return;
    clauses.push(`${sql} (${vals.map(() => '?').join(',')})`);
    params.push(...vals);
  };
  if (filters.from && cols.date) { clauses.push(`date(${cols.date}) >= date(?)`); params.push(filters.from); }
  if (filters.to && cols.date) { clauses.push(`date(${cols.date}) <= date(?)`); params.push(filters.to); }
  push(`${cols.type} IN`, filters.type);
  push(`${cols.severity} IN`, filters.severity);
  push(`${cols.region} IN`, filters.region);
  push(`${cols.location} IN`, filters.location);
  push(`${cols.status} IN`, filters.status);
  return { sql: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params };
}

/** SQLite expression that buckets a date/time column. */
export function bucketExpr(col, bucket) {
  switch (bucket) {
    case 'day': return `strftime('%Y-%m-%d', ${col})`;
    case 'week': return `strftime('%Y-W%W', ${col})`;
    case 'year': return `strftime('%Y', ${col})`;
    case 'quarter': return `strftime('%Y', ${col}) || '-Q' || ((cast(strftime('%m', ${col}) as integer) + 2) / 3)`;
    default: return `strftime('%Y-%m', ${col})`;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function bucketLabel(value, bucket) {
  if (!value) return '—';
  if (bucket === 'month') {
    const [y, m] = value.split('-');
    return `${MONTHS[(+m - 1) % 12]} ${y}`;
  }
  if (bucket === 'quarter') return value.replace('-Q', ' Q');
  if (bucket === 'year') return value;
  if (bucket === 'week') return value;
  return value;
}

/** Chooses a sensible bucket for a date range. */
export function autoBucket(from, to, forced) {
  if (forced && forced !== 'auto') return forced;
  if (!from || !to) return 'month';
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days <= 31) return 'day';
  if (days <= 120) return 'week';
  if (days <= 900) return 'month';
  return 'quarter';
}

/** Full ordered list of bucket keys between two dates (fills gaps with 0). */
export function bucketAxis(from, to, bucket) {
  if (!from || !to) return null;
  const out = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (isNaN(start) || isNaN(end) || end < start) return null;
  const guard = 2000;
  if (bucket === 'day') {
    for (let d = new Date(start), i = 0; d <= end && i < guard; d.setUTCDate(d.getUTCDate() + 1), i++) {
      out.push(d.toISOString().slice(0, 10));
    }
  } else if (bucket === 'week') {
    for (let d = new Date(start), i = 0; d <= end && i < guard; d.setUTCDate(d.getUTCDate() + 7), i++) {
      out.push(d.toISOString().slice(0, 4) + '-W' + d.toISOString().slice(5, 7) + 'x');
    }
    return null; // week keys are not reliably reconstructible — caller uses returned rows
  } else if (bucket === 'month') {
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)), i = 0; d <= end && i < guard; d.setUTCMonth(d.getUTCMonth() + 1), i++) {
      out.push(d.toISOString().slice(0, 7));
    }
  } else if (bucket === 'quarter') {
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth())) && out.length < guard;) {
      out.push(`${y}-Q${Math.floor(m / 3) + 1}`);
      m += 3;
      if (m > 11) { m = 0; y += 1; }
    }
  } else if (bucket === 'year') {
    for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear() && out.length < guard; y++) out.push(String(y));
  }
  return out.length ? out : null;
}

/**
 * Time-series chart with gap filling.
 * select must return rows shaped { bucket, ...values }.
 */
export function timeSeries({ id, title, sql, params, bucket, from, to, series, yAxisTitle = '' }) {
  const rows = query(sql, params);
  const axis = bucketAxis(from, to, bucket);
  const index = new Map(rows.map((r) => [r.bucket, r]));
  const labels = axis ? axis.map((k) => bucketLabel(k, bucket)) : rows.map((r) => bucketLabel(r.bucket, bucket));
  const keys = axis || rows.map((r) => r.bucket);
  const datasets = series.map((s) => ({
    label: s.label,
    data: keys.map((k) => {
      const r = index.get(k);
      const v = r ? r[s.field] : null;
      return v === null || v === undefined ? (s.fillZero === false ? null : 0) : round(v);
    }),
    ...(s.color ? { borderColor: s.color, backgroundColor: s.color } : {}),
    ...(s.fill ? { fill: true } : {}),
    ...(s.dashed ? { borderDash: [6, 4] } : {}),
  }));
  const total = datasets.reduce((s, d) => s + d.data.filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0), 0);
  return chart({ id, title, type: 'line', labels, datasets, yAxisTitle, empty: rows.length === 0, emptyReason: 'No records in the selected range' , meta: { bucket, points: labels.length, total: round(total) } });
}

function round(v, digits = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10 ** digits) / 10 ** digits;
}

/**
 * Multi-series time series pivoted in JS (one line per category).
 * sql must return rows shaped { bucket, <categoryKey>, <valueKey> }.
 */
export function pivotedSeries({ id, title, sql, params, bucket, from, to, categories, categoryKey = 'category', valueKey = 'value', yAxisTitle = '' }) {
  const rows = query(sql, params);
  const axis = bucketAxis(from, to, bucket);
  const keys = axis || [...new Set(rows.map((r) => r.bucket))].sort();
  const map = new Map(rows.map((r) => [`${r.bucket}||${r[categoryKey]}`, r[valueKey]]));
  const labels = keys.map((k) => bucketLabel(k, bucket));
  const datasets = categories.map((c) => ({
    label: c,
    data: keys.map((k) => round(map.get(`${k}||${c}`) ?? 0)),
  }));
  return chart({
    id, title, type: 'line', labels, datasets, yAxisTitle,
    empty: rows.length === 0,
    emptyReason: 'No records in the selected range',
    meta: { bucket, points: labels.length, series: datasets.length },
  });
}

/** Categorical bar / donut chart from grouped SQL rows. */
export function grouped({ id, title, sql, params, labelKey, series, chartType = 'bar', limit = 0, sort = 'desc', yAxisTitle = '', horizontal = false }) {
  let rows = query(sql, params);
  const primary = series[0];
  rows.sort((a, b) => (sort === 'asc' ? a[primary.field] - b[primary.field] : b[primary.field] - a[primary.field]));
  if (limit) rows = rows.slice(0, limit);
  const labels = rows.map((r) => String(r[labelKey] ?? 'Unknown'));
  const datasets = series.map((s) => ({
    label: s.label,
    data: rows.map((r) => round(r[s.field])),
    ...(s.color ? { backgroundColor: s.color } : {}),
  }));
  return chart({
    id, title,
    type: chartType,
    labels,
    datasets,
    yAxisTitle,
    empty: rows.length === 0,
    emptyReason: 'No records match the current filters',
    horizontal,
  });
}

/** Stacked bar (e.g. region x severity). */
export function stacked({ id, title, sql, params, rowKey, colKey, valueKey, categories, chartType = 'bar', horizontal = false }) {
  const rows = query(sql, params);
  const rowValues = [];
  const map = new Map();
  for (const r of rows) {
    const rk = String(r[rowKey] ?? 'Unknown');
    if (!map.has(rk)) { map.set(rk, {}); rowValues.push(rk); }
    map.get(rk)[String(r[colKey] ?? 'Unknown')] = Number(r[valueKey] || 0);
  }
  rowValues.sort((a, b) => {
    const sa = categories.reduce((s, c) => s + (map.get(a)[c] || 0), 0);
    const sb = categories.reduce((s, c) => s + (map.get(b)[c] || 0), 0);
    return sb - sa;
  });
  const datasets = categories.map((c) => ({
    label: c,
    data: rowValues.map((rv) => round(map.get(rv)[c] || 0)),
  }));
  return chart({
    id, title, type: chartType, labels: rowValues, datasets,
    stacked: true, horizontal,
    empty: rows.length === 0,
    emptyReason: 'No records match the current filters',
  });
}

/** Chart payload with a guaranteed shape for the frontend. */
export function chart({ id, title, type, labels = [], datasets = [], empty = false, emptyReason = '', yAxisTitle = '', stacked = false, horizontal = false, meta = {} }) {
  return { id, title, type, labels, datasets, empty, emptyReason, yAxisTitle, stacked, horizontal, meta };
}

export function kpi(id, label, value, extra = {}) {
  return { id, label, value: typeof value === 'number' ? round(value) : value, ...extra };
}

/** Distinct values for filter dropdowns. */
export function distinctValues(sql, params) {
  return query(sql, params).map((r) => Object.values(r)[0]).filter((v) => v !== null && v !== '');
}

export { query, queryOne };
