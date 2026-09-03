import sqlite3

conn = sqlite3.connect('vms.db')
cur = conn.cursor()

# 1. Add symbol_img column if not present
columns = [col[1] for col in cur.execute('PRAGMA table_info(party_master)').fetchall()]
if 'symbol_img' not in columns:
    cur.execute('ALTER TABLE party_master ADD COLUMN symbol_img TEXT')
    print('Added symbol_img column to party_master.')
else:
    print('symbol_img column already exists.')

# 2. Map existing party names / codes to symbols
mappings = {
    'DMK': '/parties/dmk.svg',
    'AIADMK': '/parties/aiadmk.svg',
    'PMK': '/parties/pmk.svg',
    'BJP': '/parties/bjp.svg',
    'NTK': '/parties/ntk.svg',
    'INC': '/parties/inc.svg',
    'TVK': '/parties/tvk.svg',
    'IND': '/parties/neutral.svg',
    'TNFLP': '/parties/independent.svg',
    'ATP': '/parties/independent.svg'
}

for code, img in mappings.items():
    cur.execute('UPDATE party_master SET symbol_img = ? WHERE party_code = ? OR party_name LIKE ?', (img, code, f'%{code}%'))

# Default fallback for any remaining NULL
cur.execute("UPDATE party_master SET symbol_img = '/parties/independent.svg' WHERE symbol_img IS NULL OR symbol_img = ''")

conn.commit()
cur.execute('PRAGMA wal_checkpoint(TRUNCATE)')

rows = cur.execute('SELECT id, party_name, party_code, symbol_img FROM party_master').fetchall()
print('Updated Party Records with Symbols:')
for r in rows:
    print(' ', r)

conn.close()
