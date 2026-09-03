import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'vms.db')
print(f'Adding performance indexes to: {DB_PATH}')

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

indexes = [
    'CREATE INDEX IF NOT EXISTS idx_vm_part_no ON voters_master(part_no)',
    'CREATE INDEX IF NOT EXISTS idx_vm_epic ON voters_master(epic_id)',
    'CREATE INDEX IF NOT EXISTS idx_vm_name ON voters_master(name_ta)',
    'CREATE INDEX IF NOT EXISTS idx_vm_gender ON voters_master(gender)',
    'CREATE INDEX IF NOT EXISTS idx_vm_deleted ON voters_master(is_deleted)',
    'CREATE INDEX IF NOT EXISTS idx_vs_epic ON voter_surveys(epic_id)',
    'CREATE INDEX IF NOT EXISTS idx_vs_agent ON voter_surveys(agent_id)',
    'CREATE INDEX IF NOT EXISTS idx_vs_date ON voter_surveys(surveyed_at)',
    'CREATE INDEX IF NOT EXISTS idx_pp_local ON polling_parts(local_body_name_ta)',
    'CREATE INDEX IF NOT EXISTS idx_pp_ac ON polling_parts(ac_no)',
    'CREATE INDEX IF NOT EXISTS idx_uj_user ON user_jurisdictions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_uj_part ON user_jurisdictions(part_no)',
]

for sql in indexes:
    try:
        cursor.execute(sql)
        idx_name = sql.split('idx_')[1].split(' ')[0]
        print(f'  [OK] idx_{idx_name}')
    except Exception as e:
        print(f'  [SKIP] {e}')

cursor.execute('PRAGMA wal_checkpoint(TRUNCATE)')
conn.commit()
conn.close()
print('Done! All indexes applied and WAL checkpointed.')
