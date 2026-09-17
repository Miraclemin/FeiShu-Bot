import { copyText } from '@/lib/clipboard';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sharedResourceLinks, resourceShareText } from '@/lib/shared-resources';
import { toast } from 'sonner';
export function ResourceSharing({name,links,onAdd}:{name:string;links:string[];onAdd:(links:string[])=>void}) {
  const [mode,setMode]=useState<'import'|'share'|null>(null), [text,setText]=useState(''),[preview,setPreview]=useState<string[]>([]),[error,setError]=useState('');
  return <div className="rounded-xl border bg-accent/30 p-4 space-y-3">
    <h4 className="font-medium">和同事共用飞书资料</h4>
    <p className="text-sm text-muted-foreground">在飞书分享原文链接，在这里绑定给本群 Agent。内容按需从飞书读取；清单新增资料需要重新导入。</p>
    <div className="flex gap-2"><Button variant="outline" onClick={()=>{setMode('import');setText('');setPreview([]);setError('');}}>从飞书导入资料清单</Button><Button variant="outline" disabled={!links.length} onClick={()=>{setMode('share');setText(resourceShareText(name,links));setError('');}}>分享本群资料</Button></div>
    {mode && <><textarea aria-label={mode==='import'?'粘贴飞书资料清单':'可复制的资料分享内容'} className="w-full rounded-md border bg-background p-3 min-h-32 text-sm" readOnly={mode==='share'} value={text} placeholder="粘贴同事发来的资料清单，或包含飞书链接的群消息" onChange={e=>{setText(e.target.value);setPreview([]);}} />
      {mode==='share'?<Button onClick={async()=>{try{setError('');await copyText(text);toast.success('已复制，粘贴到飞书群即可分享');}catch{setError('无法访问剪贴板，请选中上方内容手动复制');}}}>复制，去飞书分享</Button>:<Button variant="outline" onClick={()=>{try{setPreview(sharedResourceLinks(text));setError('');}catch(e){setError((e as Error).message);}}}>识别资料链接</Button>}
      {preview.length>0&&mode==='import'&&<div className="space-y-2"><p className="text-sm">识别到 {preview.length} 份资料，其中 {preview.filter(x=>!links.includes(x)).length} 份尚未加入。</p><ul className="text-xs break-all space-y-1">{preview.map(x=><li key={x}>{x}</li>)}</ul><Button onClick={()=>{onAdd([...new Set([...links,...preview])]);setMode(null);setPreview([]);toast.success('已加入编辑清单，请检查访问权限并保存');}}>加入本群资料</Button></div>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    </>}
  </div>;
}
