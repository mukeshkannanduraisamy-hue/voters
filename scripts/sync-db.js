const fs = require('fs');
const path = require('path');
const https = require('https');
const AdmZip = require('adm-zip');

const DB_PATH = path.join(process.cwd(), 'vms.db');
const ZIP_PATH = path.join(process.cwd(), 'vms.db.zip');
const DB_URL = 'https://github.com/mukeshkannanduraisamy-hue/voters/releases/download/v1.0.0/vms.db.zip';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Handle redirects (GitHub releases redirect to AWS S3)
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${res.statusCode}`));
      }

      const fileStream = fs.createWriteStream(dest);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('🔍 Checking database status...');

  let needsSync = true;
  if (fs.existsSync(DB_PATH)) {
    try {
      const Database = require('better-sqlite3');
      const db = new Database(DB_PATH, { readonly: true });
      const jobCount = db.prepare('SELECT COUNT(*) as count FROM job_master').get().count;
      db.close();
      if (jobCount >= 38) {
        console.log(`✅ Local database is up to date (${jobCount} jobs configured).`);
        needsSync = false;
      } else {
        console.log(`⚠️ Local database only has ${jobCount} jobs. Updating to latest release (38 jobs)...`);
      }
    } catch (e) {
      console.log('⚠️ Error checking existing database, will re-sync.');
    }
  }

  if (!needsSync) return;

  if (!fs.existsSync(ZIP_PATH)) {
    console.log(`⬇️ Downloading database release package from GitHub...`);
    console.log(`URL: ${DB_URL}`);
    await downloadFile(DB_URL, ZIP_PATH);
    console.log(`✅ Download complete: ${(fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(2)} MB`);
  }

  console.log('📦 Unpacking complete database to vms.db...');
  const zip = new AdmZip(ZIP_PATH);
  zip.extractAllTo(process.cwd(), true);

  // Quick verification
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  const voters = db.prepare('SELECT COUNT(*) as count FROM voters_master').get().count;
  const jobs = db.prepare('SELECT COUNT(*) as count FROM job_master').get().count;
  const parties = db.prepare('SELECT COUNT(*) as count FROM party_master').get().count;
  db.close();

  console.log(`🎉 Database ready! Total Voters: ${voters.toLocaleString()}, Jobs: ${jobs}, Parties: ${parties}`);

  // Create/ensure performance indexes
  try {
    const dbRw = new Database(DB_PATH);
    dbRw.exec(`
      CREATE INDEX IF NOT EXISTS idx_vm_part_no ON voters_master(part_no);
      CREATE INDEX IF NOT EXISTS idx_vm_epic ON voters_master(epic_id);
      CREATE INDEX IF NOT EXISTS idx_vm_name ON voters_master(name_ta);
      CREATE INDEX IF NOT EXISTS idx_vm_gender ON voters_master(gender);
      CREATE INDEX IF NOT EXISTS idx_vm_deleted ON voters_master(is_deleted);
      CREATE INDEX IF NOT EXISTS idx_vs_epic ON voter_surveys(epic_id);
      CREATE INDEX IF NOT EXISTS idx_vs_agent ON voter_surveys(agent_id);
      CREATE INDEX IF NOT EXISTS idx_vs_date ON voter_surveys(surveyed_at);
      CREATE INDEX IF NOT EXISTS idx_pp_local ON polling_parts(local_body_name_ta);
      CREATE INDEX IF NOT EXISTS idx_pp_ac ON polling_parts(ac_no);
      CREATE INDEX IF NOT EXISTS idx_uj_user ON user_jurisdictions(user_id);
      CREATE INDEX IF NOT EXISTS idx_uj_part ON user_jurisdictions(part_no);
      PRAGMA wal_checkpoint(TRUNCATE);
    `);
    dbRw.close();
    console.log('⚡ All 12 performance indexes verified and applied.');
  } catch (e) {
    console.log('Index note:', e.message);
  }
}

main().catch((err) => {
  console.error('❌ Database sync failed:', err);
  process.exit(1);
});
