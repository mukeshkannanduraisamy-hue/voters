import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = process.env.VMS_DB_PATH || path.join(DATA_DIR, 'vms.db');
const ZIP_PATH = path.join(DATA_DIR, 'vms.db.zip');
const CDN_URL = process.env.VMS_DB_CDN_URL || 'https://github.com/mukeshkannanduraisamy-hue/voters/releases/download/v1.0.0/vms.db.zip';

async function syncDb() {
  // When running with direct MySQL (the production architecture), SQLite sync is not needed.
  const isDirectMySQL = true; // Permanent direct MySQL architecture
  if (isDirectMySQL) {
    const host = process.env.DB_HOST || 'srv1497.hstgr.io';
    const dbName = process.env.DB_NAME || 'u403881955_ECL';
    console.log(`[sync-db] Direct MySQL mode active (${host}/${dbName}). Skipping SQLite download.`);
    return;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`[sync-db] Database already exists (${(stats.size / (1024 * 1024)).toFixed(2)} MB). Skipping sync.`);
      return;
    }
  }

  if (fs.existsSync(ZIP_PATH)) {
    console.log(`[sync-db] Found local ${ZIP_PATH}, extracting...`);
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(ZIP_PATH);
    zip.extractAllTo(DATA_DIR, true);
    console.log(`[sync-db] Extracted local zip successfully!`);
    return;
  }

  console.log(`[sync-db] Database not found. Downloading from ${CDN_URL}...`);
  const res = await fetch(CDN_URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download database from CDN: HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[sync-db] Downloaded ${(buffer.length / (1024 * 1024)).toFixed(2)} MB. Extracting...`);

  const AdmZip = (await import('adm-zip')).default;
  const zip = new AdmZip(buffer);
  zip.extractAllTo(DATA_DIR, true);
  console.log(`[sync-db] Database extracted successfully!`);
}

syncDb().catch((err) => {
  console.error('[sync-db] ERROR:', err);
  process.exit(1);
});
