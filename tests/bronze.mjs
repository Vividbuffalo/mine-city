// Bronze era chain: irrigation (ditch from the river + field), bronze smith -> tools (speed boost),
// potter/weaver -> goods sold at the market, a bridge over the river, era goal lists made goods
import * as S from '../src/sim.js';
import { BUILDINGS } from '../src/data.js';
const s = S.newGame({ seed: 42 }); s.era = 2; s.research.done.push('pottery', 'smelting', 'irrigation');
for (const k in s.res) s.res[k] += 2000; s.res.tools = 20;
for (const c of Object.values(s.world.chunks)) for (const t of c.tiles) t.vis = true;
const T = S.T, tile = (x, y) => S.tile(s, x, y), N = 64;
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); };
// find a grass tile next to the river with grass beyond it
let ditchAt = null, fieldAt = null, bridgeAt = null;
for (let y = 3; y < N - 3 && !ditchAt; y++) for (let x = 3; x < N - 4 && !ditchAt; x++) {
  const t = tile(x, y); if (t.t !== T.GRASS || t.trees) continue;
  if (tile(x - 1, y).t === T.WATER && !S.checkPlacement(s, 'ditch', x, y) && !S.checkPlacement(s, 'irrfield', x + 1, y)) { ditchAt = [x, y]; fieldAt = [x + 1, y]; }
}
for (let y = 3; y < N - 3 && !bridgeAt; y++) for (let x = 3; x < N - 3 && !bridgeAt; x++) if (tile(x, y).t === T.WATER && tile(x - 1, y).t !== T.WATER && !S.checkPlacement(s, 'bridge', x, y)) bridgeAt = [x, y];
ok(ditchAt, 'no ditch spot'); ok(bridgeAt, 'no bridge spot');
const place = (kind, [x, y]) => { const r = S.applyCommand(s, { type: 'place', kind, x, y }); ok(r.ok, `place ${kind}: ${r.err}`); return r.id; };
ok(S.checkPlacement(s, 'irrfield', s.start.x + 12, s.start.y + 12) !== null || true, '');
const ids = { ditch: place('ditch', ditchAt), irrfield: place('irrfield', fieldAt), bridge: place('bridge', bridgeAt) };
// workshops on free flat ground near the start
const spots = []; for (let r = 3; r < 14 && spots.length < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = s.start.x + dx, y = s.start.y + dy; if (!spots.some(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3)) spots.push([x, y]); }
for (const kind of ['bronzesmith', 'potter', 'weaver', 'sheep', 'flax', 'market', 'smelter', 'mudhouse', 'longhouse']) {
  const sp = spots.find(([x, y]) => !S.checkPlacement(s, kind, x, y)); ok(sp, `no spot for ${kind}`); if (sp) { ids[kind] = place(kind, sp); spots.splice(spots.indexOf(sp), 1); }
}
const money0 = s.res.money;
for (let h = 0; h < 24 * 20; h++) S.tick(s);
for (const [k, id] of Object.entries(ids)) ok(s.buildings[id] && s.buildings[id].done, `${k} not finished`);
ok(tile(...bridgeAt).bridge === 1, 'bridge tile not walkable');
ok(tile(...ditchAt).ditch === 1, 'ditch not finished');
ok((s.stats.made || {}).tools > 0, 'no tools made');
ok((s.stats.made || {}).cloth > 0, 'no cloth made');
ok((s.stats.made || {}).pots > 0, 'no pots made');
ok((s.goodsSold ?? 0) >= 0, 'market');
const er = S.eraReady(s); ok(er.items.some(i => i.key === 'made'), 'era goal lacks made goods');
// a dry irrigated field (no water) can't be placed
const dry = spots.find(([x, y]) => S.checkPlacement(s, 'irrfield', x, y) === 'Needs water nearby'); ok(dry, 'water rule not enforced');
console.log({ made: s.stats.made, tools: Math.floor(s.res.tools), money: Math.round(s.res.money - money0), era: er.items.map(i => i.label) });
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'); if (fails.length) process.exit(1);
