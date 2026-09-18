/**
 * Dataset management: upload CSV/XLSX/JSON, profile it, analyse it,
 * compare two datasets, or load it into a module so every chart updates.
 */
import { Router } from 'express';
import multer from 'multer';
import { db, transaction } from '../lib/db.js';
import { parseDataset, profileColumns, aggregate, suggestCharts, compareDatasets, toNumber, toDate } from '../lib/datasetEngine.js';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

const MAX_ROWS = 60000;

function loadRows(datasetId, limit = MAX_ROWS) {
  const rows = db.prepare('SELECT data_json FROM dataset_rows WHERE dataset_id = ? ORDER BY row_index LIMIT ?').all(datasetId, limit);
  return rows.map((r) => JSON.parse(r.data_json));
}

function getDataset(id) {
  return db.prepare('SELECT * FROM datasets WHERE id = ?').get(Number(id));
}

function profileOf(dataset) {
  return JSON.parse(dataset.profile_json || '{}');
}

/* ---------------- upload ---------------- */
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file received. Send a multipart form field named "file".' });
  const filename = req.file.originalname || 'dataset';
  try {
    const { rows, columns, sheetName, format } = parseDataset(req.file.buffer, filename, req.file.mimetype);
    if (!rows.length) return res.status(400).json({ error: 'No data rows could be read from this file.' });
    if (!columns.length) return res.status(400).json({ error: 'No columns were detected in this file.' });

    const trimmed = rows.slice(0, MAX_ROWS);
    const profile = { columns: profileColumns(trimmed, columns), sheetName, truncated: rows.length > MAX_ROWS };
    const name = (req.body?.name || filename.replace(/\.[^.]+$/, '')).slice(0, 120);

    const info = transaction(() => {
      const ins = db.prepare(`INSERT INTO datasets (name, filename, format, uploaded_at, row_count, column_count, profile_json, storage_table)
        VALUES (?,?,?,?,?,?,?,'dataset_rows')`);
      const r = ins.run(name, filename, format, new Date().toISOString(), trimmed.length, columns.length, JSON.stringify(profile));
      const id = Number(r.lastInsertRowid);
      const insRow = db.prepare('INSERT INTO dataset_rows (dataset_id, row_index, data_json) VALUES (?,?,?)');
      trimmed.forEach((row, i) => insRow.run(id, i, JSON.stringify(row)));
      return id;
    });

    res.json({
      id: info,
      name,
      filename,
      format,
      rowCount: trimmed.length,
      columnCount: columns.length,
      profile,
      suggestions: suggestCharts(profile.columns, trimmed.length),
    });
  } catch (err) {
    res.status(400).json({ error: `Could not parse this file: ${err.message}` });
  }
});

/* ---------------- list / detail ---------------- */
router.get('/', (_req, res) => {
  const datasets = db.prepare('SELECT * FROM datasets ORDER BY id DESC').all();
  res.json(datasets.map((d) => {
    const p = profileOf(d);
    return {
      id: d.id, name: d.name, filename: d.filename, format: d.format, uploaded_at: d.uploaded_at,
      row_count: d.row_count, column_count: d.column_count, applied_to: d.applied_to,
      numeric: p.columns.filter((c) => c.type === 'numeric').map((c) => c.name),
      categorical: p.columns.filter((c) => c.type === 'categorical').map((c) => c.name),
      date: p.columns.filter((c) => c.type === 'date').map((c) => c.name),
      missing: p.columns.reduce((s, c) => s + c.missing, 0),
    };
  }));
});

/** Column names accepted by each module target (for the apply dialog). */
router.get('/targets/schema', (_req, res) => {
  res.json(Object.fromEntries(Object.entries(TARGETS).map(([k, v]) => [k, Object.keys(v.fields)])));
});

router.get('/:id', (req, res) => {
  const d = getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dataset not found' });
  const profile = profileOf(d);
  res.json({
    id: d.id, name: d.name, filename: d.filename, format: d.format, uploaded_at: d.uploaded_at,
    row_count: d.row_count, column_count: d.column_count, applied_to: d.applied_to,
    profile,
    suggestions: suggestCharts(profile.columns, d.row_count),
  });
});

router.get('/:id/rows', (req, res) => {
  const d = getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dataset not found' });
  const limit = Math.min(500, Number(req.query.limit) || 25);
  res.json({ columns: Object.keys(loadRows(d.id, 1)[0] || {}), rows: loadRows(d.id, limit) });
});

router.delete('/:id', (req, res) => {
  const d = getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dataset not found' });
  transaction(() => {
    db.prepare('DELETE FROM dataset_rows WHERE dataset_id = ?').run(d.id);
    db.prepare('DELETE FROM datasets WHERE id = ?').run(d.id);
  });
  res.json({ deleted: d.id });
});

/* ---------------- analysis ---------------- */
router.post('/:id/analyze', (req, res) => {
  const d = getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dataset not found' });
  const rows = loadRows(d.id);
  const spec = req.body || {};
  const result = aggregate(rows, spec);
  res.json({
    dataset: { id: d.id, name: d.name, rows: rows.length },
    spec,
    ...result,
  });
});

/** Automatic visual set generated straight from the uploaded columns. */
router.post('/:id/auto', (req, res) => {
  const d = getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dataset not found' });
  const rows = loadRows(d.id);
  const profile = profileOf(d);
  const suggestions = suggestCharts(profile.columns, rows.length);
  const charts = suggestions.map((s, i) => ({ ...aggregate(rows, s), id: `auto_${i}`, title: s.title, ...s }));
  res.json({ dataset: { id: d.id, name: d.name, rows: rows.length }, charts });
});

/* ---------------- comparison ---------------- */
router.post('/compare', (req, res) => {
  const { a, b } = req.body || {};
  const da = getDataset(a);
  const dbSet = getDataset(b);
  if (!da || !dbSet) return res.status(404).json({ error: 'Select two uploaded datasets to compare' });
  const result = compareDatasets(
    { id: da.id, name: da.name, rows: loadRows(da.id), profile: profileOf(da) },
    { id: dbSet.id, name: dbSet.name, rows: loadRows(dbSet.id), profile: profileOf(dbSet) },
  );
  res.json(result);
});

/* ---------------- apply to a module ---------------- */
const TARGETS = {
  disasters: {
    table: 'disasters',
    date: 'occurred_on',
    fields: {
      name: ['name', 'disaster name', 'event', 'title'],
      type: ['type', 'disaster', 'disaster_type', 'category', 'event type'],
      severity: ['severity', 'level', 'magnitude', 'intensity'],
      location: ['location', 'city', 'district', 'place', 'area'],
      region: ['region', 'state', 'zone', 'province'],
      lat: ['lat', 'latitude', 'y'],
      lon: ['lon', 'lng', 'long', 'longitude', 'x'],
      status: ['status', 'state of event', 'stage'],
      affected_population: ['affected', 'affected_people', 'affected_population', 'people affected', 'population', 'impacted'],
      casualties: ['casualties', 'deaths', 'fatalities', 'casualty'],
      displaced: ['displaced', 'evacuated', 'displaced_people'],
      damage_crore: ['damage', 'damage_crore', 'loss', 'cost'],
      occurred_on: ['date', 'occurred_on', 'event date', 'disaster date', 'start date', 'start', 'event_date'],
    },
  },
  sos_requests: {
    table: 'sos_requests',
    date: 'reported_at',
    fields: {
      disaster_type: ['type', 'disaster', 'disaster_type', 'category'],
      severity: ['severity', 'level'],
      location: ['location', 'city', 'district', 'place'],
      region: ['region', 'state'],
      lat: ['lat', 'latitude'],
      lon: ['lon', 'lng', 'longitude'],
      priority: ['priority', 'urgency', 'criticality'],
      status: ['status', 'state'],
      category: ['category', 'kind', 'sos type'],
      response_minutes: ['response', 'response_minutes', 'response time', 'minutes'],
      people_count: ['people', 'people_count', 'persons', 'people involved'],
      reported_at: ['date', 'reported_at', 'reported', 'requested_at', 'request date', 'timestamp'],
    },
  },
  relief_camps: {
    table: 'relief_camps',
    date: 'established_on',
    fields: {
      name: ['name', 'camp', 'camp name'],
      disaster_type: ['type', 'disaster', 'disaster_type'],
      location: ['location', 'city', 'district'],
      region: ['region', 'state'],
      lat: ['lat', 'latitude'],
      lon: ['lon', 'lng', 'longitude'],
      capacity: ['capacity', 'total capacity', 'beds'],
      occupancy: ['occupancy', 'occupied', 'current'],
      food_units: ['food', 'food_units', 'meals'],
      water_litres: ['water', 'water_litres', 'water liters'],
      medicine_kits: ['medicine', 'medicine_kits', 'medical'],
      blankets: ['blankets', 'blanket'],
      medical_staff: ['medical_staff', 'staff', 'doctors'],
      status: ['status', 'state'],
      established_on: ['date', 'established_on', 'established', 'opened', 'start date'],
    },
  },
  volunteers: {
    table: 'volunteers',
    date: 'registered_on',
    fields: {
      name: ['name', 'volunteer', 'volunteer name'],
      skill: ['skill', 'skills', 'expertise', 'specialisation'],
      disaster_type: ['type', 'disaster', 'disaster_type'],
      location: ['location', 'city', 'district'],
      region: ['region', 'state'],
      status: ['status', 'availability', 'state'],
      deployments: ['deployments', 'missions'],
      hours_logged: ['hours', 'hours_logged', 'hours logged', 'service hours'],
      registered_on: ['date', 'registered_on', 'registered', 'joined', 'registration date'],
    },
  },
  donations: {
    table: 'donations',
    date: 'donated_on',
    fields: {
      campaign: ['campaign', 'fund', 'drive'],
      disaster_type: ['type', 'disaster', 'disaster_type'],
      type: ['donation_type', 'donation type', 'kind', 'category'],
      amount: ['amount', 'value', 'donation', 'money'],
      quantity: ['quantity', 'qty', 'items'],
      donor_type: ['donor', 'donor_type', 'donor type', 'source'],
      location: ['location', 'city'],
      region: ['region', 'state'],
      donated_on: ['date', 'donated_on', 'donated', 'donation date', 'transaction date'],
    },
  },
  alerts: {
    table: 'alerts',
    date: 'issued_at',
    fields: {
      title: ['title', 'alert', 'message', 'name'],
      type: ['type', 'disaster', 'disaster_type'],
      severity: ['severity', 'level'],
      location: ['location', 'city', 'district'],
      region: ['region', 'state'],
      status: ['status', 'state'],
      channel: ['channel', 'medium', 'source'],
      resolved_at: ['resolved', 'resolved_at', 'closed'],
      issued_at: ['date', 'issued_at', 'issued', 'alert date', 'sent', 'timestamp'],
    },
  },
  helpline_calls: {
    table: 'helpline_calls',
    date: 'called_at',
    fields: {
      service: ['service', 'helpline', 'number', 'agency'],
      emergency_type: ['type', 'emergency', 'emergency_type', 'category'],
      location: ['location', 'city'],
      region: ['region', 'state'],
      response_minutes: ['response', 'response_minutes', 'wait'],
      status: ['status', 'outcome status'],
      outcome: ['outcome', 'result'],
      called_at: ['date', 'called_at', 'called', 'call time', 'timestamp'],
    },
  },
};

/** Honest placeholders for columns a dataset does not carry. */
const FIELD_DEFAULTS = {
  type: 'Unclassified',
  disaster_type: 'Unclassified',
  emergency_type: 'Unclassified',
  severity: 'Unknown',
  location: 'Unknown',
  region: 'Unspecified',
  status: 'Unspecified',
  priority: 'Normal',
  category: 'Uncategorised',
  skill: 'General',
  campaign: 'General Fund',
  donor_type: 'Unknown',
  service: 'Unknown Service',
  channel: 'Unknown',
};

const NUMERIC_FIELDS = /^(affected_population|casualties|displaced|damage_crore|capacity|occupancy|food_units|water_litres|medicine_kits|blankets|medical_staff|deployments|hours_logged|amount|quantity|response_minutes|people_count|lat|lon)$/;

/**
 * Maps dataset columns onto a module schema.
 * Exact name matches always win, so a column called "Disaster" is bound to the
 * module's `type` field and cannot be stolen by the `name` field.
 */
function matchColumn(target, columns, explicit) {
  const cfg = TARGETS[target].fields;
  const norm = (s) => String(s).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = columns.map((c) => ({ raw: c, key: norm(c) }));
  const map = {};
  const used = new Set();

  // Which field claims each column by exact alias? Those columns are reserved.
  const reserved = new Map();
  for (const [field, aliases] of Object.entries(cfg)) {
    for (const a of aliases) {
      const hit = lower.find((c) => c.key === norm(a));
      if (hit && !reserved.has(hit.raw)) { reserved.set(hit.raw, field); break; }
    }
  }

  const tiers = [
    (c, a) => c.key === norm(a),
    (c, a) => c.key.split(' ').includes(norm(a)) || norm(a).split(' ').includes(c.key),
    (c, a) => c.key.includes(norm(a)) || norm(a).includes(c.key),
  ];

  for (const tier of tiers) {
    for (const [field, aliases] of Object.entries(cfg)) {
      if (map[field]) continue;
      if (explicit?.[field] && columns.includes(explicit[field]) && !used.has(explicit[field])) {
        map[field] = explicit[field];
        used.add(explicit[field]);
        continue;
      }
      outer:
      for (const a of aliases) {
        for (const c of lower) {
          if (used.has(c.raw)) continue;
          const owner = reserved.get(c.raw);
          if (owner && owner !== field) continue;
          if (tier(c, a)) { map[field] = c.raw; used.add(c.raw); break outer; }
        }
      }
    }
  }
  return map;
}

router.post('/:id/apply', (req, res) => {
  const d = getDataset(req.params.id);
  if (!d) return res.status(404).json({ error: 'Dataset not found' });
  const target = req.body?.target;
  const cfg = TARGETS[target];
  if (!cfg) return res.status(400).json({ error: `Unknown target module. Use one of: ${Object.keys(TARGETS).join(', ')}` });

  const rows = loadRows(d.id);
  const columns = Object.keys(rows[0] || {});
  const mapping = matchColumn(target, columns, req.body?.mapping || {});
  if (!Object.keys(mapping).length) {
    return res.status(400).json({ error: 'No columns in this dataset could be matched to the selected module.' });
  }

  const dateCol = mapping[cfg.date];
  const dateCandidates = columns.filter((c) => rows.slice(0, 50).some((r) => toDate(r[c]) !== null));
  const dateColumn = dateCol || dateCandidates[0] || null;
  const dateOnly = ['occurred_on', 'established_on', 'registered_on', 'donated_on'].includes(cfg.date);

  const cols = Object.keys(cfg.fields);
  const nameField = cols[0];
  const typeField = cols.find((f) => ['type', 'disaster_type', 'emergency_type'].includes(f));
  const placeholders = cols.map(() => '?').join(',');
  const stmt = db.prepare(`INSERT INTO ${cfg.table} (${cols.join(',')}, ${cfg.date}, source) VALUES (${placeholders}, ?, 'dataset:${d.id}')`);
  const today = new Date().toISOString().slice(0, 10);

  const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
  let inserted = 0;
  let undated = 0;
  let removed = 0;
  const defaultsUsed = {};
  transaction(() => {
    // append: drop only previously imported rows; replace: empty the module first
    const del = db.prepare(mode === 'replace' ? `DELETE FROM ${cfg.table}` : `DELETE FROM ${cfg.table} WHERE source LIKE 'dataset:%'`);
    removed = Number(del.run().changes || 0);
    if (cfg.table === 'relief_camps' && mode === 'replace') db.prepare('DELETE FROM camp_occupancy').run();
    rows.forEach((row, index) => {
      const values = cols.map((f) => {
        const col = mapping[f];
        const raw = col ? row[col] : null;
        if (NUMERIC_FIELDS.test(f)) {
          const n = toNumber(raw);
          // coordinates stay null when unknown so the map does not plot (0,0)
          if (n === null) return f === 'lat' || f === 'lon' ? null : 0;
          return n;
        }
        return raw === null || raw === undefined || raw === '' ? null : String(raw).trim();
      });

      // Names are required by the schema — synthesise one when the dataset has none.
      const nameIdx = cols.indexOf(nameField);
      if (nameIdx >= 0 && !values[nameIdx]) {
        const typeValue = typeField ? values[cols.indexOf(typeField)] : null;
        const locValue = values[cols.indexOf('location')];
        values[nameIdx] = (typeValue && locValue ? `${typeValue} — ${locValue}` : typeValue || `Imported record ${index + 1}`).slice(0, 160);
      }

      // Any remaining gap in a required column gets an explicit, visible placeholder.
      cols.forEach((f, i) => {
        if (!values[i] && FIELD_DEFAULTS[f]) {
          values[i] = FIELD_DEFAULTS[f];
          defaultsUsed[f] = (defaultsUsed[f] || 0) + 1;
        }
      });

      let dateValue = null;
      if (dateColumn) {
        const parsed = toDate(row[dateColumn]);
        dateValue = parsed ? (dateOnly ? parsed.toISOString().slice(0, 10) : parsed.toISOString().slice(0, 19).replace('T', ' ')) : null;
      }
      if (!dateValue) { dateValue = today; undated++; }
      stmt.run(...values, dateValue);
      inserted++;
    });
    db.prepare('UPDATE datasets SET applied_to = ? WHERE id = ?').run(target, d.id);
  });

  res.json({
    target,
    table: cfg.table,
    mode,
    removed,
    inserted,
    rows: rows.length,
    mapping,
    unmatchedColumns: Object.keys(rows[0] || {}).filter((c) => !Object.values(mapping).includes(c)),
    dateColumn,
    undated,
    defaultsUsed,
    note: undated ? `${undated} row(s) had no parseable date and were stamped with the import date (${today}).` : undefined,
  });
});

