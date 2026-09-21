import express from 'express';
import { authenticate, requireRole, ROLES } from '../lib/auth.js';
import { DB_HOST, DB_NAME } from '../lib/db.js';

const router = express.Router();
router.use(authenticate);

/** GET /api/sync/status — reports database sync and connection status */
router.get('/status', requireRole(ROLES.A1), (req, res) => {
  res.json({
    enabled: false,
    apiUrl: null,
    directMySql: true,
    host: DB_HOST,
    database: DB_NAME,
    tablePrefix: 'vms_',
    status: 'connected',
    pending: 0,
    synced: 0,
    maxPendingAttempts: 0,
  });
});

export default router;
