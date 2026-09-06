import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { db, migrate } from './lib/db.js';
import { migrateOutbox } from './lib/outbox.js';
import { startSyncWorker } from './lib/syncWorker.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import masterRoutes from './routes/masters.js';
import voterRoutes from './routes/voters.js';
import dashboardRoutes from './routes/dashboard.js';
import boothRoutes from './routes/booths.js';
import reportRoutes from './routes/reports.js';
import syncStatusRoutes from './routes/sync.js';
import formFieldRoutes from './routes/formFields.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4000;

migrate();
migrateOutbox();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind a reverse proxy, so Secure cookies work

// Credentials must be allowed for the session cookie to travel in dev, where the
// Vite origin differs from the API origin.
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
// Party emblems arrive as Base64 data URLs, so the JSON limit must clear 2 MB.
app.use(express.json({ limit: '4mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload is too large. Party pictures must be 2MB or smaller.' });
  }
  next(err);
});

app.get('/api/health', (req, res) => {
  const ac = db.prepare('SELECT ac_no, ac_name_ta, district_ta FROM polling_parts LIMIT 1').get();
  res.json({
    status: 'ok',
    service: 'vms-api',
    version: '1.0.0',
    constituency: ac ? { acNo: ac.ac_no, acNameTa: ac.ac_name_ta, districtTa: ac.district_ta } : null,
    counts: {
      voters: db.prepare('SELECT COUNT(*) c FROM voters_master').get().c,
      liveVoters: db.prepare('SELECT COUNT(*) c FROM voters_master WHERE is_deleted = 0').get().c,
      surveys: db.prepare('SELECT COUNT(*) c FROM voter_surveys').get().c,
      users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
      booths: db.prepare('SELECT COUNT(*) c FROM polling_parts').get().c,
      localBodies: db.prepare('SELECT COUNT(DISTINCT local_body_name_ta) c FROM polling_parts').get().c,
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/masters', masterRoutes);
app.use('/api/voters', voterRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/booths', boothRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sync', syncStatusRoutes);
app.use('/api/form-fields', formFieldRoutes);

app.use('/api', (req, res) =>
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` })
);

// ---- static SPA (built web app), when present -------------------------------
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
} else {
  app.get('/', (req, res) =>
    res.type('html').send('<h2>VMS API is running</h2><p>Build the web app (<code>npm run build</code>) or start the Vite dev server.</p>')
  );
}

app.use((err, req, res, next) => {
  console.error('[api error]', req.method, req.originalUrl, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong on the server', detail: err.message });
});

app.listen(PORT, () => {
  const c = db.prepare('SELECT COUNT(*) c FROM voters_master WHERE is_deleted = 0').get().c;
  const ac = db.prepare('SELECT ac_no, ac_name_ta FROM polling_parts LIMIT 1').get();
  console.log(`\n  VMS API  ->  http://localhost:${PORT}`);
  console.log(`  constituency: AC ${ac?.ac_no ?? '?'} ${ac?.ac_name_ta ?? ''}`);
  console.log(`  live electors: ${c.toLocaleString()}`);
  console.log(`  serving web:   ${fs.existsSync(webDist) ? 'yes (web/dist)' : 'no (run vite dev)'}\n`);
});

startSyncWorker({
  apiUrl: (process.env.SYNC_API_URL || '').replace(/\/+$/, ''),
  apiKey: process.env.SYNC_API_KEY || '',
  batchSize: Number(process.env.SYNC_BATCH_SIZE) || 100,
  intervalMs: Number(process.env.SYNC_INTERVAL_MS) || 10000,
  timeoutMs: Number(process.env.SYNC_TIMEOUT_MS) || 15000,
});
