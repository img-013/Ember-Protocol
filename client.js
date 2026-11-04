import { BUILD_VERSION, ITEMS, DEFS, TECHS, POLICIES, REASONS, MOVE_TICKS } from './definitions.js';
import { newGame, enqueue, tick, available, invariantErrors, query } from './engine.js';
import { hash, save, load, replay } from './save.js';
import { renderMap, TILE } from './map.js';
import { createClock } from './clock.js';

let state=newGame(),origin=null,panel='build',tool='inspect',buildType=null,person='P1',cell=null,drag=null,dragStart=null,lastPaint=0,lastPanel=0,lastResult=0;
const clock=createClock(()=>tick(state));
const q=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={BUILD:'建造',HAUL:'搬运',OPERATE:'操作机器',NEED:'生活需求',HARVEST:'采集',IDLE:'闲逛',MOVE:'移动',RETURN:'返回居住区',DEMOLISH:'拆除'};
const statuses={AVAILABLE:'待分配',MOVING:'前往目标',EXECUTING:'正在作业',BLOCKED:'等待处理',COMPLETED:'完成',CANCELLED:'取消'};
const formatItems=items=>Object.entries(items).map(([k,n])=>(ITEMS[k]?.name||k)+' '+n).join(' · ');
function notice(text){q('notice').textContent=text}
function send(type,payload){const id=enqueue(state,type,payload);notice(id+' 已排队'+(!clock.speed?'，点击 1× 开始执行':''));paint(true)}
function dialog(title,html){q('dialogTitle').textContent=title;q('dialogBody').innerHTML=html;if(!q('dialog').open)q('dialog').showModal()}
function exportJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function progress(p){return '<div class="bar"><i style="width:'+Math.max(0,Math.min(100,p))+'%"></i></div>'}
function jobDetails(j){return '<div class="row"><b>'+esc(labels[j.kind]||j.kind)+' · '+esc(j.id)+'</b><div>'+statuses[j.state]+' · '+esc(j.owner||'等待可用成员')+'</div>'+(j.reason?'<div class="reason">'+esc(REASONS[j.reason]||j.reason)+'</div>':'')+'<small>已作业 '+j.work+' Tick · 路径 '+j.path.length+' 格 · 重试 '+j.retryTick+'</small><details><summary>来源与预留</summary><pre>'+esc(JSON.stringify({sourceFactIds:j.sourceFactIds,reservation:j.reservation,escrow:j.escrow,cargo:j.cargo,lastScore:j.lastScore,history:j.history},null,2))+'</pre></details>'+(!['COMPLETED','CANCELLED'].includes(j.state)?'<button data-cancel="'+j.id+'">取消任务</button>':'')+'</div>'}
function renderSidebar(s){
  let html='';
  if(panel==='build'){
    html='<h2>规划设施</h2><p class="muted">规划后预留材料，人员到场施工。未完成的设施不参与供电和生产。</p><div class="build-grid">'+Object.entries(DEFS).filter(([id,d])=>id!=='HQ'&&(!d.tech||s.techDone.includes(d.tech))).map(([id,d])=>'<button data-build="'+id+'" class="'+(id===buildType?'active':'')+'">'+d.name+'<small>'+formatItems(d.cost)+'</small></button>').join('')+'</div>';
  }else if(panel==='people'){
    html='<h2>成员</h2>'+s.people.map(p=>'<button class="person" data-person="'+p.id+'">'+esc(p.name)+' · '+(p.dead?'已故':p.job?labels[s.jobs.find(j=>j.id===p.job)?.kind]||'工作':'待命')+'</button>').join('');
  }else if(panel==='research'){
    html='<h2>科技 · 知识 '+s.research+'</h2><p class="muted">聚落有空闲成员时积累知识。</p>'+Object.entries(TECHS).map(([id,t])=>'<button class="tree-node" data-tech="'+id+'" '+(s.techDone.includes(id)||s.research<t.cost||!t.pre.every(x=>s.techDone.includes(x))?'disabled':'')+'>'+t.name+' · '+(s.techDone.includes(id)?'已研究':t.cost)+'<small>'+(t.pre.length?t.pre.map(x=>TECHS[x].name).join('、')+' → ':'')+t.unlock+'</small></button>').join('')+'<h2>政策</h2>'+Object.entries(POLICIES).map(([id,d])=>'<label class="policy">'+d.name+'<select data-policy="'+id+'">'+d.options.map((o,i)=>'<option value="'+o+'" '+(s.policy[id]===o?'selected':'')+'>'+d.labels[i]+'</option>').join('')+'</select></label>').join('');
  }else if(panel==='history'){
    html='<h2>纪事 · 真实事实</h2>'+s.facts.slice(-35).reverse().map(f=>'<div class="row"><b>'+esc(f.text)+'</b><br><small>'+f.id+' · Tick '+f.tick+'</small><details><summary>发生依据</summary><pre>'+esc(JSON.stringify({causes:f.causes,actors:f.actors,objects:f.objects,metrics:f.metrics},null,2))+'</pre></details></div>').join('');
  }else{
    const errors=invariantErrors(s);html='<h2>运行诊断</h2><div class="row">状态哈希 '+hash(s)+'<br>待执行命令 '+s.pending.length+'<br>命令结果 '+s.results.length+'<br>事实 '+s.facts.length+'<br>已归档任务 '+s.archiveJobs+'<br>守恒与预留检查 '+(errors.length?esc(errors.join('\n')):'通过')+'</div><button id="auditExport">导出诊断与日志</button><h2>最近命令</h2>'+s.results.slice(-12).reverse().map(r=>'<div class="row">'+r.commandId+' · '+r.status+'<br>'+esc(REASONS[r.reasonCode]||r.reasonCode||'已执行')+'</div>').join('');
  }
  q('sidebar').innerHTML=html;
  q('sidebar').querySelectorAll('[data-build]').forEach(b=>b.onclick=()=>{buildType=b.dataset.build;tool='build';notice('点击地图规划'+DEFS[buildType].name);paint(true)});
  q('sidebar').querySelectorAll('[data-person]').forEach(b=>b.onclick=()=>{person=b.dataset.person;cell=null;paint(true)});
  q('sidebar').querySelectorAll('[data-tech]').forEach(b=>b.onclick=()=>send('RESEARCH',{id:b.dataset.tech}));
  q('sidebar').querySelectorAll('[data-policy]').forEach(b=>b.onchange=()=>send('POLICY',{key:b.dataset.policy,value:b.value}));
  if(q('auditExport'))q('auditExport').onclick=()=>exportJSON({buildVersion:BUILD_VERSION,hash:hash(state),commands:state.commandLog,results:state.results,errors:invariantErrors(state)},'余烬协议_诊断.json');
}
function renderInspector(s){
  const b=cell&&s.buildings.find(b=>!b.removed&&b.x===cell.x&&b.y===cell.y),stock=cell&&s.stocks[cell.x+','+cell.y];
  let html='';
  if(b){
    const related=s.jobs.filter(j=>j.target===b.id);
    html='<h2>'+esc(b.name)+'</h2><p>'+ (b.done?(b.enabled?'已启用':'已停用'):'施工 '+b.progress+'%')+'<br>供电 '+(b.powered?'正常':'无')+' · '+Math.abs(DEFS[b.type].power)+' 单位<br>缓存 '+(formatItems(b.bin)||'空')+'</p><button id="toggleBuilding">'+(b.enabled?'停用':'启用')+'</button> <button id="demolishBuilding">安排拆除</button><p><input id="buildingName" maxlength="24" value="'+esc(b.name)+'" aria-label="设施名称"><button id="renameBuilding">命名</button></p>'+related.slice(-2).map(jobDetails).join('');
  }else if(stock){
    html='<h2>'+ITEMS[stock.item].name+'</h2><p>储存格 '+cell.x+', '+cell.y+'<br>数量 '+stock.amount+' / '+ITEMS[stock.item].stack+'</p><small>入库事实 '+stock.factIds.join('、')+'</small>';
  }else{
    const p=s.people.find(p=>p.id===person)||s.people[0],j=s.jobs.find(j=>j.id===p.job);
    html='<h2>'+esc(p.name)+'</h2><div class="pair"><span>饱食</span><b>'+p.hunger+'</b></div>'+progress(p.hunger)+'<div class="pair"><span>休息</span><b>'+p.rest+'</b></div>'+progress(p.rest)+'<p>生命 '+p.hp+' · 心情 '+p.mood+'<br>位置 '+p.x+', '+p.y+'</p><button id="movePerson">指定移动地点</button><p><label><input id="homeOnly" type="checkbox" '+(p.homeOnly?'checked':'')+'> 仅在居住区活动</label></p><h2>工作优先级 · 0 禁用</h2>'+Object.entries(p.priorities).map(([k,v])=>'<label class="pair">'+({build:'建造',haul:'搬运',operate:'生产',harvest:'采集'})[k]+'<select data-priority="'+k+'">'+[0,1,2,3,4].map(n=>'<option '+(v===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label>').join('')+(j?jobDetails(j):'<p>当前待命</p>')+'<h2>记忆</h2>'+p.memories.slice(-4).reverse().map(m=>'<div class="row">'+m.appraisal+' · '+esc(s.facts.find(f=>f.id===m.factId)?.text||m.factId)+'<br><small>'+m.factId+'</small></div>').join('');
  }
  q('inspector').innerHTML=html;
  if(b){
    q('toggleBuilding').onclick=()=>send('TOGGLE',{id:b.id});q('demolishBuilding').onclick=()=>send('DEMOLISH',{id:b.id});q('renameBuilding').onclick=()=>send('RENAME',{id:b.id,name:q('buildingName').value});
  }else if(!stock){
    const p=s.people.find(p=>p.id===person)||s.people[0];
    q('movePerson').onclick=()=>{tool='move';notice('点击可达地块移动'+p.name)};
    q('homeOnly').onchange=e=>send('PERSON',{id:p.id,homeOnly:e.target.checked});
    q('inspector').querySelectorAll('[data-priority]').forEach(b=>b.onchange=()=>send('PERSON',{id:p.id,work:b.dataset.priority,priority:Number(b.value)}));
  }
}
function paint(force=false){
  const s=query(state);
  q('clockText').textContent='第 '+(1+Math.floor(s.tick/14400))+' 日 · '+Math.floor(s.tick/600)%24+' 时';
  q('resources').innerHTML=Object.keys(ITEMS).map(k=>'<span>'+ITEMS[k].name+' <b>'+available(s,k)+'</b></span>').join('')+'<span>电力 <b>'+s.power.supply+'/'+s.power.demand+'</b></span><span>储能 <b>'+s.power.battery+'/'+s.power.capacity+'</b></span>';
  renderMap(q('map'),s,{person,cell,drag});
  const editing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);
  if(force||!editing){renderSidebar(s);renderInspector(s)}
  q('issues').innerHTML=s.issues.filter(i=>i.status==='OPEN').map(i=>'<div class="issue"><b>'+i.text+'</b>　'+i.action+'<small> · '+i.sourceFactIds.join('、')+'</small></div>').join('');
  q('proposals').innerHTML=s.proposals.filter(p=>p.status==='OPEN').map(p=>'<div class="row">'+esc(s.people.find(x=>x.id===p.author)?.name)+'建议 '+esc(p.text)+'<br><button data-approve="'+p.id+'">批准建议</button></div>').join('');
  q('proposals').querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>send('APPROVE',{id:b.dataset.approve}));
  q('jobs').innerHTML=s.jobs.filter(j=>!['COMPLETED','CANCELLED','IDLE'].includes(j.state)&&j.kind!=='IDLE').slice(0,12).map(j=>'<div class="row jobsmall '+(j.state==='BLOCKED'?'blocked':'')+'">'+(labels[j.kind]||j.kind)+' · '+statuses[j.state]+'<br>'+esc(j.owner||'暂无可用成员')+(j.reason?'<div class="reason">'+esc(REASONS[j.reason])+'</div>':'')+'</div>').join('')||'<p class="muted">暂无待办工作</p>';
  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>send('CANCEL',{id:b.dataset.cancel}));
  document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',Number(b.dataset.speed)===clock.speed));
  document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  q('summary').textContent='Tick '+s.tick+' · Fact '+s.facts.length+' · '+BUILD_VERSION;
  if(s.results.length>lastResult){const r=s.results.at(-1);notice(r.commandId+(r.status==='SUCCEEDED'?' 已执行':' · '+(REASONS[r.reasonCode]||r.reasonCode)));lastResult=s.results.length}
}
const canvas=q('map');
const tileAt=e=>{const r=canvas.getBoundingClientRect();return{x:Math.min(state.width-1,Math.max(0,Math.floor((e.clientX-r.left)/r.width*state.width))),y:Math.min(state.height-1,Math.max(0,Math.floor((e.clientY-r.top)/r.height*state.height)))}};
const rect=(a,b)=>({x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x)+1,h:Math.abs(a.y-b.y)+1});
canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);if(['harvest','stock','home'].includes(tool)){dragStart=tileAt(e);drag=rect(dragStart,dragStart)}};
canvas.onpointermove=e=>{const t=tileAt(e);if(dragStart){drag=rect(dragStart,t);q('mapHint').textContent=drag.w+' × '+drag.h+' · '+drag.w*drag.h+' 格，松开确认 / Esc 取消'}else q('mapHint').textContent='坐标 '+t.x+', '+t.y+' · '+(state.stocks[t.x+','+t.y]?ITEMS[state.stocks[t.x+','+t.y].item].name:'地图地块');renderMap(canvas,state,{person,cell,drag})};
canvas.onpointerup=e=>{
  const t=tileAt(e);cell=t;
  if(dragStart){const area=rect(dragStart,t);dragStart=drag=null;q('mapHint').textContent='已框选 '+area.w+' × '+area.h+' 格';if(tool==='harvest')send('HARVEST',area);else send('ZONE',{...area,type:tool});return}
  if(tool==='build')send('BUILD',{type:buildType,...t});
  else if(tool==='move'){send('MOVE',{id:person,...t});tool='inspect'}
  else{const p=state.people.find(p=>p.x===t.x&&p.y===t.y);if(p){person=p.id;cell=null}paint(true)}
};
canvas.onpointercancel=()=>{dragStart=drag=null};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){dragStart=drag=null;tool='inspect';paint(true)}});
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{clock.setSpeed(Number(b.dataset.speed));paint(true)});
document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>{panel=b.dataset.panel;paint(true)});
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{tool=b.dataset.tool;buildType=null;paint(true)});
q('saveBtn').onclick=()=>{try{localStorage.setItem('ember.v090',JSON.stringify(save(state,origin)));notice('已保存 · Tick '+state.tick)}catch(e){notice('保存失败 '+e.message)}};
function installSaved(raw){const loaded=load(raw);if(loaded.migrated)localStorage.setItem('ember.v080.backup',typeof raw==='string'?raw:JSON.stringify(raw));state=loaded.state;origin=loaded.origin;person=state.people[0].id;cell=null;lastResult=state.results.length;clock.setSpeed(0);paint(true);notice(loaded.migrated?'旧档迁移完成，原存档已备份':'读档完成，当前已暂停')}
q('loadBtn').onclick=()=>{try{const raw=localStorage.getItem('ember.v090')||localStorage.getItem('ember.v080');if(!raw)return notice('没有存档');installSaved(raw)}catch(e){notice('读档失败，原档保留 · '+e.message)}};
q('exportBtn').onclick=()=>exportJSON(save(state,origin),'余烬协议_v0.9.0_存档.json');
q('importBtn').onclick=()=>q('importFile').click();
q('importFile').onchange=async e=>{try{const file=e.target.files[0];if(file)installSaved(await file.text())}catch(error){notice('导入失败 · '+error.message)}finally{e.target.value=''}};
q('replayBtn').onclick=()=>{clock.setSpeed(0);notice('正在回放本局…');setTimeout(()=>{try{const r=replay(state,origin);notice(r.ok?'回放验证一致':'回放不一致，请导出诊断');dialog('回放验证','<p>'+(r.ok?'一致':'不一致')+'</p><pre>当前 '+r.expected+'\n回放 '+r.actual+'\n'+(origin?'来源为旧档迁移 checkpoint':'来源为种子与命令日志')+'</pre>')}catch(e){dialog('回放失败','<p>'+esc(e.message)+'</p>')}},0)};
q('newBtn').onclick=()=>dialog('建立新聚落','<p>先保存需要保留的进度。</p><label>世界种子 <input id="newSeed" type="number" value="20261104"></label><button id="confirmNew">开始新局</button>');
q('dialogBody').onclick=e=>{if(e.target.id==='confirmNew'){const seed=Number(q('newSeed').value);if(!Number.isSafeInteger(seed))return;state=newGame(seed);origin=null;person='P1';cell=null;lastResult=0;clock.setSpeed(0);q('dialog').close();paint(true)}};
q('helpBtn').onclick=()=>dialog('聚落指南','<p>先规划太阳能和藻类农场，开启 1× 等待成员施工。框选地图采集材料，完成后会留下物资。储存区需可达，搬运者会自动送货，每格只放一种物品并遵守堆叠上限。</p><p>采矿站、农场、工坊和医疗站需要人员操作及供电。采矿站只开采周围三格内的有限金属矿藏，枯竭后停止。满仓、缺料、无路和停电都会显示在任务队列。研究解锁后续设施，政策会影响实际限电顺序和需求优先级。</p><p>人物是小点，点选后可指定移动、设置工作优先级或居住区限制。库存显示已经可用的物资，在途货物到达后才计入。</p><p>存档保存任务中间态。回放按钮按本局命令重算并比对哈希。固定剧情不决定资源和伤害。</p>');
document.addEventListener('visibilitychange',()=>clock.reset());
function frame(now){clock.frame(now);if(now-lastPaint>=40){renderMap(canvas,state,{person,cell,drag});lastPaint=now}if(now-lastPanel>=700){paint();lastPanel=now}requestAnimationFrame(frame)}
paint(true);requestAnimationFrame(frame);
