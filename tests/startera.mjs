// Start-era presets: every era from Bronze to Industrial founds a settled town with that era's techs, stock and buildings, and it keeps running.
import * as S from '../src/sim.js';
import { TECHS, ERAS } from '../src/data.js';
let fail = 0;
for (let e = 2; e <= 7; e++) {
  const s = S.newGame({ seed: 11, size: +(process.env.MAP || 64), era: e });
  const nb = Object.values(s.buildings).length, pop0 = S.popTotal(s), techs = s.research.done.length, need = Object.values(TECHS).filter(t => t.era < e).length;
  for (let h = 0; h < 24 * 10; h++) S.tick(s);
  const pop = S.popTotal(s), ok = s.era >= e && nb >= 10 + e * 2 && techs === need && pop >= pop0 * 0.8 && s.res.food > 0;
  console.log(ERAS[e].name.padEnd(12), 'buildings', nb, 'pop', pop0, '->', pop, 'techs', techs + '/' + need, 'food', Math.round(s.res.food), ok ? 'ok' : 'FAIL');
  if (!ok) fail++;
}
if (fail) { console.log('FAIL'); process.exit(1); } console.log('PASS: start-era presets');
