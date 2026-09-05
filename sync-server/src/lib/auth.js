import crypto from 'node:crypto';

/**
 * Shared-secret Bearer auth. This endpoint is service-to-service (the VMS
 * server's sync worker calling home), never a browser, so there is no session,
 * no cookie, and no CORS surface to worry about — just a constant-time key
 * comparison so timing can't leak how much of the key matched.
 */
export function requireApiKey(req, res, next) {
  const expected = process.env.SYNC_API_KEY || '';
  if (!expected) {
    console.error('[sync-server] SYNC_API_KEY is not configured — refusing all sync requests');
    return res.status(500).json({ error: 'Server is not configured for sync' });
  }

  const header = req.headers.authorization || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) return res.status(401).json({ error: 'Invalid or missing API key' });
  next();
}
