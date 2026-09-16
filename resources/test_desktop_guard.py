import importlib.util,json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import context
class DesktopGuardTest(unittest.TestCase):
 def test_desktop_profiles_fail_before_legacy_reads_or_identity_switch(self):
  with tempfile.TemporaryDirectory() as d:
   for profile in ['Agent-测试1','codex','inspector','product-manager']:
    (Path(d)/'config.json').write_text(json.dumps({'profiles':{profile:{'workbench':{'groups':{}}}}}))
    with patch.dict(os.environ,{'LARK_CHANNEL_HOME':d,'LARK_CHANNEL_PROFILE':profile,'LARK_CHANNEL':'1'},clear=True),patch.object(context,'run') as run,patch.object(context,'default_chat') as default:
     for role in ['codex','inspector','product-manager']:
      with self.assertRaisesRegex(ValueError,'legacy_tool_incompatible'):
       context.current(role)
     run.assert_not_called();default.assert_not_called()
 def test_legacy_context_still_validates_and_resolves_real_scope(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/'config.json').write_text(json.dumps({'profiles':{'codex':{}}}))
   with patch.dict(os.environ,{'LARK_CHANNEL_HOME':d,'LARK_CHANNEL_PROFILE':'codex','LARK_CHANNEL':'1','LARK_PROJECT_CHAT_ID':'oc_actual'},clear=True),patch.object(context,'run',return_value={'configured':True}) as run:
    self.assertTrue(context.current('codex')['configured'])
    run.assert_called_once_with('codex','oc_actual','','show')
    with self.assertRaisesRegex(ValueError,'不匹配'):context.current('inspector')
    with self.assertRaisesRegex(ValueError,'不匹配'):context.current('codex','oc_other')
if __name__=='__main__':unittest.main()
