import { ITEMS, DEFS, MOVE_TICKS } from './definitions.js';
export const TILE=26;
function noise(seed,x,y){let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return(n^(n>>>16))>>>0}
function poly(c,color,points){c.fillStyle=color;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill()}
function object(c,n){
  c.save();c.translate(n.x*TILE,n.y*TILE);
  if(n.item==='wood'){
    c.fillStyle='#776b51';c.fillRect(12,15,2,6);poly(c,'#3e5b42',[[5,15],[8,8],[14,4],[20,10],[21,16],[14,19]]);poly(c,'#657e55',[[6,13],[9,8],[14,4],[15,12],[10,16]]);
  }else if(n.item==='grass'){
    c.strokeStyle='#84926d66';c.beginPath();c.moveTo(8,18);c.lineTo(7,14);c.moveTo(12,18);c.lineTo(14,14);c.stroke();
  }else if(n.item==='food'||n.item==='medicine'){
    poly(c,'#536c45',[[5,18],[9,10],[12,13],[16,7],[20,17],[15,21]]);c.fillStyle=n.item==='food'?'#b5836a':'#b7bb8e';c.fillRect(9,13,2,2);c.fillRect(16,12,2,2);
  }else{
    poly(c,'#717a69',[[4,18],[7,10],[14,7],[21,12],[22,20],[13,22]]);poly(c,n.item==='metal'?'#a3977d':'#959a8a',[[7,10],[14,7],[17,12],[12,16],[4,18]]);
  }
  c.restore();
}
function item(c,x,y,id,n,stored){
  c.save();c.translate(x*TILE,y*TILE);const d=ITEMS[id];
  poly(c,d.color,[[5,13],[11,8],[20,11],[20,18],[11,21],[5,18]]);
  if(stored){c.strokeStyle='#d6c99c88';c.strokeRect(2.5,2.5,21,21)}
  c.fillStyle='#202d26';c.font='bold 9px sans-serif';c.textAlign='center';c.fillText(d.name[0],12,16);
  c.fillStyle='#f1e9d3';c.font='9px sans-serif';c.fillText(String(n),13,24,20);c.restore();
}
export function renderMap(canvas,s,view={}){
  const c=canvas.getContext('2d');
  const w=s.width*TILE,h=s.height*TILE;
  if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  for(const t of s.tiles){
    const v=noise(s.seed,t.x,t.y);c.fillStyle=t.t==='water'?'#4d7479':['#53664d','#586a50','#51634a'][v%3];c.fillRect(t.x*TILE,t.y*TILE,TILE,TILE);
    if(t.t==='water'){c.strokeStyle='#9cb3ad33';c.beginPath();c.moveTo(t.x*TILE+5,t.y*TILE+10);c.lineTo(t.x*TILE+16,t.y*TILE+9);c.stroke()}
    if(t.t==='rock')object(c,{...t,item:'stone'});
  }
  for(const n of s.nodes)if(n.amount>0||n.item==='grass')object(c,n);
  for(const z of s.zones){c.fillStyle=z.type==='stock'?'#dbc78320':'#82c2b423';c.strokeStyle=z.type==='stock'?'#c5b47988':'#8eb7a688';c.lineWidth=1;c.fillRect(z.x*TILE,z.y*TILE,z.w*TILE,z.h*TILE);c.strokeRect(z.x*TILE+.5,z.y*TILE+.5,z.w*TILE-1,z.h*TILE-1)}
  for(const [key,stock] of Object.entries(s.stocks)){const [x,y]=key.split(',').map(Number);item(c,x,y,stock.item,stock.amount,true)}
  for(const p of s.piles)item(c,p.x,p.y,p.item,p.amount,false);
  for(const b of s.buildings.filter(b=>!b.removed)){
    c.save();c.translate(b.x*TILE,b.y*TILE);c.fillStyle=b.done?DEFS[b.type].color:'#80755b';c.globalAlpha=b.done?1:.55;c.fillRect(4,4,18,17);c.globalAlpha=1;
    c.fillStyle='#293c32';c.textAlign='center';c.font='bold 10px sans-serif';c.fillText(DEFS[b.type].icon,13,16,16);
    if(!b.done){c.fillStyle='#d7b36b';c.fillRect(4,23,18*b.progress/100,2)}
    if(b.done&&DEFS[b.type].power<0&&!b.powered){c.fillStyle='#d58c75';c.fillRect(20,2,3,3)}
    c.restore();
  }
  for(const p of s.people.filter(p=>!p.dead)){
    const j=s.jobs.find(j=>j.id===p.job),m=j?.move,f=m?Math.max(0,Math.min(1,1-(m.until-s.tick)/MOVE_TICKS)):0;
    const x=((m?m.from.x+(m.to.x-m.from.x)*f:p.x)+.5)*TILE,y=((m?m.from.y+(m.to.y-m.from.y)*f:p.y)+.5)*TILE;
    if(view.person===p.id){c.strokeStyle='#ead6a0';c.lineWidth=1;c.beginPath();c.arc(x,y,5,0,7);c.stroke()}
    c.fillStyle='#20352d66';c.beginPath();c.ellipse(x,y+3,3,1.5,0,0,7);c.fill();c.fillStyle=j?.cargo?'#d6b775':p.job?'#e2cd9e':'#d6dfc8';c.beginPath();c.arc(x,y,2.5,0,7);c.fill();
  }
  const selection=view.drag;
  if(selection){c.fillStyle='#b9dbb62b';c.strokeStyle='#d2e7bc';c.fillRect(selection.x*TILE,selection.y*TILE,selection.w*TILE,selection.h*TILE);c.strokeRect(selection.x*TILE+1,selection.y*TILE+1,selection.w*TILE-2,selection.h*TILE-2)}
  if(view.cell){c.strokeStyle='#ead6a0';c.lineWidth=1;c.strokeRect(view.cell.x*TILE+1.5,view.cell.y*TILE+1.5,TILE-3,TILE-3)}
}
