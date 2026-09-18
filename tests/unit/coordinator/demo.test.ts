import {describe,it,expect} from 'vitest';
import {initialBoard,advance,approve,changeRequirement} from '../../../web/src/coordinator/model';
describe('coordinator experience control boundaries',()=>{
 it('waits for both parallel dependencies and never auto approves release',()=>{
 let b={...initialBoard(),phase:'active' as const};
 let x=advance(b);expect(x.steps.filter(s=>s.status==='running').map(s=>s.id)).toEqual(['product']);
 x=advance(advance(x));expect(x.steps.filter(s=>s.status==='running').map(s=>s.id)).toEqual(['frontend','backend']);
 x={...x,steps:x.steps.map(s=>s.id==='frontend'?{...s,status:'done' as const}:s)};
 x=advance(x);expect(x.steps.find(s=>s.id==='test')?.status).toBe('pending');
 for(let i=0;i<6;i++)x=advance(x);
 expect(x.steps.find(s=>s.id==='release')?.status).toBe('approval');expect(x.phase).toBe('active');
 expect(approve(x).phase).toBe('done');
 });
 it('pauses, invalidates prior revision, keeps history and rejects premature approval',()=>{
 const b=advance({...initialBoard(),phase:'active'});
 expect(approve(b)).toBe(b);
 const x=changeRequirement(b,'保留历史数据');expect(x.phase).toBe('paused');expect(x.revision).toBe(2);expect(x.steps.every(s=>s.status==='pending')).toBe(true);expect(x.events.length).toBeGreaterThan(b.events.length);expect(advance(x)).toBe(x);
 });
});
