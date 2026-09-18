/**
 * Natural Disaster Management System — API + static host.
 * No login, no registration: every route is public and the app opens on the dashboard.
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensureSeeded } from './lib/seed.js';
import { tableCounts } from './lib/db.js';
import { router as analytics } from './routes/analytics.js';
import { router as datasets } from './routes/datasets.js';
import { router as meta } from './routes/meta.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const seeded = ensureSeeded();
if (seeded) console.log('[seed] demo dataset created:', JSON.stringify(seeded));

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, tables: tableCounts(), time: new Date().toISOString() }));
app.use('/api/analytics', analytics);
app.use('/api/datasets', datasets);
app.use('/api/meta', meta);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

if (fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
  app.use(express.static(PUBLIC_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
} else {
  app.get('/', (_req, res) => res
    .status(200)
    .type('text/plain')
    .send('API is running. The dashboard client has not been built yet — run `npm run build`.'));
}

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Disaster Intelligence API listening on http://${HOST}:${PORT}`);
  console.log('Table counts:', JSON.stringify(tableCounts()));
});
