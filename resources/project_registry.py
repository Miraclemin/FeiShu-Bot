"""Per-profile, per-chat/topic project settings. No credentials, network or broadcast."""
import argparse, hashlib, json, os, re, sys
from contextlib import contextmanager

@contextmanager
def registry_lock(path):
 with path.open("a+b") as lock:
  if os.name == "nt":
   import msvcrt
   lock.seek(0, 2)
   if lock.tell() == 0: lock.write(b"0"); lock.flush()
   lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
  else:
   import fcntl
   fcntl.flock(lock, fcntl.LOCK_EX)
  try: yield
  finally:
   if os.name == "nt":
    lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)
   else: fcntl.flock(lock, fcntl.LOCK_UN)
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
FILE=Path(os.environ.get('LARK_PROJECT_BINDINGS_FILE',str(Path(os.environ.get('LARK_CHANNEL_HOME',str(Path.home()/'.lark-channel')))/'project-bindings.json')))
ROLES={'product-manager':'产品','codex':'研发','inspector':'巡检'}
FIELDS={'name':'product_name','url':'product_url','repo':'project_workspace','requirements':'requirements_url','bugs':'bugs_url','records':'records_url','directions':'directions_url','logs':'logs_url'}
def key(profile,chat,topic=''):return json.dumps([profile,chat,topic],separators=(',',':'))
def table(value):
 from urllib.parse import parse_qs
 u=urlparse(value);m=re.fullmatch(r'/base/([A-Za-z0-9]+)',u.path.rstrip('/'))
 if u.scheme!='https' or not (u.hostname or '').endswith(('.feishu.cn','.larksuite.com')) or not m:raise ValueError('请粘贴飞书多维表格完整链接，包含 ?table=tbl...')
 t=parse_qs(u.query).get('table',[''])[0]
 if not re.fullmatch(r'tbl[A-Za-z0-9]+',t):raise ValueError('链接缺少有效table参数')
 return {'base_token':m[1],'table_id':t,'url':value}
def validate(field,value):
 if not value.strip() or len(value)>1500 or any(ord(c)<32 for c in value):raise ValueError('配置不能为空、过长或含控制字符')
 if field=='repo':
  p=Path(value).expanduser().resolve(strict=True)
  if not p.is_dir() or str(p) in ['/',str(Path.home()),'/tmp','/private/tmp','/System','/Library','/usr','/private','/Users']:raise ValueError('必须指定具体项目目录')
  return str(p)
 if field=='url':
  u=urlparse(value)
  if u.scheme!='https' or not u.hostname or u.username or u.password or u.query or u.fragment:raise ValueError('产品网址请使用无账号、令牌和查询参数的HTTPS入口')
 if field in ['requirements','bugs','records','directions','logs']:table(value)
 return value

def run(profile,chat,topic,action,field=None,value=None,path=FILE,cwd=None):
 if not profile or any(c in profile for c in '/\\'):raise ValueError('profile无效')
 if not re.fullmatch('oc_[A-Za-z0-9]+',chat):raise ValueError('缺少真实群ID')
 if topic and not re.fullmatch(r'(?:om_|omt_)[A-Za-z0-9]+',topic):raise ValueError('Topic ID无效')
 path=Path(path)
 if action not in ['show','set']:raise ValueError('仅支持show/set')
 def read():
  try:return json.loads(path.read_text())
  except FileNotFoundError:return {}
 k=key(profile,chat,topic)
 default={'profile':profile,'chat_id':chat,'topic_id':topic or None,'role':ROLES.get(profile,profile),'reply':'current'}
 if action=='show':
  # Writers atomically replace the complete JSON; readers need no writable lock.
  data=read();b=data.get(k,default)
 else:
  if field not in FIELDS:raise ValueError('可设置字段：'+', '.join(FIELDS))
  value=validate(field,value)
  path.parent.mkdir(parents=True,exist_ok=True)
  with registry_lock(path.with_suffix('.lock')):
   data=read();b=data.get(k,default);b[FIELDS[field]]=value
   data[k]=b;t=path.with_suffix('.tmp');t.write_text(json.dumps(data,ensure_ascii=False,indent=2));t.replace(path)
 result=dict(b);result['configured']=k in data;result['workspace']=cwd
 needed={'product-manager':['name','url','repo','requirements'],'codex':['name','url','repo','bugs','requirements'],'inspector':['name','url','repo','bugs','records','directions','logs']}.get(profile, ['name','repo'])
 result['missing']=[f for f in needed if not b.get(FIELDS[f])]
 result['note']='配置完整不等于表权限、字段兼容、浏览器登录或定时任务已验收；回执仅当前群/Topic，定时绑定另行配置。'
 return result
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('action',choices=['show','set']);a.add_argument('--profile',required=True);a.add_argument('--chat',required=True);a.add_argument('--topic',default='');a.add_argument('--cwd');a.add_argument('--field');a.add_argument('--value');x=a.parse_args()
 try:print(json.dumps(run(x.profile,x.chat,x.topic,x.action,x.field,x.value,cwd=x.cwd),ensure_ascii=False))
 except (ValueError,OSError) as e:print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
