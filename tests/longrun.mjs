// 60-day Stone Age balance run: a simple "player" keeps adding homes, food and culture. Prints milestones.
import * as S from '../src/sim.js';
import { BUILDINGS } from '../src/data.js';
const afford = (s, cost) => Object.entries(cost).every(([k, v]) => (s.res[k] || 0) >= v);
const s = S.newGame({ seed: 7 }), c = (x) => S.applyCommand(s, x), { x, y } = s.start;
const plan = ['berryhut', 'tent', 'polehut', 'woodcutter', 'lodge', 'polehut', 'firepit', 'hut', 'quarry', 'berryhut', 'polehut', 'shrine', 'hunter', 'longhouse', 'claypit', 'stall', 'hut', 'stones', 'pen', 'timbercircle', 'polehut', 'hut', 'rack', 'well', 'greathall', 'hut', 'hut', 'cairn'];
let pi = 0, skips = 0; const log = [];
function tryPlace(k) { for (let r = 2; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (S.checkPlacement(s, k, x + dx, y + dy)) continue; const q = c({ type: 'place', kind: k, x: x + dx, y: y + dy }); if (q.ok) return q; } return null; }
const vs = () => s.units.filter(u => u.kind === 'villager');
for (let d = 1; d <= 60; d++) {
  for (let h = 0; h < 24; h++) {
    if (pi < plan.length) { const q = afford(s, BUILDINGS[plan[pi]].cost) ? tryPlace(plan[pi]) : null; if (!q && h === 12) { plan.push(plan.splice(pi, 1)[0]); skips++; } if (skips > 200) pi = plan.length; if (q) { pi++; const idle = vs().filter(u => u.vstate === 'idle').map(u => u.id); if (idle.length) { const b = s.buildings[q.id]; void ({ type: 'villagerTask', ids: idle.slice(0, 1), x: b.x, y: b.y }); } } }
    for (const u of vs()) if (u.vstate === 'idle' && !u.path.length) { for (let r = 1; r < 10; r++) { let done = false; for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { const f = S.featureAt(s, u.x + dx, u.y + dy); if (f === (s.res.food < 30 ? 'food' : s.res.stone < 20 ? 'stone' : 'wood')) { void ({ type: 'villagerTask', ids: [u.id], x: u.x + dx, y: u.y + dy }); done = true; } } if (done) break; } }
    S.tick(s);
  }
  if (d % 2 === 0 && s.res.food > 30) c({ type: 'trainVillager' });
  for (const inc of s.incidents) if (inc.stage === 'cleanup' && !inc.ordered) S.applyCommand(s, { type: 'cleanUp', id: inc.bid });
  if (!s.research.current) { for (const t of ['pottery', 'smelting']) if (!s.research.done.includes(t)) { { const rr = c({ type: 'research', tech: t }); if (!rr.ok) { pi = Math.min(pi, plan.length); skips = Math.min(skips, 2000); } if (!rr.ok) for (const it of S.researchCheck(s, t).items) if (!it.ok && it.build && !plan.slice(pi).includes(it.build) && !Object.values(s.buildings).some(b => b.kind === it.build)) plan.splice(pi, 0, it.build); } break; } }
  if (d % 5 === 0) log.push({ d, pop: S.popTotal(s), cap: S.housingCap(s), food: Math.floor(s.res.food), wood: Math.floor(s.res.wood), stone: Math.floor(s.res.stone), clay: Math.floor(s.res.clay), happy: s.happiness, cult: Math.floor(s.cult || 0), built: pi, cond: Math.round(s.condAvg), growth: s.growth.reason || 'ok', era: S.eraReady(s).items.filter(i => !i.ok).map(i => i.label).join('; '), col: s.stats.collapses, deaths: s.stats.deaths });
}
console.table(log);
