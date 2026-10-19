// v3.6.1 hotfix: drawing roads along / up / around hills must stay fast (no unbounded search) and never throw.
import * as S from '../src/sim.js';
const fail = [];
for (const size of [64, 128]) {
  const s = S.newGame({ seed: 42, size }), N = s.world.size; s.res.money = 1e6; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) S.tile(s, x, y).vis = 1;
  const hills = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (S.tile(s, x, y).t === S.T.HILL) hills.push([x, y]);
  let worst = 0;
  for (let i = 0; i < 40; i++) { const [hx, hy] = hills[(i * 7919) % hills.length]; const a = i * 0.7, L = 6 + (i % 20);
    const tiles = []; for (let k = -L; k <= L; k++) { const x = Math.round(hx + Math.cos(a) * k), y = Math.round(hy + Math.sin(a) * k); if (x >= 0 && y >= 0 && x < N && y < N && !tiles.some(q => q[0] === x && q[1] === y)) tiles.push([x, y]); }
    const t0 = performance.now(); S.applyCommand(s, { type: 'roadLine', tiles }); S.applyCommand(s, { type: 'road', x: hx, y: hy }); for (let h = 0; h < 50; h++) S.tick(s); worst = Math.max(worst, performance.now() - t0); }
  if (worst > 400) fail.push(`size ${size}: slowest road stroke + 50 ticks took ${worst.toFixed(0)} ms`);
  console.log(`size ${size}: worst ${worst.toFixed(0)} ms`);
}
console.log(fail.length ? 'FAIL roads_hill: ' + fail.join('; ') : 'PASS roads_hill'); if (fail.length) process.exit(1);
