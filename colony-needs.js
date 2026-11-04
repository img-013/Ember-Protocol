import {fact} from './colony-runtime.js';
const FOOD='ITM-FOOD';
export function rationCount(g, source) {
  if(source==='camp') return Math.max(0,(g.inventory[FOOD]||0)-Object.values(g.stockCells||{}).reduce((n,c)=>n+(c.item===FOOD?c.amount:0),0));
  const cell=g.stockCells?.[source];
  return cell?.item===FOOD ? cell.amount : 0;
}
export function freeRations(g, source, person) {
  return Math.max(0,rationCount(g,source)-(g.people||[]).filter(p=>p!==person&&p.motion?.kind==='meal'&&p.motion.foodSource===source).length);
}
export function eatRation(g,p,source) {
  if(rationCount(g,source)<1||(g.inventory[FOOD]||0)<1) return false;
  let sourceFactId=null;
  if(source!=='camp') {
    const cell=g.stockCells[source];
    cell.amount--;
    const lot=cell.lots?.[0];
    if(lot){sourceFactId=lot.factId||null;lot.amount--;if(lot.amount<=0)cell.lots.shift()}
    if(cell.amount<=0)delete g.stockCells[source];
  }
  g.inventory[FOOD]--;
  const before=p.needs.饮食;
  p.needs.饮食=Math.min(100,before+50);
  const f=fact(g,'MEAL_CONSUMED',{actor:p.id,item:FOOD,amount:1,source,sourceFactId,before,after:p.needs.饮食,text:p.name+'吃完一份食物（'+(source==='camp'?'随营储备':source)+'）'});
  p.memories.unshift({factId:f.id,appraisal:f.text,intensity:2});p.memories.splice(24);
  return true;
}
