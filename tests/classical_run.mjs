// Stone -> Bronze -> Iron -> Classical balance run: a simple "player" keeps adding homes, food and culture. Prints milestones.
import * as S from '../src/sim.js';
import { BUILDINGS } from '../src/data.js';
const afford = (s, cost) => Object.entries(cost).every(([k, v]) => (s.res[k] || 0) >= v);
const s = S.newGame({ seed: 7, size: +(process.env.MAP || 64) }), c = (x) => S.applyCommand(s, x), { x, y } = s.start;
const plan = ['berryhut', 'tent', 'polehut', 'woodcutter', 'polehut', 'firepit', 'hut', 'quarry', 'berryhut', 'polehut', 'shrine', 'hunter', 'longhouse', 'claypit', 'stall', 'hut', 'stones', 'pen', 'timbercircle', 'polehut', 'hut', 'rack', 'well', 'greathall', 'hut', 'hut', 'cairn', 'claypit', 'kiln', 'orepit', 'claypit', 'orepit', 'kiln', 'tradepost', 'smelter', 'mudhouse', 'granary', 'ditch', 'irrfield', 'mudhouse', 'bronzesmith', 'potter', 'sheep', 'flax', 'weaver', 'market', 'mudhouse', 'oven', 'mudhouse', 'tower', 'temple', 'mudhouse', 'mound', 'statue', 'mudhouse', 'irrfield', 'mudhouse', 'brickhouse', 'mudhouse', 'store', 'mudhouse', 'mudhouse', 'charcoal', 'ironpit', 'charcoal', 'bloomery', 'ironpit', 'mason', 'blacksmith', 'stonehouse', 'mason', 'stonehouse', 'tradepost', 'stonehouse', 'horsefarm', 'stonewell', 'vineyard', 'winepress', 'stonehouse', 'hillfort', 'stonehouse', 'stonehouse', 'stonewall', 'stonewall', 'stonehouse', 'stonehouse', 'stonehouse', 'temple', 'stonehouse', 'stonehouse', 'stonehouse'];
let pi = 0, skips = 0; const log = [];
function tryPlace(k) { for (let r = 2; r < (k === 'orepit' || k === 'ironpit' || k === 'ditch' || k === 'irrfield' ? 30 : 14); r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (S.checkPlacement(s, k, x + dx, y + dy)) continue; const q = c({ type: 'place', kind: k, x: x + dx, y: y + dy }); if (q.ok) return q; } return null; }
const vs = () => s.units.filter(u => u.kind === 'villager');
for (let d = 1; d <= 300 && s.era < 4; d++) {
  for (let h = 0; h < 24; h++) {
    if (pi < plan.length) { const q = afford(s, BUILDINGS[plan[pi]].cost) ? tryPlace(plan[pi]) : null; if (!q && h === 12) { plan.push(plan.splice(pi, 1)[0]); skips++; } if (skips > 3000) pi = plan.length; if (q) { pi++; const idle = vs().filter(u => u.vstate === 'idle').map(u => u.id); if (idle.length) { const b = s.buildings[q.id]; c({ type: 'villagerTask', ids: idle.slice(0, 1), x: b.x, y: b.y }); } } }
    for (const u of vs()) if (u.vstate === 'idle' && !u.path.length) { for (let r = 1; r < 10; r++) { let done = false; for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { const f = S.featureAt(s, u.x + dx, u.y + dy); if (f === (s.res.food < 30 ? 'food' : s.res.stone < 20 ? 'stone' : 'wood')) { c({ type: 'villagerTask', ids: [u.id], x: u.x + dx, y: u.y + dy }); done = true; } } if (done) break; } }
    S.tick(s);
  }
  if (d % 2 === 0 && s.res.food > 30) c({ type: 'trainVillager' });
  // the player explores outward with scouts over time (stand-in: reveal a growing ring)
  if (d % 3 === 0) { const a = d * 0.7, r = Math.min(26, 6 + d * 0.4); S.reveal(s, Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 5); }
  if (!s.research.current) { for (const t of ['pottery', 'smelting', 'writing', 'irrigation', 'prospecting', 'ironworking', 'masonry', 'currency']) if (!s.research.done.includes(t)) { c({ type: 'research', tech: t }); break; } }
  if (d % 5 === 0) log.push({ d, pop: S.popTotal(s), cap: S.housingCap(s), food: Math.floor(s.res.food), wood: Math.floor(s.res.wood), stone: Math.floor(s.res.stone), clay: Math.floor(s.res.clay), happy: s.happiness, cult: Math.floor(s.cult || 0), built: pi, cond: Math.round(s.condAvg), growth: s.growth.reason || 'ok', era: s.era + ' ' + S.eraReady(s).items.filter(i => !i.ok).map(i => i.label).join('; '), col: s.stats.collapses, deaths: s.stats.deaths });
}
console.table(log); { const kc = {}; for (const b of Object.values(s.buildings)) if (b.done && !b.ruin) kc[b.kind] = (kc[b.kind] || 0) + 1; console.log(JSON.stringify(kc), "pending:", plan.slice(pi).join(",")); } if (process.env.LOG) console.log(s.log.filter(l => /collap|fell|killed|died|gave way|sank/i.test(l.msg)).map(l => l.msg).slice(0, 60).join("\n"));
const eraDay = log.find(l => l.era >= 2), ironDay = log.find(l => l.era >= 3), classDay = log.find(l => l.era >= 4);
console.log("Bronze by day", eraDay ? eraDay.d : "?");
if (s.era < 4) { console.log("FAIL: Classical era not reached", JSON.stringify(S.eraReady(s).items.map(i => i.label + (i.ok ? ' ok' : ''))), JSON.stringify(s.res)); process.exit(1); }
console.log("PASS: Classical era reached by day", log[log.length - 1].d);
