import { BUILD_VERSION, CONTENT_VERSION, SCHEMA_VERSION, DEFS } from './definitions.js';
import { newGame, record, tick, invariantErrors } from './engine.js';

function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
  return value;
}
export function hash(state) {
  const text=JSON.stringify(canonical(state));let value=2166136261;
  for(let i=0;i<text.length;i++){value^=text.charCodeAt(i);value=Math.imul(value,16777619)}
  return (value>>>0).toString(16).padStart(8,'0');
}
export function save(state,origin=null) {
  return {schemaVersion:SCHEMA_VERSION,buildVersion:BUILD_VERSION,contentVersion:CONTENT_VERSION,
    state:JSON.parse(JSON.stringify(state)),hash:hash(state),origin:origin?JSON.parse(JSON.stringify(origin)):null};
}
function validateState(s) {
  if(!s||s.schemaVersion!==SCHEMA_VERSION||s.contentVersion!==CONTENT_VERSION||!Number.isInteger(s.tick)||!Array.isArray(s.people)||!Array.isArray(s.tiles)||s.tiles.length!==s.width*s.height)throw Error('SCHEMA_UNSUPPORTED');
  const errors=invariantErrors(s);if(errors.length)throw Error('SAVE_INVALID '+errors.slice(0,4).join(', '));
}
export function migrateV2(old) {
  if(old?.schema!==2||old?.version!=='0.8.0'||!Array.isArray(old.people)||!Array.isArray(old.buildings)||!old.resources)throw Error('SCHEMA_UNSUPPORTED');
  const s=newGame(old.seed);s.tick=old.tick||0;s.nodes=[];s.tiles=JSON.parse(JSON.stringify(old.tiles));
  s.reserve={};s.power.battery=Math.max(0,Math.round(old.resources.energy||0)*100);
  for(const key of ['metal','parts','food','medicine','wood','stone'])s.reserve[key]=Math.max(0,Math.round(old.resources[key]||0));
  s.research=Math.max(0,Math.round(old.resources.research||0));
  s.buildings=old.buildings.map(b=>({...b,name:DEFS[b.type]?.name||b.type,enabled:true,bin:{},status:'旧档迁移'}));
  if(s.buildings.some(b=>!DEFS[b.type]))throw Error('CONTENT_VERSION_MISMATCH');
  s.people=old.people.map((p,i)=>({...s.people[i%s.people.length],...p,x:Math.round(p.x),y:Math.round(p.y),job:null,homeOnly:false,priorities:{build:3,haul:3,operate:3,harvest:3},mood:p.morale||72,memories:[]}));
  s.jobs=[];s.facts=[];s.seq=1000;s.commandLog=[];s.pending=[];s.results=[];s.legacy=[];s.relations={};
  const f=record(s,'SAVE_MIGRATED','v0.8.0 存档迁移，未完成建造恢复为待分配任务，原始存档另行保留。',{metrics:{from:2,to:3,oldTick:old.tick}});
  for(const b of s.buildings){b.sourceFactId=f.id;
    if(!b.done){const cost={...DEFS[b.type].cost};s.jobs.push({id:'MIG-'+b.id,kind:'BUILD',target:b.id,state:'AVAILABLE',owner:null,work:Math.floor((b.progress||0)*DEFS[b.type].work/100),path:[],moveAt:0,reason:'LEGACY_JOB_RESET',retryTick:s.tick,sourceFactIds:[f.id],reservation:null,escrow:cost,history:[{tick:s.tick,state:'AVAILABLE'}]})}
  }
  s.economy={initial:{...s.reserve},produced:{},consumed:{}};
  for(const j of s.jobs)for(const [k,n] of Object.entries(j.escrow))s.economy.initial[k]=(s.economy.initial[k]||0)+n;
  s.techDone=Object.keys(DEFS).filter(k=>s.buildings.some(b=>b.type===k)).map(k=>DEFS[k].tech).filter(Boolean);
  validateState(s);
  return {state:s,origin:JSON.parse(JSON.stringify(s)),migrated:true,original:old};
}
export function load(input) {
  const envelope=typeof input==='string'?JSON.parse(input):JSON.parse(JSON.stringify(input));
  if(envelope?.schema===2)return migrateV2(envelope);
  if(envelope?.schemaVersion!==SCHEMA_VERSION||envelope?.contentVersion!==CONTENT_VERSION)throw Error('SCHEMA_UNSUPPORTED');
  if(hash(envelope.state)!==envelope.hash)throw Error('SAVE_HASH_MISMATCH');
  validateState(envelope.state);
  return {state:envelope.state,origin:envelope.origin||null,migrated:false};
}
export function replay(original,origin=null) {
  const s=origin?JSON.parse(JSON.stringify(origin)):newGame(original.seed);
  // The checkpoint is authoritative only for migrated legacy saves.
  const logs=original.commandLog.filter(c=>c.issuedTick>=s.tick);
  let index=0;
  while(s.tick<=original.tick){
    while(index<logs.length&&logs[index].issuedTick===s.tick){
      const c=JSON.parse(JSON.stringify(logs[index++]));s.commandLog.push(c);s.pending.push(JSON.parse(JSON.stringify(c)));s.commandSeq=c.sequence;
    }
    if(s.tick===original.tick)break;
    tick(s);
  }
  return {state:s,expected:hash(original),actual:hash(s),ok:hash(original)===hash(s)};
}
