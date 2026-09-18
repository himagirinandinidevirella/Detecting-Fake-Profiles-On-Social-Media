/**
 * Disaster / dashboard / map analytics.
 * Every payload here is aggregated from SQLite at request time.
 */
import { Router } from 'express';
import {
  buildWhere, readFilters, autoBucket, bucketExpr, bucketLabel, bucketAxis,
  timeSeries, pivotedSeries, grouped, stacked, chart, kpi, query, queryOne, SEVERITY_ORDER,
} from '../lib/analytics.js';

export const router = Router();

const DISASTER_COLS = { date: 'occurred_on', type: 'type', severity: 'severity', region: 'region', location: 'location', status: 'status' };
const SOS_COLS = { date: 'reported_at', type: 'disaster_type', severity: 'severity', region: 'region', location: 'location', status: 'status' };

function resolveRange(q, table, dateCol) {
  const f = readFilters(q);
  if (!f.from || !f.to) {
    const row = queryOne(`SELECT MIN(${dateCol}) AS a, MAX(${dateCol}) AS b FROM ${table}`);
    f.from = f.from || (row?.a ? String(row.a).slice(0, 10) : '');
    f.to = f.to || (row?.b ? String(row.b).slice(0, 10) : '');
  }
  return f;
}

function meta(filters, matched) {
  return { from: filters.from, to: filters.to, filters: { type: filters.type, severity: filters.severity, region: filters.region, location: filters.location, status: filters.status }, matched, generatedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
router.get('/dashboard', (req, res) => {
  const f = resolveRange(req.query, 'disasters', 'occurred_on');
  const w = buildWhere(f, DISASTER_COLS);
  const ws = buildWhere(f, SOS_COLS);

  const dTotals = queryOne(`SELECT COUNT(*) AS total, SUM(affected_population) AS affected, SUM(casualties) AS casualties, SUM(displaced) AS displaced, SUM(damage_crore) AS damage FROM disasters${w.sql}`, w.params) || {};
  const byStatus = query(`SELECT status, COUNT(*) AS c FROM disasters${w.sql} GROUP BY status`, w.params);
  const active = byStatus.find((r) => r.status === 'Active')?.c || 0;
  const monitoring = byStatus.find((r) => r.status === 'Monitoring')?.c || 0;
  const sos = queryOne(`SELECT COUNT(*) AS total, SUM(CASE WHEN priority='Critical' THEN 1 ELSE 0 END) AS critical, AVG(response_minutes) AS avg_response, SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved FROM sos_requests${ws.sql}`, ws.params) || {};
  const camps = queryOne('SELECT COUNT(*) AS total, SUM(capacity) AS capacity, SUM(occupancy) AS occupancy FROM relief_camps') || {};
  const donations = queryOne(`SELECT SUM(amount) AS amount, COUNT(*) AS total FROM donations`) || {};
  const volunteers = queryOne('SELECT COUNT(*) AS total, SUM(CASE WHEN status=? THEN 1 ELSE 0 END) AS available FROM volunteers', ['Available']) || {};
  const alertsActive = queryOne("SELECT COUNT(*) AS c FROM alerts WHERE status <> 'Resolved'") || {};

  const bucket = autoBucket(f.from, f.to, req.query.bucket);
  const dBucket = bucketExpr('occurred_on', bucket);
  const sBucket = bucketExpr('reported_at', bucket);

  const kpis = [
    kpi('total_disasters', 'Total Disasters', dTotals.total || 0, { hint: 'events in range', icon: 'disaster' }),
    kpi('active_disasters', 'Active Disasters', active, { hint: `${monitoring} under monitoring`, icon: 'alert', tone: 'danger' }),
    kpi('affected_population', 'Affected Population', dTotals.affected || 0, { hint: `${dTotals.displaced || 0} displaced`, icon: 'people', format: 'compact' }),
    kpi('sos_requests', 'SOS Requests', sos.total || 0, { hint: `${sos.critical || 0} critical`, icon: 'sos', tone: 'warning' }),
    kpi('casualties', 'Casualties', dTotals.casualties || 0, { hint: 'recorded fatalities', icon: 'cross' }),
    kpi('donations', 'Donations Received', donations.amount || 0, { hint: `${donations.total || 0} contributions`, icon: 'rupee', format: 'currency' }),
    kpi('camp_occupancy', 'Relief Camp Occupancy', camps.capacity ? Math.round(((camps.occupancy || 0) / camps.capacity) * 1000) / 10 : 0, { hint: `${camps.occupancy || 0} of ${camps.capacity || 0} beds`, icon: 'camp', unit: '%' }),
    kpi('avg_response', 'Avg SOS Response', sos.avg_response ? Math.round(sos.avg_response) : null, { hint: 'minutes to first response', icon: 'clock', unit: ' min' }),
  ];

  const charts = [
    timeSeries({
      id: 'disaster_trend', title: `Disaster Trend (${bucket})`,
      sql: `SELECT ${dBucket} AS bucket, COUNT(*) AS disasters, SUM(casualties) AS casualties FROM disasters${w.sql} GROUP BY bucket ORDER BY bucket`,
      params: w.params, bucket, from: f.from, to: f.to,
      series: [{ label: 'Disasters', field: 'disasters' }, { label: 'Casualties', field: 'casualties', fillZero: true }],
      yAxisTitle: 'events',
    }),
    grouped({
      id: 'disaster_types', title: 'Disasters by Type', chartType: 'bar', labelKey: 'type',
      sql: `SELECT type, COUNT(*) AS c, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY type`,
      params: w.params, series: [{ label: 'Disasters', field: 'c' }], yAxisTitle: 'events',
    }),
    grouped({
      id: 'severity_donut', title: 'Disaster Severity Mix', chartType: 'donut', labelKey: 'severity', sort: 'none',
      sql: `SELECT severity, COUNT(*) AS c FROM disasters${w.sql} GROUP BY severity`,
      params: w.params, series: [{ label: 'Disasters', field: 'c' }],
    }),
    timeSeries({
      id: 'affected_trend', title: `Affected Population (${bucket})`,
      sql: `SELECT ${dBucket} AS bucket, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY bucket ORDER BY bucket`,
      params: w.params, bucket, from: f.from, to: f.to,
      series: [{ label: 'People affected', field: 'affected', fill: true }], yAxisTitle: 'people',
    }),
    grouped({
      id: 'region_bar', title: 'Disasters by Region', chartType: 'bar', labelKey: 'region',
      sql: `SELECT region, COUNT(*) AS c FROM disasters${w.sql} GROUP BY region`,
      params: w.params, series: [{ label: 'Disasters', field: 'c' }], yAxisTitle: 'events',
    }),
    stacked({
      id: 'status_stack', title: 'Response Status by Type', rowKey: 'type', colKey: 'status', valueKey: 'c',
      categories: ['Active', 'Monitoring', 'Resolved'], horizontal: true,
      sql: `SELECT type, status, COUNT(*) AS c FROM disasters${w.sql} GROUP BY type, status`,
      params: w.params,
    }),
    timeSeries({
      id: 'sos_trend', title: `SOS Requests (${bucket})`,
      sql: `SELECT ${sBucket} AS bucket, COUNT(*) AS sos, SUM(CASE WHEN priority='Critical' THEN 1 ELSE 0 END) AS critical FROM sos_requests${ws.sql} GROUP BY bucket ORDER BY bucket`,
      params: ws.params, bucket, from: f.from, to: f.to,
      series: [{ label: 'All SOS', field: 'sos' }, { label: 'Critical', field: 'critical' }], yAxisTitle: 'requests',
    }),
    grouped({
      id: 'top_locations', title: 'Most Affected Locations', chartType: 'bar', labelKey: 'location', limit: 12,
      sql: `SELECT location, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY location`,
      params: w.params, series: [{ label: 'People affected', field: 'affected' }], yAxisTitle: 'people', horizontal: true,
    }),
    grouped({
      id: 'alerts_status', title: 'Alert Status', chartType: 'donut', labelKey: 'status',
      sql: "SELECT status, COUNT(*) AS c FROM alerts WHERE date(issued_at) >= date(?) AND date(issued_at) <= date(?) GROUP BY status",
      params: [f.from, f.to], series: [{ label: 'Alerts', field: 'c' }],
    }),
  ];

  // order severity consistently for the donut
  const sev = charts.find((c) => c.id === 'severity_donut');
  if (sev && !sev.empty) orderSeverity(sev);

  res.json({
    kpis,
    charts,
    meta: {
      ...meta(f, dTotals.total || 0),
      bucket,
      availability: { active, monitoring, volunteersAvailable: volunteers.available || 0, volunteersTotal: volunteers.total || 0, openAlerts: alertsActive.c || 0 },
    },
  });
});

function orderSeverity(c) {
  const idx = new Map(SEVERITY_ORDER.map((s, i) => [s, i]));
  const order = c.labels.map((l, i) => i).sort((a, b) => (idx.get(c.labels[a]) ?? 99) - (idx.get(c.labels[b]) ?? 99));
  c.labels = order.map((i) => c.labels[i]);
  c.datasets.forEach((d) => { d.data = order.map((i) => d.data[i]); });
}

/* ------------------------------------------------------------------ */
/* Disaster management                                                 */
/* ------------------------------------------------------------------ */
router.get('/disasters', (req, res) => {
  const f = resolveRange(req.query, 'disasters', 'occurred_on');
  const w = buildWhere(f, DISASTER_COLS);
  const bucket = autoBucket(f.from, f.to, req.query.bucket);
  const bExpr = bucketExpr('occurred_on', bucket);

  const totals = queryOne(`SELECT COUNT(*) AS total, SUM(affected_population) AS affected, SUM(casualties) AS casualties, SUM(damage_crore) AS damage, AVG(affected_population) AS avg_affected FROM disasters${w.sql}`, w.params) || {};
  const sevCounts = query(`SELECT severity, COUNT(*) AS c FROM disasters${w.sql} GROUP BY severity`, w.params);
  const critical = sevCounts.find((r) => r.severity === 'Critical')?.c || 0;
  const active = queryOne(`SELECT COUNT(*) AS c FROM disasters${w.sql}${w.sql ? ' AND' : ' WHERE'} status <> 'Resolved'`, w.params)?.c || 0;

  const charts = [
    grouped({
      id: 'type_bar', title: 'Disaster Type', chartType: 'bar', labelKey: 'type',
      sql: `SELECT type, COUNT(*) AS c FROM disasters${w.sql} GROUP BY type`,
      params: w.params, series: [{ label: 'Events', field: 'c' }], yAxisTitle: 'events',
    }),
    timeSeries({
      id: 'frequency_line', title: `Disaster Frequency (${bucket})`,
      sql: `SELECT ${bExpr} AS bucket, COUNT(*) AS c FROM disasters${w.sql} GROUP BY bucket ORDER BY bucket`,
      params: w.params, bucket, from: f.from, to: f.to, series: [{ label: 'Events', field: 'c' }], yAxisTitle: 'events',
    }),
    grouped({
      id: 'severity_donut', title: 'Severity Distribution', chartType: 'donut', labelKey: 'severity', sort: 'none',
      sql: `SELECT severity, COUNT(*) AS c FROM disasters${w.sql} GROUP BY severity`,
      params: w.params, series: [{ label: 'Events', field: 'c' }],
    }),
    grouped({
      id: 'location_bar', title: 'Disasters by Location', chartType: 'bar', labelKey: 'location', limit: 15,
      sql: `SELECT location, COUNT(*) AS c FROM disasters${w.sql} GROUP BY location`,
      params: w.params, series: [{ label: 'Events', field: 'c' }], yAxisTitle: 'events', horizontal: true,
    }),
    grouped({
      id: 'affected_bar', title: 'Affected Population by Location', chartType: 'bar', labelKey: 'location', limit: 15,
      sql: `SELECT location, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY location`,
      params: w.params, series: [{ label: 'People affected', field: 'affected' }], yAxisTitle: 'people',
    }),
    timeSeries({
      id: 'casualties_line', title: `Casualties (${bucket})`,
      sql: `SELECT ${bExpr} AS bucket, SUM(casualties) AS casualties, SUM(displaced) AS displaced FROM disasters${w.sql} GROUP BY bucket ORDER BY bucket`,
      params: w.params, bucket, from: f.from, to: f.to,
      series: [{ label: 'Casualties', field: 'casualties' }, { label: 'Displaced', field: 'displaced' }], yAxisTitle: 'people',
    }),
    timeSeries({
      id: 'monthly_trend', title: `Monthly Disaster Trend (${bucket})`,
      sql: `SELECT ${bExpr} AS bucket, COUNT(*) AS c, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY bucket ORDER BY bucket`,
      params: w.params, bucket, from: f.from, to: f.to,
      series: [{ label: 'Events', field: 'c', fill: true }], yAxisTitle: 'events',
    }),
    grouped({
      id: 'region_bar', title: 'Disasters by Region', chartType: 'bar', labelKey: 'region',
      sql: `SELECT region, COUNT(*) AS c FROM disasters${w.sql} GROUP BY region`,
      params: w.params, series: [{ label: 'Events', field: 'c' }], yAxisTitle: 'events',
    }),
    stacked({
      id: 'type_severity_stack', title: 'Severity by Disaster Type', rowKey: 'type', colKey: 'severity', valueKey: 'c',
      categories: SEVERITY_ORDER,
      sql: `SELECT type, severity, COUNT(*) AS c FROM disasters${w.sql} GROUP BY type, severity`,
      params: w.params,
    }),
  ];
  const sev = charts.find((c) => c.id === 'severity_donut');
  if (sev && !sev.empty) orderSeverity(sev);

  res.json({
    kpis: [
      kpi('total', 'Total Disasters', totals.total || 0, { icon: 'disaster' }),
      kpi('active', 'Active / Monitoring', active, { tone: 'danger', icon: 'alert' }),
      kpi('affected', 'Affected Population', totals.affected || 0, { format: 'compact', icon: 'people' }),
      kpi('casualties', 'Casualties', totals.casualties || 0, { icon: 'cross' }),
      kpi('critical', 'Critical Events', critical, { tone: 'warning', icon: 'shield' }),
      kpi('damage', 'Estimated Damage', totals.damage || 0, { format: 'currency', icon: 'rupee' }),
    ],
    charts,
    meta: { ...meta(f, totals.total || 0), bucket, avgAffected: Math.round(totals.avg_affected || 0) },
  });
});

/* ------------------------------------------------------------------ */
/* Map + regional analytics                                            */
/* ------------------------------------------------------------------ */
router.get('/map', (req, res) => {
  const f = resolveRange(req.query, 'disasters', 'occurred_on');
  const w = buildWhere(f, DISASTER_COLS);
  const bucket = autoBucket(f.from, f.to, req.query.bucket);

  const points = query(
    `SELECT id, name, type, severity, location, region, lat, lon, occurred_on, status, affected_population, casualties
     FROM disasters${w.sql} AND lat IS NOT NULL ORDER BY affected_population DESC LIMIT 4000`.replace(' AND lat IS NOT NULL', `${w.sql ? ' AND' : ' WHERE'} lat IS NOT NULL`),
    w.params,
  );

  const camps = query(`SELECT id, name, disaster_type, location, region, lat, lon, capacity, occupancy, status FROM relief_camps WHERE lat IS NOT NULL`);
  const sos = query(`SELECT id, disaster_type, severity, location, lat, lon, priority, status, reported_at FROM sos_requests${buildWhere(f, SOS_COLS).sql} AND lat IS NOT NULL LIMIT 4000`.replace(' AND lat IS NOT NULL', `${buildWhere(f, SOS_COLS).sql ? ' AND' : ' WHERE'} lat IS NOT NULL`), buildWhere(f, SOS_COLS).params);

  const regionRows = query(`SELECT region, COUNT(*) AS c, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY region`, w.params);
  const density = query(`SELECT region, type, COUNT(*) AS c FROM disasters${w.sql} GROUP BY region, type`, w.params);
  const types = [...new Set(density.map((r) => r.type))].sort();

  res.json({
    points,
    camps,
    sosPoints: sos,
    kpis: [
      kpi('mapped', 'Mapped Disasters', points.length, { icon: 'pin' }),
      kpi('regions', 'Regions Affected', regionRows.length, { icon: 'globe' }),
      kpi('affected', 'Affected Population', regionRows.reduce((s, r) => s + (r.affected || 0), 0), { format: 'compact', icon: 'people' }),
      kpi('camps', 'Relief Camps', camps.length, { icon: 'camp' }),
    ],
    charts: [
      grouped({
        id: 'region_count', title: 'Regional Disaster Count', chartType: 'bar', labelKey: 'region',
        sql: `SELECT region, COUNT(*) AS c FROM disasters${w.sql} GROUP BY region`,
        params: w.params, series: [{ label: 'Events', field: 'c' }], yAxisTitle: 'events',
      }),
      stacked({
        id: 'region_severity', title: 'Regional Severity', rowKey: 'region', colKey: 'severity', valueKey: 'c',
        categories: SEVERITY_ORDER,
        sql: `SELECT region, severity, COUNT(*) AS c FROM disasters${w.sql} GROUP BY region, severity`,
        params: w.params,
      }),
      grouped({
        id: 'region_affected', title: 'Affected Population by Region', chartType: 'bar', labelKey: 'region',
        sql: `SELECT region, SUM(affected_population) AS affected FROM disasters${w.sql} GROUP BY region`,
        params: w.params, series: [{ label: 'People affected', field: 'affected' }], yAxisTitle: 'people',
      }),
      grouped({
        id: 'region_casualties', title: 'Casualties by Region', chartType: 'bar', labelKey: 'region',
        sql: `SELECT region, SUM(casualties) AS casualties FROM disasters${w.sql} GROUP BY region`,
        params: w.params, series: [{ label: 'Casualties', field: 'casualties' }], yAxisTitle: 'people',
      }),
      {
        id: 'density_matrix',
        title: 'Disaster Density (Region × Type)',
        type: 'heatmap',
        rows: [...new Set(density.map((r) => r.region))].sort(),
        columns: types,
        cells: density.map((r) => ({ row: r.region, column: r.type, value: r.c })),
        empty: density.length === 0,
        emptyReason: 'No mapped disasters in the selected range',
        valueLabel: 'events',
      },
      pivotedSeries({
        id: 'regional_trend', title: `Regional Trend (${bucket})`,
        sql: `SELECT ${bucketExpr('occurred_on', bucket)} AS bucket, region AS category, COUNT(*) AS value FROM disasters${w.sql} GROUP BY bucket, region ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to,
        categories: regionRows.map((r) => r.region),
      }),
    ],
    meta: { ...meta(f, points.length), bucket },
  });
});

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */
const ALERT_COLS = { date: 'issued_at', type: 'type', severity: 'severity', region: 'region', location: 'location', status: 'status' };
router.get('/alerts', (req, res) => {
  const f = resolveRange(req.query, 'alerts', 'issued_at');
  const w = buildWhere(f, ALERT_COLS);
  const bucket = autoBucket(f.from, f.to, req.query.bucket);

  const totals = queryOne(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='Active' THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved, AVG(CASE WHEN resolved_at IS NOT NULL THEN (julianday(resolved_at) - julianday(issued_at)) * 24 END) AS avg_hours FROM alerts${w.sql}`, w.params) || {};
  const criticalActive = queryOne(`SELECT COUNT(*) AS c FROM alerts${w.sql}${w.sql ? ' AND' : ' WHERE'} status <> 'Resolved' AND severity IN ('Critical','High')`, w.params)?.c || 0;

  res.json({
    kpis: [
      kpi('total', 'Total Alerts', totals.total || 0, { icon: 'bell' }),
      kpi('active', 'Active Alerts', totals.active || 0, { tone: 'danger', icon: 'alert' }),
      kpi('resolved', 'Resolved Alerts', totals.resolved || 0, { icon: 'check' }),
      kpi('high_active', 'High/Critical Open', criticalActive, { tone: 'warning', icon: 'shield' }),
      kpi('avg_hours', 'Avg Time to Resolve', totals.avg_hours ? Math.round(totals.avg_hours * 10) / 10 : null, { unit: ' hrs', icon: 'clock' }),
    ],
    charts: [
      grouped({
        id: 'status_donut', title: 'Active vs Resolved Alerts', chartType: 'donut', labelKey: 'status',
        sql: `SELECT status, COUNT(*) AS c FROM alerts${w.sql} GROUP BY status`,
        params: w.params, series: [{ label: 'Alerts', field: 'c' }],
      }),
      grouped({
        id: 'type_bar', title: 'Alerts by Disaster Type', chartType: 'bar', labelKey: 'type',
        sql: `SELECT type, COUNT(*) AS c FROM alerts${w.sql} GROUP BY type`,
        params: w.params, series: [{ label: 'Alerts', field: 'c' }], yAxisTitle: 'alerts',
      }),
      grouped({
        id: 'severity_donut', title: 'Alerts by Severity', chartType: 'donut', labelKey: 'severity', sort: 'none',
        sql: `SELECT severity, COUNT(*) AS c FROM alerts${w.sql} GROUP BY severity`,
        params: w.params, series: [{ label: 'Alerts', field: 'c' }],
      }),
      grouped({
        id: 'location_bar', title: 'Alerts by Location', chartType: 'bar', labelKey: 'location', limit: 15,
        sql: `SELECT location, COUNT(*) AS c FROM alerts${w.sql} GROUP BY location`,
        params: w.params, series: [{ label: 'Alerts', field: 'c' }], yAxisTitle: 'alerts', horizontal: true,
      }),
      timeSeries({
        id: 'frequency_line', title: `Alert Frequency Over Time (${bucket})`,
        sql: `SELECT ${bucketExpr('issued_at', bucket)} AS bucket, COUNT(*) AS alerts, SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved FROM alerts${w.sql} GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to,
        series: [{ label: 'Issued', field: 'alerts' }, { label: 'Resolved', field: 'resolved' }], yAxisTitle: 'alerts',
      }),
      grouped({
        id: 'channel_bar', title: 'Alerts by Channel', chartType: 'bar', labelKey: 'channel',
        sql: `SELECT channel, COUNT(*) AS c FROM alerts${w.sql} GROUP BY channel`,
        params: w.params, series: [{ label: 'Alerts', field: 'c' }], yAxisTitle: 'alerts',
      }),
      stacked({
        id: 'region_severity', title: 'Alert Severity by Region', rowKey: 'region', colKey: 'severity', valueKey: 'c',
        categories: SEVERITY_ORDER,
        sql: `SELECT region, severity, COUNT(*) AS c FROM alerts${w.sql} GROUP BY region, severity`,
        params: w.params, horizontal: true,
      }),
      {
        id: 'resolution_heat',
        title: 'Resolution Time by Type (hours)',
        type: 'heatmap',
        rows: [],
        columns: [],
        cells: [],
        ...resolutionHeat(w),
      },
    ],
    meta: meta(f, totals.total || 0),
  });
});

function resolutionHeat(w) {
  const rows = query(
    `SELECT type, status, AVG((julianday(resolved_at) - julianday(issued_at)) * 24) AS hours
     FROM alerts${w.sql}${w.sql ? ' AND' : ' WHERE'} resolved_at IS NOT NULL GROUP BY type, status`,
    w.params,
  );
  if (!rows.length) return { empty: true, emptyReason: 'No resolved alerts to measure' };
  const types = [...new Set(rows.map((r) => r.type))].sort();
  const statuses = [...new Set(rows.map((r) => r.status))].sort();
  return {
    empty: false,
    rows: types,
    columns: statuses,
    cells: rows.map((r) => ({ row: r.type, column: r.status, value: Math.round((r.hours || 0) * 10) / 10 })),
    valueLabel: 'hours',
  };
}

/* ------------------------------------------------------------------ */
/* SOS                                                                 */
/* ------------------------------------------------------------------ */
router.get('/sos', (req, res) => {
  const f = resolveRange(req.query, 'sos_requests', 'reported_at');
  const w = buildWhere(f, SOS_COLS);
  const bucket = autoBucket(f.from, f.to, req.query.bucket);

  const totals = queryOne(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Resolved' THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN status='Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN priority='Critical' THEN 1 ELSE 0 END) AS critical,
      AVG(response_minutes) AS avg_response, SUM(people_count) AS people FROM sos_requests${w.sql}`, w.params) || {};

  res.json({
    kpis: [
      kpi('total', 'SOS Requests', totals.total || 0, { icon: 'sos' }),
      kpi('pending', 'Pending', totals.pending || 0, { tone: 'warning', icon: 'clock' }),
      kpi('critical', 'Critical Priority', totals.critical || 0, { tone: 'danger', icon: 'alert' }),
      kpi('resolved', 'Resolved', totals.resolved || 0, { icon: 'check' }),
      kpi('avg_response', 'Avg Response Time', totals.avg_response ? Math.round(totals.avg_response) : null, { unit: ' min', icon: 'timer' }),
      kpi('people', 'People in Requests', totals.people || 0, { format: 'compact', icon: 'people' }),
    ],
    charts: [
      grouped({
        id: 'status_donut', title: 'SOS by Status', chartType: 'donut', labelKey: 'status',
        sql: `SELECT status, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY status`,
        params: w.params, series: [{ label: 'Requests', field: 'c' }],
      }),
      grouped({
        id: 'type_bar', title: 'SOS by Disaster Type', chartType: 'bar', labelKey: 'disaster_type',
        sql: `SELECT disaster_type, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY disaster_type`,
        params: w.params, series: [{ label: 'Requests', field: 'c' }], yAxisTitle: 'requests',
      }),
      grouped({
        id: 'location_bar', title: 'SOS by Location', chartType: 'bar', labelKey: 'location', limit: 15,
        sql: `SELECT location, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY location`,
        params: w.params, series: [{ label: 'Requests', field: 'c' }], yAxisTitle: 'requests', horizontal: true,
      }),
      timeSeries({
        id: 'timeline', title: `SOS Requests Over Time (${bucket})`,
        sql: `SELECT ${bucketExpr('reported_at', bucket)} AS bucket, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to, series: [{ label: 'Requests', field: 'c', fill: true }], yAxisTitle: 'requests',
      }),
      grouped({
        id: 'priority_donut', title: 'Critical vs Normal SOS', chartType: 'donut', labelKey: 'priority',
        sql: `SELECT priority, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY priority`,
        params: w.params, series: [{ label: 'Requests', field: 'c' }],
      }),
      timeSeries({
        id: 'response_time', title: `Response Time (${bucket})`,
        sql: `SELECT ${bucketExpr('reported_at', bucket)} AS bucket, AVG(response_minutes) AS avg_min, MAX(response_minutes) AS max_min FROM sos_requests${w.sql}${w.sql ? ' AND' : ' WHERE'} response_minutes IS NOT NULL GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to,
        series: [{ label: 'Avg minutes', field: 'avg_min' }, { label: 'Slowest (min)', field: 'max_min', fillZero: false }], yAxisTitle: 'minutes',
      }),
      grouped({
        id: 'category_bar', title: 'SOS by Category', chartType: 'bar', labelKey: 'category',
        sql: `SELECT category, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY category`,
        params: w.params, series: [{ label: 'Requests', field: 'c' }], yAxisTitle: 'requests',
      }),
      stacked({
        id: 'priority_by_region', title: 'Priority by Region', rowKey: 'region', colKey: 'priority', valueKey: 'c',
        categories: ['Critical', 'Normal'],
        sql: `SELECT region, priority, COUNT(*) AS c FROM sos_requests${w.sql} GROUP BY region, priority`,
        params: w.params,
      }),
      {
        id: 'response_scatter',
        title: 'Response Time vs People Affected',
        type: 'scatter',
        datasets: scatter(`SELECT response_minutes AS x, people_count AS y, disaster_type AS k FROM sos_requests${w.sql}${w.sql ? ' AND' : ' WHERE'} response_minutes IS NOT NULL LIMIT 900`, w.params),
        axisTitles: { x: 'Response time (minutes)', y: 'People in request' },
        empty: false,
      },
    ],
    meta: meta(f, totals.total || 0),
  });
});

function scatter(sql, params) {
  const rows = query(sql, params);
  const byKey = new Map();
  for (const r of rows) {
    const k = String(r.k ?? 'All');
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push({ x: Number(r.x), y: Number(r.y) });
  }
  return [...byKey.entries()].map(([label, data]) => ({ label, data }));
}

/* ------------------------------------------------------------------ */
/* Relief camps                                                        */
/* ------------------------------------------------------------------ */
router.get('/camps', (req, res) => {
  const f = resolveRange(req.query, 'relief_camps', 'established_on');
  const w = buildWhere(f, { date: 'established_on', type: 'disaster_type', region: 'region', location: 'location', status: 'status' });
  const bucket = autoBucket(f.from, f.to, req.query.bucket);

  const totals = queryOne(`SELECT COUNT(*) AS total, SUM(capacity) AS capacity, SUM(occupancy) AS occupancy,
      SUM(food_units) AS food, SUM(water_litres) AS water, SUM(medicine_kits) AS medicine, SUM(blankets) AS blankets,
      SUM(medical_staff) AS staff FROM relief_camps${w.sql}`, w.params) || {};
  const criticalStock = queryOne(`SELECT COUNT(*) AS c FROM relief_camps${w.sql}${w.sql ? ' AND' : ' WHERE'} (food_units * 1.0 / NULLIF(capacity,0)) < 1`, w.params)?.c || 0;
  const occupancyRate = totals.capacity ? Math.round(((totals.occupancy || 0) / totals.capacity) * 1000) / 10 : 0;

  res.json({
    kpis: [
      kpi('camps', 'Relief Camps', totals.total || 0, { icon: 'camp' }),
      kpi('capacity', 'Total Capacity', totals.capacity || 0, { format: 'compact', icon: 'bed' }),
      kpi('occupancy', 'Current Occupancy', totals.occupancy || 0, { format: 'compact', icon: 'people' }),
      kpi('rate', 'Occupancy Rate', occupancyRate, { unit: '%', tone: occupancyRate > 85 ? 'danger' : 'default', icon: 'gauge' }),
      kpi('staff', 'Medical Staff', totals.staff || 0, { icon: 'cross' }),
      kpi('stock', 'Camps Low on Food', criticalStock, { tone: 'warning', icon: 'food' }),
    ],
    charts: [
      grouped({
        id: 'capacity_vs_occupancy', title: 'Camp Capacity vs Occupancy (by region)', chartType: 'bar', labelKey: 'region',
        sql: `SELECT region, SUM(capacity) AS capacity, SUM(occupancy) AS occupancy FROM relief_camps${w.sql} GROUP BY region`,
        params: w.params, series: [{ label: 'Capacity', field: 'capacity' }, { label: 'Occupancy', field: 'occupancy' }], yAxisTitle: 'beds',
      }),
      chart({
        id: 'available_donut', title: 'Available vs Occupied Beds', type: 'donut',
        labels: ['Occupied', 'Available'],
        datasets: [{ label: 'Beds', data: [totals.occupancy || 0, Math.max(0, (totals.capacity || 0) - (totals.occupancy || 0))] }],
        empty: !(totals.capacity || 0),
        emptyReason: 'No relief camps in the selected range',
      }),
      grouped({
        id: 'location_bar', title: 'Camps by Location', chartType: 'bar', labelKey: 'location', limit: 15,
        sql: `SELECT location, COUNT(*) AS c FROM relief_camps${w.sql} GROUP BY location`,
        params: w.params, series: [{ label: 'Camps', field: 'c' }], yAxisTitle: 'camps', horizontal: true,
      }),
      grouped({
        id: 'resource_bar', title: 'Resource Availability (totals)', chartType: 'bar', labelKey: 'resource', sort: 'none',
        sql: `SELECT 'Food units' AS resource, SUM(food_units) AS qty FROM relief_camps${w.sql}
              UNION ALL SELECT 'Medicine kits', SUM(medicine_kits) FROM relief_camps${w.sql}
              UNION ALL SELECT 'Blankets', SUM(blankets) FROM relief_camps${w.sql}`,
        params: [...w.params, ...w.params, ...w.params], series: [{ label: 'Units', field: 'qty' }], yAxisTitle: 'units',
      }),
      timeSeries({
        id: 'occupancy_trend', title: `Camp Occupancy Trend (${bucket})`,
        sql: `SELECT ${bucketExpr('co.recorded_on', bucket)} AS bucket, AVG(co.occupancy) AS avg_occ, SUM(co.occupancy) AS total_occ, AVG(co.capacity) AS avg_cap
              FROM camp_occupancy co JOIN relief_camps c ON c.id = co.camp_id
              ${buildWhere(f, { date: 'c.established_on', type: 'c.disaster_type', region: 'c.region', location: 'c.location', status: 'c.status' }).sql}
              GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to,
        series: [{ label: 'Avg occupancy per camp', field: 'avg_occ' }, { label: 'Avg capacity per camp', field: 'avg_cap', dashed: true, fillZero: false }],
        yAxisTitle: 'people per camp',
      }),
      grouped({
        id: 'essentials_bar', title: 'Food / Water / Medicine per Occupant', chartType: 'bar', labelKey: 'resource', sort: 'none',
        sql: `SELECT 'Food units' AS resource, ROUND(SUM(food_units)*1.0/NULLIF(SUM(occupancy),0),2) AS qty FROM relief_camps${w.sql}
              UNION ALL SELECT 'Water litres', ROUND(SUM(water_litres)*1.0/NULLIF(SUM(occupancy),0),2) FROM relief_camps${w.sql}
              UNION ALL SELECT 'Medicine kits', ROUND(SUM(medicine_kits)*1.0/NULLIF(SUM(occupancy),0),2) FROM relief_camps${w.sql}
              UNION ALL SELECT 'Blankets', ROUND(SUM(blankets)*1.0/NULLIF(SUM(occupancy),0),2) FROM relief_camps${w.sql}`,
        params: [...w.params, ...w.params, ...w.params, ...w.params], series: [{ label: 'Per occupant', field: 'qty' }], yAxisTitle: 'units / person',
      }),
      grouped({
        id: 'top_camps', title: 'Largest Camps — Capacity vs Occupancy', chartType: 'bar', labelKey: 'name', limit: 12,
        sql: `SELECT name, capacity, occupancy FROM relief_camps${w.sql}`,
        params: w.params, series: [{ label: 'Capacity', field: 'capacity' }, { label: 'Occupancy', field: 'occupancy' }], yAxisTitle: 'beds', horizontal: true,
      }),
      grouped({
        id: 'status_donut', title: 'Camp Status', chartType: 'donut', labelKey: 'status',
        sql: `SELECT status, COUNT(*) AS c FROM relief_camps${w.sql} GROUP BY status`,
        params: w.params, series: [{ label: 'Camps', field: 'c' }],
      }),
    ],
    meta: { ...meta(f, totals.total || 0), bucket, occupancyRate },
  });
});

/* ------------------------------------------------------------------ */
/* Volunteers                                                          */
/* ------------------------------------------------------------------ */
router.get('/volunteers', (req, res) => {
  const f = resolveRange(req.query, 'volunteers', 'registered_on');
  const w = buildWhere(f, { date: 'registered_on', type: 'disaster_type', severity: null, region: 'region', location: 'location', status: 'status' });
  const bucket = autoBucket(f.from, f.to, req.query.bucket);

  const totals = queryOne(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status='Assigned' THEN 1 ELSE 0 END) AS assigned,
      SUM(deployments) AS deployments, SUM(hours_logged) AS hours FROM volunteers${w.sql}`, w.params) || {};

  res.json({
    kpis: [
      kpi('total', 'Total Volunteers', totals.total || 0, { icon: 'people' }),
      kpi('available', 'Available Volunteers', totals.available || 0, { icon: 'check', tone: 'success' }),
      kpi('assigned', 'Currently Assigned', totals.assigned || 0, { icon: 'flag', tone: 'warning' }),
      kpi('deployments', 'Total Deployments', totals.deployments || 0, { icon: 'truck' }),
      kpi('hours', 'Hours Logged', totals.hours || 0, { format: 'compact', icon: 'clock' }),
    ],
    charts: [
      grouped({
        id: 'location_bar', title: 'Volunteers by Location', chartType: 'bar', labelKey: 'location', limit: 15,
        sql: `SELECT location, COUNT(*) AS c FROM volunteers${w.sql} GROUP BY location`,
        params: w.params, series: [{ label: 'Volunteers', field: 'c' }], yAxisTitle: 'volunteers', horizontal: true,
      }),
      grouped({
        id: 'skill_bar', title: 'Volunteers by Skill', chartType: 'bar', labelKey: 'skill',
        sql: `SELECT skill, COUNT(*) AS c FROM volunteers${w.sql} GROUP BY skill`,
        params: w.params, series: [{ label: 'Volunteers', field: 'c' }], yAxisTitle: 'volunteers',
      }),
      grouped({
        id: 'type_donut', title: 'Volunteers by Disaster Type', chartType: 'donut', labelKey: 'disaster_type',
        sql: `SELECT disaster_type, COUNT(*) AS c FROM volunteers${w.sql} GROUP BY disaster_type`,
        params: w.params, series: [{ label: 'Volunteers', field: 'c' }],
      }),
      timeSeries({
        id: 'registration_trend', title: `Volunteer Registration Trend (${bucket})`,
        sql: `SELECT ${bucketExpr('registered_on', bucket)} AS bucket, COUNT(*) AS c FROM volunteers${w.sql} GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to, series: [{ label: 'New volunteers', field: 'c', fill: true }], yAxisTitle: 'volunteers',
      }),
      chart({
        id: 'available_donut', title: 'Available vs Assigned', type: 'donut',
        labels: ['Available', 'Assigned', 'On Leave'],
        datasets: [{
          label: 'Volunteers',
          data: [
            totals.available || 0,
            totals.assigned || 0,
            Math.max(0, (totals.total || 0) - (totals.available || 0) - (totals.assigned || 0)),
          ],
        }],
        empty: !(totals.total || 0),
        emptyReason: 'No volunteers match the current filters',
      }),
      grouped({
        id: 'region_bar', title: 'Volunteers by Region', chartType: 'bar', labelKey: 'region',
        sql: `SELECT region, COUNT(*) AS c FROM volunteers${w.sql} GROUP BY region`,
        params: w.params, series: [{ label: 'Volunteers', field: 'c' }], yAxisTitle: 'volunteers',
      }),
      stacked({
        id: 'skill_status', title: 'Skill Availability', rowKey: 'skill', colKey: 'status', valueKey: 'c',
        categories: ['Available', 'Assigned', 'On Leave'], horizontal: true,
        sql: `SELECT skill, status, COUNT(*) AS c FROM volunteers${w.sql} GROUP BY skill, status`,
        params: w.params,
      }),
      grouped({
        id: 'deployments_bar', title: 'Avg Deployments by Skill', chartType: 'bar', labelKey: 'skill',
        sql: `SELECT skill, ROUND(AVG(deployments),2) AS c FROM volunteers${w.sql} GROUP BY skill`,
        params: w.params, series: [{ label: 'Avg deployments', field: 'c' }], yAxisTitle: 'deployments',
      }),
    ],
    meta: meta(f, totals.total || 0),
  });
});

/* ------------------------------------------------------------------ */
/* Donations                                                           */
/* ------------------------------------------------------------------ */
router.get('/donations', (req, res) => {
  const f = resolveRange(req.query, 'donations', 'donated_on');
  const w = buildWhere(f, { date: 'donated_on', type: 'disaster_type', region: 'region', location: 'location' });
  const bucket = autoBucket(f.from, f.to, req.query.bucket);

  const totals = queryOne(`SELECT COUNT(*) AS total, SUM(amount) AS amount, SUM(quantity) AS quantity,
      SUM(CASE WHEN type='Cash' THEN amount ELSE 0 END) AS cash,
      SUM(CASE WHEN donor_type='Corporate' THEN amount ELSE 0 END) AS corporate FROM donations${w.sql}`, w.params) || {};

  res.json({
    kpis: [
      kpi('amount', 'Total Donation Amount', totals.amount || 0, { format: 'currency', icon: 'rupee' }),
      kpi('cash', 'Cash Contributions', totals.cash || 0, { format: 'currency', icon: 'cash' }),
      kpi('inkind', 'In-kind Items', totals.quantity || 0, { format: 'compact', icon: 'box' }),
      kpi('count', 'Contributions', totals.total || 0, { icon: 'heart' }),
      kpi('corporate', 'Corporate Share', totals.amount ? Math.round(((totals.corporate || 0) / totals.amount) * 1000) / 10 : 0, { unit: '%', icon: 'building' }),
    ],
    charts: [
      timeSeries({
        id: 'over_time', title: `Donations Over Time (${bucket})`,
        sql: `SELECT ${bucketExpr('donated_on', bucket)} AS bucket, SUM(amount) AS amount, COUNT(*) AS c FROM donations${w.sql} GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to,
        series: [{ label: 'Amount (₹)', field: 'amount', fill: true }, { label: 'Contributions', field: 'c' }], yAxisTitle: '₹ / count',
      }),
      grouped({
        id: 'by_disaster', title: 'Donations by Disaster Type', chartType: 'bar', labelKey: 'disaster_type',
        sql: `SELECT disaster_type, SUM(amount) AS amount, COUNT(*) AS c FROM donations${w.sql} GROUP BY disaster_type`,
        params: w.params, series: [{ label: 'Amount (₹)', field: 'amount' }, { label: 'Contributions', field: 'c' }], yAxisTitle: '₹',
      }),
      grouped({
        id: 'type_donut', title: 'Donations by Type', chartType: 'donut', labelKey: 'type',
        sql: `SELECT type, COUNT(*) AS c FROM donations${w.sql} GROUP BY type`,
        params: w.params, series: [{ label: 'Contributions', field: 'c' }],
      }),
      grouped({
        id: 'campaign_bar', title: 'Campaign-wise Donations', chartType: 'bar', labelKey: 'campaign', limit: 12,
        sql: `SELECT campaign, SUM(amount) AS amount FROM donations${w.sql} GROUP BY campaign`,
        params: w.params, series: [{ label: 'Amount (₹)', field: 'amount' }], yAxisTitle: '₹',
      }),
      timeSeries({
        id: 'monthly_trend', title: `Monthly Donation Trend (${bucket})`,
        sql: `SELECT ${bucketExpr('donated_on', bucket)} AS bucket, SUM(amount) AS amount FROM donations${w.sql} GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to, series: [{ label: 'Amount (₹)', field: 'amount', fill: true }], yAxisTitle: '₹',
      }),
      grouped({
        id: 'donor_donut', title: 'Donor Type Mix', chartType: 'donut', labelKey: 'donor_type',
        sql: `SELECT donor_type, SUM(amount) AS amount FROM donations${w.sql} GROUP BY donor_type`,
        params: w.params, series: [{ label: 'Amount (₹)', field: 'amount' }],
      }),
      grouped({
        id: 'region_bar', title: 'Donations by Region', chartType: 'bar', labelKey: 'region',
        sql: `SELECT region, SUM(amount) AS amount FROM donations${w.sql} GROUP BY region`,
        params: w.params, series: [{ label: 'Amount (₹)', field: 'amount' }], yAxisTitle: '₹',
      }),
      grouped({
        id: 'inkind_bar', title: 'In-kind Quantity by Type', chartType: 'bar', labelKey: 'type',
        sql: `SELECT type, SUM(quantity) AS qty FROM donations${w.sql} GROUP BY type`,
        params: w.params, series: [{ label: 'Items', field: 'qty' }], yAxisTitle: 'items',
      }),
    ],
    meta: meta(f, totals.total || 0),
  });
});

/* ------------------------------------------------------------------ */
/* Emergency helplines                                                 */
/* ------------------------------------------------------------------ */
router.get('/helplines', (req, res) => {
  const f = resolveRange(req.query, 'helpline_calls', 'called_at');
  const w = buildWhere(f, { date: 'called_at', type: 'emergency_type', region: 'region', location: 'location', status: 'status' });
  const bucket = autoBucket(f.from, f.to, req.query.bucket);
  const hasData = queryOne(`SELECT COUNT(*) AS c FROM helpline_calls`)?.c || 0;

  const totals = queryOne(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='Answered' THEN 1 ELSE 0 END) AS answered,
      SUM(CASE WHEN status='Missed' THEN 1 ELSE 0 END) AS missed,
      AVG(response_minutes) AS avg_response FROM helpline_calls${w.sql}`, w.params) || {};

  const noCalls = !hasData;
  const emptyAll = noCalls ? { empty: true, emptyReason: 'No emergency call records in the database' } : {};

  res.json({
    kpis: [
      kpi('total', 'Emergency Calls', totals.total || 0, { icon: 'phone', note: noCalls ? 'No call data' : undefined }),
      kpi('answered', 'Answered', totals.answered || 0, { icon: 'check', tone: 'success' }),
      kpi('missed', 'Missed Calls', totals.missed || 0, { icon: 'x', tone: 'danger' }),
      kpi('avg_response', 'Avg Response Time', totals.avg_response ? Math.round(totals.avg_response) : null, { unit: ' min', icon: 'clock' }),
      kpi('answer_rate', 'Answer Rate', totals.total ? Math.round(((totals.answered || 0) / totals.total) * 1000) / 10 : null, { unit: '%', icon: 'gauge' }),
    ],
    charts: [
      { ...grouped({
        id: 'service_bar', title: 'Emergency Calls by Service', chartType: 'bar', labelKey: 'service',
        sql: `SELECT service, COUNT(*) AS c FROM helpline_calls${w.sql} GROUP BY service`,
        params: w.params, series: [{ label: 'Calls', field: 'c' }], yAxisTitle: 'calls',
      }), ...emptyAll },
      { ...timeSeries({
        id: 'calls_over_time', title: `Calls Over Time (${bucket})`,
        sql: `SELECT ${bucketExpr('called_at', bucket)} AS bucket, COUNT(*) AS c FROM helpline_calls${w.sql} GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to, series: [{ label: 'Calls', field: 'c', fill: true }], yAxisTitle: 'calls',
      }), ...emptyAll },
      { ...grouped({
        id: 'type_donut', title: 'Emergency Type Distribution', chartType: 'donut', labelKey: 'emergency_type',
        sql: `SELECT emergency_type, COUNT(*) AS c FROM helpline_calls${w.sql} GROUP BY emergency_type`,
        params: w.params, series: [{ label: 'Calls', field: 'c' }],
      }), ...emptyAll },
      { ...grouped({
        id: 'location_bar', title: 'Calls by Location', chartType: 'bar', labelKey: 'location', limit: 15,
        sql: `SELECT location, COUNT(*) AS c FROM helpline_calls${w.sql} GROUP BY location`,
        params: w.params, series: [{ label: 'Calls', field: 'c' }], yAxisTitle: 'calls', horizontal: true,
      }), ...emptyAll },
      { ...timeSeries({
        id: 'response_trend', title: `Avg Response Time (${bucket})`,
        sql: `SELECT ${bucketExpr('called_at', bucket)} AS bucket, AVG(response_minutes) AS avg_min FROM helpline_calls${w.sql}${w.sql ? ' AND' : ' WHERE'} response_minutes IS NOT NULL GROUP BY bucket ORDER BY bucket`,
        params: w.params, bucket, from: f.from, to: f.to, series: [{ label: 'Avg minutes', field: 'avg_min' }], yAxisTitle: 'minutes',
      }), ...emptyAll },
      { ...stacked({
        id: 'status_by_service', title: 'Call Outcome by Service', rowKey: 'service', colKey: 'status', valueKey: 'c',
        categories: ['Answered', 'Busy', 'Missed'], horizontal: true,
        sql: `SELECT service, status, COUNT(*) AS c FROM helpline_calls${w.sql} GROUP BY service, status`,
        params: w.params,
      }), ...emptyAll },
    ],
    meta: { ...meta(f, totals.total || 0), bucket, noCallData: noCalls },
  });
});

/* ------------------------------------------------------------------ */
/* Safety tips                                                         */
/* ------------------------------------------------------------------ */
router.get('/safety', (req, res) => {
  const f = resolveRange(req.query, 'safety_resource_usage', 'viewed_at');
  const wUsage = buildWhere(f, { date: 'viewed_at', type: 'disaster_type', region: null, location: null });
  const bucket = autoBucket(f.from, f.to, req.query.bucket);
  const usageCount = queryOne('SELECT COUNT(*) AS c FROM safety_resource_usage')?.c || 0;
  const tipsCount = queryOne('SELECT COUNT(*) AS c FROM safety_tips')?.c || 0;

  const emptyUsage = !usageCount ? { empty: true, emptyReason: 'No safety resource usage recorded — charts appear once usage data exists' } : {};

  res.json({
    kpis: [
      kpi('tips', 'Safety Resources', tipsCount, { icon: 'book' }),
      kpi('views', 'Resource Views', usageCount, { icon: 'eye' }),
      kpi('types', 'Disaster Types Covered', queryOne('SELECT COUNT(DISTINCT disaster_type) AS c FROM safety_tips')?.c || 0, { icon: 'shield' }),
      kpi('top', 'Most Viewed Category', queryOne('SELECT category FROM safety_resource_usage GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1')?.category || 'No data', { icon: 'star' }),
    ],
    charts: [
      grouped({
        id: 'tips_by_type', title: 'Safety Tips by Disaster Type', chartType: 'bar', labelKey: 'disaster_type',
        sql: 'SELECT disaster_type, COUNT(*) AS c FROM safety_tips GROUP BY disaster_type',
        params: [], series: [{ label: 'Tips', field: 'c' }], yAxisTitle: 'tips',
      }),
      { ...grouped({
        id: 'resource_usage', title: 'Safety Resource Usage', chartType: 'bar', labelKey: 'resource_type',
        sql: `SELECT resource_type, COUNT(*) AS c FROM safety_resource_usage${wUsage.sql} GROUP BY resource_type`,
        params: wUsage.params, series: [{ label: 'Views', field: 'c' }], yAxisTitle: 'views',
      }), ...emptyUsage },
      { ...grouped({
        id: 'viewed_categories', title: 'Most Viewed Disaster Categories', chartType: 'donut', labelKey: 'category',
        sql: `SELECT category, COUNT(*) AS c FROM safety_resource_usage${wUsage.sql} GROUP BY category`,
        params: wUsage.params, series: [{ label: 'Views', field: 'c' }],
      }), ...emptyUsage },
      { ...timeSeries({
        id: 'content_trend', title: `Safety Content Trend (${bucket})`,
        sql: `SELECT ${bucketExpr('viewed_at', bucket)} AS bucket, COUNT(*) AS views FROM safety_resource_usage${wUsage.sql} GROUP BY bucket ORDER BY bucket`,
        params: wUsage.params, bucket, from: f.from, to: f.to, series: [{ label: 'Views', field: 'views', fill: true }], yAxisTitle: 'views',
      }), ...emptyUsage },
      { ...grouped({
        id: 'type_views', title: 'Views by Disaster Type', chartType: 'bar', labelKey: 'disaster_type',
        sql: `SELECT disaster_type, COUNT(*) AS c FROM safety_resource_usage${wUsage.sql} GROUP BY disaster_type`,
        params: wUsage.params, series: [{ label: 'Views', field: 'c' }], yAxisTitle: 'views',
      }), ...emptyUsage },
      { ...stacked({
        id: 'category_resource', title: 'Resource Type by Category', rowKey: 'category', colKey: 'resource_type', valueKey: 'c',
        categories: ['Tip', 'Checklist', 'Video', 'Field Guide', 'Poster'],
        sql: `SELECT category, resource_type, COUNT(*) AS c FROM safety_resource_usage${wUsage.sql} GROUP BY category, resource_type`,
        params: wUsage.params, horizontal: true,
      }), ...emptyUsage },
    ],
    meta: { ...meta(f, usageCount), bucket, hasUsage: usageCount > 0, tipsCount },
  });
});
