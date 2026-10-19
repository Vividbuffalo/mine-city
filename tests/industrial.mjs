// Industrial skeleton: coal seams exist, colliery digs coal, steelworks makes steel, rail must form a line and a station
// must sit on it (trade), row houses house people, Machinery makes the bulldozer demolish instantly and earthworks fast
import * as S from '../src/sim.js';
import { TECHS, BUILDINGS } from '../src/data.js';
const s = S.newGame({ seed: 42 }); s.era = 7; for (const id in TECHS) s.research.done.push(id);
for (const k in s.res) s.res[k] += 5000; s.res.money = 5000;
for (const c of Object.values(s.world.chunks)) for (const t of c.tiles) { t.vis = true; t.sv = 1; }
const tile = (x, y) => S.tile(s, x, y), fails = [], ok = (c, m) => { if (!c) fails.push(m); };
const place = (kind, x, y) => { const r = S.applyCommand(s, { type: 'place', kind, x, y }); return r.ok ? r.id : null; };
const near = (kind, cx, cy, R = 30) => { for (let r = 0; r < R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const id = place(kind, cx + dx, cy + dy); if (id) return id; } fails.push('could not place ' + kind); return null; };
let coal = null, nc = 0; for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const t = tile(x, y); if (t.dep && t.dep.r === 'coal') { nc++; if (!coal || Math.hypot(x - s.start.x, y - s.start.y) < Math.hypot(coal[0] - s.start.x, coal[1] - s.start.y)) coal = [x, y]; } }
ok(nc > 20, 'few coal tiles: ' + nc);
const ids = {}; if (coal) ids.colliery = near('colliery', coal[0], coal[1], 6);
// a rail line east from a free row, then a station touching its end
let line = null; for (let r = 3; r < 25 && !line; r++) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) { const x0 = s.start.x + ox, y0 = s.start.y + oy; let fine = true; for (let i = 0; i < 6; i++) if (S.checkPlacement(s, 'rail', x0 + i, y0)) fine = false; if (fine) { line = [x0, y0]; break; } }
ok(line, 'no room for a rail line');
if (line) { for (let i = 0; i < 6; i++) ok(place('rail', line[0] + i, line[1]), 'rail ' + i);
  ok(S.checkPlacement(s, 'rail', line[0] + 3, line[1] + 5) === 'Must connect to a railway', 'detached rail allowed: ' + S.checkPlacement(s, 'rail', line[0] + 3, line[1] + 5));
  for (const [dx, dy] of [[6, 0], [6, -1], [0, 1], [2, 1], [0, -2], [3, -2]]) { if (!ids.station) ids.station = place('station', line[0] + dx, line[1] + dy); }
  ok(ids.station, 'station could not be placed next to the line'); }
for (const k of ['steelworks', 'textilemill', 'rowhouse', 'rowhouse']) { const id = near(k, s.start.x, s.start.y); if (id) ids[k + (ids[k] ? 2 : '')] = id; }
s.res.steel = 0; s.res.coal = 0; s.res.iron = 300;
for (let h = 0; h < 24 * 60; h++) S.tick(s);
for (const [k, id] of Object.entries(ids)) ok(id && s.buildings[id] && s.buildings[id].done, `${k} not finished`);
ok((s.stats.made || {}).steel > 0, 'no steel made: ' + JSON.stringify(s.stats.made));
ok((s.stats.made || {}).coal > 0 || s.res.coal > 0, 'no coal dug');
if (line) ok(tile(line[0] + 2, line[1]).rail === 1, 'rail flag');
// bulldozer: instant demolition with Machinery
const rh = ids.rowhouse; if (rh) { S.applyCommand(s, { type: 'dismantle', x: s.buildings[rh].x, y: s.buildings[rh].y }); S.tick(s); ok(!s.buildings[rh], 'bulldozer did not demolish instantly'); }
s.era = 6; ok(S.eraReady(s).items.some(i => /Cathedral built/.test(i.label)), 'era 6 goal lacks cathedral');
console.log({ coalTiles: nc, made: s.stats.made, res: { coal: Math.round(s.res.coal), steel: Math.round(s.res.steel) } });
console.log(fails.length ? 'FAIL ' + fails.join('; ') : 'PASS'); if (fails.length) process.exit(1);
// ---- trains: two stations on one line run a train; arrivals pay freight; nearby mine works faster
{
  const s2 = S.newGame({ seed: 42 }); s2.era = 7; for (const id in TECHS) s2.research.done.push(id); for (const k in s2.res) s2.res[k] += 5000; s2.res.money = 5000;
  for (const c of Object.values(s2.world.chunks)) for (const t of c.tiles) { t.vis = true; t.sv = 1; }
  const pl = (k, x, y) => { const r = S.applyCommand(s2, { type: 'place', kind: k, x, y }); return r.ok ? r.id : null; };
  let L = null; for (let r = 3; r < 28 && !L; r++) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) { const x0 = s2.start.x + ox, y0 = s2.start.y + oy; let fine = true;
    for (let i = -2; i < 12; i++) for (let j = -2; j <= 2; j++) { const t = S.tile(s2, x0 + i, y0 + j); if (!t || t.occ || t.t === 3 || t.t === 2) fine = false; } if (fine) { L = [x0, y0]; break; } }
  const f2 = []; if (!L) f2.push('no room for a two-station line');
  else { for (let i = 0; i < 10; i++) if (!pl('rail', L[0] + i, L[1])) f2.push('rail ' + i);
    const a = pl('station', L[0] + 1, L[1] - 2), b = pl('station', L[0] + 7, L[1] - 2); if (!a || !b) f2.push('stations ' + a + ' ' + b + ' ' + S.checkPlacement(s2, 'station', L[0] + 7, L[1] - 2));
    for (const bb of Object.values(s2.buildings)) if (!bb.done) S.applyCommand(s2, { type: 'skip', what: 'build', id: bb.id });
    for (const bb of Object.values(s2.buildings)) bb.workers = BUILDINGS[bb.kind].jobs || 0;
    const m0 = s2.res.money; for (let h = 0; h < 24 * 3; h++) S.tick(s2);
    if (!(s2.trains || []).length) f2.push('no train'); if (!(s2.stats.freight > 2)) f2.push('few arrivals ' + s2.stats.freight);
    if (!(s2.railIncome > 0)) f2.push('no freight income'); }
  console.log({ trains: (s2.trains || []).length, arrivals: s2.stats.freight, railIncome: Math.round(s2.railIncome || 0) });
  if (f2.length) { console.log('FAIL ' + f2.join('; ')); process.exit(1); } else console.log('PASS trains');
}
