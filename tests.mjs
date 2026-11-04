import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { newGame, enqueue, tick, available, invariantErrors, totals } from './engine.js';
import { save, load, hash, replay, migrateV2 } from './save.js';
import { createClock } from './clock.js';
import { DEFS, validateDefinitions } from './definitions.js';
const results=[];
function test(name,fn){const started=performance.now();fn();results.push({name,pass:true,ms:Math.round(performance.now()-started)});console.log('PASS',name)}
function run(s,n){for(let i=0;i<n;i++)tick(s)}
function until(s,predicate,limit=4000){for(let i=0;i<limit;i++){if(predicate())return;tick(s)}throw Error('condition timeout at '+s.tick)}
function command(s,type,payload){enqueue(s,type,payload);tick(s);return s.results.at(-1)}
function clean(){const s=newGame(7);s.nodes=[];s.tiles=s.tiles.map(t=>({...t,t:'soil'}));s.people.forEach(p=>p.nextIdle=1e9);return s}
function check(s){assert.deepEqual(invariantErrors(s),[])}
function addBuilding(s,type,x,y){const b={id:'FIX-'+s.buildings.length,type,name:DEFS[type].name,x,y,done:true,progress:100,powered:false,enabled:true,bin:{},status:'fixture'};s.buildings.push(b);return b}
function addPile(s,item,amount,x,y){s.piles.push({id:'PILE-'+s.piles.length,item,amount,x,y,sourceFactId:s.facts[0].id});s.economy.produced[item]=(s.economy.produced[item]||0)+amount}
test('定义与跨引用有效',()=>assert.equal(validateDefinitions().buildings,10));
test('固定时钟暂停、倍率及后台补算上限',()=>{
 let ticks=0;const c=createClock(()=>ticks++);c.frame(0);c.frame(1000);assert.equal(ticks,0);c.setSpeed(1);c.frame(0);c.frame(160);assert.equal(ticks,4);c.setSpeed(0);c.frame(2000);assert.equal(ticks,4);c.setSpeed(3);c.frame(0);c.frame(1000);assert.equal(ticks,22);
});
test('命令验证失败不扣资源，成功先预留后施工',()=>{
 const s=clean(),before=totals(s);assert.equal(command(s,'BUILD',{type:'WORKSHOP',x:11,y:8}).reasonCode,'TECH_LOCKED');assert.deepEqual(totals(s),before);
 assert.equal(command(s,'BUILD',{type:'SOLAR',x:11,y:8}).status,'SUCCEEDED');assert.equal(available(s,'metal'),100);assert.deepEqual(totals(s),before);
 until(s,()=>s.buildings.find(b=>b.type==='SOLAR')?.done);assert.equal(totals(s).metal,before.metal-20);assert.ok(s.facts.some(f=>f.type==='BUILD_COMPLETED'));check(s);
});
test('取消规划返还预留，任务不能重复完成',()=>{
 const s=clean(),before=totals(s);command(s,'BUILD',{type:'SOLAR',x:11,y:8});const j=s.jobs.find(j=>j.kind==='BUILD');command(s,'CANCEL',{id:j.id});run(s,200);assert.deepEqual(totals(s),before);assert.equal(j.state,'CANCELLED');check(s);
});
test('多人搬运竞争、分堆上限与满仓守恒',()=>{
 const s=clean();s.zones=[{id:'Z',type:'stock',x:17,y:9,w:1,h:1}];addPile(s,'wood',90,16,9);addPile(s,'stone',12,16,10);
 until(s,()=>s.stocks['17,9']?.amount===75);
 assert.equal(s.stocks['17,9'].item,'wood');run(s,100);check(s);
 assert.equal(totals(s).wood,s.economy.initial.wood+90);
 command(s,'ZONE',{type:'stock',x:18,y:9,w:2,h:1});
 until(s,()=>s.piles.length===0&&s.jobs.every(j=>!j.cargo));assert.equal(available(s,'wood'),170);assert.equal(available(s,'stone'),72);check(s);
});
test('搬运中保存、读取、后续同 Tick 哈希一致',()=>{
 const s=clean();addPile(s,'wood',8,15,9);until(s,()=>s.jobs.some(j=>j.cargo));const r=load(save(s)).state;run(s,300);run(r,300);assert.equal(hash(s),hash(r));check(r);
});
test('禁用搬运与居住区限制',()=>{
 const s=clean();s.people.forEach(p=>p.priorities.haul=0);addPile(s,'wood',8,16,9);run(s,100);assert.equal(s.piles[0].amount,8);assert.ok(!s.jobs.some(j=>j.kind==='HAUL'&&j.owner));check(s);
 command(s,'ZONE',{type:'home',x:12,y:8,w:4,h:4});command(s,'PERSON',{id:'P1',homeOnly:true});assert.equal(command(s,'MOVE',{id:'P1',x:20,y:9}).reasonCode,'NO_PATH');
});
test('断电等待、供电恢复与生产投入产出守恒',()=>{
 const s=clean();const workshop=addBuilding(s,'WORKSHOP',11,10);
 run(s,100);assert.ok(s.jobs.some(j=>j.kind==='OPERATE'&&j.reason==='POWER_LOST'));check(s);
 const solar=addBuilding(s,'SOLAR',11,8);
 until(s,()=>s.jobs.some(j=>j.kind==='OPERATE'&&j.state==='EXECUTING'&&j.work>20));
 const progress=s.jobs.find(j=>j.kind==='OPERATE'&&j.owner).work;
 command(s,'TOGGLE',{id:solar.id});run(s,60);const j=s.jobs.find(j=>j.kind==='OPERATE'&&j.owner);assert.equal(j.work,progress);check(s);
 const restored=load(save(s)).state;run(s,1);run(restored,1);assert.equal(hash(s),hash(restored));
 command(s,'TOGGLE',{id:solar.id});until(s,()=>s.facts.some(f=>f.type==='PRODUCTION_COMPLETED'));
 assert.equal(s.economy.consumed.metal,4);assert.equal(s.economy.produced.parts,2);check(s);
 assert.ok(s.facts.filter(f=>f.type==='POWER_SHED'&&f.objects.includes(workshop.id)).every(f=>f.metrics.need===18));
});
test('输出满停止生产并能恢复',()=>{
 const s=clean();addBuilding(s,'SOLAR',11,8);const b=addBuilding(s,'WORKSHOP',11,10);addPile(s,'parts',75,b.x,b.y);s.zones=[];run(s,100);
 assert.ok(s.jobs.some(j=>j.reason==='OUTPUT_FULL'));assert.equal(s.economy.consumed.metal||0,0);
 command(s,'ZONE',{type:'stock',x:17,y:9,w:2,h:2});until(s,()=>s.facts.some(f=>f.type==='PRODUCTION_COMPLETED'));check(s);
});
test('移动中路径失效可诊断、清障后重试',()=>{
 const s=clean();s.people=s.people.slice(0,1);command(s,'BUILD',{type:'SOLAR',x:20,y:9});
 until(s,()=>s.jobs.some(j=>j.owner&&j.move));const j=s.jobs.find(j=>j.owner),cell=j.move.to;
 const wall=addBuilding(s,'WALL',cell.x,cell.y);run(s,45);assert.ok(j.history.some(h=>h.reason==='NO_PATH'));wall.removed=true;
 until(s,()=>s.buildings.find(b=>b.type==='SOLAR').done);check(s);
});
test('需求抢占、真实食物消耗与 Fact 记忆',()=>{
 const s=clean();s.people=s.people.slice(0,1);command(s,'BUILD',{type:'SOLAR',x:23,y:9});until(s,()=>s.people[0].job);s.people[0].hunger=10;
 until(s,()=>s.facts.some(f=>f.type==='NEED_SATISFIED'));assert.equal(s.economy.consumed.food,1);assert.ok(s.people[0].memories.some(m=>s.facts.find(f=>f.id===m.factId)?.type==='NEED_SATISFIED'));check(s);
});
test('科技、政策、提案与命名有来源，均可保存',()=>{
 const s=clean();s.research=100;command(s,'RESEARCH',{id:'MACHINING'});assert.ok(s.techDone.includes('MACHINING'));
 const b=addBuilding(s,'WORKSHOP',11,10);run(s,200);assert.ok(s.proposals.length);command(s,'APPROVE',{id:s.proposals[0].id});command(s,'RENAME',{id:b.id,name:'林澈工坊'});command(s,'POLICY',{key:'power',value:'production'});
 assert.equal(s.policy.power,'production');assert.equal(s.legacy[0].name,'林澈工坊');assert.equal(hash(load(save(s)).state),hash(s));check(s);
});
test('需求抢占与手动移动后建造材料仍扣除且蓝图可继续',()=>{
 const s=clean();s.people=s.people.slice(0,1);command(s,'BUILD',{type:'SOLAR',x:23,y:9});until(s,()=>s.people[0].job);s.people[0].hunger=10;
 until(s,()=>s.facts.some(f=>f.type==='NEED_SATISFIED'));until(s,()=>s.buildings.some(b=>b.type==='SOLAR'&&b.done));assert.equal(s.economy.consumed.metal,20);check(s);
 command(s,'BUILD',{type:'HOUSE',x:22,y:9});until(s,()=>s.people[0].job);command(s,'MOVE',{id:'P1',x:18,y:9});until(s,()=>s.buildings.some(b=>b.type==='HOUSE'&&b.done));assert.equal(s.economy.consumed.metal,40);check(s);
});
test('资源总占格 33%，每个岩石地块都有可采对象',()=>{
 const s=newGame(7);assert.equal(s.nodes.length,Math.round(s.width*s.height*.33));assert.ok(s.tiles.filter(t=>t.t==='rock').every(t=>s.nodes.some(n=>n.x===t.x&&n.y===t.y&&n.item==='stone')));check(s);
});
test('采矿消耗有限矿藏，枯竭后停止且无凭空产出',()=>{
 const s=clean();addBuilding(s,'SOLAR',11,8);addBuilding(s,'MINE',11,10);s.nodes.push({id:'D',item:'metal',amount:4,x:10,y:10});
 until(s,()=>s.facts.some(f=>f.type==='PRODUCTION_COMPLETED'));run(s,300);assert.equal(s.nodes[0].amount,0);assert.equal(s.economy.produced.metal,4);assert.ok(s.jobs.some(j=>j.reason==='DEPOSIT_EMPTY'));check(s);
});
test('缺料不启动生产，补入并搬运后恢复',()=>{
 const s=clean();s.reserve.metal=0;s.economy.initial.metal=0;addBuilding(s,'SOLAR',11,8);addBuilding(s,'WORKSHOP',11,10);run(s,100);assert.ok(s.jobs.some(j=>j.reason==='INPUT_MISSING'));assert.equal(s.economy.produced.parts||0,0);
 addPile(s,'metal',4,16,9);until(s,()=>s.facts.some(f=>f.type==='PRODUCTION_COMPLETED'));assert.equal(s.economy.consumed.metal,4);check(s);
});
test('限电政策真实改变负载顺序且电池会耗尽',()=>{
 const s=clean();addBuilding(s,'SOLAR',11,8);const clinic=addBuilding(s,'CLINIC',11,10),workshop=addBuilding(s,'WORKSHOP',12,10);run(s,1);assert.equal(clinic.powered,true);assert.equal(workshop.powered,false);
 command(s,'POLICY',{key:'power',value:'production'});assert.equal(workshop.powered,true);assert.equal(clinic.powered,false);addBuilding(s,'BATTERY',10,8);s.power.battery=5;run(s,1);assert.equal(clinic.powered,true);assert.equal(s.power.battery,0);run(s,1);assert.equal(clinic.powered,false);check(s);
});
let replayEvidence;
test('同种子同命令 10,000 Tick，两次独立回放一致',()=>{
 const s=newGame(7);command(s,'BUILD',{type:'SOLAR',x:11,y:8});command(s,'BUILD',{type:'FARM',x:11,y:10});command(s,'ZONE',{type:'stock',x:18,y:9,w:2,h:3});
 run(s,400);command(s,'POLICY',{key:'work',value:'care'});run(s,10000-s.tick);const a=replay(s),b=replay(s);assert.equal(a.ok,true);assert.equal(b.ok,true);check(s);
 replayEvidence={tick:s.tick,expected:hash(s),first:a.actual,second:b.actual};writeFileSync(new URL('./demo-save.json',import.meta.url),JSON.stringify(save(s),null,2));writeFileSync(new URL('./demo-commands.json',import.meta.url),JSON.stringify(s.commandLog,null,2));
});
test('旧 v0.8.0 迁移保留物资与建造预留，checkpoint 回放',()=>{
 const base=newGame(7);
 const old={schema:2,version:'0.8.0',seed:7,tick:99,tiles:base.tiles,people:base.people,resources:{metal:20,parts:10,food:50,medicine:3,energy:5,research:7},buildings:[{id:'B0',type:'HQ',x:13,y:8,done:true,progress:100},{id:'B1',type:'SOLAR',x:11,y:8,done:false,progress:40}]};
 const migrated=migrateV2(old);assert.equal(available(migrated.state,'metal'),20);assert.equal(totals(migrated.state).metal,40);
 command(migrated.state,'POLICY',{key:'work',value:'care'});run(migrated.state,100);assert.equal(replay(migrated.state,migrated.origin).ok,true);check(migrated.state);
 const bad=save(migrated.state);bad.state.tick++;assert.throws(()=>load(bad),/HASH_MISMATCH/);
});
let endurance;
test('72 游戏小时稳定运行与逐段守恒',()=>{
 const s=newGame(7);command(s,'BUILD',{type:'SOLAR',x:11,y:8});command(s,'BUILD',{type:'FARM',x:11,y:10});command(s,'BUILD',{type:'HOUSE',x:14,y:12});
 const start=performance.now();for(let i=s.tick;i<43200;i++){tick(s);if(i%1000===0)check(s)}
 check(s);endurance={ticks:s.tick,gameHours:72,ms:Math.round(performance.now()-start),facts:s.facts.length,jobs:s.jobs.length,saveBytes:JSON.stringify(save(s)).length,hash:hash(s)};
});
const report={build:'0.9.0',tests:results,replay:replayEvidence,endurance,limitations:['300×300 / 200 人性能基准尚未通过，当前验收场景为 28×18 / 6 人','全量策划库尚未全部执行，L4 仅适用于本报告验证的已实现链路']};
writeFileSync(new URL('./verification.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:results.length,replay:replayEvidence,endurance},null,2));

