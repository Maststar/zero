import {player,room,act,view,timeout,randomInt} from './engine.js';

const URL=Deno.env.get('SUPABASE_URL')!;
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-zero-token','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
class ClientError extends Error {constructor(message:string,public status=400){super(message)}}
async function db(path:string,method='GET',body?:unknown){
 const r=await fetch(URL+'/rest/v1/'+path,{method,headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{data=null}
 if(!r.ok)throw new Error('Database request failed '+r.status);
 return data;
}
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('')}
async function rate(key:string,max:number){const hits=await db('rpc/zero_rate_hit','POST',{p_key:key+':'+Math.floor(Date.now()/60000)});if(hits>max)throw new ClientError('Too many requests. Wait a moment and try again.',429)}
function code(){return Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(31)]).join('')}
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors})}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method==='GET')return reply({game:'Zero',version:'1.0.0',status:'ready'});
 if(req.method!=='POST')return reply({error:'Use POST.'},405);
 try{
  const raw=await req.text();if(raw.length>4096)throw new ClientError('Request too large.',413);
  let b;try{b=JSON.parse(raw)}catch{throw new ClientError('Invalid request.')}
  const token=req.headers.get('x-zero-token')||'';
  if(!/^[a-f0-9]{64}$/.test(token))throw new ClientError('Invalid device session.',401);
  const key=await hash(token),now=Date.now(),action=String(b.action||'');
  if(!['create','join','state','ready','team','kick','start','draw','play','leave','rematch'].includes(action))throw new ClientError('Unknown action.');
  const ip=(req.headers.get('x-forwarded-for')||req.headers.get('cf-connecting-ip')||'unknown').split(',')[0].trim();
  if(action==='create'||action==='join')await rate('entry:'+await hash(ip),60);
  else await rate('session:'+key,120);
  if(action==='create'){
   await db('zero_rooms?expires_at=lt.'+encodeURIComponent(new Date(now).toISOString()),'DELETE');
   await db('zero_rate_limits?expires_at=lt.'+encodeURIComponent(new Date(now).toISOString()),'DELETE');
   if(!/^[a-zA-Z0-9-]{8,80}$/.test(String(b.requestId||'')))throw new ClientError('Missing request identifier.');
   const old=await db('zero_rooms?owner_hash=eq.'+key+'&select=code,state');
   const previous=old.find((r:any)=>r.state.createRequest===b.requestId);
   if(previous){const owner=previous.state.players.find((x:any)=>x.key===key&&!x.left);if(owner)return reply({state:view(previous.state,owner.id,now)})}
   if(old.length>=5)throw new ClientError('You already have 5 active rooms. Rejoin one or try again later.');
   if(!String(b.name||'').trim())throw new ClientError('Choose a player name.');
   const c=code(),p=player(b.name,key),s=room(c,b.mode,p);s.createRequest=b.requestId;
   await db('zero_rooms','POST',{code:c,state:s,owner_hash:key});
   return reply({state:view(s,p.id,now)});
  }
  const c=String(b.code||'').toUpperCase();if(!/^[A-Z2-9]{6}$/.test(c))throw new ClientError('Enter the 6-character room code.');
  for(let attempt=0;attempt<8;attempt++){
   const rows=await db('zero_rooms?code=eq.'+c+'&select=state,revision,expires_at');
   if(!rows.length||Date.parse(rows[0].expires_at)<now)throw new ClientError('Room not found or expired. Check the code.',404);
   const row=rows[0],s=row.state;let p=s.players.find((x:any)=>x.key===key&&!x.left),changed=false;
   if(action==='join'&&!p){
    if(s.status!=='lobby')throw new ClientError('This match has started. Join the next round.');
    if(s.players.length>=(s.mode==='teams'?4:8))throw new ClientError('This room is full.');
    if(!String(b.name||'').trim())throw new ClientError('Choose a player name.');
    let team=0;if(s.mode==='teams')team=s.players.filter((x:any)=>x.team===0).length<=s.players.filter((x:any)=>x.team===1).length?0:1;
    p=player(b.name,key,team);s.players.push(p);changed=true;
   }
   if(!p)throw new ClientError('You are not in this room. Join using its code.',403);
   if(now-p.lastSeen>15000){p.lastSeen=now;changed=true}
   const host=s.players.find((x:any)=>x.id===s.host&&!x.left);
   if(!host||now-host.lastSeen>65000){s.host=p.id;p.ready=true;changed=true}
   if(timeout(s,now))changed=true;
   const requestKey=p.id+':'+String(b.requestId||'');
   if(!['state','join'].includes(action)&&!s.requests.includes(requestKey)){
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(String(b.requestId||'')))throw new ClientError('Missing request identifier.');
    try{act(s,p.id,action,b,now)}catch(e){throw new ClientError(e.message)}
    s.requests.push(requestKey);s.requests=s.requests.slice(-64);changed=true;
   }
   if(changed){
    const saved=await db(`zero_rooms?code=eq.${c}&revision=eq.${row.revision}`,'PATCH',{state:s,revision:row.revision+1,expires_at:new Date(now+7200000).toISOString()});
    if(!saved.length)continue;
   }
   if(action==='leave')return reply({left:true});
   return reply({state:view(s,p.id,now)});
  }
  throw new ClientError('The room is busy. Try your move again.',409);
 }catch(e){
  if(e instanceof ClientError)return reply({error:e.message},e.status);
  console.error('Zero request failed',e.message);return reply({error:'Could not reach the game server. Try again.'},503);
 }
});
