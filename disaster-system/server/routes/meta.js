/**
 * Meta routes: filter options for every module, data-source status,
 * and demo-data controls (reseed / clear) so empty states can be verified.
 */
import { Router } from 'express';
import { query, queryOne, tableCounts, DB_PATH } from '../lib/db.js';
import { clearAll, seed } from '../lib/seed.js';

export const router = Router();

const MODULE_CONFIG = {
  dashboard: { table: 'disasters', date: 'occurred_on', type: 'type', severity: 'severity', region: 'region', location: 'location', status: 'status' },
  disasters: { table: 'disasters', date: 'occurred_on', type: 'type', severity: 'severity', region: 'region', location: 'location', status: 'status' },
  alerts: { table: 'alerts', date: 'issued_at', type: 'type', severity: 'severity', region: 'region', location: 'location', status: 'status' },
  map: { table: 'disasters', date: 'occurred_on', type: 'type', severity: 'severity', region: 'region', location: 'location', status: 'status' },
  sos: { table: 'sos_requests', date: 'reported_at', type: 'disaster_type', severity: 'severity', region: 'region', location: 'location', status: 'status' },
  camps: { table: 'relief_camps', date: 'established_on', type: 'disaster_type', region: 'region', location: 'location', status: 'status' },
  volunteers: { table: 'volunteers', date: 'registered_on', type: 'disaster_type', region: 'region', location: 'location', status: 'status' },
  donations: { table: 'donations', date: 'donated_on', type: 'disaster_type', region: 'region', location: 'location' },
  helplines: { table: 'helpline_calls', date: 'called_at', type: 'emergency_type', region: 'region', location: 'location', status: 'status' },
  safety: { table: 'safety_resource_usage', date: 'viewed_at', type: 'disaster_type' },
};

router.get('/options', (req, res) => {
  const cfg = MODULE_CONFIG[req.query.module] || MODULE_CONFIG.dashboard;
  const t = cfg.table;
  const distinct = (col) => (col ? query(`SELECT DISTINCT ${col} AS v FROM ${t} WHERE ${col} IS NOT NULL AND ${col} <> '' ORDER BY v`).map((r) => r.v) : []);
  const range = queryOne(`SELECT MIN(${cfg.date}) AS min, MAX(${cfg.date}) AS max FROM ${t}`);
  res.json({
    module: req.query.module || 'dashboard',
    table: t,
    types: distinct(cfg.type),
    severities: distinct(cfg.severity),
    regions: distinct(cfg.region),
    locations: distinct(cfg.location),
    statuses: distinct(cfg.status),
    range: { from: range?.min ? String(range.min).slice(0, 10) : null, to: range?.max ? String(range.max).slice(0, 10) : null },
  });
});

router.get('/status', (_req, res) => {
  res.json({
    database: 'SQLite (node:sqlite)',
    path: DB_PATH,
    tables: tableCounts(),
    now: new Date().toISOString(),
  });
});

router.post('/reseed', (_req, res) => {
  clearAll();
  res.json({ reseeded: seed() });
});

const CLEARABLE = ['disasters', 'alerts', 'sos_requests', 'relief_camps', 'volunteers', 'donations', 'helpline_calls', 'safety_resource_usage'];
router.post('/clear', (req, res) => {
  const table = req.body?.table;
  if (!CLEARABLE.includes(table)) {
    return res.status(400).json({ error: `Clearable tables: ${CLEARABLE.join(', ')}` });
  }
  query(`DELETE FROM ${table}`);
  res.json({ cleared: table, remaining: queryOne(`SELECT COUNT(*) AS c FROM ${table}`).c });
});
