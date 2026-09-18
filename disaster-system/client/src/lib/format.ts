const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 2 });
const full = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decimals = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 2 });

export function fmtNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return full.format(n);
}

export function fmtCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Math.abs(n) >= 100000 ? compact.format(n) : full.format(n);
}

export function fmtCurrency(value: number | string | null | undefined, short = false): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  return short || Math.abs(n) >= 10000000 ? inrCompact.format(n) : inr.format(n);
}

export function fmtAxis(value: number | string): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Math.abs(n) >= 10000000) return inrCompact.format(n).replace('₹', '');
  return compact.format(n);
}

export function fmtDecimals(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? decimals.format(n) : String(value);
}

/** Renders a KPI value using the formatting hint supplied by the API. */
export function fmtKpi(value: number | string | null, format?: 'compact' | 'currency', unit?: string): string {
  let out: string;
  if (format === 'currency') out = fmtCurrency(value, true);
  else if (format === 'compact') out = fmtCompact(value);
  else if (typeof value === 'number' && !Number.isInteger(value)) out = fmtDecimals(value);
  else out = fmtNumber(value);
  return unit ? `${out}${unit}` : out;
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') || iso.includes('Z') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
