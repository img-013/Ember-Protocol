import { TICKS_PER_SECOND } from './definitions.js';
export function createClock(step) {
  let last=null,accumulator=0,speed=0;
  return {
    get speed(){return speed},
    setSpeed(value){if(![0,1,3].includes(value))throw Error('INVALID_SPEED');speed=value;last=null;accumulator=0},
    frame(now){if(last===null){last=now;return 0}const elapsed=Math.min(250,Math.max(0,now-last));last=now;
      if(!speed)return 0;
      accumulator+=elapsed*speed;let count=0;
      while(accumulator>=1000/TICKS_PER_SECOND){step();accumulator-=1000/TICKS_PER_SECOND;count++}
      return count;
    },
    reset(){last=null;accumulator=0}
  };
}
