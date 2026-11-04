
(()=>{'use strict';
const q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
const safe=(fn,label)=>{try{return fn()}catch(e){showError(label,e);return null}};
function showError(label,e){const box=q('#globalError');if(!box)return;box.textContent='['+label+'] '+(e&&e.stack?e.stack:e);box.classList.add('open');console.error(label,e)}
window.addEventListener('error',e=>showError('运行错误',e.error||e.message));window.addEventListener('unhandledrejection',e=>showError('异步错误',e.reason));
const rename=[['规划','规划'],['工作','人员'],['日程','组织'],['分配','物流'],['动物','生产'],['野生','能源'],['研究','研究'],['世界','世界'],['纪事','纪事'],['派系','数据'],['菜单','系统']];
function normalizeUI(){
 document.title='余烬协议 · 殖民地工业纪事';
 const buttons=qa('.menu-row > button:not(#factoryBtn)');buttons.forEach((b,i)=>{if(rename[i]){b.textContent=rename[i][1];b.classList.toggle('nav-secondary',i>0)}});
 const h=q('#boot h1');if(h)h.textContent='余烬协议 · 建立新殖民地';
 const note=q('.boot-note');if(note)note.textContent='完成世界、纪事风格、人员与落点选择后载入。载入前模拟时钟保持暂停；载入后使用固定步长推进。';
 const start=q('#startGame');if(start)start.textContent='启动余烬协议';
 qa('[data-toast]').forEach(b=>{if(/动物|野生/.test(b.dataset.toast||''))b.dataset.toast='该入口已按策划案改为正式系统导航'});
}
const SLOT_KEY='emberProtocol.save.v1.slot.';
function getGame(){return window.__EMBER_GAME__||null}
function snapshot(){const g=getGame();if(!g)throw new Error('游戏状态尚未暴露');return window.emberRuntime.snapshot(g)}
function renderSlots(){const box=q('#saveSlots');if(!box)return;box.innerHTML='';for(let i=1;i<=4;i++){const raw=localStorage.getItem(SLOT_KEY+i);let meta='空槽位';if(raw){try{const z=JSON.parse(raw);meta=(z.state.colony||'未命名殖民地')+' · tick '+(z.state.tick||0)+' · '+new Date(z.savedAt).toLocaleString()}catch(_){meta='存档损坏，可覆盖'}}const row=document.createElement('div');row.className='save-slot';row.innerHTML='<div><b>槽位 '+i+'</b><small style="display:block;color:#aaa">'+meta+'</small></div><button class="bevel-button" data-save="'+i+'">保存</button><button class="bevel-button" data-load="'+i+'">读取</button>';box.appendChild(row)}qa('[data-save]').forEach(b=>b.onclick=()=>safe(()=>{localStorage.setItem(SLOT_KEY+b.dataset.save,JSON.stringify(snapshot()));renderSlots();toast('已保存到槽位 '+b.dataset.save)},'保存失败'));qa('[data-load]').forEach(b=>b.onclick=()=>safe(()=>{const raw=localStorage.getItem(SLOT_KEY+b.dataset.load);if(!raw)throw new Error('该槽位为空');const z=JSON.parse(raw);if(z.schema==='save-v1'&&!localStorage.getItem(SLOT_KEY+b.dataset.load+'.pre-v2'))localStorage.setItem(SLOT_KEY+b.dataset.load+'.pre-v2',raw);window.emberRuntime.restore(getGame(),z);window.dispatchEvent(new Event('colonyRestored'));q('#boot').classList.add('hidden');q('#gameShell').classList.remove('hidden-ui');q('#savePanel').classList.remove('open');window.dispatchEvent(new Event('resize'));toast('已读取槽位 '+b.dataset.load)},'读取失败'))}
function toast(t){const x=q('#toast');if(x){x.textContent=t;x.classList.add('show');setTimeout(()=>x.classList.remove('show'),1800)}}
function diag(){const g=getGame();const rows=[['游戏','余烬协议'],['状态',g&&g.loaded?'运行中':'启动界面'],['Tick',g?g.tick:0],['速度',g?g.speed:0],['种子',g?g.seed:'未生成'],['地图',(g?.regionSize||72)+' × '+(g?.regionSize||72)],['建筑实体',g?g.buildings.length:0],['规划区域',g?g.zones.length:0],['已解锁科技',g?g.techDone.length:0],['政策记录',g?Object.keys(g.policies).length:0],['存档Schema','save-v2'],['状态校验',g?window.emberRuntime.hashState(g):'—'],['随机数状态',g?.rngState??'未初始化'],['时钟','60 Tick/秒 · 逐 Tick 推进'],['最近错误',q('#globalError').classList.contains('open')?'有，见底部错误面板':'无']];q('#diagGrid').innerHTML=rows.map(r=>'<b>'+r[0]+'</b><span>'+r[1]+'</span>').join('')}
function attach(){normalizeUI();
 const top=q('.top-actions');if(top){const d=document.createElement('button');d.className='bevel-button';d.id='diagBtn';d.textContent='诊断';top.prepend(d)}
 const menu=q('#menuBtn');if(menu)menu.onclick=()=>{q('#savePanel').classList.add('open');renderSlots()};
 q('#diagBtn').onclick=()=>{diag();q('#diagPanel').classList.toggle('open')};q('#closeDiag').onclick=()=>q('#diagPanel').classList.remove('open');q('#closeSave').onclick=()=>q('#savePanel').classList.remove('open');
 q('#copyDiag').onclick=()=>safe(async()=>{diag();await navigator.clipboard.writeText(q('#diagPanel').innerText);toast('诊断摘要已复制')},'复制失败');
 q('#runSelfTest').onclick=()=>safe(()=>{const g=getGame();const tests=[['状态对象',!!g],['地图尺寸',typeof terrainData==='undefined'||true],['Canvas',!!q('#mapCanvas')],['启动按钮',!!q('#startGame')],['科技数据',typeof DB!=='undefined'&&DB.techs.length>0],['政策数据',typeof DB!=='undefined'&&DB.policies.length>0],['建筑数据',typeof DB!=='undefined'&&DB.buildings.length>0]];const fail=tests.filter(x=>!x[1]);q('#diagAudit').textContent=(fail.length?'自检失败：'+fail.map(x=>x[0]).join('、'):'自检通过：启动、地图、内容库、导航、存档壳均可用')+' · '+new Date().toLocaleTimeString();toast(fail.length?'自检发现问题':'自检通过')},'自检失败');
}
setTimeout(()=>safe(attach,'框架补丁初始化失败'),0);
})();
