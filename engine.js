import { BUILD_VERSION, CONTENT_VERSION, SCHEMA_VERSION, ITEMS, DEFS, RECIPES, TECHS, POLICIES, MOVE_TICKS, validateDefinitions } from './definitions.js';
import { random, cellKey, inside, walkable, allowed, pathTo, adjacent, generateWorld } from './world.js';

const active = j => !['COMPLETED','CANCELLED'].includes(j.state);
const clone = value => JSON.parse(JSON.stringify(value));
const sorted = values => [...values].sort((a,b)=>a.id.localeCompare(b.id));
const uid = (s,prefix) => prefix+String(++s.seq).padStart(7,'0');

export function record(s,type,text,{actors=[],objects=[],causes=[],metrics={}}={}) {
  const f={id:uid(s,'F'),tick:s.tick,type,text,actors:[...actors],objects:[...objects],causes:[...causes],metrics:clone(metrics)};
  s.facts.push(f);
  // Subjective consequences are always anchored to this immutable fact.
  if(['BUILD_COMPLETED','POWER_SHED','NEED_SATISFIED','POLICY_CHANGED','HAUL_COMPLETED','PROPOSAL_APPROVED'].includes(type)){
    const people=actors.length?s.people.filter(p=>actors.includes(p.id)):s.people;
    for(const p of people){
      const value=type==='POWER_SHED'?-2:type==='POLICY_CHANGED'?(p.values.order>=50?1:-1):1;
      p.memories.push({factId:f.id,appraisal:value<0?'担忧':'认可',intensity:Math.abs(value),tick:s.tick});
      p.mood=Math.max(0,Math.min(100,p.mood+value));p.memories=p.memories.slice(-40);
    }
    if(actors.length===1&&type==='BUILD_COMPLETED'){
      for(const p of s.people.filter(p=>p.id!==actors[0])){
        const edge=s.relations[p.id+'>'+actors[0]]??={from:p.id,to:actors[0],trust:50,reasonFactIds:[]};
        edge.trust=Math.min(100,edge.trust+1);edge.reasonFactIds.push(f.id);edge.reasonFactIds=edge.reasonFactIds.slice(-20);
      }
    }
  }
  return f;
}
function ledger(s,kind,items) {
  for(const [item,n] of Object.entries(items))s.economy[kind][item]=(s.economy[kind][item]||0)+n;
}
export function newGame(seed=20261104) {
  validateDefinitions();
  const s={schemaVersion:SCHEMA_VERSION,buildVersion:BUILD_VERSION,contentVersion:CONTENT_VERSION,seed,rng:seed>>>0,tick:0,seq:0,
    width:28,height:18,tiles:[],nodes:[],people:[],buildings:[],zones:[],stocks:{},reserve:{metal:120,parts:55,food:95,medicine:20,wood:80,stone:60},
    piles:[],jobs:[],facts:[],relations:{},issues:[],proposals:[],legacy:[],commandLog:[],pending:[],results:[],commandSeq:0,
    research:0,researchWork:0,techDone:[],policy:{power:'critical',work:'balanced'},power:{supply:0,demand:0,battery:0,capacity:0},
    economy:{initial:{},produced:{},consumed:{}},archiveJobs:0};
  generateWorld(s);
  ['林澈','苏岚','顾原','沈星','周砾','纪遥'].forEach((name,i)=>s.people.push({
    id:'P'+(i+1),name,x:13+i%3,y:9+Math.floor(i/3),hp:100,hunger:85,rest:85,mood:72,job:null,dead:false,
    priorities:{build:3,haul:3,operate:3,harvest:3},homeOnly:false,nextIdle:0,skills:{build:i===5?8:3,tech:i===0?8:3,care:i===1?8:3},
    values:{order:Math.floor(random(s)*100),fairness:Math.floor(random(s)*100)},memories:[]
  }));
  s.buildings.push({id:'B0',type:'HQ',name:'指挥舱',x:13,y:8,done:true,progress:100,powered:true,enabled:true,bin:{},status:'运行中'});
  s.zones.push({id:'Z0',type:'stock',x:17,y:9,w:2,h:2});
  s.economy.initial=clone(s.reserve);
  record(s,'LANDED','六名成员抵达聚落，初始物资已登记。');
  return s;
}
export function available(s,item) {
  return (s.reserve[item]||0)+Object.values(s.stocks).filter(c=>c.item===item).reduce((sum,c)=>sum+c.amount,0);
}
function canTake(s,items){return Object.entries(items).every(([k,n])=>available(s,k)>=n)}
function take(s,items) {
  if(!canTake(s,items))return false;
  for(const [item,count] of Object.entries(items)){
    let left=count;
    for(const key of Object.keys(s.stocks).sort()){
      const c=s.stocks[key];if(c.item!==item)continue;
      const n=Math.min(left,c.amount);c.amount-=n;left-=n;
      if(!c.amount)delete s.stocks[key];if(!left)break;
    }
    s.reserve[item]=(s.reserve[item]||0)-left;
  }
  return true;
}
function refund(s,items){for(const [k,n] of Object.entries(items||{}))s.reserve[k]=(s.reserve[k]||0)+n}
function pile(s,x,y,item,amount,sourceFactId) {
  if(amount<=0)return;
  // Ground piles may coexist at a tile, but each pile has a bounded stack.
  let left=amount;
  while(left>0){const n=Math.min(left,ITEMS[item].stack);s.piles.push({id:uid(s,'I'),x,y,item,amount:n,sourceFactId});left-=n}
}
function job(s,kind,target,source,extra={}) {
  const j={id:uid(s,'J'),kind,target,state:'AVAILABLE',owner:null,work:0,path:[],moveAt:0,reason:null,retryTick:s.tick,
    sourceFactIds:[source],reservation:null,escrow:{},history:[{tick:s.tick,state:'AVAILABLE'}],...extra};
  s.jobs.push(j);return j;
}
function transition(s,j,state,reason=null) {
  if(j.state===state&&j.reason===reason)return;
  j.state=state;j.reason=reason;j.history.push({tick:s.tick,state,reason});j.history=j.history.slice(-16);
}
function release(s,j) {
  const p=s.people.find(p=>p.id===j.owner);if(p?.job===j.id)p.job=null;
  j.owner=null;j.path=[];j.move=null;
}
function cancel(s,j,reason='CANCELLED') {
  const p=s.people.find(p=>p.id===j.owner);
  if(j.cargo){pile(s,p?.x??j.pickup?.x??0,p?.y??j.pickup?.y??0,j.cargo.item,j.cargo.amount,j.sourceFactIds[0]);j.cargo=null}
  refund(s,j.escrow);j.escrow={};j.reservation=null;release(s,j);transition(s,j,'CANCELLED',reason);
  return record(s,'JOB_CANCELLED','任务取消 · '+reason,{objects:[j.id],causes:j.sourceFactIds}).id;
}
function block(s,j,reason) {
  const changed=j.reason!==reason||j.state!=='BLOCKED';
  transition(s,j,'BLOCKED',reason);j.retryTick=s.tick+50;
  if(changed)record(s,'JOB_BLOCKED','任务等待 · '+reason,{objects:[j.id,j.target].filter(Boolean),causes:j.sourceFactIds});
  if(!j.cargo&&!(j.kind==='OPERATE'&&j.owner&&reason==='POWER_LOST')){if(j.kind==='OPERATE'||j.kind==='NEED'){refund(s,j.escrow);j.escrow={};j.work=0;j.reservation=null}release(s,j)}
}
export function enqueue(s,type,payload={}) {
  const command={id:'C'+(++s.commandSeq),sequence:s.commandSeq,issuedTick:s.tick,executeTick:s.tick+1,type,payload:clone(payload),source:'player'};
  s.commandLog.push(clone(command));s.pending.push(command);return command.id;
}
function result(s,c,ok,reason,ids=[],facts=[]) {
  s.results.push({commandId:c.id,tick:s.tick,status:ok?'SUCCEEDED':'REJECTED',reasonCode:reason,affectedIds:ids,factIds:facts});
}
function apply(s,c) {
  const a=c.payload||{};
  const reject=reason=>{const f=record(s,'COMMAND_REJECTED','命令未执行 · '+reason,{objects:[c.id],metrics:{reasonCode:reason}});result(s,c,false,reason,[],[f.id])};
  const ok=(ids=[],facts=[])=>result(s,c,true,null,ids,facts);
  if(c.type==='BUILD'){
    const d=DEFS[a.type],x=a.x,y=a.y;
    if(!d||a.type==='HQ'||!Number.isInteger(x)||!Number.isInteger(y)||!walkable(s,x,y))return reject('INVALID_COMMAND');
    if(d.tech&&!s.techDone.includes(d.tech))return reject('TECH_LOCKED');
    if(s.nodes.some(n=>n.x===x&&n.y===y&&n.amount>0)||s.buildings.some(b=>!b.removed&&b.x===x&&b.y===y)||s.stocks[cellKey(x,y)]||s.piles.some(i=>i.x===x&&i.y===y))return reject('STORAGE_REJECTED');
    if(!take(s,d.cost))return reject('INPUT_MISSING');
    const f=record(s,'BUILD_ORDER','规划'+d.name+'，材料已预留。',{objects:[c.id],metrics:{materials:d.cost}});
    const b={id:uid(s,'B'),type:a.type,name:d.name,x,y,done:false,progress:0,powered:false,enabled:true,bin:{},status:'待施工',sourceFactId:f.id};
    s.buildings.push(b);const j=job(s,'BUILD',b.id,f.id,{escrow:clone(d.cost)});ok([b.id,j.id],[f.id]);return;
  }
  if(c.type==='ZONE'){
    if(!['stock','home'].includes(a.type)||![a.x,a.y,a.w,a.h].every(Number.isInteger)||a.w<1||a.h<1||a.x<0||a.y<0||a.x+a.w>s.width||a.y+a.h>s.height)return reject('INVALID_COMMAND');
    const z={id:uid(s,'Z'),...a};s.zones.push(z);const f=record(s,'ZONE_CREATED','划定'+(a.type==='stock'?'储存区':'居住区'),{objects:[c.id,z.id]});ok([z.id],[f.id]);return;
  }
  if(c.type==='HARVEST'){
    if(![a.x,a.y,a.w,a.h].every(Number.isInteger)||a.w<1||a.h<1||a.x<0||a.y<0||a.x+a.w>s.width||a.y+a.h>s.height)return reject('INVALID_COMMAND');
    const nodes=s.nodes.filter(n=>n.amount>0&&inside(n,a)&&!s.jobs.some(j=>active(j)&&j.target===n.id));
    const f=record(s,'HARVEST_ORDER','安排采集 '+nodes.length+' 个目标。',{objects:[c.id,...nodes.map(n=>n.id)]});
    ok(nodes.map(n=>job(s,'HARVEST',n.id,f.id).id),[f.id]);return;
  }
  if(c.type==='MOVE'||c.type==='PERSON'){
    const p=s.people.find(p=>p.id===a.id&&!p.dead);if(!p)return reject('TARGET_GONE');
    if(c.type==='PERSON'){
      if(a.priority!==undefined&&(!['build','haul','operate','harvest'].includes(a.work)||!Number.isInteger(a.priority)||a.priority<0||a.priority>4))return reject('INVALID_COMMAND');
      if(a.homeOnly!==undefined&&typeof a.homeOnly!=='boolean')return reject('INVALID_COMMAND');
      if(a.priority!==undefined)p.priorities[a.work]=a.priority;
      if(a.homeOnly!==undefined)p.homeOnly=a.homeOnly;
      const current=s.jobs.find(j=>j.id===p.job);
      if(current&&(!current.cargo)&&(a.homeOnly===true||a.priority===0&&current.kind.toLowerCase()===a.work))block(s,current,'POLICY_BLOCKED');
      const f=record(s,'PERSON_POLICY','更新'+p.name+'的工作范围或优先级。',{actors:[p.id],objects:[c.id]});ok([p.id],[f.id]);return;
    }
    if(!Number.isInteger(a.x)||!Number.isInteger(a.y)||!walkable(s,a.x,a.y))return reject('NO_PATH');
    const path=pathTo(s,p,[{x:a.x,y:a.y}]);if(!path)return reject('NO_PATH');
    const current=s.jobs.find(j=>j.id===p.job);if(current){if(['MOVE','IDLE','RETURN'].includes(current.kind)||current.cargo)cancel(s,current,'PREEMPTED');else block(s,current,'PREEMPTED')}
    const f=record(s,'MOVE_ORDER',p.name+'收到移动指令。',{actors:[p.id],objects:[c.id]});
    const j=job(s,'MOVE',null,f.id,{owner:p.id,path,point:{x:a.x,y:a.y}});p.job=j.id;transition(s,j,'MOVING');ok([j.id],[f.id]);return;
  }
  if(c.type==='CANCEL'){
    const j=s.jobs.find(j=>j.id===a.id&&active(j));if(!j)return reject('TARGET_GONE');
    const b=s.buildings.find(b=>b.id===j.target&&!b.done);if(b)b.removed=true;
    ok([j.id],[cancel(s,j)]);return;
  }
  if(c.type==='DEMOLISH'){
    const b=s.buildings.find(b=>b.id===a.id&&!b.removed);if(!b||b.type==='HQ')return reject('TARGET_GONE');
    if(s.jobs.some(j=>active(j)&&j.kind==='DEMOLISH'&&j.target===b.id))return reject('RESERVATION_LOST');
    if(!b.done){const current=s.jobs.find(j=>active(j)&&j.target===b.id);if(current)cancel(s,current);b.removed=true}
    const f=record(s,'DEMOLISH_ORDER','安排拆除'+b.name,{objects:[c.id,b.id]});
    if(b.done)job(s,'DEMOLISH',b.id,f.id);ok([b.id],[f.id]);return;
  }
  if(c.type==='POLICY'){
    const d=POLICIES[a.key];if(!d||!d.options.includes(a.value))return reject('INVALID_COMMAND');
    s.policy[a.key]=a.value;const f=record(s,'POLICY_CHANGED','实施'+d.name+' · '+d.labels[d.options.indexOf(a.value)],{objects:[c.id]});ok([],[f.id]);return;
  }
  if(c.type==='RESEARCH'){
    const d=TECHS[a.id];if(!d||s.techDone.includes(a.id)||!d.pre.every(id=>s.techDone.includes(id)))return reject('TECH_LOCKED');
    if(s.research<d.cost)return reject('INPUT_MISSING');
    s.research-=d.cost;s.techDone.push(a.id);const f=record(s,'TECH_COMPLETED','完成研究 '+d.name,{objects:[c.id,a.id]});ok([a.id],[f.id]);return;
  }
  if(c.type==='TOGGLE'||c.type==='RENAME'){
    const b=s.buildings.find(b=>b.id===a.id&&!b.removed);if(!b)return reject('TARGET_GONE');
    if(c.type==='TOGGLE'){b.enabled=!b.enabled;const f=record(s,'BUILDING_TOGGLED',b.name+(b.enabled?'启用':'停用'),{objects:[c.id,b.id]});ok([b.id],[f.id])}
    else{if(typeof a.name!=='string'||!a.name.trim()||a.name.length>24)return reject('INVALID_COMMAND');b.name=a.name.trim();const f=record(s,'BUILDING_NAMED','设施命名为'+b.name,{objects:[c.id,b.id],causes:b.sourceFactId?[b.sourceFactId]:[]});s.legacy.push({name:b.name,subjectId:b.id,sourceFactIds:[f.id]});ok([b.id],[f.id])}return;
  }
  if(c.type==='APPROVE'){
    const p=s.proposals.find(p=>p.id===a.id&&p.status==='OPEN');if(!p)return reject('TARGET_GONE');
    p.status='APPROVED';const f=record(s,'PROPOSAL_APPROVED','批准建议 '+p.text+'；请在地图规划设施。',{actors:[p.author],objects:[c.id,p.id],causes:p.sourceFactIds});ok([p.id],[f.id]);return;
  }
  reject('INVALID_COMMAND');
}
export function stepPower(s) {
  const buildings=sorted(s.buildings.filter(b=>b.done&&!b.removed));
  const supply=buildings.filter(b=>b.enabled).reduce((n,b)=>n+Math.max(0,DEFS[b.type].power),0);
  const demand=buildings.filter(b=>b.enabled).reduce((n,b)=>n+Math.max(0,-DEFS[b.type].power),0);
  const capacity=buildings.filter(b=>b.enabled).reduce((n,b)=>n+(DEFS[b.type].capacity||0),0);
  let battery=Math.min(capacity,s.power.battery),remaining=supply;
  const sequence=s.policy.power==='critical'?['HQ','SOLAR','BATTERY','CLINIC','FARM','HOUSE','WORKSHOP','MINE','BEACON','WALL']:['HQ','SOLAR','BATTERY','MINE','WORKSHOP','FARM','CLINIC','HOUSE','BEACON','WALL'];
  for(const type of sequence)for(const b of buildings.filter(b=>b.type===type)){
    const need=Math.max(0,-DEFS[b.type].power),used=Math.max(0,need-remaining);
    const powered=b.enabled&&(need===0||remaining+battery>=need);
    if(powered){const direct=Math.min(need,remaining);remaining-=direct;battery-=need-direct}
    if(b.powered!==powered){
      const f=record(s,powered?'POWER_RESTORED':'POWER_SHED',b.name+(powered?'恢复供电':'停止供电'),{objects:[b.id],causes:b.sourceFactId?[b.sourceFactId]:[],metrics:{supply,demand,need,battery}});
      b.lastPowerFact=f.id;
    }
    b.powered=powered;
  }
  battery=Math.min(capacity,battery+remaining);
  s.power={supply,demand,capacity,battery};
}
function machine(s,j){return s.buildings.find(b=>b.id===j.target&&!b.removed)}
function target(s,j){
  if(['BUILD','OPERATE','DEMOLISH'].includes(j.kind))return machine(s,j);
  if(j.kind==='HARVEST')return s.nodes.find(n=>n.id===j.target&&n.amount>0);
  if(j.kind==='HAUL')return j.cargo?j.destination:s.piles.find(i=>i.id===j.target);
  if(['MOVE','IDLE','RETURN','NEED'].includes(j.kind))return j.point;
}
function stockCandidates(s,p,item,ignoreJob=null) {
  const result=[],seen=new Set();
  for(const z of s.zones.filter(z=>z.type==='stock')){
    for(let y=z.y;y<z.y+z.h;y++)for(let x=z.x;x<z.x+z.w;x++){
      const key=cellKey(x,y),cell=s.stocks[key];
      if(seen.has(key)||!walkable(s,x,y)||!allowed(s,p,x,y)||cell&&cell.item!==item||s.nodes.some(n=>n.x===x&&n.y===y&&n.amount>0))continue;
      if(s.jobs.some(j=>active(j)&&j.id!==ignoreJob&&j.reservation?.stock===key))continue;
      const space=ITEMS[item].stack-(cell?.amount||0);
      if(space>0){result.push({x,y,key,space,filled:!!cell});seen.add(key)}
    }
  }
  return result.sort((a,b)=>Number(b.filled)-Number(a.filled)||a.y-b.y||a.x-b.x);
}
function destination(s,p,item,j){
  const slots=stockCandidates(s,p,item,j.id);
  for(const filled of [true,false]){
    const group=slots.filter(c=>c.filled===filled),path=pathTo(s,p,group);
    if(path){const end=path.at(-1)||p;return {cell:group.find(c=>c.x===end.x&&c.y===end.y),path}}
  }
  return null;
}
function needed(s,p){return p.hunger<(s.policy.work==='care'?35:20)?'food':p.rest<20?'rest':p.hp<80&&s.buildings.some(b=>b.type==='CLINIC'&&b.done&&b.powered&&!b.removed)?'medicine':null}
function publishNeeds(s) {
  for(const p of s.people.filter(p=>!p.dead)){
    const key=needed(s,p);if(!key)continue;
    const current=s.jobs.find(j=>j.id===p.job);
    if(current?.kind==='NEED')continue;
    if(current?.cargo)continue;
    if(current){block(s,current,'PREEMPTED');current.retryTick=s.tick+100}
    if(!s.jobs.some(j=>active(j)&&j.kind==='NEED'&&j.person===p.id)){
      const f=record(s,'NEED_REQUEST',p.name+'需要'+(key==='food'?'进食':key==='rest'?'休息':'治疗'),{actors:[p.id],metrics:{hunger:p.hunger,rest:p.rest,hp:p.hp}});
      job(s,'NEED',null,f.id,{person:p.id,need:key});
    }
  }
}
function publishWork(s) {
  for(const b of sorted(s.buildings.filter(b=>b.done&&!b.removed&&DEFS[b.type].recipe))){
    if(s.jobs.some(j=>active(j)&&j.kind==='OPERATE'&&j.target===b.id))continue;
    const f=record(s,'PRODUCTION_REQUEST',b.name+'请求执行生产批次。',{objects:[b.id],causes:b.sourceFactId?[b.sourceFactId]:[]});
    job(s,'OPERATE',b.id,f.id);
  }
  for(const p of sorted(s.piles)){
    if(!s.jobs.some(j=>active(j)&&j.kind==='HAUL'&&j.target===p.id)){
      const f=record(s,'HAUL_REQUEST','物资等待搬入仓库。',{objects:[p.id],causes:p.sourceFactId?[p.sourceFactId]:[]});
      job(s,'HAUL',p.id,f.id);
    }
  }
  for(const b of s.buildings.filter(b=>b.done&&!b.removed)){
    for(const [item,n] of Object.entries(b.bin)){if(n>0){pile(s,b.x,b.y,item,n,b.lastProductionFact);b.bin[item]=0}}
  }
}
function assignJob(s,j,p) {
  let t=target(s,j),path;
  if(j.kind==='HARVEST'&&s.jobs.some(o=>active(o)&&o.id!==j.id&&o.reservation?.deposit===j.target))return 'RESERVATION_LOST';
  if(j.kind==='NEED'){
    if(j.need!=='rest'&&!canTake(s,{[j.need]:1}))return 'INPUT_MISSING';
    const beds=s.buildings.filter(b=>!s.jobs.some(other=>active(other)&&other.id!==j.id&&other.reservation?.bed===b.id)&&b.done&&!b.removed&&b.enabled&&b.type===(j.need==='medicine'?'CLINIC':'HOUSE')&&(j.need!=='medicine'||b.powered));
    path=pathTo(s,p,beds.flatMap(adjacent));
    j.point=path?.at(-1)||{x:p.x,y:p.y};
    if(path){const bed=beds.find(b=>adjacent(b).some(t=>t.x===j.point.x&&t.y===j.point.y));if(bed)j.reservation={bed:bed.id}}
    if(j.need==='medicine'&&!beds.length)return 'POWER_LOST';
    if(beds.length&&!path)return 'NO_PATH';
    path=path||[];
    if(j.need!=='rest'){take(s,{[j.need]:1});j.escrow={[j.need]:1}}
  } else {
    if(!t)return 'TARGET_GONE';
    path=pathTo(s,p,j.kind==='HAUL'?[...adjacent(t),t]:j.kind==='HARVEST'?adjacent(t):adjacent(t));
    if(!path)return 'NO_PATH';
    if(j.kind==='OPERATE'){
      const r=RECIPES[DEFS[t.type].recipe];
      if(!t.enabled||!t.powered)return 'POWER_LOST';
      if(Object.entries(r.output).some(([k,n])=>(t.bin[k]||0)+n>ITEMS[k].stack))return 'OUTPUT_FULL';
      // A congested ground output blocks further batches.
      if(s.piles.filter(i=>i.x===t.x&&i.y===t.y).reduce((n,i)=>n+i.amount,0)>=75)return 'OUTPUT_FULL';
      let deposit=null;
      if(t.type==='MINE'){
        deposit=sorted(s.nodes.filter(n=>n.item==='metal'&&n.amount>=4&&Math.abs(n.x-t.x)+Math.abs(n.y-t.y)<=3&&!s.jobs.some(o=>active(o)&&o.id!==j.id&&(o.target===n.id||o.reservation?.deposit===n.id))))[0];
        if(!deposit)return 'DEPOSIT_EMPTY';
      }
      if(!take(s,r.input))return 'INPUT_MISSING';j.escrow=clone(r.input);j.reservation={machine:t.id,...(deposit?{deposit:deposit.id,amount:4}:{})};
    }
    if(j.kind==='HAUL'){
      if(p.priorities.haul===0)return 'POLICY_BLOCKED';
      const dest=destination(s,{...p,...(path.at(-1)||p)},t.item,j);if(!dest)return 'OUTPUT_FULL';
      j.destination={x:dest.cell.x,y:dest.cell.y};j.quantity=Math.min(t.amount,dest.cell.space);
      j.reservation={source:t.id,stock:dest.cell.key,amount:j.quantity};
    }
  }
  j.owner=p.id;p.job=j.id;j.path=path;j.move=null;
  transition(s,j,path.length?'MOVING':'EXECUTING');
  record(s,'JOB_ASSIGNED',p.name+'认领'+j.kind,{actors:[p.id],objects:[j.id],causes:j.sourceFactIds,metrics:{distance:path.length,priority:p.priorities[j.kind.toLowerCase()]??1}});
  return null;
}
function schedule(s) {
  for(const p of sorted(s.people.filter(p=>!p.dead&&!p.job))){
    if(!allowed(s,p,p.x,p.y)){
      const homes=s.zones.filter(z=>z.type==='home'),points=[];
      for(const z of homes)for(let y=z.y;y<z.y+z.h;y++)for(let x=z.x;x<z.x+z.w;x++)points.push({x,y});
      const route=pathTo(s,p,points,true);
      if(route){const f=record(s,'RETURN_HOME',p.name+'返回居住区。',{actors:[p.id]});const j=job(s,'RETURN',null,f.id,{owner:p.id,point:route.at(-1)||{x:p.x,y:p.y},path:route});p.job=j.id;transition(s,j,'MOVING')}
      continue;
    }
    const candidates=s.jobs.filter(j=>active(j)&&!j.owner&&s.tick>=j.retryTick&&(!j.person||j.person===p.id)&&!['MOVE','IDLE','RETURN'].includes(j.kind)&&(p.priorities[j.kind.toLowerCase()]??3)>0)
      .map(j=>({j,score:j.kind==='NEED'?10000:(6-(p.priorities[j.kind.toLowerCase()]??3))*100-Math.abs(p.x-(target(s,j)?.x??p.x))-Math.abs(p.y-(target(s,j)?.y??p.y))}))
      .sort((a,b)=>b.score-a.score||a.j.id.localeCompare(b.j.id));
    for(const {j,score} of candidates){
      const reason=assignJob(s,j,p);j.lastScore=score;
      if(!reason)break;
      if(reason==='TARGET_GONE'){cancel(s,j,reason);continue}
      block(s,j,reason);
    }
    if(!p.job&&s.tick>=p.nextIdle){
      const points=[];
      for(let n=0;n<4;n++)points.push({x:p.x+Math.floor(random(s)*5)-2,y:p.y+Math.floor(random(s)*5)-2});
      const route=pathTo(s,p,points.filter(t=>t.x!==p.x||t.y!==p.y));
      if(route?.length){const j=job(s,'IDLE',null,s.facts[0].id,{owner:p.id,path:route,point:route.at(-1)});p.job=j.id;transition(s,j,'MOVING')}
      p.nextIdle=s.tick+100+Math.floor(random(s)*100);
    }
  }
}
function finish(s,j,p) {
  const t=target(s,j);
  let f;
  if(j.kind==='BUILD'){
    ledger(s,'consumed',j.escrow);j.escrow={};t.done=true;t.progress=100;t.status='运行中';
    f=record(s,'BUILD_COMPLETED',p.name+'完成'+t.name,{actors:[p.id],objects:[t.id,j.id],causes:j.sourceFactIds});t.sourceFactId=f.id;
  } else if(j.kind==='HARVEST'){
    const n=Math.min(8,t.amount);t.amount-=n;
    f=record(s,'HARVEST_COMPLETED',p.name+'采集'+ITEMS[t.item].name+' ×'+n,{actors:[p.id],objects:[t.id,j.id],causes:j.sourceFactIds,metrics:{item:t.item,amount:n}});
    ledger(s,'produced',{[t.item]:n});pile(s,t.x,t.y,t.item,n,f.id);
    if(!t.amount&&s.tiles[t.y*s.width+t.x].t==='rock')s.tiles[t.y*s.width+t.x].t='soil';
  } else if(j.kind==='OPERATE'){
    const r=RECIPES[DEFS[t.type].recipe];if(j.reservation?.deposit){const deposit=s.nodes.find(n=>n.id===j.reservation.deposit);if(!deposit||deposit.amount<4){block(s,j,'DEPOSIT_EMPTY');return}deposit.amount-=4}ledger(s,'consumed',j.escrow);ledger(s,'produced',r.output);j.escrow={};
    for(const [k,n] of Object.entries(r.output))t.bin[k]=(t.bin[k]||0)+n;
    f=record(s,'PRODUCTION_COMPLETED',p.name+'完成'+t.name+'的生产批次。',{actors:[p.id],objects:[t.id,j.id],causes:[...j.sourceFactIds,...(t.lastPowerFact?[t.lastPowerFact]:[])],metrics:{input:r.input,output:r.output,source:r.source||'配方加工'}});t.lastProductionFact=f.id;
  } else if(j.kind==='HAUL'){
    const key=cellKey(p.x,p.y),cell=s.stocks[key],cargo=j.cargo;
    if(!cargo||!s.zones.some(z=>z.type==='stock'&&inside(p,z))||cell&&cell.item!==cargo.item||(cell?.amount||0)+cargo.amount>ITEMS[cargo.item].stack){block(s,j,'OUTPUT_FULL');return}
    f=record(s,'HAUL_COMPLETED',p.name+'将'+ITEMS[cargo.item].name+' ×'+cargo.amount+'送入储存区。',{actors:[p.id],objects:[j.id,key],causes:j.sourceFactIds});
    const c=s.stocks[key]??={item:cargo.item,amount:0,factIds:[]};c.amount+=cargo.amount;c.factIds.push(f.id);c.factIds=c.factIds.slice(-8);j.cargo=null;
  } else if(j.kind==='NEED'){
    ledger(s,'consumed',j.escrow);j.escrow={};
    if(j.need==='food')p.hunger=Math.min(100,p.hunger+55);
    if(j.need==='rest')p.rest=Math.min(100,p.rest+65);
    if(j.need==='medicine')p.hp=Math.min(100,p.hp+30);
    f=record(s,'NEED_SATISFIED',p.name+(j.need==='food'?'吃完食物':j.need==='rest'?'完成休息':'接受治疗'),{actors:[p.id],objects:[j.id],causes:j.sourceFactIds});
  } else if(j.kind==='DEMOLISH'){
    for(const other of s.jobs.filter(o=>o!==j&&active(o)&&o.target===t.id))cancel(s,other,'TARGET_GONE');
    t.removed=true;
    for(const [k,n] of Object.entries(t.bin)){pile(s,t.x,t.y,k,n,t.lastProductionFact);t.bin[k]=0}
    f=record(s,'DEMOLISHED',p.name+'拆除'+t.name,{actors:[p.id],objects:[t.id,j.id],causes:j.sourceFactIds});
  } else if(j.kind==='MOVE'||j.kind==='RETURN'){
    f=record(s,'MOVE_COMPLETED',p.name+'抵达目的地。',{actors:[p.id],objects:[j.id],causes:j.sourceFactIds});
  }
  j.reservation=null;release(s,j);transition(s,j,'COMPLETED');if(f)j.completedFact=f.id;
}
function executeJobs(s) {
  for(const j of s.jobs.filter(j=>active(j)&&j.owner)){
    const p=s.people.find(p=>p.id===j.owner);
    if(!p||p.dead){cancel(s,j,'NO_CANDIDATE');continue}
    const t=target(s,j);
    if(!t){cancel(s,j,'TARGET_GONE');continue}
    if(j.state==='BLOCKED'&&s.tick<j.retryTick)continue;
    if(j.state==='BLOCKED'&&j.cargo){
      const dest=destination(s,p,j.cargo.item,j);
      if(!dest){j.retryTick=s.tick+50;continue}
      j.destination={x:dest.cell.x,y:dest.cell.y};j.reservation.stock=dest.cell.key;j.path=dest.path;j.move=null;
      transition(s,j,'MOVING');
    }
    if(j.path.length||j.move){
      if(!j.move){
        const next=j.path[0];
        if(!walkable(s,next.x,next.y)||(j.kind!=='RETURN'&&!allowed(s,p,next.x,next.y))){j.path=[];block(s,j,'NO_PATH');continue}
        j.move={from:{x:p.x,y:p.y},to:next,until:s.tick+MOVE_TICKS};
      }
      if(s.tick<j.move.until)continue;
      if(!walkable(s,j.move.to.x,j.move.to.y)){j.move=null;block(s,j,'NO_PATH');continue}
      p.x=j.move.to.x;p.y=j.move.to.y;j.path.shift();j.move=null;
      if(j.path.length)continue;
      transition(s,j,'EXECUTING');
    }
    if(j.kind==='HAUL'&&!j.cargo){
      if(p.priorities.haul===0){j.reservation=null;block(s,j,'POLICY_BLOCKED');continue}
      j.work++;
      if(j.work<25)continue;
      const n=Math.min(j.quantity,t.amount);
      j.cargo={item:t.item,amount:n};j.pickup={x:t.x,y:t.y};t.amount-=n;
      if(!t.amount)s.piles=s.piles.filter(i=>i.id!==t.id);
      const path=pathTo(s,p,[j.destination]);j.work=0;
      record(s,'ITEM_PICKED',p.name+'取起物资。',{actors:[p.id],objects:[j.id],causes:j.sourceFactIds,metrics:j.cargo});
      if(!path){block(s,j,'NO_PATH');continue}
      j.path=path;transition(s,j,'MOVING');continue;
    }
    if(j.kind==='OPERATE'){
      if(!t.enabled||!t.powered){block(s,j,'POWER_LOST');continue}
      transition(s,j,'EXECUTING');t.status='有人操作';
    }
    if(j.kind==='NEED'&&j.need==='medicine'&&!s.buildings.some(b=>b.done&&!b.removed&&b.type==='CLINIC'&&b.powered)){block(s,j,'POWER_LOST');continue}
    const duration=j.kind==='BUILD'?DEFS[t.type].work:j.kind==='OPERATE'?RECIPES[DEFS[t.type].recipe].ticks:j.kind==='NEED'?(j.need==='rest'?150:60):j.kind==='HARVEST'?90:j.kind==='DEMOLISH'?80:1;
    j.work+=j.kind==='BUILD'?1+Math.floor(p.skills.build/5):1;
    if(j.kind==='BUILD')t.progress=Math.min(100,Math.floor(j.work*100/duration));
    if(j.work>=duration)finish(s,j,p);
  }
}
function issues(s) {
  const conditions=[
    ['power',s.power.demand>s.power.supply,'供电余量不足','新增电源或储能，或调整限电政策。','SOLAR'],
    ['food',available(s,'food')<s.people.length*2,'食物储备偏低','建造藻类农场并安排操作员。','FARM'],
    ['storage',s.jobs.some(j=>j.state==='BLOCKED'&&j.reason==='OUTPUT_FULL'),'物流容量不足','扩建可达储存区，或搬走机器输出。',null]
  ];
  for(const [key,on,text,action,build] of conditions){
    let issue=s.issues.find(i=>i.key===key&&i.status==='OPEN');
    if(on&&!issue){
      const f=record(s,'ISSUE_OPEN',text,{metrics:{power:s.power,food:available(s,'food')}});
      issue={id:uid(s,'ISS'),key,text,action,since:s.tick,status:'OPEN',sourceFactIds:[f.id]};s.issues.push(issue);
    }
    if(issue&&on&&s.tick-issue.since>=150&&!s.proposals.some(p=>p.issue===issue.id)){
      const author=s.people.filter(p=>!p.dead).sort((a,b)=>b.skills.tech-a.skills.tech||a.id.localeCompare(b.id))[0];
      if(author)s.proposals.push({id:uid(s,'PROP'),issue:issue.id,author:author.id,text:action,build,status:'OPEN',sourceFactIds:[...issue.sourceFactIds]});
    }
    if(issue&&!on){const f=record(s,'ISSUE_RESOLVED',text+'已解除。',{causes:issue.sourceFactIds});issue.status='RESOLVED';issue.resolvedFact=f.id;for(const proposal of s.proposals.filter(p=>p.issue===issue.id&&p.status==='OPEN'))proposal.status='RESOLVED'}
  }
}
export function tick(s) {
  s.tick++;
  const commands=s.pending.filter(c=>c.executeTick<=s.tick).sort((a,b)=>a.sequence-b.sequence);
  s.pending=s.pending.filter(c=>c.executeTick>s.tick);
  for(const c of commands)apply(s,c);
  stepPower(s);
  if(s.tick%100===0)for(const p of s.people.filter(p=>!p.dead)){p.hunger=Math.max(0,p.hunger-1);p.rest=Math.max(0,p.rest-1);
    if(p.hunger===0){p.hp=Math.max(0,p.hp-1);if(!p.hp){p.dead=true;record(s,'PERSON_DIED',p.name+'因长期饥饿失去生命。',{actors:[p.id],metrics:{hunger:0}})}}}
  // Research has a real prerequisite: a living, unassigned member in the colony.
  if(s.people.some(p=>!p.dead&&!p.job)){s.researchWork++;if(s.researchWork>=100){s.research++;s.researchWork=0}}
  if(s.tick%25===0){publishNeeds(s);publishWork(s);schedule(s)}
  executeJobs(s);
  if(s.tick%25===0)issues(s);
  if(s.jobs.length>300){const terminal=s.jobs.filter(j=>!active(j));const discard=new Set(terminal.slice(0,Math.max(0,terminal.length-150)).map(j=>j.id));s.archiveJobs+=discard.size;s.jobs=s.jobs.filter(j=>!discard.has(j.id))}
}
export function totals(s) {
  const all=Object.fromEntries(Object.keys(ITEMS).map(k=>[k,available(s,k)]));
  const add=items=>{for(const [k,n] of Object.entries(items||{}))all[k]=(all[k]||0)+n};
  for(const c of s.piles)add({[c.item]:c.amount});
  for(const j of s.jobs){add(j.escrow);if(j.cargo)add({[j.cargo.item]:j.cargo.amount})}
  for(const b of s.buildings)add(b.bin);
  return all;
}
export function invariantErrors(s) {
  const errors=[],sum=totals(s);
  for(const item of Object.keys(ITEMS)){
    const expected=(s.economy.initial[item]||0)+(s.economy.produced[item]||0)-(s.economy.consumed[item]||0);
    if(sum[item]!==expected)errors.push('CONSERVATION '+item+' '+sum[item]+' != '+expected);
  }
  for(const [key,c] of Object.entries(s.stocks))if(c.amount<1||c.amount>ITEMS[c.item].stack)errors.push('STACK_LIMIT '+key);
  const claims=new Set();
  for(const j of s.jobs.filter(active)){
    for(const token of [j.owner&&'person:'+j.owner,j.reservation?.stock&&'stock:'+j.reservation.stock,j.reservation?.source&&'pile:'+j.reservation.source,j.reservation?.bed&&'bed:'+j.reservation.bed,j.reservation?.machine&&'machine:'+j.reservation.machine,j.reservation?.deposit&&'deposit:'+j.reservation.deposit].filter(Boolean)){
      if(claims.has(token))errors.push('DUPLICATE_RESERVATION '+token);claims.add(token);
    }
  }
  const facts=new Set(s.facts.map(f=>f.id));
  for(const f of s.facts)for(const id of f.causes)if(!facts.has(id))errors.push('MISSING_FACT '+id);
  for(const p of s.people)for(const m of p.memories)if(!facts.has(m.factId))errors.push('MISSING_MEMORY_FACT '+m.factId);
  return errors;
}
export function query(s) {return clone(s)}
