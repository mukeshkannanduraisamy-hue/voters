import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = process.env.VMS_DB_PATH || path.join(DATA_DIR, 'vms.db');
const ZIP_PATH = path.join(DATA_DIR, 'vms.db.zip');
const CDN_URL = process.env.VMS_DB_CDN_URL || 'https://github.com/mukeshkannanduraisamy-hue/voters/releases/download/v1.0.0/vms.db.zip';

async function syncDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Check if DB already exists and has reasonable size (> 10MB)
  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`[sync-db] Database already exists (${(stats.size / (1024 * 1024)).toFixed(2)} MB). Skipping sync.`);
      return;
    }
    console.log(`[sync-db] Existing database is suspiciously small (${stats.size} bytes). Re-downloading...`);
  }

  // If local zip exists, we can extract it directly
  if (fs.existsSync(ZIP_PATH)) {
    console.log(`[sync-db] Found local ${ZIP_PATH}, extracting...`);
    const zip = new AdmZip(ZIP_PATH);
    zip.extractAllTo(DATA_DIR, true);
    console.log(`[sync-db] Extracted local zip successfully!`);
    return;
  }

  // Download from CDN
  console.log(`[sync-db] Database not found. Downloading from ${CDN_URL}...`);
  const res = await fetch(CDN_URL, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to download database from CDN: HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[sync-db] Downloaded ${(buffer.length / (1024 * 1024)).toFixed(2)} MB. Extracting...`);

  const zip = new AdmZip(buffer);
  zip.extractAllTo(DATA_DIR, true);

  if (fs.existsSync(DB_PATH)) {
    const stats = fs.statSync(DB_PATH);
    console.log(`[sync-db] Database extracted successfully (${(stats.size / (1024 * 1024)).toFixed(2)} MB)!`);
  } else {
    throw new Error(`[sync-db] Extraction completed but ${DB_PATH} was not found!`);
  }
}

syncDb().catch((err) => {
  console.error('[sync-db] ERROR:', err);
  process.exit(1);
});
