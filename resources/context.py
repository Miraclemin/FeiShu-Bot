"""Resolve tool inputs from trusted Bridge per-run environment or explicit schedule."""
import os
from project_registry import run,table
import json
from pathlib import Path
def reject_desktop_legacy_tool():
 # These helpers bind fixed role identities and can override the inherited CLI
 # identity. Detect desktop mode before touching legacy state or calling Feishu.
 home=os.environ.get('LARK_CHANNEL_HOME')
 profile=os.environ.get('LARK_CHANNEL_PROFILE')
 if not home or not profile:return
 try:config=json.loads((Path(home)/'config.json').read_text())
 except FileNotFoundError:return
 if 'workbench' in config.get('profiles',{}).get(profile,{}):
  raise ValueError('legacy_tool_incompatible: 当前为软件群任务，旧角色脚本未适配当前机器人；这不表示未绑定。请使用注入的 resources 和当前身份 lark-cli --as bot 查询，禁止切换身份或要求 /project 重绑。')

def default_chat(profile):
 p=Path(os.environ.get('LARK_CHANNEL_HOME',str(Path.home()/'.lark-channel')))/'project-defaults.json'
 return json.loads(p.read_text())[profile]['chat_id']
def current(profile,chat=None,topic=None):
 reject_desktop_legacy_tool()
 if os.environ.get('LARK_CHANNEL'):
  if os.environ.get('LARK_CHANNEL_PROFILE')!=profile:raise ValueError('机器人身份不匹配')
  actual=os.environ.get('LARK_PROJECT_CHAT_ID')
  if not actual:raise ValueError('缺少Bridge真实群上下文；停止，不能回退到原群')
  if chat and chat!=actual:raise ValueError('指定群与当前消息群不匹配')
  chat=actual;topic=os.environ.get('LARK_PROJECT_TOPIC_ID','')
 b=run(profile,chat or default_chat(profile),topic or '','show')
 if not b['configured']:raise ValueError('当前群/Topic未绑定项目，请先 /project set')
 return b
