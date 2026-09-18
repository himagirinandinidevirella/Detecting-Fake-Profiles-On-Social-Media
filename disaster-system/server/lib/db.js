/**
 * Database layer — uses Node's built-in `node:sqlite` (no native build step).
 * Every chart in the dashboard is computed from the tables defined here.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, 'disaster.db');

export const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS disasters (
  id                  INTEGER PRIMARY KEY,
  name                TEXT    NOT NULL,
  type                TEXT    NOT NULL,
  severity            TEXT    NOT NULL,
  location            TEXT    NOT NULL,
  region              TEXT    NOT NULL,
  lat                 REAL,
  lon                 REAL,
  occurred_on         TEXT    NOT NULL,
  status              TEXT    NOT NULL,
  affected_population INTEGER NOT NULL DEFAULT 0,
  casualties          INTEGER NOT NULL DEFAULT 0,
  displaced           INTEGER NOT NULL DEFAULT 0,
  damage_crore        REAL    NOT NULL DEFAULT 0,
  source              TEXT    NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY,
  disaster_id INTEGER,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL,
  severity    TEXT NOT NULL,
  location    TEXT NOT NULL,
  region      TEXT NOT NULL,
  status      TEXT NOT NULL,
  channel     TEXT NOT NULL,
  issued_at   TEXT NOT NULL,
  resolved_at TEXT,
  source      TEXT NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS sos_requests (
  id               INTEGER PRIMARY KEY,
  disaster_id      INTEGER,
  disaster_type    TEXT NOT NULL,
  severity         TEXT NOT NULL,
  location         TEXT NOT NULL,
  region           TEXT NOT NULL,
  lat              REAL,
  lon              REAL,
  priority         TEXT NOT NULL,
  status           TEXT NOT NULL,
  category         TEXT NOT NULL,
  reported_at      TEXT NOT NULL,
  responded_at     TEXT,
  response_minutes REAL,
  people_count     INTEGER NOT NULL DEFAULT 1,
  source           TEXT NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS relief_camps (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  disaster_id      INTEGER,
  disaster_type    TEXT NOT NULL,
  location         TEXT NOT NULL,
  region           TEXT NOT NULL,
  lat              REAL,
  lon              REAL,
  capacity         INTEGER NOT NULL DEFAULT 0,
  occupancy        INTEGER NOT NULL DEFAULT 0,
  food_units       INTEGER NOT NULL DEFAULT 0,
  water_litres     INTEGER NOT NULL DEFAULT 0,
  medicine_kits    INTEGER NOT NULL DEFAULT 0,
  blankets         INTEGER NOT NULL DEFAULT 0,
  medical_staff    INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL,
  established_on   TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS camp_occupancy (
  id           INTEGER PRIMARY KEY,
  camp_id      INTEGER NOT NULL,
  recorded_on  TEXT NOT NULL,
  occupancy    INTEGER NOT NULL,
  capacity     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS volunteers (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  skill          TEXT NOT NULL,
  disaster_type  TEXT NOT NULL,
  location       TEXT NOT NULL,
  region         TEXT NOT NULL,
  status         TEXT NOT NULL,
  registered_on  TEXT NOT NULL,
  deployments    INTEGER NOT NULL DEFAULT 0,
  hours_logged   INTEGER NOT NULL DEFAULT 0,
  source         TEXT NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS donations (
  id            INTEGER PRIMARY KEY,
  campaign      TEXT NOT NULL,
  disaster_id   INTEGER,
  disaster_type TEXT NOT NULL,
  type          TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,
  quantity      INTEGER NOT NULL DEFAULT 0,
  donor_type    TEXT NOT NULL,
  location      TEXT NOT NULL,
  region        TEXT NOT NULL,
  donated_on    TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS helpline_calls (
  id               INTEGER PRIMARY KEY,
  service          TEXT NOT NULL,
  emergency_type   TEXT NOT NULL,
  location         TEXT NOT NULL,
  region           TEXT NOT NULL,
  called_at        TEXT NOT NULL,
  response_minutes REAL,
  status           TEXT NOT NULL,
  outcome          TEXT,
  source           TEXT NOT NULL DEFAULT 'seed'
);

CREATE TABLE IF NOT EXISTS safety_tips (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  disaster_type TEXT NOT NULL,
  category      TEXT NOT NULL,
  audience      TEXT,
  content       TEXT,
  published_on  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS safety_resource_usage (
  id            INTEGER PRIMARY KEY,
  tip_id        INTEGER,
  disaster_type TEXT NOT NULL,
  category      TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  viewed_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  filename      TEXT NOT NULL,
  format        TEXT NOT NULL,
  uploaded_at   TEXT NOT NULL,
  row_count     INTEGER NOT NULL DEFAULT 0,
  column_count  INTEGER NOT NULL DEFAULT 0,
  profile_json  TEXT NOT NULL DEFAULT '{}',
  applied_to    TEXT,
  storage_table TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_rows (
  id          INTEGER PRIMARY KEY,
  dataset_id  INTEGER NOT NULL,
  row_index   INTEGER NOT NULL,
  data_json   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_disasters_date   ON disasters(occurred_on);
CREATE INDEX IF NOT EXISTS idx_disasters_type   ON disasters(type);
CREATE INDEX IF NOT EXISTS idx_alerts_date      ON alerts(issued_at);
CREATE INDEX IF NOT EXISTS idx_sos_date         ON sos_requests(reported_at);
CREATE INDEX IF NOT EXISTS idx_camps_region     ON relief_camps(region);
CREATE INDEX IF NOT EXISTS idx_occupancy_camp   ON camp_occupancy(camp_id, recorded_on);
CREATE INDEX IF NOT EXISTS idx_volunteers_date  ON volunteers(registered_on);
CREATE INDEX IF NOT EXISTS idx_donations_date   ON donations(donated_on);
CREATE INDEX IF NOT EXISTS idx_calls_date       ON helpline_calls(called_at);
CREATE INDEX IF NOT EXISTS idx_usage_date       ON safety_resource_usage(viewed_at);
CREATE INDEX IF NOT EXISTS idx_dataset_rows     ON dataset_rows(dataset_id);
`);

/** Transaction helper for node:sqlite. */
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  }
}

/** Convenience: run all statements and return rows. */
export function query(sql, params = []) {
  return db.prepare(sql).all(...params);
}

export function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params) || null;
}

/** Count of rows for every analytics table — used by the data-source panel. */
export function tableCounts() {
  const tables = [
    'disasters', 'alerts', 'sos_requests', 'relief_camps', 'camp_occupancy',
    'volunteers', 'donations', 'helpline_calls', 'safety_tips',
    'safety_resource_usage', 'datasets', 'dataset_rows',
  ];
  const out = {};
  for (const t of tables) {
    out[t] = queryOne(`SELECT COUNT(*) AS c FROM ${t}`).c;
  }
  return out;
}
