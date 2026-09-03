import zipfile
import os
import sqlite3
import shutil

db_path = r'C:\Users\MugiL\.gemini\antigravity\scratch\vms-webapp\vms.db'
zip_path = r'C:\Users\MugiL\.gemini\antigravity\scratch\vms-webapp\vms.db.zip'

print('Compressing checkpointed vms.db...')
with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    z.write(db_path, arcname='vms.db')

print(f'New vms.db.zip size: {os.path.getsize(zip_path) / (1024*1024):.2f} MB')

# Verify inside zip immediately
verify_dir = r'C:\Users\MugiL\.gemini\antigravity\scratch\vms-webapp\temp_verify'
os.makedirs(verify_dir, exist_ok=True)
with zipfile.ZipFile(zip_path, 'r') as z:
    z.extract('vms.db', verify_dir)

conn = sqlite3.connect(os.path.join(verify_dir, 'vms.db'))
cur = conn.cursor()
for t in ['voters_master', 'job_master', 'caste_master', 'party_master', 'users', 'user_jurisdictions', 'voter_surveys']:
    cnt = cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t}: {cnt}')
conn.close()

shutil.rmtree(verify_dir)
print('Verification successful!')
