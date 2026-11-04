export const BUILD_VERSION = '0.9.0';
export const CONTENT_VERSION = 'ember-0.9.0';
export const SCHEMA_VERSION = 3;
export const TICKS_PER_SECOND = 25;
export const MOVE_TICKS = 40;
export const ITEMS = Object.freeze({
  metal: { name: '金属', stack: 75, color: '#929381' },
  parts: { name: '零件', stack: 50, color: '#b89a72' },
  food: { name: '食物', stack: 40, color: '#9aa36c' },
  medicine: { name: '药品', stack: 25, color: '#82aaa0' },
  wood: { name: '木材', stack: 75, color: '#9d815e' },
  stone: { name: '石料', stack: 100, color: '#8b8c7d' }
});
export const DEFS = Object.freeze({
  HQ: { name: '指挥舱', cost: {}, power: 0, work: 1, color: '#af9471', icon: '◆' },
  SOLAR: { name: '太阳能阵列', cost: {metal:20,parts:5}, power: 35, work: 110, color: '#788e91', icon: '▱' },
  BATTERY: { name: '蓄电池', cost: {metal:16,parts:8}, power: 0, capacity: 6000, work: 100, color: '#94a17b', icon: '▣' },
  MINE: { name: '采矿站', cost: {metal:25,parts:5}, power: -10, work: 140, color: '#8b8370', icon: '矿', recipe: 'RECYCLE' },
  FARM: { name: '藻类农场', cost: {metal:18,parts:6}, power: -8, work: 110, color: '#738e69', icon: '田', recipe: 'GROW' },
  WORKSHOP: { name: '零件工坊', cost: {metal:30,parts:10}, power: -18, work: 160, tech: 'MACHINING', color: '#9b866f', icon: '⚙', recipe: 'PARTS' },
  CLINIC: { name: '医疗站', cost: {metal:35,parts:15}, power: -22, work: 180, tech: 'MEDICINE', color: '#85a59b', icon: '+', recipe: 'MEDICINE' },
  HOUSE: { name: '居住舱', cost: {metal:20,parts:8}, power: -6, work: 120, color: '#9c927e', icon: '⌂' },
  BEACON: { name: '信标塔', cost: {metal:55,parts:30}, power: -35, work: 240, tech: 'SIGNAL', color: '#b19875', icon: '△' },
  WALL: { name: '石墙', cost: {stone:5}, power: 0, work: 40, color: '#797e73', icon: '' }
});
export const RECIPES = Object.freeze({
  RECYCLE: { input: {}, output: {metal:4}, ticks: 180, source: '邻近有限金属矿藏，每批消耗4单位', skill: 'build' },
  GROW: { input: {}, output: {food:6}, ticks: 200, source: '藻类生长', skill: 'care' },
  PARTS: { input: {metal:4}, output: {parts:2}, ticks: 160, skill: 'tech' },
  MEDICINE: { input: {food:3,parts:1}, output: {medicine:2}, ticks: 200, skill: 'care' }
});
export const TECHS = Object.freeze({
  MACHINING: { name:'精密加工', cost:20, pre:[], unlock:'零件工坊' },
  MEDICINE: { name:'基础医疗', cost:25, pre:[], unlock:'医疗站、药品生产和治疗' },
  SIGNAL: { name:'信号工程', cost:50, pre:['MACHINING'], unlock:'信标塔' }
});
export const POLICIES = Object.freeze({
  power: { name:'限电次序', options:['critical','production'], labels:['医疗与生活优先','生产设施优先'] },
  work: { name:'需求抢占', options:['care','balanced'], labels:['生活优先（需求低于35）','均衡（需求低于20）'] }
});
export const REASONS = Object.freeze({
  DEPOSIT_EMPTY:'附近三格内没有可用金属矿藏。选择矿脉旁建站或等待其他采集任务结束。',
  NO_PATH:'没有可通行路径。清理通道或取消目标。',
  OUTPUT_FULL:'输出或储存空间不足。扩建储存区或搬走物资。',
  INPUT_MISSING:'缺少原料。采集资源、搬入仓库或等待上游生产。',
  POWER_LOST:'供电不足。建造电源、储能或调整限电政策。',
  TARGET_GONE:'目标已消失。任务已取消并释放预留。',
  NO_CANDIDATE:'暂无可用成员。检查工作禁用、活动范围或需求。',
  RESERVATION_LOST:'目标或容量被其他任务认领。等待重新调度。',
  POLICY_BLOCKED:'当前人物活动范围不允许到达目标。',
  PREEMPTED:'人物优先处理生活需求。满足需求后继续任务。',
  CANCELLED:'玩家取消了任务，已释放预留。',
  INVALID_COMMAND:'命令参数无效，未改变玩法状态。',
  TECH_LOCKED:'前置研究未完成。先在研究页完成对应项目。',
  STORAGE_REJECTED:'该地块无法储存。选择无建筑、无地物的可达空地。',
  LEGACY_JOB_RESET:'旧版运行任务已恢复为待分配，材料保留在预留中。'
});
export function validateDefinitions() {
  const errors=[];
  for(const [id,d] of Object.entries(DEFS)) {
    for(const [item,n] of Object.entries(d.cost)) if(!ITEMS[item]||!Number.isInteger(n)||n<0) errors.push(id+'.cost.'+item);
    if(d.tech&&!TECHS[d.tech])errors.push(id+'.tech');
    if(d.recipe&&!RECIPES[d.recipe])errors.push(id+'.recipe');
  }
  for(const [id,r] of Object.entries(RECIPES))for(const values of [r.input,r.output])
    for(const [item,n] of Object.entries(values))if(!ITEMS[item]||!Number.isInteger(n)||n<1)errors.push(id+'.'+item);
  for(const [id,t] of Object.entries(TECHS))for(const p of t.pre)if(!TECHS[p])errors.push(id+'.pre');
  for(const [id,item] of Object.entries(ITEMS))if(!Number.isInteger(item.stack)||item.stack<1)errors.push(id+'.stack');
  if(errors.length)throw new Error('CONTENT_INVALID '+errors.join(', '));
  return {buildings:Object.keys(DEFS).length,recipes:Object.keys(RECIPES).length,items:Object.keys(ITEMS).length};
}
