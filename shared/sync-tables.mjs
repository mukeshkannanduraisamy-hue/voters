/**
 * The single source of truth for which SQLite tables mirror to the central
 * MySQL server, each one's primary key, and the exact column list captured in
 * every outbox event.
 *
 * Both sides of the sync import this same file:
 *   - server/src/lib/outbox.js       (installs the SQLite triggers that write it)
 *   - sync-server/src/lib/tables.js  (validates + applies incoming events to MySQL)
 * so the two can never drift out of step with each other — add a column here
 * once and both the capture side and the apply side pick it up.
 *
 * Deliberately excluded from sync:
 *   - voters_master   — 245k+ rows from a one-time bulk import. Triggering on
 *     it would flood the outbox with a quarter million CREATE events the
 *     moment `import-data.mjs` runs. The roll is distributed to every
 *     deployment as the same source workbook, not trickled through events.
 *   - audit_log       — high-volume, low value centrally (a row on every
 *     login), and multiplies the event count for no operational benefit.
 *
 * This design assumes a single SQLite writer syncing to one central MySQL —
 * exactly what was asked for. If multiple independent SQLite instances are
 * ever introduced, the INTEGER AUTOINCREMENT primary keys below
 * (user_jurisdictions.id, caste_master.id, job_master.id, party_master.id)
 * would collide across instances and need namespacing (e.g. a
 * `<device_id>:<local_id>` composite key) before this same design could be
 * reused as-is for a multi-writer topology.
 */
export const SYNC_TABLES = {
  users: {
    pk: 'id',
    columns: [
      'id', 'mobile_number', 'password_hash', 'role', 'epic_id',
      'full_name', 'is_active', 'created_by', 'created_at', 'last_login_at',
    ],
  },
  user_jurisdictions: {
    pk: 'id',
    columns: ['id', 'user_id', 'part_no'],
  },
  caste_master: {
    pk: 'id',
    columns: ['id', 'name', 'name_ta', 'category', 'is_active', 'created_at'],
  },
  job_master: {
    pk: 'id',
    columns: ['id', 'category', 'category_ta', 'name', 'name_ta', 'is_active', 'created_at'],
  },
  party_master: {
    pk: 'id',
    columns: ['id', 'name', 'name_ta', 'party_code', 'color_code', 'symbol_img', 'is_active', 'created_at'],
  },
  voter_surveys: {
    pk: 'epic_id',
    columns: [
      'epic_id', 'corrected_name_ta', 'corrected_relative_name_ta', 'phone_number',
      'caste_id', 'job_id', 'party_id', 'other_job_text', 'remarks',
      'surveyed_by', 'surveyed_at', 'updated_at',
    ],
  },
  polling_parts: {
    pk: 'part_no',
    columns: [
      'part_no', 'ac_no', 'ac_name_ta', 'pc_no', 'pc_name_ta',
      'local_body_name_ta', 'local_body_type', 'main_village_ta', 'ward_ta',
      'taluk_ta', 'district_ta', 'pincode', 'section_details_ta', 'revision_year',
    ],
  },
};

export const SYNC_OPERATIONS = ['CREATE', 'UPDATE', 'DELETE'];
