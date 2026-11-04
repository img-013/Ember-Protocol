export function random(state) {
  state.rng = (Math.imul(state.rng,1664525)+1013904223)>>>0;
  return state.rng/4294967296;
}
export const cellKey = (x,y) => x+','+y;
export function inside(c,area) {
  return c.x>=area.x&&c.y>=area.y&&c.x<area.x+area.w&&c.y<area.y+area.h;
}
export function terrainAt(s,x,y) { return s.tiles[y*s.width+x]; }
export function walkable(s,x,y) {
  if(x<0||y<0||x>=s.width||y>=s.height)return false;
  const t=terrainAt(s,x,y);
  return t?.t!=='water'&&t?.t!=='rock'&&!s.buildings.some(b=>b.done&&!b.removed&&b.x===x&&b.y===y);
}
export function allowed(s,p,x,y) {
  const homes=s.zones.filter(z=>z.type==='home');
  return !p.homeOnly||!homes.length||homes.some(z=>inside({x,y},z));
}
export function pathTo(s,p,targets,ignoreHome=false) {
  const goals=new Set(targets.filter(c=>walkable(s,c.x,c.y)&&(ignoreHome||allowed(s,p,c.x,c.y))).map(c=>c.y*s.width+c.x));
  if(!goals.size)return null;
  const start=p.y*s.width+p.x,seen=new Map([[start,-1]]),queue=[start];
  for(let i=0;i<queue.length;i++){
    const v=queue[i],x=v%s.width,y=Math.floor(v/s.width);
    if(goals.has(v)){
      const path=[];
      for(let at=v;seen.get(at)!==-1;at=seen.get(at))path.push({x:at%s.width,y:Math.floor(at/s.width)});
      return path.reverse();
    }
    for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=ny*s.width+nx;
      if(!seen.has(k)&&walkable(s,nx,ny)&&(ignoreHome||allowed(s,p,nx,ny))){seen.set(k,v);queue.push(k)}
    }
  }
  return null;
}
export const adjacent = target => [{x:target.x-1,y:target.y},{x:target.x+1,y:target.y},{x:target.x,y:target.y-1},{x:target.x,y:target.y+1}];
export function generateWorld(s) {
  s.tiles=[];
  for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
    const river=4+Math.sin(y*.4+s.seed%7)*1.3;
    const water=Math.abs(x-river)<.7&&y!==Math.floor(s.height/2);
    const central=x>=10&&x<=18&&y>=6&&y<=12;
    const r=random(s);
    s.tiles.push({x,y,t:!central&&water?'water':'soil'});
  }
  const candidates=s.tiles.filter(t=>t.t!=='water'&&!(t.x>=10&&t.x<=18&&t.y>=6&&t.y<=12));
  for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]]}
  const count=Math.min(candidates.length,Math.round(s.width*s.height*.33));
  for(let i=0;i<count;i++){
    const t=candidates[i],r=i/count;
    const kind=r<.22?'wood':r<.42?'stone':r<.52?'metal':r<.56?'food':r<.60?'medicine':'grass';
    if(kind==='stone')t.t='rock';
    s.nodes.push({id:'N'+i,x:t.x,y:t.y,item:kind,amount:kind==='grass'?0:kind==='medicine'?4:20});
  }
}
