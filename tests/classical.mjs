// Iron + Classical chains: iron ore pit on a found deposit -> bloomery (+ charcoal) -> iron; blacksmith -> iron tools;
// stonemason -> blocks -> stone houses; horse breeder (horses flag); aqueduct from the river + fountain waters homes;
// trading post trades with a met neighbouring town; library speeds research; the Great Monument completes.
import * as S from '../src/sim.js';
const s = S.newGame({ seed: 42 }); s.era = 4; s.research.done.push('pottery', 'smelting', 'irrigation', 'writing', 'masonry', 'currency');
for (const k in s.res) s.res[k] += 3000; s.res.ironore = 0; s.res.iron = 20; s.res.charcoal = 0;
for (const c of Object.values(s.world.chunks)) for (const t of c.tiles) { t.vis = true; t.sv = 1; }
const T = S.T, tile = (x, y) => S.tile(s, x, y), N = 64, fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const place = (kind, x, y) => { const r = S.applyCommand(s, { type: 'place', kind, x, y }); return r.ok ? r.id : null; };
const near = (kind, cx, cy, R = 20) => { for (let r = 0; r < R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const id = place(kind, cx + dx, cy + dy); if (id) return id; } fails.push('could not place ' + kind); return null; };
const ids = {};
// iron ore pit next to a known iron deposit
let ore = null; for (let y = 0; y < N && !ore; y++) for (let x = 0; x < N && !ore; x++) { const t = tile(x, y); if (t.dep && t.dep.r === 'ironore') ore = [x, y]; }
ok(ore, 'no iron ore on the map');
if (ore) ids.ironpit = near('ironpit', ore[0], ore[1], 4);
ok(S.checkPlacement(s, 'ironpit', s.start.x, s.start.y) !== null, 'iron pit allowed without ore');
// aqueduct chain from the river towards the start
let riv = null; for (let r = 1; r < 30 && !riv; r++) for (let dy = -r; dy <= r && !riv; dy++) for (let dx = -r; dx <= r && !riv; dx++) { const t = tile(s.start.x + dx, s.start.y + dy); if (t && t.t === T.WATER) riv = [s.start.x + dx, s.start.y + dy]; }
let aq = null; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = riv[0] + a, y = riv[1] + b; if (!aq && place('aqueduct', x, y)) aq = [x, y, a, b]; }
ok(aq, 'aqueduct not placeable by the river');
if (aq) { let [x, y, a, b] = aq; for (let i = 0; i < 3; i++) { x += a; y += b; place('aqueduct', x, y); } ids.fountain = near('fountain', x + a, y + b, 3); }
for (const k of ['charcoal', 'charcoal', 'bloomery', 'blacksmith', 'mason', 'stonehouse', 'horsefarm', 'vineyard', 'winepress', 'potter', 'tradepost', 'library', 'forum', 'insula', 'villa', 'baths', 'theatre', 'mint', 'monument', 'hillfort', 'stonewell']) { const id = near(k, s.start.x, s.start.y); if (id) ids[k + (ids[k] ? 2 : '')] = id; }
// meet the first town
const town = s.towns[0]; for (const p of town.houses) tile(p.x, p.y).vis = true;
s.res.blocks = s.res.wine = s.res.horses = s.res.charcoal = 0;
const money0 = s.res.money;
for (let h = 0; h < 24 * 30; h++) S.tick(s);
for (const [k, id] of Object.entries(ids)) if (k !== 'monument' && k !== 'baths') ok(id && s.buildings[id] && s.buildings[id].done, `${k} not finished`);
const m = s.stats.made || {};
ok(m.iron > 0, 'no iron'); ok(m.charcoal > 0, 'no charcoal'); ok(m.blocks > 0, 'no blocks'); ok(m.wine > 0, 'no wine'); ok(m.horses > 0, 'no horses');
ok(s.flags.ironTools, 'iron tools flag'); ok(s.flags.horses, 'horses flag');
ok(town.met, 'town not met'); ok(town.traded !== 0, 'no trade with the town');
for (let h = 0; h < 24 * 200 && !(s.buildings[ids.monument] || {}).done; h++) S.tick(s);
ok(s.buildings[ids.monument] && s.buildings[ids.monument].done, 'monument not finished in 230 days');
ok(s.log.some(l => /Great Monument is complete/.test(l.msg)), 'no monument log');
console.log({ made: m, towns: s.towns.map(t => [t.name, t.houses.length, t.met, Math.round(t.traded)]), health: s.health, water: s.waterFrac });
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'); if (fails.length) process.exit(1);
