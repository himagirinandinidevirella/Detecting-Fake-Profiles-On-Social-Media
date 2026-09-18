/**
 * Generic dataset engine.
 * Handles uploaded CSV / XLSX / JSON files: parsing, column profiling,
 * automatic visualisation suggestions, aggregation for any chart type,
 * and dataset-vs-dataset comparison. All results are computed from the
 * uploaded rows — nothing is invented.
 */
import * as XLSX from 'xlsx';

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseDataset(buffer, filename = '', mimetype = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const isJson = ext === 'json' || mimetype.includes('json');
  let rows = [];
  let sheetName = null;

  if (isJson) {
    const text = buffer.toString('utf8');
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) rows = parsed;
    else if (parsed && Array.isArray(parsed.data)) rows = parsed.data;
    else if (parsed && Array.isArray(parsed.records)) rows = parsed.records;
    else if (parsed && Array.isArray(parsed.rows)) rows = parsed.rows;
    else if (parsed && typeof parsed === 'object') {
      // object of arrays -> transpose into rows
      const keys = Object.keys(parsed).filter((k) => Array.isArray(parsed[k]));
      if (keys.length) {
        const len = Math.max(...keys.map((k) => parsed[k].length));
        rows = Array.from({ length: len }, (_, i) => Object.fromEntries(keys.map((k) => [k, parsed[k][i] ?? null])));
      } else rows = [parsed];
    }
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
    sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true, blankrows: false });
  }

  // Normalise: keep only object rows, trim string keys/values.
  rows = rows
    .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        const key = String(k).trim();
        if (typeof v === 'string') {
          const t = v.trim();
          out[key] = t === '' ? null : t;
        } else {
          out[key] = v === undefined || v === '' ? null : v;
        }
      }
      return out;
    });

  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { rows, columns, sheetName, format: isJson ? 'json' : ext || 'unknown' };
}

/* ------------------------------------------------------------------ */
/* Value coercion                                                      */
/* ------------------------------------------------------------------ */

export function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[₹$€, ]/g, '').replace(/%$/, '').trim();
  if (!s || /(^n\/?a$|null|none|-{1,2}$)/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const DATE_PATTERNS = [
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?/,       // ISO
  /^\d{4}\/\d{1,2}\/\d{1,2}/,
  /^\d{1,2}\/\d{1,2}\/\d{2,4}/,                          // d/m/Y, m/d/Y, 1/2/24
  /^\d{1,2}-\d{1,2}-\d{2,4}/,
  /^\d{1,2} [A-Za-z]{3,9} \d{2,4}/,                       // 12 March 2024
  /^[A-Za-z]{3,9} \d{1,2},? \d{2,4}/,                     // March 12, 2024
  /^\d{4}-Q[1-4]$/,
  /^\d{4}-\d{2}$/,
];

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function validYear(d) {
  const y = d.getUTCFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

export function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') {
    // Excel serial date (1900 system) — only when in a plausible window
    if (v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isNaN(d) ? null : d;
    }
    return null;
  }
  const s = String(v).trim();
  if (!DATE_PATTERNS.some((p) => p.test(s))) return null;
  // try dd/mm/yyyy first (Indian convention), fall back to Date parsing
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const [, a, b, yRaw] = dmy.map(Number);
    const y = yRaw < 100 ? (yRaw > 60 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
    if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
      const d = new Date(Date.UTC(y, b - 1, a));
      if (!isNaN(d) && validYear(d)) return d;
    }
  }
  const d = new Date(s);
  return isNaN(d) || !validYear(d) ? null : d;
}

const BOOLISH = new Set(['true', 'false', 'yes', 'no', 'y', 'n']);

export function detectType(values) {
  const sample = values.filter((v) => v !== null && v !== undefined && v !== '');
  if (!sample.length) return 'empty';
  const n = sample.length;
  let numeric = 0;
  let dates = 0;
  let boolish = 0;
  for (const v of sample) {
    if (typeof v === 'boolean' || BOOLISH.has(String(v).toLowerCase())) boolish++;
    if (toNumber(v) !== null) numeric++;
    if (toDate(v) !== null) dates++;
  }
  if (boolish / n > 0.9) return 'boolean';
  if (numeric / n > 0.85) return 'numeric';
  if (dates / n > 0.8) return 'date';
  return 'categorical';
}

/* ------------------------------------------------------------------ */
/* Profiling                                                           */
/* ------------------------------------------------------------------ */

function stats(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    sum,
    mean: sum / nums.length,
    median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    stddev: Math.sqrt(nums.reduce((a, b) => a + (b - sum / nums.length) ** 2, 0) / nums.length),
  };
}

export function profileColumns(rows, columns) {
  return columns.map((name) => {
    const values = rows.map((r) => r[name]);
    const present = values.filter((v) => v !== null && v !== undefined && v !== '');
    const type = detectType(values);
    const distinct = new Set(present.map((v) => String(v)));
    const col = {
      name,
      type,
      count: present.length,
      missing: values.length - present.length,
      missingPct: values.length ? Math.round(((values.length - present.length) / values.length) * 1000) / 10 : 0,
      distinct: distinct.size,
    };
    if (type === 'numeric') {
      const nums = present.map(toNumber).filter((v) => v !== null);
      col.stats = stats(nums);
    } else if (type === 'date') {
      const dates = present.map(toDate).filter(Boolean).sort((a, b) => a - b);
      if (dates.length) {
        col.stats = { min: dates[0].toISOString().slice(0, 10), max: dates[dates.length - 1].toISOString().slice(0, 10), days: Math.round((dates[dates.length - 1] - dates[0]) / 86400000) };
      }
    }
    if (type === 'categorical' || type === 'boolean') {
      const counts = new Map();
      for (const v of present) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
      col.topValues = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
        .map(([value, count]) => ({ value, count, pct: Math.round((count / present.length) * 1000) / 10 }));
    }
    return col;
  });
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */

export function aggregate(rows, spec) {
  const { chartType = 'bar' } = spec;
  if (!rows.length) return { empty: true, emptyReason: 'Dataset has no rows' };
  switch (chartType) {
    case 'bar':
    case 'groupedBar':
    case 'horizontalBar':
      return groupAgg(rows, spec, 'bar');
    case 'donut':
    case 'pie':
      return groupAgg(rows, spec, 'donut');
    case 'area':
    case 'line':
      return seriesAgg(rows, spec, chartType === 'area' ? 'area' : 'line');
    case 'scatter':
      return scatterAgg(rows, spec);
    case 'histogram':
      return histogramAgg(rows, spec);
    case 'heatmap':
      return heatmapAgg(rows, spec);
    default:
      return { empty: true, emptyReason: `Unsupported chart type: ${chartType}` };
  }
}

function metricValue(values, metric) {
  if (!values.length) return 0;
  const nums = values.map(toNumber).filter((v) => v !== null);
  switch (metric) {
    case 'sum': return round(nums.reduce((a, b) => a + b, 0));
    case 'avg':
    case 'mean': return nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
    case 'min': return nums.length ? Math.min(...nums) : 0;
    case 'max': return nums.length ? Math.max(...nums) : 0;
    case 'median': {
      if (!nums.length) return 0;
      const s = [...nums].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    case 'count':
    default: return values.length;
  }
}

function groupAgg(rows, spec, type) {
  const { labelKey, valueKey = null, metric = 'count', limit = 15, sort = 'desc' } = spec;
  if (!labelKey) return { empty: true, emptyReason: 'Select a category column' };
  const groups = new Map();
  for (const r of rows) {
    const key = r[labelKey] === null || r[labelKey] === undefined || r[labelKey] === '' ? '(blank)' : String(r[labelKey]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(valueKey ? r[valueKey] : 1);
  }
  let entries = [...groups.entries()].map(([label, values]) => ({ label, value: metricValue(values, metric) }));
  if (sort === 'desc') entries.sort((a, b) => b.value - a.value);
  else if (sort === 'asc') entries.sort((a, b) => a.value - b.value);
  if (limit) entries = entries.slice(0, limit);
  const seriesLabel = metric === 'count' ? 'Count' : `${metric.toUpperCase()}(${valueKey})`;
  return {
    empty: entries.length === 0,
    type,
    labels: entries.map((e) => e.label),
    datasets: [{ label: seriesLabel, data: entries.map((e) => e.value) }],
    meta: { metric, labelKey, valueKey, groups: entries.length },
  };
}

function seriesAgg(rows, spec, type) {
  const { dateKey, valueKey = null, metric = 'count', bucket = 'month' } = spec;
  if (!dateKey) return { empty: true, emptyReason: 'Select a date column' };
  const groups = new Map();
  for (const r of rows) {
    const d = toDate(r[dateKey]);
    if (!d) continue;
    const key = bucketKey(d, bucket);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(valueKey ? r[valueKey] : 1);
  }
  const keys = [...groups.keys()].sort();
  const labels = keys.map((k) => bucketLabelOut(k, bucket));
  const seriesLabel = metric === 'count' ? 'Count' : `${metric.toUpperCase()}(${valueKey})`;
  return {
    empty: keys.length === 0,
    emptyReason: 'No parseable dates in the selected column',
    type,
    labels,
    datasets: [{ label: seriesLabel, data: keys.map((k) => metricValue(groups.get(k), metric)), fill: type === 'area' }],
    meta: { metric, dateKey, valueKey, bucket, points: keys.length },
  };
}

function isNumericColumn(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== '');
  if (!values.length) return false;
  const numeric = values.filter((v) => toNumber(v) !== null).length;
  return numeric / values.length > 0.8;
}

/**
 * Scatter plot. The X axis may be numeric or categorical — categorical values
 * (e.g. Severity) are placed on evenly spaced ticks and the labels are returned
 * in `meta.xLabels` so the axis still reads as text.
 */
function scatterAgg(rows, spec) {
  const { xKey, yKey, colorKey = null, limit = 1500 } = spec;
  if (!xKey || !yKey) return { empty: true, emptyReason: 'Select X and Y columns' };

  const xNumeric = isNumericColumn(rows, xKey);
  const xLabels = [];
  const xIndex = new Map();
  const series = new Map();
  let count = 0;

  for (const r of rows) {
    if (count >= limit) break;
    const y = toNumber(r[yKey]);
    if (y === null) continue;
    let x;
    if (xNumeric) {
      x = toNumber(r[xKey]);
      if (x === null) continue;
    } else {
      const label = r[xKey] === null || r[xKey] === undefined || r[xKey] === '' ? '(blank)' : String(r[xKey]);
      if (!xIndex.has(label)) { xIndex.set(label, xLabels.length); xLabels.push(label); }
      x = xIndex.get(label);
    }
    const key = colorKey ? String(r[colorKey] ?? 'All') : `${yKey} vs ${xKey}`;
    if (!series.has(key)) series.set(key, []);
    // jitter categorical x slightly so overlapping points stay visible
    series.get(key).push({ x: xNumeric ? x : x + (Math.random() - 0.5) * 0.28, y });
    count++;
  }

  const datasets = [...series.entries()].map(([label, data]) => ({ label, data }));
  return {
    empty: !datasets.length || !datasets.some((d) => d.data.length),
    emptyReason: 'No usable value pairs found for the selected columns',
    type: 'scatter',
    datasets,
    axisTitles: { x: xKey, y: yKey },
    meta: { points: count, xNumeric, ...(xNumeric ? {} : { xLabels }) },
  };
}

function histogramAgg(rows, spec) {
  const { valueKey, bins = 12 } = spec;
  if (!valueKey) return { empty: true, emptyReason: 'Select a numeric column' };
  const nums = rows.map((r) => toNumber(r[valueKey])).filter((v) => v !== null);
  if (!nums.length) return { empty: true, emptyReason: `Column "${valueKey}" has no numeric values` };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const width = span / bins;
  const counts = new Array(bins).fill(0);
  for (const n of nums) {
    let idx = Math.floor((n - min) / width);
    if (idx >= bins) idx = bins - 1;
    counts[idx]++;
  }
  const labels = counts.map((_, i) => `${fmt(min + i * width)} – ${fmt(min + (i + 1) * width)}`);
  return {
    empty: false,
    type: 'bar',
    labels,
    datasets: [{ label: `Frequency of ${valueKey}`, data: counts }],
    meta: { bins, min, max, width: round(width), values: nums.length },
  };
}

function heatmapAgg(rows, spec) {
  const { rowKey, colKey, valueKey = null, metric = 'count' } = spec;
  if (!rowKey || !colKey) return { empty: true, emptyReason: 'Select row and column categories' };
  const map = new Map();
  const rowSet = new Set();
  const colSet = new Set();
  for (const r of rows) {
    const rk = r[rowKey] == null ? '(blank)' : String(r[rowKey]);
    const ck = r[colKey] == null ? '(blank)' : String(r[colKey]);
    rowSet.add(rk);
    colSet.add(ck);
    const k = `${rk}||${ck}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(valueKey ? r[valueKey] : 1);
  }
  // keep the matrix readable: cap the axes on the highest-volume members
  const MAX_ROWS = 40;
  const MAX_COLS = 24;
  const totals = (set, idx) => {
    const t = new Map();
    for (const r of rows) {
      const k = r[idx] == null ? '(blank)' : String(r[idx]);
      t.set(k, (t.get(k) || 0) + 1);
    }
    return [...set].sort((a, b) => (t.get(b) || 0) - (t.get(a) || 0)).slice(0, idx === rowKey ? MAX_ROWS : MAX_COLS);
  };
  const rowValues = totals(rowSet, rowKey);
  const colValues = totals(colSet, colKey);
  const cells = [];
  for (const rk of rowValues) {
    for (const ck of colValues) {
      const values = map.get(`${rk}||${ck}`);
      if (values) cells.push({ row: rk, column: ck, value: metricValue(values, metric) });
    }
  }
  return {
    empty: !cells.length,
    type: 'heatmap',
    rows: rowValues,
    columns: colValues,
    cells,
    valueLabel: metric === 'count' ? 'records' : metric,
    meta: {
      metric, rowKey, colKey, valueKey,
      truncated: rowSet.size > MAX_ROWS || colSet.size > MAX_COLS,
      rowMembers: rowSet.size, columnMembers: colSet.size,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Bucket helpers                                                      */
/* ------------------------------------------------------------------ */

function bucketKey(d, bucket) {
  switch (bucket) {
    case 'day': return d.toISOString().slice(0, 10);
    case 'week': {
      const t = new Date(d);
      t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
      return t.toISOString().slice(0, 10);
    }
    case 'quarter': return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case 'year': return String(d.getUTCFullYear());
    default: return d.toISOString().slice(0, 7);
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function bucketLabelOut(key, bucket) {
  if (bucket === 'month') {
    const [y, m] = key.split('-');
    return `${MONTHS[(+m - 1) % 12]} ${y}`;
  }
  if (bucket === 'quarter') return key.replace('-Q', ' Q');
  return key;
}

function round(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function fmt(v) {
  const n = round(v);
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-IN') : String(n);
}

/* ------------------------------------------------------------------ */
/* Automatic chart suggestions                                         */
/* ------------------------------------------------------------------ */

export function suggestCharts(profile, rowCount) {
  const suggestions = [];
  const numeric = profile.filter((c) => c.type === 'numeric');
  const categorical = profile.filter((c) => c.type === 'categorical' && c.distinct > 1 && c.distinct <= Math.max(30, rowCount / 4));
  const dates = profile.filter((c) => c.type === 'date');

  for (const c of categorical) {
    suggestions.push({ chartType: 'bar', labelKey: c.name, metric: 'count', title: `${c.name} — Count`, reason: `${c.distinct} categories` });
  }
  for (const c of categorical.slice(0, 6)) {
    suggestions.push({ chartType: 'donut', labelKey: c.name, metric: 'count', title: `${c.name} — Share`, reason: 'composition' });
  }
  for (const d of dates) {
    suggestions.push({ chartType: 'line', dateKey: d.name, metric: 'count', bucket: 'month', title: `${d.name} — Trend`, reason: 'date column' });
  }
  for (const n of numeric) {
    suggestions.push({ chartType: 'histogram', valueKey: n.name, bins: 12, title: `${n.name} — Distribution`, reason: 'numeric measure' });
  }
  // cross-tab + scatter for the first plausible pairs
  if (categorical.length >= 2) {
    suggestions.push({ chartType: 'heatmap', rowKey: categorical[0].name, colKey: categorical[1].name, metric: 'count', title: `${categorical[0].name} × ${categorical[1].name}`, reason: 'density' });
  }
  if (categorical.length && numeric.length) {
    suggestions.push({ chartType: 'bar', labelKey: categorical[0].name, valueKey: numeric[0].name, metric: 'sum', title: `${numeric[0].name} by ${categorical[0].name}`, reason: 'measure by category' });
    if (categorical.length >= 2) {
      suggestions.push({ chartType: 'heatmap', rowKey: categorical[0].name, colKey: categorical[1].name, valueKey: numeric[0].name, metric: 'sum', title: `${numeric[0].name} by ${categorical[0].name} × ${categorical[1].name}`, reason: 'cross-tab' });
    }
  }
  if (numeric.length >= 2) {
    suggestions.push({ chartType: 'scatter', xKey: numeric[0].name, yKey: numeric[1].name, colorKey: categorical[0]?.name || null, title: `${numeric[1].name} vs ${numeric[0].name}`, reason: 'correlation' });
  }
  if (categorical.length && numeric.length) {
    suggestions.push({ chartType: 'scatter', xKey: categorical[0].name, yKey: numeric[0].name, colorKey: numeric[1]?.name ? categorical[1]?.name || null : null, title: `${numeric[0].name} by ${categorical[0].name} (scatter)`, reason: 'measure across categories' });
  }
  return suggestions.slice(0, 18);
}

/* ------------------------------------------------------------------ */
/* Dataset comparison                                                  */
/* ------------------------------------------------------------------ */

export function compareDatasets(a, b) {
  const profA = a.profile.columns;
  const profB = b.profile.columns;
  const byName = (cols) => Object.fromEntries(cols.map((c) => [c.name.toLowerCase(), c]));
  const mapA = byName(profA);
  const mapB = byName(profB);
  const shared = profA.filter((c) => mapB[c.name.toLowerCase()]).map((c) => c.name);
  const sharedNumeric = shared.filter((n) => mapA[n.toLowerCase()].type === 'numeric' && mapB[n.toLowerCase()].type === 'numeric');
  const sharedCategorical = shared.filter((n) => mapA[n.toLowerCase()].type === 'categorical');
  const sharedDate = shared.filter((n) => mapA[n.toLowerCase()].type === 'date');

  const kpis = shared.map((name) => {
    const colA = mapA[name.toLowerCase()];
    const colB = mapB[name.toLowerCase()];
    const valuesA = a.rows.map((r) => r[name]);
    const valuesB = b.rows.map((r) => r[name]);
    const metric = colA.type === 'numeric' ? 'sum' : 'count';
    const va = metricValue(valuesA.filter((v) => v !== null), metric);
    const vb = metricValue(valuesB.filter((v) => v !== null), metric);
    const delta = vb - va;
    const pct = va ? Math.round((delta / va) * 1000) / 10 : (vb ? 100 : 0);
    return {
      id: name,
      label: name,
      type: colA.type,
      metric,
      a: round(va),
      b: round(vb),
      delta: round(delta),
      pct,
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    };
  });

  const charts = [];

  // 1. Record count
  charts.push({
    id: 'record_count', title: 'Record Count', type: 'bar',
    labels: ['Records'],
    datasets: [
      { label: a.name, data: [a.rows.length] },
      { label: b.name, data: [b.rows.length] },
    ],
    empty: !a.rows.length && !b.rows.length,
  });

  // 2. Side-by-side totals for every shared numeric column
  if (sharedNumeric.length) {
    charts.push({
      id: 'numeric_totals', title: 'Numeric Totals — Side by Side', type: 'bar',
      labels: sharedNumeric,
      datasets: [
        { label: a.name, data: sharedNumeric.map((n) => round(a.rows.reduce((s, r) => s + (toNumber(r[n]) || 0), 0))) },
        { label: b.name, data: sharedNumeric.map((n) => round(b.rows.reduce((s, r) => s + (toNumber(r[n]) || 0), 0))) },
      ],
      empty: false,
    });
    charts.push({
      id: 'numeric_averages', title: 'Numeric Averages — Side by Side', type: 'bar',
      labels: sharedNumeric,
      datasets: [
        { label: a.name, data: sharedNumeric.map((n) => meanOf(a.rows, n)) },
        { label: b.name, data: sharedNumeric.map((n) => meanOf(b.rows, n)) },
      ],
      empty: false,
    });
  }

  // 3. Category distributions (grouped bar + donuts)
  for (const name of sharedCategorical.slice(0, 3)) {
    const cats = [...new Set([...a.rows, ...b.rows].map((r) => (r[name] == null ? '(blank)' : String(r[name]))))];
    const count = (rows) => {
      const m = new Map();
      for (const r of rows) {
        const k = r[name] == null ? '(blank)' : String(r[name]);
        m.set(k, (m.get(k) || 0) + 1);
      }
      return m;
    };
    const mA = count(a.rows);
    const mB = count(b.rows);
    const sorted = cats.sort((x, y) => (mB.get(y) || 0) + (mA.get(y) || 0) - (mB.get(x) || 0) - (mA.get(x) || 0)).slice(0, 15);
    charts.push({
      id: `cat_${slug(name)}`, title: `${name} — Grouped Comparison`, type: 'bar',
      labels: sorted,
      datasets: [
        { label: a.name, data: sorted.map((c) => mA.get(c) || 0) },
        { label: b.name, data: sorted.map((c) => mB.get(c) || 0) },
      ],
      empty: false,
    });
    charts.push({
      id: `donut_a_${slug(name)}`, title: `${name} mix — ${a.name}`, type: 'donut',
      labels: sorted, datasets: [{ label: a.name, data: sorted.map((c) => mA.get(c) || 0) }],
      empty: !a.rows.length,
    });
    charts.push({
      id: `donut_b_${slug(name)}`, title: `${name} mix — ${b.name}`, type: 'donut',
      labels: sorted, datasets: [{ label: b.name, data: sorted.map((c) => mB.get(c) || 0) }],
      empty: !b.rows.length,
    });
  }

  // 4. Time series comparison (line + area)
  for (const name of sharedDate.slice(0, 1)) {
    const bucketsA = new Map();
    const bucketsB = new Map();
    const fill = (rows, map) => {
      for (const r of rows) {
        const d = toDate(r[name]);
        if (!d) continue;
        const k = bucketKey(d, 'month');
        map.set(k, (map.get(k) || 0) + 1);
      }
    };
    fill(a.rows, bucketsA);
    fill(b.rows, bucketsB);
    const keys = [...new Set([...bucketsA.keys(), ...bucketsB.keys()])].sort();
    charts.push({
      id: `trend_${slug(name)}`, title: `Monthly Trend — ${name}`, type: 'line',
      labels: keys.map((k) => bucketLabelOut(k, 'month')),
      datasets: [
        { label: a.name, data: keys.map((k) => bucketsA.get(k) || 0) },
        { label: b.name, data: keys.map((k) => bucketsB.get(k) || 0) },
      ],
      empty: !keys.length,
      emptyReason: 'No parseable dates to compare',
    });
    charts.push({
      id: `area_${slug(name)}`, title: `Cumulative Records — ${name}`, type: 'area',
      labels: keys.map((k) => bucketLabelOut(k, 'month')),
      datasets: [
        { label: a.name, data: cumsum(keys.map((k) => bucketsA.get(k) || 0)), fill: true },
        { label: b.name, data: cumsum(keys.map((k) => bucketsB.get(k) || 0)), fill: true },
      ],
      empty: !keys.length,
    });
  }

  // 5. Scatter for shared numeric pairs
  if (sharedNumeric.length >= 2) {
    const [x, y] = sharedNumeric;
    const mk = (rows) => rows
      .map((r) => ({ x: toNumber(r[x]), y: toNumber(r[y]) }))
      .filter((p) => p.x !== null && p.y !== null)
      .slice(0, 900);
    const da = mk(a.rows);
    const dbRows = mk(b.rows);
    charts.push({
      id: 'scatter', title: `${y} vs ${x}`, type: 'scatter',
      datasets: [
        { label: a.name, data: da },
        { label: b.name, data: dbRows },
      ],
      axisTitles: { x, y },
      empty: !da.length && !dbRows.length,
      emptyReason: 'No numeric pairs available',
    });
  }

  // 6. Heatmap of category x category for each dataset
  if (sharedCategorical.length >= 2) {
    const [rk, ck] = sharedCategorical;
    for (const ds of [a, b]) {
      const cells = [];
      const map = new Map();
      for (const r of ds.rows) {
        const k = `${r[rk] ?? '(blank)'}||${r[ck] ?? '(blank)'}`;
        map.set(k, (map.get(k) || 0) + 1);
      }
      for (const [k, v] of map.entries()) {
        const [row, column] = k.split('||');
        cells.push({ row, column, value: v });
      }
      charts.push({
        id: `heat_${slug(ds.name)}_${slug(rk)}`,
        title: `${rk} × ${ck} — ${ds.name}`,
        type: 'heatmap',
        rows: [...new Set(cells.map((c) => c.row))],
        columns: [...new Set(cells.map((c) => c.column))],
        cells,
        valueLabel: 'records',
        empty: !cells.length,
      });
    }
  }

  return {
    a: { id: a.id, name: a.name, rows: a.rows.length, columns: a.profile.columns.length },
    b: { id: b.id, name: b.name, rows: b.rows.length, columns: b.profile.columns.length },
    sharedColumns: shared,
    kpis,
    charts,
  };
}

function meanOf(rows, name) {
  const nums = rows.map((r) => toNumber(r[name])).filter((v) => v !== null);
  return nums.length ? round(nums.reduce((s, v) => s + v, 0) / nums.length) : 0;
}
function cumsum(arr) {
  let s = 0;
  return arr.map((v) => (s += v));
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'x';
}
