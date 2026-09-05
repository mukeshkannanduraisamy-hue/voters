import mysql from 'mysql2/promise';
import { SYNC_EVENTS_DDL, mirrorDdlStatements } from './tables.js';

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

/** Idempotent: safe to call on every startup. Never touches any table outside this database. */
export async function migrate() {
  const conn = await pool.getConnection();
  try {
    await conn.query(SYNC_EVENTS_DDL);
    for (const ddl of mirrorDdlStatements()) await conn.query(ddl);
  } finally {
    conn.release();
  }
}
