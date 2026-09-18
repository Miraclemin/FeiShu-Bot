import { beforeEach, expect, it, vi } from 'vitest';
const hooks=vi.hoisted(()=>({values:[] as any[],index:0,effects:[] as (()=>void)[]}));
vi.mock('react',()=>({useState:(initial:any)=>{const i=hooks.index++;if(!(i in hooks.values))hooks.values[i]=typeof initial==='function'?initial():initial;return [hooks.values[i],(next:any)=>{hooks.values[i]=typeof next==='function'?next(hooks.values[i]):next;}];},useEffect:(fn:()=>void)=>hooks.effects.push(fn)}));
vi.mock('@/components/ui/button',()=>({Button:'button'}));
vi.mock('@/components/ui/input',()=>({Input:'input'}));
vi.mock('@/lib/api',()=>({apiPost:vi.fn(),apiGet:vi.fn().mockResolvedValue({profiles:[]})}));
vi.mock('../../../web/src/views/OnboardWizard',()=>({OnboardWizard:'wizard'}));
// @ts-expect-error Vitest transforms this web TSX; the server tsconfig has no JSX option.
import { CreateTeam } from '../../../web/src/views/CreateTeam';
function render(){hooks.index=0;hooks.effects=[];const tree=CreateTeam({onBack:()=>{},onOpen:()=>{}});hooks.effects.forEach(f=>f());return tree;}
function find(tree:any,type:string):any {if(!tree||typeof tree!=='object')return; if(tree.type===type)return tree;for(const child of [tree.props?.children].flat(Infinity)){const match=find(child,type);if(match)return match;}}
beforeEach(()=>{vi.stubGlobal('window',{});hooks.values=[];const data=new Map<string,string>();vi.stubGlobal('sessionStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v),removeItem:(k:string)=>data.delete(k)});});
it('late QR callback preserves all fields typed after polling began and persisted draft',()=>{
 const first=render();const qrDone=find(first,'wizard').props.onCreated;
 find(first,'input').props.onChange({target:{value:'我的团队'}});
 const second=render();find(second,'textarea').props.onChange({target:{value:'用户新填的目标'}});
 // The final directory input lives under the last label in the fieldset.
 const third=render();const fields=find(third,'fieldset').props.children;
 fields.find((f:any)=>f.type==='label' && f.props.children[0]==='组织者工作目录').props.children[1].props.onChange({target:{value:'/tmp/my-project'}});
 render();qrDone('组织者2');render();
 expect(hooks.values[0]).toEqual({name:'我的团队',goal:'用户新填的目标',workspace:'/tmp/my-project',profile:'组织者2'});
 expect(JSON.parse(sessionStorage.getItem('create-collaboration-team')!)).toEqual(hooks.values[0]);
 // Leaving for permissions and returning must restore the same draft.
 hooks.values=[];render();expect(hooks.values[0].workspace).toBe('/tmp/my-project');expect(hooks.values[0].profile).toBe('组织者2');
});
