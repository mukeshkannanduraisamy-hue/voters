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
        process.loadEnvFile(envFile);
      } else {
        const lines = fs.readFileSync(envFile, 'utf8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim();
            const v = trimmed.slice(eq + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        }
      }
    }
  } catch {}
}

/**
 * Required configuration must come from the environment — never from a
 * hardcoded fallback baked into source. A missing value fails startup loudly
 * and immediately rather than silently connecting to (or signing tokens with)
 * whatever default happened to be committed to the repo.
 */
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in server/.env ` +
      `(see server/.env.example) — the application will not start without it.`
    );
  }
  return value;
}

