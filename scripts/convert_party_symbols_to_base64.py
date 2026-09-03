import base64
import sqlite3
import os

DB_PATH = r'C:\Users\MugiL\.gemini\antigravity\scratch\vms-webapp\vms.db'
conn = sqlite3.connect(DB_PATH, timeout=30)
cur = conn.cursor()

parties_dir = r'C:\Users\MugiL\.gemini\antigravity\scratch\vms-webapp\public\parties'

party_file_map = {
    'DMK': 'dmk.svg',
    'AIADMK': 'aiadmk.svg',
    'BJP': 'bjp.svg',
    'INC': 'inc.svg',
    'PMK': 'pmk.svg',
    'NTK': 'ntk.svg',
    'TVK': 'tvk.svg',
    'VCK': 'vck.svg',
    'IND': 'neutral.svg',
    'TNFLP': 'independent.svg',
    'ATP': 'independent.svg',
}

print("Converting party pictures to Base64 in vms.db...")

for code, fname in party_file_map.items():
    fpath = os.path.join(parties_dir, fname)
    if os.path.exists(fpath):
        with open(fpath, 'rb') as f:
            b64_content = base64.b64encode(f.read()).decode('utf-8')
            data_url = f'data:image/svg+xml;base64,{b64_content}'
            cur.execute('UPDATE party_master SET symbol_img = ? WHERE party_code = ?', (data_url, code))
            print(f'  [OK] {code} ({fname}) -> {len(data_url)} chars Base64 data URL')

conn.commit()
rows = cur.execute('SELECT id, party_name, party_code, substr(symbol_img, 1, 35), is_active FROM party_master').fetchall()
print("\nUpdated party_master table:")
for r in rows:
    print(r)

cur.execute('PRAGMA wal_checkpoint(PASSIVE)')
conn.close()
print("Base64 party symbols successfully saved in vms.db!")
