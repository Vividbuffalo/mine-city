// Node sim test reproducing Isaac's v2.1 report: many huts + a woodcutter, no roads -> "no free workers".
// Run: node tests/isaac.mjs   (from the repo root, with ../game/src next to it)
import * as S from '../src/sim.js';
const s = S.newGame({ seed: 42 }), c = (x) => S.applyCommand(s, x), { x, y } = s.start;
s.manualVillagers = true; // this test drives villagers itself
const placed = [];
// Isaac's case: woodcutter next to trees + many huts, no roads at all
let wc = null; for (let r = 2; r < 10 && !wc; r++) for (let dy = -r; dy <= r && !wc; dy++) for (let dx = -r; dx <= r; dx++) { if (S.checkPlacement(s, 'woodcutter', x + dx, y + dy)) continue; let n = 0; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const t = S.tile(s, x + dx + a, y + dy + b); if (t) n += t.trees; } if (n > 20) { wc = c({ type: 'place', kind: 'woodcutter', x: x + dx, y: y + dy }); break; } }
for (let i = 0; i < 12 && placed.length < 5; i++) { const r = c({ type: 'place', kind: i % 2 ? 'polehut' : 'tent', x: x - 3 + (i % 4) * 2, y: y + 3 + Math.floor(i / 4) * 2 }); if (r.ok) placed.push(r.id); }
const out = { placed: placed.length, wood0: s.res.wood };
for (let d = 1; d <= 4; d++) { for (let h = 0; h < 24; h++) S.tick(s); const w = s.buildings[wc.id]; out['day' + d] = { pop: S.popTotal(s), cap: S.housingCap(s), free: s.unemployed, wcWorkers: w.workers, wood: Math.floor(s.res.wood), food: Math.floor(s.res.food), happy: s.happiness, F: s.happyF, grief: s.grief, deaths: s.stats.deaths, col: s.stats.collapses, growth: s.growth }; }
// villagers gather berries / wood
const vs = s.units.filter(u => u.kind === 'villager').map(u => u.id);
let tree = null, berry = null; for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = S.tile(s, x + dx, y + dy); if (!t || !t.vis) continue; if (!tree && t.trees > 0 && !t.occ) tree = [x + dx, y + dy]; if (!berry && t.berry > 0) berry = [x + dx, y + dy]; }
const w0 = s.res.wood, f0 = s.res.food;
out.task1 = c({ type: 'villagerTask', ids: vs.slice(0, 2), x: tree[0], y: tree[1] });
out.task2 = berry ? c({ type: 'villagerTask', ids: vs.slice(2), x: berry[0], y: berry[1] }) : 'no berry';
for (let h = 0; h < 48; h++) S.tick(s);
out.villagerStates = s.units.filter(u => u.kind === 'villager').map(u => u.vstate + ':' + (u.carry ? u.carry.n.toFixed(1) : 0));
out.gathered = Math.round(s.stats.gathered || 0);
out.train = c({ type: 'trainVillager' }); out.villagers = s.units.filter(u => u.kind === 'villager').length;
out.era = S.eraReady(s).items.map(i => i.label);
console.log(JSON.stringify(out, null, 1));
const fail = [];
if (out.day1.wcWorkers < 1) fail.push('woodcutter unstaffed on day 1');
if (out.day2.pop < 10) fail.push('housing did not fill by day 2');
if (!(out.day2.free > 0)) fail.push('no free workers on day 2');
if (!out.day2.growth.ok) fail.push('growth paused on day 2: ' + out.day2.growth.reason);
if (!out.task1.ok || out.gathered < 20) fail.push('villagers did not gather');
if (!out.train.ok) fail.push('training failed: ' + out.train.err);
if (fail.length) { console.error('FAIL', fail); process.exit(1); } else console.log('PASS');
