import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { db, migrate } from './lib/db.js';
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

await migrate();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
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

app.get('/api/health', async (req, res, next) => {
  try {
    const ac = await db.prepare('SELECT ac_no, ac_name_ta, district_ta FROM polling_parts LIMIT 1').get();
    const votersRow = await db.prepare('SELECT COUNT(*) c FROM voters_master').get();
    const liveVotersRow = await db.prepare('SELECT COUNT(*) c FROM voters_master WHERE is_deleted = 0').get();
    const surveysRow = await db.prepare('SELECT COUNT(*) c FROM voter_surveys').get();
    const usersRow = await db.prepare('SELECT COUNT(*) c FROM users').get();
    const boothsRow = await db.prepare('SELECT COUNT(*) c FROM polling_parts').get();
    const localBodiesRow = await db.prepare('SELECT COUNT(DISTINCT local_body_name_ta) c FROM polling_parts').get();

    res.json({
      status: 'ok',
      service: 'vms-api',
      version: '2.0.0 (MySQL)',
      database: 'MySQL',
      constituency: ac ? { acNo: ac.ac_no, acNameTa: ac.ac_name_ta, districtTa: ac.district_ta } : null,
      counts: {
        voters: Number(votersRow?.c || 0),
        liveVoters: Number(liveVotersRow?.c || 0),
        surveys: Number(surveysRow?.c || 0),
        users: Number(usersRow?.c || 0),
        booths: Number(boothsRow?.c || 0),
        localBodies: Number(localBodiesRow?.c || 0),
      },
    });
  } catch (err) {
    next(err);
  }
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
    res.type('html').send('<h2>VMS API is running (Direct MySQL)</h2>')
  );
}

app.use((err, req, res, next) => {
  console.error('[api error]', req.method, req.originalUrl, err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    error: 'Something went wrong on the server',
    detail: err?.message || err?.code || String(err),
  });
});

app.listen(PORT, async () => {
  try {
    const c = (await db.prepare('SELECT COUNT(*) c FROM voters_master WHERE is_deleted = 0').get())?.c ?? 0;
    const ac = await db.prepare('SELECT ac_no, ac_name_ta FROM polling_parts LIMIT 1').get();
    console.log(`\n  VMS API (Direct MySQL)  ->  http://localhost:${PORT}`);
    console.log(`  constituency: AC ${ac?.ac_no ?? '?'} ${ac?.ac_name_ta ?? ''}`);
    console.log(`  live electors: ${Number(c).toLocaleString()}`);
    console.log(`  serving web:   ${fs.existsSync(webDist) ? 'yes (web/dist)' : 'no (run vite dev)'}\n`);
  } catch (e) {
    console.log(`\n  VMS API (Direct MySQL)  ->  http://localhost:${PORT} (ready)`);
  }
});
