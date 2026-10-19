// Hunting: a staffed Hunting Lodge sends hunters out who stalk prey, bring meat home, thin the local herds (never the last animal), and the herds regrow.
import * as S from '../src/sim.js';
import { BUILDINGS } from '../src/data.js';
const s = S.newGame({ seed: 42, size: 64 }); s.res.wood += 500; s.res.stone += 100; s.res.food += 500;
// put the lodge next to the nearest deer herd
const herd = s.herds.filter(h => h.kind === 'deer').sort((a, b) => Math.hypot(a.x - s.start.x, a.y - s.start.y) - Math.hypot(b.x - s.start.x, b.y - s.start.y))[0];
for (const c of Object.values(s.world.chunks)) for (const t of c.tiles) t.vis = 1;
let lodge = null; for (let r = 2; r < 8 && !lodge; r++) for (let dy = -r; dy <= r && !lodge; dy++) for (let dx = -r; dx <= r && !lodge; dx++) { const q = S.applyCommand(s, { type: 'place', kind: 'hunter', x: herd.x + dx, y: herd.y + dy }); if (q.ok) lodge = s.buildings[q.id]; }
if (!lodge) { console.log('FAIL: no lodge spot'); process.exit(1); }
S.applyCommand(s, { type: 'skip', what: 'build', id: lodge.id });
// homes so there are workers
for (let i = 0; i < 4; i++) { for (let r = 2; r < 10; r++) { let ok = false; for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) { const q = S.applyCommand(s, { type: 'place', kind: 'hut', x: s.start.x + dx, y: s.start.y + dy }); if (q.ok) { S.applyCommand(s, { type: 'skip', what: 'build', id: q.id }); ok = true; } } if (ok) break; } }
const deer0 = s.animals.filter(a => a.herd === herd.id).length; let maxOut = 0, seenTrack = false, minDeer = deer0;
for (let h = 0; h < 24 * 12; h++) { S.tick(s); const hs = s.hunters || []; maxOut = Math.max(maxOut, hs.length); if (hs.some(x => x.st === 'track')) seenTrack = true; minDeer = Math.min(minDeer, s.animals.filter(a => a.herd === herd.id).length); }
const herds = s.herds.map(h => s.animals.filter(a => a.herd === h.id).length);
console.log({ workers: lodge.workers, hunters: maxOut, seenTrack, hunted: s.stats.hunted || 0, meat: s.stats.meat || 0, deer0, minDeer, emptyHerds: herds.filter(n => n === 0).length });
// regrowth once the lodge is gone
S.applyCommand(s, { type: 'dismantle', x: lodge.x, y: lodge.y }); for (let i = 0; i < 4; i++) S.applyCommand(s, { type: 'skip', what: 'dismantle' });
const before = s.animals.length; for (let h = 0; h < 24 * 20; h++) S.tick(s); const after = s.animals.length;
console.log({ before, after, hunters: (s.hunters || []).length });
const ok = maxOut >= 1 && seenTrack && (s.stats.hunted || 0) >= 2 && (s.stats.meat || 0) > 0 && minDeer >= 1 && minDeer < deer0 && after > before;
console.log(ok ? 'PASS: hunting' : 'FAIL: hunting'); process.exit(ok ? 0 : 1);
