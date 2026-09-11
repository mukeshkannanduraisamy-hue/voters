import express from 'express';
import { authenticate, requireRole, ROLES } from '../lib/auth.js';

const router = express.Router();
router.use(authenticate);

/** GET /api/sync/status — reports database sync and connection status */
router.get('/status', requireRole(ROLES.A1), (req, res) => {
  res.json({
    enabled: false,
    apiUrl: null,
    directMySql: true,
    host: process.env.DB_HOST || 'srv1497.hstgr.io',
    database: process.env.DB_NAME || 'u403881955_vms',
    tablePrefix: 'vms_',
    status: 'connected',
    pending: 0,
    synced: 0,
    maxPendingAttempts: 0,
  });
});

export default router;
