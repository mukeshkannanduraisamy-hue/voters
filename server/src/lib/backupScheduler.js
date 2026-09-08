import { createDatabaseBackup, getISTParts } from './backup.js';

// 3 times a day in IST (Asia/Kolkata, UTC+5:30):
// 1. 08:00 AM IST (02:30 UTC) - Morning start
// 2. 02:00 PM IST (08:30 UTC) - Midday shift
// 3. 09:00 PM IST (15:30 UTC) - Evening wrap-up
const TARGET_HOURS_IST = [8, 14, 21];

let lastRunHour = null;
let lastRunDate = null;

export function startBackupScheduler() {
  console.log('[backupScheduler] Initialized 3x daily automated backup (08:00, 14:00, 21:00 IST).');

  // Check every 60 seconds
  setInterval(async () => {
    try {
      // Reuses backup.js's Intl.DateTimeFormat-based IST extraction (matches
      // the rest of the backup code) instead of round-tripping through
      // toLocaleString() + `new Date(string)`, which depends on the runtime's
      // locale string format to parse its own output back correctly.
      const ist = getISTParts();
      const hour = parseInt(ist.hour, 10);
      const minute = parseInt(ist.minute, 10);
      const dateKey = `${ist.year}-${ist.month}-${ist.day}`;

      // Check if current hour is one of the target hours and minute is in the first 5 minutes
      if (TARGET_HOURS_IST.includes(hour) && minute < 5) {
        if (lastRunDate !== dateKey || lastRunHour !== hour) {
          lastRunDate = dateKey;
          lastRunHour = hour;
          console.log(`[backupScheduler] Triggering scheduled backup for ${hour}:00 IST...`);
          await createDatabaseBackup({ triggerType: 'scheduler' });
        }
      }
    } catch (err) {
      console.error('[backupScheduler] Error running scheduled backup:', err);
    }
  }, 60 * 1000);
}
