// Shared deterministic services for the original colony. No second world state.
export const CONTENT_VERSION = 'colony-0.9.2';
export function fact(state, type, payload) {
  const entry = Object.freeze({id:'FACT-R-'+(state.factSerial=(state.factSerial||0)+1),tick:state.tick,type,...JSON.parse(JSON.stringify(payload))});
  (state.facts ??= []).push(entry);
  return entry;
}
export function random(state) {
  state.rngState = (Math.imul((state.rngState ?? state.seed) >>> 0, 1664525) + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}
export function advance(state, elapsedMs, step) {
  if (!state.loaded || !state.speed) return 0;
  state.clockFraction = (state.clockFraction || 0) + Math.max(0, Math.min(100, elapsedMs)) * .06 * state.speed;
  const count = Math.floor(state.clockFraction + 1e-9);
  state.clockFraction = Math.max(0, state.clockFraction - count);
  for (let i = 0; i < count; i++) { state.tick++; step(); }
  return count;
}
export function hashState(state) {
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  let hash = 2166136261;
  for (const char of JSON.stringify(canonical(state))) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}
export function snapshot(state) {
  const copy = JSON.parse(JSON.stringify(state));
  return {schema:'save-v2', contentVersion:CONTENT_VERSION, game:'余烬协议', savedAt:new Date().toISOString(), state:copy, hash:hashState(copy)};
}
export function restore(target, input) {
  if (!input || !['save-v1','save-v2'].includes(input.schema)) throw new Error('不支持的存档版本');
  const s = input.state;
  if (!s || !Number.isSafeInteger(s.tick) || s.tick < 0 || !Array.isArray(s.people) || !Array.isArray(s.buildings) || !Array.isArray(s.zones) || !s.camera || !s.inventory) throw new Error('存档缺少必要状态');
  if (input.schema === 'save-v2' && (input.contentVersion !== CONTENT_VERSION || hashState(s) !== input.hash)) throw new Error('存档版本不兼容或校验失败，原档未修改');
  const copy = JSON.parse(JSON.stringify(s));
  copy.clockFraction ??= 0;
  copy.rngState ??= copy.seed >>> 0;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, copy);
  return target;
}
