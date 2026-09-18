export type Status = 'pending' | 'running' | 'done' | 'approval';
export type Step = { id:string; title:string; agent:string; role:string; status:Status; deps:string[]; result:string };
export type Board = { goal:string; mode:'auto'|'manual'; phase:'draft'|'active'|'paused'|'done'; revision:number; steps:Step[]; events:string[] };
export const initialBoard = ():Board => ({goal:'让用户看清任务正在执行到哪一步，失败时不要一直显示运行中。',mode:'auto',phase:'draft',revision:1,events:['协调员已就绪。先确认目标，再开始体验。'],steps:[
{id:'product',title:'明确需求与验收标准',agent:'小策 · 产品',role:'明确用户目标、范围和验收标准',status:'pending',deps:[],result:'建议：展示当前阶段、失败原因和完成状态；不使用没有依据的进度百分比。'},
{id:'frontend',title:'实现阶段状态展示',agent:'小码 · 前端研发',role:'负责页面与交互，不修改后端协议',status:'pending',deps:['product'],result:'示例交付：状态组件与预览说明；等待集成验收。'},
{id:'backend',title:'核对任务状态接口',agent:'小栈 · 后端研发',role:'负责接口与状态定义，保留历史数据',status:'pending',deps:['product'],result:'示例交付：运行、失败、完成三种状态契约及兼容说明。'},
{id:'test',title:'集成验收与回归',agent:'小检 · 测试',role:'按验收标准检查，记录复现步骤和证据',status:'pending',deps:['frontend','backend'],result:'模拟验收：正常运行、失败、完成和历史任务共 4 项通过。没有真实网页测试。'},
{id:'release',title:'负责人确认上线',agent:'你 · 项目负责人',role:'确认版本和发布范围',status:'pending',deps:['test'],result:'本体验只模拟确认，不执行真实发布。'},
]});
export function advance(b:Board):Board {
 if(b.phase!=='active') return b;
 const next={...b,steps:b.steps.map(s=>({...s})),events:[...b.events]};
 const running=next.steps.filter(s=>s.status==='running');
 if(running.length){ for(const s of running){s.status='done';next.events.unshift(`${s.agent} 完成「${s.title}」· 模拟交付，v${b.revision}`);} return next; }
 const ready=next.steps.filter(s=>s.status==='pending'&&s.deps.every(id=>next.steps.find(t=>t.id===id)?.status==='done'));
 for(const s of ready){s.status=s.id==='release'?'approval':'running';next.events.unshift(s.id==='release'?'协调员：验收结果已汇总，等待负责人确认。':`协调员 → ${s.agent}：${s.title}（按负责范围分配）`);}
 return ready.length?next:b;
}
export function approve(b:Board):Board {
 if(b.phase!=='active'||b.steps.find(s=>s.id==='release')?.status!=='approval')return b;
 return {...b,phase:'done',steps:b.steps.map(s=>s.id==='release'?{...s,status:'done'}:s),events:['你确认了模拟上线；本轮体验结束。没有调用真实机器人或生产发布。',...b.events]};
}
export function changeRequirement(b:Board,note:string):Board {
 if(!note.trim()||b.phase==='draft'||b.phase==='done')return b;
 return {...b,phase:'paused',revision:b.revision+1,goal:b.goal+'\n补充：'+note.trim(),steps:b.steps.map(s=>({...s,status:'pending'})),events:[`你补充要求「${note.trim()}」。旧版本结果保留在历史中；暂停派发，按 v${b.revision+1} 重新规划。`,...b.events]};
}
