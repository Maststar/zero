// Request-level tests exercise the real Edge handler against an in-memory
// PostgREST implementation, including optimistic concurrency conflicts.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {chooseBotMove} from '../web/engine.js';
const rooms=new Map(),rates=new Map();let handler,forcedConflict=false;
globalThis.Deno={env:{get:key=>key==='SUPABASE_URL'?'https://test-db.local':'test-service-key'},serve:fn=>handler=fn};
globalThis.fetch=async(url,options={})=>{
 const u=new URL(url),path=u.pathname.replace('/rest/v1/',''),method=options.method||'GET',b=options.body?JSON.parse(options.body):null;
 const result=v=>new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});
 if(path==='rpc/zero_rate_hit'){rates.set(b.p_key,(rates.get(b.p_key)||0)+1);return result(rates.get(b.p_key))}
 if(path==='zero_rate_limits')return result([]);
 if(path!=='zero_rooms')throw new Error('Unexpected DB call '+path);
 if(method==='POST'){if(rooms.has(b.code))return new Response('{}',{status:409});rooms.set(b.code,{...structuredClone(b),revision:0,expires_at:new Date(Date.now()+7200000).toISOString()});return result([b])}
 const code=u.searchParams.get('code')?.slice(3),owner=u.searchParams.get('owner_hash')?.slice(3);
 if(method==='GET'){const list=code?(rooms.has(code)?[rooms.get(code)]:[]):[...rooms.values()].filter(r=>!owner||r.owner_hash===owner);return result(list)}
 if(method==='DELETE')return result([]);
 if(method==='PATCH'){const row=rooms.get(code);if(forcedConflict){forcedConflict=false;row.revision++;return result([])}if(!row||String(row.revision)!==u.searchParams.get('revision')?.slice(3))return result([]);Object.assign(row,structuredClone(b));return result([row])}
 throw new Error('Unexpected method '+method);
};
let source=await fs.readFile(new URL('../backend/index.ts',import.meta.url),'utf8');
source=source.replace("'./engine.js'",JSON.stringify(new URL('../web/engine.js',import.meta.url).href));
const transformed=stripTypeScriptTypes(source,{mode:'transform'});
const modulePath=new URL('./.backend-runtime.mjs',import.meta.url);
await fs.writeFile(modulePath,transformed);await import(pathToFileURL(modulePath.pathname).href);
let ip=0;
function client(){return {token:randomBytes(32).toString('hex'),ip:String(++ip)}}
async function call(c,action,data={}){const r=await handler(new Request('https://test.local/zero-game',{method:'POST',headers:{'Content-Type':'application/json','x-zero-token':c.token,'x-forwarded-for':c.ip},body:JSON.stringify({action,requestId:crypto.randomUUID(),...data})}));return {status:r.status,...await r.json()}}
test('device authentication and malformed requests rejected',async()=>{const r=await call({token:'bad',ip:'a'},'create',{name:'Bad'});assert.equal(r.status,401);assert.equal((await call(client(),'join',{code:'bad'})).status,400)});
test('create retries return the original room',async()=>{const c=client(),requestId=crypto.randomUUID();const a=await call(c,'create',{name:'Retry',requestId}),b=await call(c,'create',{name:'Retry',requestId});assert.equal(a.status,200);assert.equal(a.state.code,b.state.code);assert.equal(a.state.you,b.state.you)});
test('8 independent clients join, hidden hands, host rules, replay protection, complete match',async()=>{
 const cs=Array.from({length:9},client),created=await call(cs[0],'create',{name:'Host',mode:'ffa'});assert.equal(created.status,200,JSON.stringify(created));const code=created.state.code;
 const joined=await Promise.all(cs.slice(1,8).map((c,i)=>call(c,'join',{code,name:'Guest'+i})));assert.ok(joined.every(x=>x.status===200));
 assert.equal((await call(cs[8],'join',{code,name:'Overflow'})).status,400);
 assert.equal((await call(cs[8],'state',{code})).status,403);
 assert.equal((await call(cs[1],'start',{code})).status,400);
 assert.equal((await call(cs[0],'start',{code})).status,400);
 for(const c of cs.slice(1,8))assert.equal((await call(c,'ready',{code,ready:true})).status,200);
 forcedConflict=true;const started=await call(cs[0],'start',{code});assert.equal(started.status,200);
 const views=await Promise.all(cs.slice(0,8).map(c=>call(c,'state',{code})));
 const owners=new Map();views.forEach((r,i)=>{assert.equal(r.status,200);owners.set(r.state.you,cs[i]);assert.equal(r.state.players.filter(p=>'hand'in p).length,1);assert.ok(!JSON.stringify(r).includes(cs[i].token));assert.ok(!JSON.stringify(r).includes('owner_hash'))});
 let s=rooms.get(code).state,current=s.players[s.turn],c=owners.get(current.id),turn=s.turnId;
 const nonce=crypto.randomUUID(),first=await call(c,'draw',{code,turnId:turn,requestId:nonce}),second=await call(c,'draw',{code,turnId:turn,requestId:nonce});assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(first.state.players.find(p=>p.id===current.id).hand.length,second.state.players.find(p=>p.id===current.id).hand.length);
 assert.equal((await call(owners.get(s.players.find(p=>p.id!==current.id).id),'play',{code,turnId:turn,cardId:'fake',target:current.id})).status,400);
 let moves=0;while(rooms.get(code).state.status==='playing'&&moves<500){s=structuredClone(rooms.get(code).state);current=s.players[s.turn];c=owners.get(current.id);if(s.phase==='draw')assert.equal((await call(c,'draw',{code,turnId:s.turnId})).status,200);s=structuredClone(rooms.get(code).state);const move=chooseBotMove(s,current.id);const played=await call(c,'play',{code,turnId:s.turnId,...move});assert.equal(played.status,200,JSON.stringify(played));moves++}
 assert.equal(rooms.get(code).state.status,'finished');console.log('Eight-client request simulation finished after',moves,'moves');
 assert.equal((await call(cs[0],'rematch',{code})).state.status,'lobby');
});
test('2v2 lobby enforces four seats and balanced team changes',async()=>{const cs=Array.from({length:5},client);const r=await call(cs[0],'create',{name:'Team host',mode:'teams'});const code=r.state.code;for(let i=1;i<4;i++)assert.equal((await call(cs[i],'join',{code,name:'Mate'+i})).status,200);assert.equal((await call(cs[4],'join',{code,name:'Extra'})).status,400);assert.equal((await call(cs[1],'team',{code,team:0})).status,400);for(const c of cs.slice(1,4))await call(c,'ready',{code,ready:true});const started=await call(cs[0],'start',{code});assert.equal(started.status,200);assert.deepEqual(started.state.players.map(p=>p.team),[0,1,0,1]);});
test('reconnect recovers same seat and leave revokes room access',async()=>{const c=client();const r=await call(c,'create',{name:'Reconnect',mode:'ffa'});const code=r.state.code,seat=r.state.you;assert.equal((await call(c,'join',{code,name:'Changed'})).state.you,seat);assert.equal((await call(c,'leave',{code})).left,true);assert.equal((await call(c,'state',{code})).status,403)});
test('entry throttling is applied across different device tokens',async()=>{const c=client();c.ip='rate-test';for(let i=0;i<60;i++)await call({...c,token:randomBytes(32).toString('hex')},'join',{code:'ABC234',name:'Guest'});assert.equal((await call(c,'join',{code:'ABC234',name:'Guest'})).status,429)});
