/* Typed view of the analytics payloads returned by the API. */

export interface ChartDataset {
  label: string;
  data: number[] | { x: number; y: number }[];
  fill?: boolean;
  borderColor?: string;
  backgroundColor?: string | string[];
  borderDash?: number[];
}

export interface ChartPayload {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'area' | 'donut' | 'pie' | 'scatter' | 'heatmap';
  labels?: string[];
  datasets?: ChartDataset[];
  rows?: string[];
  columns?: string[];
  cells?: { row: string; column: string; value: number }[];
  axisTitles?: { x: string; y: string };
  valueLabel?: string;
  empty?: boolean;
  emptyReason?: string;
  stacked?: boolean;
  horizontal?: boolean;
  yAxisTitle?: string;
  meta?: Record<string, unknown>;
}

export interface Kpi {
  id: string;
  label: string;
  value: number | string | null;
  hint?: string;
  icon?: string;
  tone?: 'danger' | 'warning' | 'success' | 'default';
  unit?: string;
  format?: 'compact' | 'currency';
  note?: string;
}

export interface ModulePayload {
  kpis: Kpi[];
  charts: ChartPayload[];
  meta: {
    from?: string;
    to?: string;
    matched?: number;
    bucket?: string;
    [k: string]: unknown;
  };
}

export interface MapPoint {
  id: number;
  name: string;
  type: string;
  severity: string;
  location: string;
  region: string;
  lat: number | null;
  lon: number | null;
  occurred_on: string;
  status: string;
  affected_population: number;
  casualties: number;
}

export interface MapCamp {
  id: number;
  name: string;
  disaster_type: string;
  location: string;
  region: string;
  lat: number | null;
  lon: number | null;
  capacity: number;
  occupancy: number;
  status: string;
}

export interface MapSos {
  id: number;
  disaster_type: string;
  severity: string;
  location: string;
  lat: number | null;
  lon: number | null;
  priority: string;
  status: string;
  reported_at: string;
}

export interface MapPayload extends ModulePayload {
  points: MapPoint[];
  camps: MapCamp[];
  sosPoints: MapSos[];
}

export interface FilterOptions {
  module: string;
  table: string;
  types: string[];
  severities: string[];
  regions: string[];
  locations: string[];
  statuses: string[];
  range: { from: string | null; to: string | null };
}

export interface ColumnProfile {
  name: string;
  type: 'numeric' | 'categorical' | 'date' | 'boolean' | 'empty';
  count: number;
  missing: number;
  missingPct: number;
  distinct: number;
  stats?: { min: number | string; max: number | string; sum?: number; mean?: number; median?: number; stddev?: number; days?: number };
  topValues?: { value: string; count: number; pct: number }[];
}

export interface DatasetInfo {
  id: number;
  name: string;
  filename: string;
  format: string;
  uploaded_at: string;
  row_count: number;
  column_count: number;
  applied_to?: string | null;
  numeric: string[];
  categorical: string[];
  date: string[];
  missing: number;
}

export interface DatasetDetail extends DatasetInfo {
  profile: { columns: ColumnProfile[]; sheetName?: string; truncated?: boolean };
  suggestions: ChartSpec[];
}

export interface ChartSpec {
  chartType: string;
  labelKey?: string;
  valueKey?: string;
  dateKey?: string;
  xKey?: string;
  yKey?: string;
  colorKey?: string | null;
  rowKey?: string;
  colKey?: string;
  metric?: string;
  bucket?: string;
  bins?: number;
  limit?: number;
  title?: string;
  reason?: string;
}

export interface CompareResult {
  a: { id: number; name: string; rows: number; columns: number };
  b: { id: number; name: string; rows: number; columns: number };
  sharedColumns: string[];
  kpis: {
    id: string; label: string; type: string; metric: string;
    a: number; b: number; delta: number; pct: number; direction: 'up' | 'down' | 'flat';
  }[];
  charts: ChartPayload[];
}

export interface ApplyResult {
  target: string;
  table: string;
  mode: string;
  removed: number;
  inserted: number;
  rows: number;
  mapping: Record<string, string>;
  unmatchedColumns: string[];
  dateColumn: string | null;
  undated: number;
  defaultsUsed: Record<string, number>;
  note?: string;
}

const BASE = '/api';

async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error((body as { error?: string })?.error || `Request failed (${res.status})`);
  return body as T;
}

export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { signal, headers: { Accept: 'application/json' } });
  return handle<T>(res);
}

export async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  return handle<T>(res);
}

export async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  return handle<T>(res);
}

/** Response of POST /datasets/upload — freshly profiled, camelCased by the API. */
export interface UploadResult {
  id: number;
  name: string;
  filename: string;
  format: string;
  rowCount: number;
  columnCount: number;
  profile: { columns: ColumnProfile[]; sheetName?: string; truncated?: boolean };
  suggestions: ChartSpec[];
}

export async function uploadDataset(file: File, name?: string): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);
  if (name) form.append('name', name);
  const res = await fetch(`${BASE}/datasets/upload`, { method: 'POST', body: form });
  return handle<UploadResult>(res);
}

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | string[] | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    search.set(k, Array.isArray(v) ? v.join(',') : v);
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
