# Natural Disaster Management System — Disaster Intelligence & Analytics

A **visualization-first** disaster analytics dashboard. There is **no login, no user
login and no registration**: the app opens directly on the Dashboard and every page is
built from charts, graphs, KPI cards and filters rather than forms and tables.

```
Natural disaster data → analysis → charts → graphs → visual insights
```

Nothing is hardcoded. Every number you see is aggregated from the SQLite database at
request time, or computed from a dataset you upload. When a query returns no rows the UI
shows a real **“No data available”** state instead of invented figures.

---

## Quick start

```bash
cd disaster-system
npm install
npm run seed      # optional — builds the demo dataset (runs automatically on first start)
npm run build     # bundles the client into server/public
npm start         # serves API + dashboard on http://0.0.0.0:4000
```

Development (hot reload):

```bash
npm run dev:server   # API on :4000
npm run dev:client   # Vite on :5173, proxies /api to :4000
```

Checks:

```bash
npm run typecheck   # TypeScript, client sources
npm run verify      # 81-step end-to-end API pipeline test
npm run samples     # regenerate the downloadable sample CSVs from the database
```

---

## Modules

| # | Module | Route | Visual analytics |
|---|--------|-------|------------------|
| 1 | Dashboard | `/` | KPI cards (total / active disasters, affected population, SOS, casualties, donations, camp occupancy, response time), disaster trend line, disaster types bar, severity donut, affected-population area chart, SOS trend, region bar, status stack, interactive Leaflet map |
| 2 | Disaster Management | `/disasters` | Type bar, frequency line, severity donut, location bar, affected-population bar, casualties line, monthly trend, region bar, severity-by-type stack |
| 3 | Disaster Alerts | `/alerts` | Active vs resolved donut, alerts by type bar, severity donut, location bar, frequency line, channel bar, region severity stack, resolution-time heatmap |
| 4 | Disaster Map | `/map` | Interactive map (severity colour, affected-population radius, camp + SOS layers), regional count bar, regional severity stack, affected by region, casualties by region, region × type density heatmap, regional trend lines |
| 5 | SOS Analytics | `/sos` | Status donut, disaster-type bar, location bar, timeline, critical vs normal donut, response-time line, category bar, priority-by-region stack, response-time scatter |
| 6 | Relief Camp Analytics | `/camps` | Capacity vs occupancy bar, available vs occupied donut, camps by location, resource availability, occupancy trend line, food/water/medicine per occupant, largest camps, status donut |
| 7 | Volunteer Analytics | `/volunteers` | KPIs, location bar, skill bar, disaster-type donut, registration trend, available vs assigned donut, region bar, skill × status stack, avg deployments |
| 8 | Donation Analytics | `/donations` | Total amount KPI, donations over time, by disaster type, type donut, campaign bar, monthly trend, donor-type donut, region bar, in-kind quantities |
| 9 | Emergency Helplines | `/helplines` | Calls by service, calls over time, emergency-type donut, calls by location, response-time trend, outcome stack. Empty call log → genuine *No data available* visuals |
| 10 | Safety Tips | `/safety` | Tips by disaster type, resource usage bar, most-viewed categories donut, content trend line, views by type, category × format heatmap. Usage charts appear only when usage rows exist |
| 11 | Dataset Management | `/datasets` | CSV / XLSX / JSON upload, automatic detection of rows, columns, numeric / categorical / date fields and missing values, profile charts, column table, load-into-module with column mapping |
| 12 | Dataset Analysis | `/analysis` | Dataset → column → chart type: bar, line, area, donut, pie, scatter, histogram, heatmap, plus one-click auto-generation of every suggested visualisation |
| 13 | Dataset Comparison | `/comparison` | Dataset A vs B: KPI comparison cards with deltas, side-by-side bars, monthly lines, cumulative area, donuts, grouped category bars, scatter, cross-tab heatmaps |

Every module page carries **date range selection**, multi-select filters (disaster type,
severity, region, location, status), a time-bucket selector (auto / day / week / month /
quarter / year) and a refresh control. Changing any filter re-queries the API and
re-renders every chart on the page.

---

## Architecture

```
client/                      React 18 + TypeScript + Vite
  src/pages                  one page per module (13 routes)
  src/components             Layout, Sidebar, KpiCard, ChartCard, ChartView,
                             Heatmap, MapView (Leaflet), FilterBar, EmptyState
  src/lib                    api.ts (typed fetch), charts.ts (Chart.js theming),
                             format.ts (Indian number / ₹ formatting)
  public/samples             downloadable sample CSVs

server/                      Express + node:sqlite (no native build step)
  lib/db.js                  schema: 12 tables + indexes
  lib/seed.js                deterministic demo dataset (reproducible PRNG)
  lib/analytics.js           SQL → chart-payload helpers (grouped, stacked,
                             timeSeries, pivotedSeries, heatmap, KPI)
  lib/datasetEngine.js       parse CSV/XLSX/JSON, column profiling, aggregation
                             for every chart type, dataset comparison
  routes/analytics.js        /api/analytics/* (dashboard, disasters, alerts, map,
                             sos, camps, volunteers, donations, helplines, safety)
  routes/datasets.js         /api/datasets/* (upload, profile, analyze, auto,
                             compare, apply)
  routes/meta.js             /api/meta/* (filter options, status, reseed, clear)

scripts/verify.mjs           end-to-end pipeline test
scripts/export-samples.mjs   regenerates the sample CSVs from the database
```

**Data flow**

```
Upload dataset → parse → profile columns → store rows in SQLite
   → analyze (aggregate) → chart payload JSON → Chart.js / Leaflet render
```

Module charts read the analytics tables directly, so loading a dataset into a module
(`POST /api/datasets/:id/apply`) makes every chart on that page re-aggregate from the
uploaded rows — verified by `npm run verify`.

---

## Data model

| Table | Purpose |
|-------|---------|
| `disasters` | events: type, severity, location, region, lat/lon, date, status, affected population, casualties, displaced, damage |
| `alerts` | warnings: type, severity, status, channel, issued/resolved timestamps |
| `sos_requests` | distress requests: priority, status, category, response minutes, people |
| `relief_camps` + `camp_occupancy` | camps with capacity, occupancy and supplies, plus a daily occupancy log |
| `volunteers` | skill, specialisation, availability, deployments, hours |
| `donations` | campaign, type, amount, quantity, donor type |
| `helpline_calls` | service, emergency type, response time, outcome |
| `safety_tips` + `safety_resource_usage` | guidance library and recorded views |
| `datasets` + `dataset_rows` | uploaded datasets and their rows (JSON per row) |

Rows carry a `source` column (`seed` or `dataset:<id>`) so imported data can be replaced
or removed without touching the demo records.

### Demo data

`npm run seed` builds a deterministic demo dataset (695 disasters across 2024–2026,
883 alerts, 2,138 SOS requests, 240 camps with 8,696 occupancy log entries, 1,800
volunteers, 3,076 donations, 1,360 helpline calls, 45 safety tips, 2,584 usage events).
It exists so the dashboard is meaningful on first run — replace it with your own data by
uploading datasets in **Dataset Management** and loading them into a module. The
helpline call log intentionally has no calls for the *Tsunami Warning Cell* service, so
that filter demonstrates the empty state.

---

## Design notes

- **Dark / light professional theme** with a single toggle; Chart.js colours, gridlines
  and tooltips follow the active theme.
- **Responsive**: 12-column chart grid collapses to 6 then 12 columns; the sidebar
  becomes a drawer below 820 px.
- **Tooltips and legends** on every chart; donuts show value + percentage; scatter plots
  show both axis values; heatmaps show row × column × value.
- **No fake data**: charts flagged `empty` by the API render a striped “No data
  available” panel with the reason (for example *“No emergency call records in the
  database”*).
- Basemap tiles come from OpenStreetMap; if tiles cannot be reached the markers, camps
  and SOS points still plot and a notice appears.

## API summary

```
GET  /api/health
GET  /api/analytics/{dashboard|disasters|alerts|map|sos|camps|volunteers|donations|helplines|safety}
     ?from&to&type&severity&region&location&status&bucket
GET  /api/meta/options?module=…        filter values + date range per module
GET  /api/meta/status                  table row counts
POST /api/meta/reseed                  rebuild the demo dataset
POST /api/meta/clear {table}           empty a table (to inspect empty states)
POST /api/datasets/upload              multipart `file` (CSV/XLSX/JSON)
GET  /api/datasets | /api/datasets/:id | /api/datasets/:id/rows
POST /api/datasets/:id/analyze         {chartType, labelKey, valueKey, metric, …}
POST /api/datasets/:id/auto            every suggested visualisation
POST /api/datasets/compare {a,b}       dataset-vs-dataset analytics
POST /api/datasets/:id/apply           {target, mode: append|replace, mapping?}
GET  /api/datasets/targets/schema      module field names for mapping
```
