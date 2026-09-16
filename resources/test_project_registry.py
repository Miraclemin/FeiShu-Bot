import tempfile,unittest
from pathlib import Path
from project_registry import run,validate
class RegistryTest(unittest.TestCase):
 def test_isolation(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'b.json'
   run('codex','oc_a','','set','name','A',p)
   run('codex','oc_b','','set','name','B',p)
   run('inspector','oc_a','','set','name','C',p)
   run('codex','oc_a','omt_1','set','name','Topic',p)
   self.assertEqual(run('codex','oc_a','','show',path=p)['product_name'],'A')
   self.assertEqual(run('codex','oc_b','','show',path=p)['product_name'],'B')
   self.assertEqual(run('inspector','oc_a','','show',path=p)['product_name'],'C')
   self.assertEqual(run('codex','oc_a','omt_1','show',path=p)['product_name'],'Topic')
   self.assertFalse(run('codex','oc_unknown','','show',path=p)['configured'])
 def test_show_never_writes(self):
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'b.json'
   run('codex','oc_a','','set','name','A',p)
   real_open=Path.open
   def readonly(path,mode='r',*args,**kwargs):
    if any(c in mode for c in 'wax+'):raise PermissionError('read-only workspace')
    return real_open(path,mode,*args,**kwargs)
   with patch.object(Path,'open',readonly),patch.object(Path,'mkdir',side_effect=PermissionError('no mkdir')):
    self.assertEqual(run('codex','oc_a','','show',path=p)['product_name'],'A')
    self.assertFalse(run('codex','oc_a','','show',path=Path(d)/'missing'/'b.json')['configured'])
 def test_desktop_binding_without_name_or_repo(self):
  import json
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'project-bindings.json'
   config={'profiles':{'Agent-test':{'workbench':{'groups':{'oc_a':{'enabled':True,'project':{},'resources':['https://example.com/table']},'oc_disabled':{'enabled':False}}}}}}
   (Path(d)/'config.json').write_text(json.dumps(config))
   result=run('Agent-test','oc_a','omt_1','show',path=p)
   self.assertTrue(result['configured'])
   self.assertEqual(result['source'],'desktop-workbench')
   self.assertEqual(result['resources'],['https://example.com/table'])
   self.assertEqual(result['missing'],[])
   self.assertFalse(run('Agent-test','oc_other','','show',path=p)['configured'])
   self.assertFalse(run('Agent-test','oc_disabled','','show',path=p)['configured'])
   with self.assertRaises(ValueError):run('Agent-test','oc_a','','set','name','B',p)
   self.assertFalse(p.exists())
 def test_invalid(self):
  for f,v in [('url','https://a.com/?token=secret'),('repo','/'),('bugs','https://a.com/base/abc?table=tblx')]:
   with self.assertRaises(ValueError):validate(f,v)
 def test_no_broadcast(self):
  with tempfile.TemporaryDirectory() as d:
   with self.assertRaises(ValueError):run('codex','oc_a','','set','reply','all',Path(d)/'b.json')
if __name__=='__main__':unittest.main()
