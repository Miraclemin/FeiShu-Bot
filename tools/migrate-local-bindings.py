"""Migrate local data and retain old absolute Skill entrypoints as thin compatibility links.
No network, no secrets read, no access policy changes. Back up before invoking.
"""
import argparse,json,os,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--legacy-tools',type=Path,required=True);p.add_argument('--bridge-home',type=Path,default=Path.home()/'.lark-channel');p.add_argument('--package-root',type=Path,required=True);p.add_argument('--link-compat',action='store_true');a=p.parse_args()
source=a.legacy_tools/'bridge_extension';dest=a.bridge_home/'project-bindings.json'
def write_once(path,data):
 if path.exists():
  if json.loads(path.read_text())!=data:raise SystemExit(f'Refusing to overwrite different existing data: {path}')
  return
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:json.dump(data,f,ensure_ascii=False,indent=2)
bs=json.loads((source/'bindings.json').read_text());write_once(dest,bs)
schedules=json.loads((a.legacy_tools/'product_manager/bindings.json').read_text())
# The existing installation has one explicit daily route; do not guess for multi-project data.
defaults={}
for profile in {b['profile'] for b in bs.values()}:
 candidates=[b for b in bs.values() if b['profile']==profile and not b.get('topic_id')]
 if len(candidates)!=1:raise SystemExit(f'Choose explicit daily default for {profile}; found {len(candidates)}')
 defaults[profile]={'chat_id':candidates[0]['chat_id']}
write_once(a.bridge_home/'project-defaults.json',defaults)
if a.link_compat:
 backup=source/'pre-source-migration';backup.mkdir(exist_ok=True)
 for old,new in [('registry.py','project_registry.py'),('project_registry.py','project_registry.py'),('context.py','context.py')]:
  target=a.package_root/'resources'/new
  if not target.is_file():raise SystemExit(f'Missing installed resource: {target}')
  entry=source/old
  if entry.is_symlink() and entry.resolve()==target.resolve():continue
  if entry.exists() or entry.is_symlink():
   if (backup/old).exists():raise SystemExit(f'Backup already exists: {old}')
   entry.rename(backup/old)
  entry.symlink_to(target)
print('Local bindings migrated; no app credentials, access lists, workspaces or schedules modified.')
