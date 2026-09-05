import express from 'express';
import { authenticate, requireRole, ROLES } from '../lib/auth.js';
import { outboxStats } from '../lib/outbox.js';

const router = express.Router();
router.use(authenticate);

/** GET /api/sync/status — outbox health, for an operator to confirm sync is keeping up. */
router.get('/status', requireRole(ROLES.A1), (req, res) => {
  const stats = outboxStats();
  res.json({
    enabled: !!process.env.SYNC_API_URL,
    apiUrl: process.env.SYNC_API_URL || null,
    ...stats,
  });
});

export default router;
