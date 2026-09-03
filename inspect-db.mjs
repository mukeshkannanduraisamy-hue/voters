import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database('vms.db');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('TABLES:', JSON.stringify(tables.map(t => t.name)));

for (const t of tables) {
  const info = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\nTABLE: ${t.name}`);
  console.log(JSON.stringify(info.map(c => ({ name: c.name, type: c.type })), null, 2));
  const sample = db.prepare(`SELECT * FROM ${t.name} LIMIT 2`).all();
  console.log('SAMPLE:', JSON.stringify(sample));
}

db.close();
