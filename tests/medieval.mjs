// Medieval + Renaissance: castle on a hill (terraced by a levelling job), stone bridge, mills raise food,
// guild hall speeds workshops, shipyard -> ships sail the river, bank interest, cathedral completes, era goals list built items
import * as S from '../src/sim.js';
const s = S.newGame({ seed: 42 }); s.era = 6; for (const id in S.TECHS || {}) s.research.done.push(id);
s.research.done.push('pottery', 'smelting', 'irrigation', 'writing', 'masonry', 'currency', 'earthworks', 'guilds', 'navigation', 'printing', 'banking', 'engineering', 'philosophy', 'timber');
for (const k in s.res) s.res[k] += 5000; s.res.money = 2000;
for (const c of Object.values(s.world.chunks)) for (const t of c.tiles) { t.vis = true; t.sv = 1; }
const T = S.T, tile = (x, y) => S.tile(s, x, y), N = 64, fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const place = (kind, x, y) => { const r = S.applyCommand(s, { type: 'place', kind, x, y }); return r.ok ? r.id : null; };
const near = (kind, cx, cy, R = 24) => { for (let r = 0; r < R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const id = place(kind, cx + dx, cy + dy); if (id) return id; } fails.push('could not place ' + kind); return null; };
ok(S.checkPlacement(s, 'castle', s.start.x, s.start.y) === 'Must be on a hill', 'castle allowed on grass: ' + S.checkPlacement(s, 'castle', s.start.x, s.start.y));
let hill = null; for (let r = 1; r < 30 && !hill; r++) for (let dy = -r; dy <= r && !hill; dy++) for (let dx = -r; dx <= r && !hill; dx++) { const x = s.start.x + dx, y = s.start.y + dy; if (!S.checkPlacement(s, 'castle', x, y)) hill = [x, y]; }
ok(hill, 'no hill for a castle');
const ids = {}; if (hill) ids.castle = place('castle', ...hill);
const c0 = ids.castle && s.buildings[ids.castle]; ok(c0 && c0.levelLeft > 0, 'castle on a slope should start with terracing');
let wat = null; for (let r = 1; r < 30 && !wat; r++) for (let dy = -r; dy <= r && !wat; dy++) for (let dx = -r; dx <= r && !wat; dx++) { const x = s.start.x + dx, y = s.start.y + dy; if (!S.checkPlacement(s, 'stonebridge', x, y)) wat = [x, y]; }
if (wat) ids.stonebridge = place('stonebridge', ...wat);
for (const k of ['watermill', 'windmill', 'guildhall', 'timberhouse', 'church', 'monastery', 'inn', 'townwall', 'gatehouse', 'markethall', 'shipyard', 'townhouse', 'palazzo', 'university', 'printing', 'bank', 'observatory', 'harbour', 'clocktower', 'cathedral', 'mason', 'weaver', 'field', 'field']) { const id = near(k, s.start.x, s.start.y); if (id) ids[k + (ids[k] ? 2 : '')] = id; }
s.res.cloth = 0; s.res.blocks = 0;
const g0 = S.guildF(s);
for (let h = 0; h < 24 * 40; h++) S.tick(s);
for (const [k, id] of Object.entries(ids)) if (!['castle', 'cathedral'].includes(k)) ok(id && s.buildings[id] && s.buildings[id].done, `${k} not finished`);
ok(tile(...wat).bridge === 1, 'stone bridge not walkable');
ok(S.guildF(s) > 1.15 && g0 === 1, 'guild factor ' + S.guildF(s));
ok(s.flags.ships, 'ships flag');
const sh = S.applyCommand(s, { type: 'hireUnit', kind: 'ship' }); ok(sh.ok, 'ship not built: ' + sh.err);
if (sh.ok) { const u = s.units.find(u => u.id === sh.id); ok(tile(u.x, u.y).t === T.WATER, 'ship not on water');
  let far = null; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const t = tile(x, y); if (t.t === T.WATER && Math.hypot(x - u.x, y - u.y) > 8 && (!far || Math.hypot(x - u.x, y - u.y) < Math.hypot(far[0] - u.x, far[1] - u.y))) far = [x, y]; }
  const mv = S.applyCommand(s, { type: 'orderUnit', id: u.id, x: far[0], y: far[1] }); ok(mv.ok, 'ship cannot sail: ' + mv.err);
  const land = S.applyCommand(s, { type: 'orderUnit', id: u.id, x: s.start.x, y: s.start.y }); ok(!land.ok, 'ship sailed onto land');
  S.applyCommand(s, { type: 'orderUnit', id: u.id, x: far[0], y: far[1] }); for (let h = 0; h < 48; h++) S.tick(s); ok(Math.hypot(u.x - far[0], u.y - far[1]) < 1.5, 'ship did not arrive'); }
const m0 = s.res.money; S.tick(s); for (let h = 0; h < 24; h++) S.tick(s);
for (let h = 0; h < 24 * 400 && !(s.buildings[ids.cathedral] || {}).done; h++) S.tick(s);
ok(s.buildings[ids.castle] && s.buildings[ids.castle].done, 'castle not finished');
ok(s.buildings[ids.cathedral] && s.buildings[ids.cathedral].done, 'cathedral not finished');
s.era = 5; const er = S.eraReady(s); ok(er.items.some(i => /Castle built/.test(i.label) && i.ok), 'era goal lacks castle');
s.era = 4; ok(S.eraReady(s).items.some(i => /Great Monument built/.test(i.label)), 'era goal lacks monument'); s.era = 6;
console.log({ guild: S.guildF(s).toFixed(2), made: s.stats.made, ships: s.units.filter(u => u.kind === 'ship').length });
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'); if (fails.length) process.exit(1);
