// Shared rules. Online authority lives exclusively in the Edge Function.
export const CARDS = {
  minus1:{label:'−1',name:'Nudge',text:'Subtract 1 from any total.',color:'lime',n:10},
  minus3:{label:'−3',name:'Cut',text:'Subtract 3 from any total.',color:'lime',n:12},
  minus5:{label:'−5',name:'Crash',text:'Subtract 5 from any total.',color:'lime',n:8},
  plus2:{label:'+2',name:'Bump',text:'Add 2 to any total.',color:'coral',n:10},
  double:{label:'×2',name:'Double',text:'Double any total, up to 99.',color:'coral',n:4},
  divide:{label:'÷2',name:'Split',text:'Halve any total. Round up.',color:'lime',n:8},
  swap:{label:'⇄',name:'Swap',text:'Exchange your total with another player.',color:'purple',n:4},
  reverse:{label:'↶',name:'Reverse',text:'Reverse the order of play.',color:'blue',n:4},
  lock:{label:'⊠',name:'Lock',text:'Stop another player winning until their next turn ends.',color:'purple',n:4},
  steal:{label:'↗',name:'Steal',text:'Take one random card from another player.',color:'coral',n:4},
  hide:{label:'◌',name:'Cloak',text:'Hide your total until your next turn starts.',color:'purple',n:4},
  shield:{label:'◇',name:'Shield',text:'Block the next card another player aims at you.',color:'blue',n:4}
};
export const TURN_MS=45000;
const fail = text => {throw new Error(text)};
export function randomInt(n){const a=new Uint32Array(1);crypto.getRandomValues(a);return Math.floor(a[0]/4294967296*n)}
export function uid(){return crypto.randomUUID()}
export function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
export function deck(){return shuffle(Object.entries(CARDS).flatMap(([type,c])=>Array.from({length:c.n},()=>({id:uid(),type}))))}
export function player(name,key,team=0){return {id:uid(),name:String(name).trim().slice(0,18)||'Player',key,team,ready:false,hand:[],total:0,alive:true,revealed:false,hidden:false,locked:false,shield:false,misses:0,lastSeen:Date.now(),left:false}}
export function room(code,mode,p){p.ready=true;return {code,mode:mode==='teams'?'teams':'ffa',host:p.id,players:[p],status:'lobby',phase:'draw',turn:0,turnId:0,direction:1,deadline:0,deck:[],discard:[],events:[],winners:[],reason:'',round:0,requests:[]}}
function log(s,text){s.events.unshift({id:uid(),text});s.events=s.events.slice(0,12)}
function drawOne(s,p){if(!s.deck.length){s.deck=shuffle(s.discard.splice(0));if(!s.deck.length)s.deck=deck()}p.hand.push(s.deck.pop());if(p.hand.length>12)s.discard.push(p.hand.shift())}
function finish(s,winners,reason){s.status='finished';s.winners=winners;s.reason=reason;s.deadline=0;log(s,reason)}
function winIds(s,p){return s.mode==='teams'?s.players.filter(x=>x.team===p.team).map(x=>x.id):[p.id]}
function checkEnd(s,preferred){
  const living=s.players.filter(p=>p.alive&&!p.left);
  const zeros=living.filter(p=>p.total===0&&!p.locked);
  if(zeros.length){const p=zeros.find(p=>p.id===preferred)||zeros[0];finish(s,winIds(s,p),`${p.name} hit exactly ZERO!`);return true}
  if(!living.length){finish(s,[],'No players left. It is a draw.');return true}
  if(s.mode==='ffa'&&living.length===1){finish(s,[living[0].id],`${living[0].name} is the last one standing!`);return true}
  if(s.mode==='teams'&&new Set(living.map(p=>p.team)).size===1){finish(s,winIds(s,living[0]),`Team ${living[0].team===0?'Lime':'Violet'} is the last team standing!`);return true}
  return false;
}
function beginTurn(s,now){const p=s.players[s.turn];p.revealed=true;p.hidden=false;s.phase='draw';s.turnId++;s.deadline=now+TURN_MS}
function advance(s,now){for(let i=0;i<s.players.length;i++){s.turn=(s.turn+s.direction+s.players.length)%s.players.length;if(s.players[s.turn].alive&&!s.players[s.turn].left){beginTurn(s,now);return}}}
export function start(s,now=Date.now()){
  const ps=s.players.filter(p=>!p.left);
  if(ps.length<2||ps.length>8)fail('You need 2–8 players.');
  if(s.mode==='teams'&&(ps.length!==4||ps.filter(p=>p.team===0).length!==2))fail('2v2 needs two players on each team.');
  if(ps.some(p=>p.id!==s.host&&!p.ready))fail('Wait for everyone to tap Ready.');
  s.players=ps;s.deck=deck();s.discard=[];s.events=[];s.winners=[];s.reason='';s.direction=1;s.round++;s.status='playing';s.turn=randomInt(ps.length);
  if(s.mode==='teams'){const a=ps.filter(p=>p.team===0),b=ps.filter(p=>p.team===1);s.players=[a[0],b[0],a[1],b[1]]}
  for(const p of s.players){Object.assign(p,{total:20+randomInt(11),hand:[],alive:true,revealed:false,hidden:false,locked:false,shield:false,misses:0});for(let i=0;i<5;i++)drawOne(s,p)}
  log(s,'Reach zero. Go below it and you are out.');beginTurn(s,now);
}
export function validTargets(s,actor,card){
  const me=s.players.find(p=>p.id===actor),t=card.type;
  return s.players.filter(p=>p.alive&&!p.left&&(['reverse','hide','shield'].includes(t)?p.id===actor:['swap','lock','steal'].includes(t)?p.id!==actor&&(t!=='steal'||p.hand.length>0):true)).map(p=>p.id);
}
export function play(s,actor,cardId,targetId,now=Date.now()){
  const p=s.players[s.turn];if(p.id!==actor)fail('Wait for your turn.');if(s.phase!=='play')fail('Draw a card first.');
  const i=p.hand.findIndex(c=>c.id===cardId);if(i<0)fail('That card is no longer in your hand.');
  const card=p.hand[i],t=card.type;if(!validTargets(s,actor,card).includes(targetId))fail('Choose a valid target.');
  const target=s.players.find(p=>p.id===targetId),wasLocked=p.locked;p.hand.splice(i,1);s.discard.push(card);p.misses=0;
  log(s,`${p.name} played ${CARDS[t].name}${t==='reverse'?'':` on ${target.id===p.id?'themselves':target.name}`}.`);
  if(target.id!==p.id&&target.shield){target.shield=false;log(s,`${target.name} blocked it with a Shield.`)}
  else switch(t){
    case 'minus1':target.total-=1;break;
    case 'minus3':target.total-=3;break;
    case 'minus5':target.total-=5;break;
    case 'plus2':target.total=Math.min(99,target.total+2);break;
    case 'double':target.total=Math.min(99,target.total*2);break;
    case 'divide':target.total=Math.ceil(target.total/2);break;
    case 'swap':[p.total,target.total]=[target.total,p.total];break;
    case 'reverse':s.direction*=-1;break;
    case 'lock':target.locked=true;break;
    case 'steal':p.hand.push(target.hand.splice(randomInt(target.hand.length),1)[0]);if(p.hand.length>12)s.discard.push(p.hand.shift());break;
    case 'hide':p.hidden=true;break;
    case 'shield':p.shield=true;break;
  }
  for(const q of s.players)if(q.alive&&q.total<0){q.alive=false;log(s,`${q.name} went below zero. Out!`)}
  // Lock ends after the target completes their next turn, even if they reached 0.
  if(wasLocked)p.locked=false;
  if(!checkEnd(s,p.id))advance(s,now);
}
export function timeout(s,now=Date.now()){
  if(s.status!=='playing'||now<s.deadline)return false;
  const p=s.players[s.turn];if(s.phase==='draw')drawOne(s,p);if(p.hand.length)s.discard.push(p.hand.pop());
  p.total=Math.min(99,p.total+2);p.locked=false;p.misses++;
  log(s,`${p.name} ran out of time. +2 penalty.`);
  if(p.misses>=3){p.alive=false;log(s,`${p.name} missed 3 turns and is out.`)}
  if(!checkEnd(s,p.id))advance(s,now);return true;
}
export function act(s,actor,action,data={},now=Date.now()){
  const p=s.players.find(p=>p.id===actor&&!p.left);if(!p)fail('You are not in this room.');
  if(action==='leave'){
    p.left=true;p.alive=false;
    if(s.status==='lobby')s.players=s.players.filter(x=>!x.left);
    else if(s.status==='playing'){log(s,`${p.name} left the match.`);if(!checkEnd(s)&&s.players[s.turn].id===p.id)advance(s,now)}
    if(s.host===p.id)s.host=s.players.find(x=>!x.left)?.id||'';return;
  }
  if(action==='rematch'){
    if(s.host!==actor||s.status!=='finished')fail('The host can start a rematch after the game.');
    s.status='lobby';s.players=s.players.filter(x=>!x.left);s.winners=[];s.deck=[];s.discard=[];s.deadline=0;
    for(const q of s.players)Object.assign(q,{ready:q.id===s.host,total:0,hand:[],alive:true,revealed:false,hidden:false,locked:false,shield:false});return;
  }
  if(s.status==='lobby'){
    if(action==='ready')p.ready=!!data.ready;
    else if(action==='team'){
      const team=Number(data.team);if(s.mode!=='teams'||![0,1].includes(team))fail('Invalid team.');
      if(s.players.filter(x=>x.id!==actor&&x.team===team).length>=2)fail('That team is full.');p.team=team;p.ready=p.id===s.host;
    }else if(action==='kick'){
      if(s.host!==actor||data.target===actor)fail('Only the host can remove other players.');s.players=s.players.filter(x=>x.id!==data.target);
    }else if(action==='start'){if(s.host!==actor)fail('Only the host can start.');start(s,now)}
    else fail('That action is not available in the lobby.');return;
  }
  if(s.status!=='playing')fail('This round has ended.');
  if(data.turnId!==s.turnId)fail('The turn changed. Try your next move.');
  if(s.players[s.turn].id!==actor)fail('Wait for your turn.');
  if(action==='draw'){if(s.phase!=='draw')fail('You already drew a card.');drawOne(s,p);s.phase='play'}
  else if(action==='play')play(s,actor,data.cardId,data.target,now);
  else fail('Unknown action.');
}
export function view(s,actor,now=Date.now()){
  const me=s.players.find(p=>p.id===actor&&!p.left);if(!me)fail('You are not in this room.');
  return {code:s.code,mode:s.mode,host:s.host,status:s.status,phase:s.phase,turnPlayer:s.players[s.turn]?.id,turnId:s.turnId,direction:s.direction,deadline:s.deadline,serverNow:now,round:s.round,events:s.events,winners:s.winners,reason:s.reason,you:actor,
    players:s.players.filter(p=>!p.left).map(p=>({id:p.id,name:p.name,team:p.team,ready:p.ready,total:s.status==='lobby'?null:(p.id===actor||s.status==='finished'||!p.alive||p.revealed&&!p.hidden)?p.total:null,alive:p.alive,hidden:!p.revealed||p.hidden,locked:p.locked,shield:p.shield,handCount:p.hand.length,online:now-p.lastSeen<35000,...p.id===actor?{hand:p.hand}:{} })),
    lastCard:s.discard.at(-1)?.type||null,deckCount:s.deck.length};
}
export function chooseBotMove(s,id){
  const p=s.players.find(x=>x.id===id);let best=null;
  for(const c of p.hand)for(const tid of validTargets(s,id,c)){
    const t=s.players.find(x=>x.id===tid),friendly=tid===id||(s.mode==='teams'&&t.team===p.team),known=tid===id||t.revealed&&!t.hidden;
    const base=known?t.total:22;let n=base,score=0;
    if(c.type==='minus1')n-=1;if(c.type==='minus3')n-=3;if(c.type==='minus5')n-=5;if(c.type==='plus2')n+=2;if(c.type==='double')n*=2;if(c.type==='divide')n=Math.ceil(n/2);
    if(['minus1','minus3','minus5','plus2','double','divide'].includes(c.type))score=friendly?(n<0?-1000:n===0?1000:base-n):(n<0?500:n===0?-1000:n-base);
    else if(c.type==='swap')score=known?p.total-t.total:0;
    else if(c.type==='shield')score=p.shield?-3:5;
    else if(c.type==='lock')score=friendly?-10:known&&t.total<6?8:1;
    else if(c.type==='steal')score=friendly?-2:3;
    else if(c.type==='hide')score=3;
    if(tid!==id&&t.shield)score=1;
    score+=randomInt(100)/100;
    if(!best||score>best.score)best={cardId:c.id,target:tid,score};
  }return best;
}
