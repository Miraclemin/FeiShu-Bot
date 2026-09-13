"""Resolve tool inputs from trusted Bridge per-run environment or explicit schedule."""
import os
from project_registry import run,table
import json
from pathlib import Path
def default_chat(profile):
 p=Path(os.environ.get('LARK_CHANNEL_HOME',str(Path.home()/'.lark-channel')))/'project-defaults.json'
 return json.loads(p.read_text())[profile]['chat_id']
def current(profile,chat=None,topic=None):
 if os.environ.get('LARK_CHANNEL'):
  if os.environ.get('LARK_CHANNEL_PROFILE')!=profile:raise ValueError('机器人身份不匹配')
  actual=os.environ.get('LARK_PROJECT_CHAT_ID')
  if not actual:raise ValueError('缺少Bridge真实群上下文；停止，不能回退到原群')
  if chat and chat!=actual:raise ValueError('指定群与当前消息群不匹配')
  chat=actual;topic=os.environ.get('LARK_PROJECT_TOPIC_ID','')
 b=run(profile,chat or default_chat(profile),topic or '','show')
 if not b['configured']:raise ValueError('当前群/Topic未绑定项目，请先 /project set')
 return b
