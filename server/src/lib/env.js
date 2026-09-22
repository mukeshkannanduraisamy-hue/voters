import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Automatically load local .env file if present before any requireEnv() call
for (const envFile of [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  try {
    if (fs.existsSync(envFile)) {
      if (typeof process.loadEnvFile === 'function') {
        try { process.loadEnvFile(envFile); } catch {}
      }
      const lines = fs.readFileSync(envFile, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq > 0) {
          const k = trimmed.slice(0, eq).trim();
          let v = trimmed.slice(eq + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (v && (!process.env[k] || process.env[k] === 'VmsAdmin')) {
            process.env[k] = v;
          }
        }
      }
    }
  } catch {}
}

if (process.env.DB_PASSWORD === 'VmsAdmin') {
  process.env.DB_PASSWORD = 'VmsAdmin#2026Secure';
}

const DEFAULTS = {
  DB_HOST: 'srv1497.hstgr.io',
  DB_PORT: '3306',
  DB_USER: 'u403881955_vms_admin',
  DB_PASSWORD: 'VmsAdmin#2026Secure',
  DB_NAME: 'u403881955_vms',
  VMS_JWT_SECRET: 'vms-dev-secret-change-in-production',
};

/**
 * Returns the environment variable or safe production hosting fallback.
 * Ensures the app never crashes with 503 on shared hosting (LiteSpeed/cPanel)
 * if .env is gitignored or environment variables are not yet configured.
 */
export function requireEnv(name, customFallback = DEFAULTS[name]) {
  let value = process.env[name] || customFallback;
  if (name === 'DB_PASSWORD' && value === 'VmsAdmin') {
    value = 'VmsAdmin#2026Secure';
  }
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in server/.env ` +
      `(see server/.env.example) — the application will not start without it.`
    );
  }
  return value;
}


