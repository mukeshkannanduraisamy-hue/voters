import express from 'express';
import { pool, migrate } from './lib/db.js';
import { requireApiKey } from './lib/auth.js';
import syncRoutes from './routes/sync.js';

const PORT = Number(process.env.PORT) || 4500;

const app = express();
app.disable('x-powered-by');
// Party emblems travel as Base64 inside a payload; the JSON limit must clear that comfortably.
app.use(express.json({ limit: '8mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  next(err);
});

app.get('/api/health', async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT COUNT(*) AS c FROM sync_events');
    res.json({ status: 'ok', service: 'vms-sync-server', eventsApplied: row.c });
  } catch (err) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

// Every sync route requires the shared-secret key — nothing here is reachable
// without it, and there is no other route surface (no browser-facing pages,
// no cookies, no session state) for anything else to protect.
app.use('/api/sync', requireApiKey, syncRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));

app.use((err, req, res, next) => {
  console.error('[sync-server error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal error' });
});

async function start() {
  try {
    await migrate();
    console.log('[sync-server] MySQL schema ready');
  } catch (err) {
    if (err.code === 'ER_BAD_DB_ERROR' || err.code === 'ER_DBACCESS_DENIED_ERROR') {
      // MariaDB/MySQL report the same "access denied" error whether the
      // database is missing or merely not granted to this user — it never
      // confirms which, to avoid leaking which database names exist.
      console.error(`\n  ✖ Database "${process.env.DB_NAME}" is not reachable by user "${process.env.DB_USER}" on ${process.env.DB_HOST}.`);
      console.error(`    Most likely it doesn't exist yet. Shared MySQL hosting (e.g. Hostinger)`);
      console.error(`    usually requires the database to be created through the hosting control`);
      console.error(`    panel first — programmatic CREATE DATABASE is denied for those accounts.`);
      console.error(`    Create "${process.env.DB_NAME}" there, grant user "${process.env.DB_USER}"`);
      console.error(`    full privileges on it, then restart this service.\n`);
      process.exit(1);
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
      console.error(`\n  ✖ Could not reach MySQL at ${process.env.DB_HOST}:${process.env.DB_PORT} (${err.code}).`);
      console.error(`    Check DB_HOST/DB_PORT and that this network can reach it.\n`);
      process.exit(1);
    }
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error(`\n  ✖ MySQL rejected the credentials for user "${process.env.DB_USER}".`);
      console.error(`    Check DB_USER/DB_PASSWORD.\n`);
      process.exit(1);
    }
    throw err;
  }

  app.listen(PORT, () => {
    console.log(`\n  VMS Sync Server  ->  http://localhost:${PORT}`);
    console.log(`  MySQL: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);
  });
}

start().catch((err) => {
  console.error('[sync-server] fatal startup error:', err);
  process.exit(1);
});
