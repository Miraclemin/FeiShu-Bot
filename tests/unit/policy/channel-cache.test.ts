import { expect, it } from 'vitest';
import { createChannelCache } from '../../../src/bot/channel-cache';
it('keeps the same group message independent for two bots', async () => {
 const a=createChannelCache(), b=createChannelCache();
 await a.set('om_shared','1',Date.now()+60000,{namespace:'seen'});
 expect(await a.get('om_shared',{namespace:'seen'})).toBe('1');
 expect(await b.get('om_shared',{namespace:'seen'})).toBeUndefined();
 await b.set('om_shared','1',Date.now()+60000,{namespace:'seen'});
 expect(await b.get('om_shared',{namespace:'seen'})).toBe('1');
});
it('isolates namespaces and expires entries',async()=>{
 const cache=createChannelCache();
 await cache.set('id','x',Date.now()-1,{namespace:'a'});
 await cache.set('id','y',undefined,{namespace:'b'});
 expect(await cache.get('id',{namespace:'a'})).toBeUndefined();
 expect(await cache.get('id',{namespace:'b'})).toBe('y');
});
it('delivers one shared message to both SDK channels while suppressing same-bot replays',async()=>{
 const {createLarkChannel}=await import('@larksuite/channel');
 const received:number[]=[];
 const channels=[1,2].map(i=>{
  const channel=createLarkChannel({appId:`cli_test_${i}`,appSecret:'test',cache:createChannelCache(),policy:{requireMention:false,dmMode:'open'},safety:{chatQueue:{enabled:false}}});
  channel.on({message:async()=>{received.push(i);}});
  return channel;
 });
 // Exercise the SDK's real dedup pipeline without starting a websocket or making API calls.
 const safety=channels.map(c=>(c as unknown as {safety:{pushMessage(m:unknown):Promise<void>;dispose():Promise<void>}}).safety);
 const msg={messageId:'om_shared_regression',chatId:'oc_team',chatType:'group',senderId:'ou_user',senderType:'user',createTime:Date.now(),text:'hello',mentionedBot:true,resources:[]};
 try {
  await safety[0]!.pushMessage(msg); await new Promise(r=>setTimeout(r,20));
  await safety[1]!.pushMessage(msg); await new Promise(r=>setTimeout(r,20));
  await safety[0]!.pushMessage(msg); await safety[1]!.pushMessage(msg);
  expect(received).toEqual([1,2]);
 } finally {await Promise.all(safety.map(s=>s.dispose()));}
});
