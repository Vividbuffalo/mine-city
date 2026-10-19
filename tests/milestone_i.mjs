// Milestone I sim checks: survey claims, tree marks, manual rubble cleanup, scout camp hiring, deep water, save version, new buildings.
import * as S from '../src/sim.js';
import { BUILDINGS } from '../src/data.js';
import { readFileSync } from 'fs';
const MSRC = readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
const fail = [], s = S.newGame({ seed: 7 }), c = (x) => S.applyCommand(s, x), { x, y } = s.start;
s.res.wood = s.res.stone = s.res.food = 999; s.res.money = 999;
const spot = (kind, r0 = 2) => { for (let r = r0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!S.checkPlacement(s, kind, x + dx, y + dy)) return [x + dx, y + dy]; };
for (let i = 0; i < 8; i++) { const p = spot('tent', 3); if (!p) break; const r = c({ type: 'place', kind: 'tent', x: p[0], y: p[1] }); if (r.ok) { const b = s.buildings[r.id]; b.done = true; b.progress = 1; b.residents = BUILDINGS.tent.cap; } }
// models exist for every building
for (const k of Object.keys(BUILDINGS)) if (!BUILDINGS[k].hidden && !new RegExp('\\n  ' + k + ': \\{ dims').test(MSRC)) fail.push('no model: ' + k);
// no free scout at start
if ((s.units || []).some(u => u.kind === 'scout')) fail.push('free scout at start');
// scouts need a camp
if (c({ type: 'hireUnit', kind: 'scout' }).ok) fail.push('scout hired without camp');
const [cx, cy] = spot('scoutcamp'); const camp = c({ type: 'place', kind: 'scoutcamp', x: cx, y: cy }); s.buildings[camp.id].done = true; s.buildings[camp.id].progress = 1;
const h1 = c({ type: 'hireUnit', kind: 'scout' }), h2 = c({ type: 'hireUnit', kind: 'scout' }), h3 = c({ type: 'hireUnit', kind: 'scout' });
if (!h1.ok || !h2.ok) fail.push('camp hire failed: ' + (h1.err || h2.err)); if (h3.ok) fail.push('camp capacity ignored');
// deep water impassable on foot
const sc = s.units.find(u => u.kind === 'scout'); let deep = null;
for (let yy = 0; yy < (s.world.size || 64) && !deep; yy++) for (let xx = 0; xx < (s.world.size || 64); xx++) { const t = S.tile(s, xx, yy); if (t && t.t === S.T.WATER && t.wd === 2) { deep = { t, x: xx, y: yy }; break; } }
if (!deep) fail.push('no deep water found'); if (deep) { deep.t.vis = 1; const r = S.applyCommand(s, { type: 'orderUnit', id: sc.id, x: deep.x, y: deep.y }); let wet = 0; for (let h = 0; h < 200; h++) { S.tick(s); const u = s.units.find(u => u.id === sc.id); if (u) { const t = S.tile(s, Math.round(u.x - 0.5), Math.round(u.y - 0.5)); const t2 = S.tile(s, Math.floor(u.x), Math.floor(u.y)); if (t2 && t2.t === S.T.WATER && t2.wd === 2 && !u.canoe) wet++; } } if (wet) fail.push('scout in deep water ' + wet + ' h (order ' + JSON.stringify(r) + ')'); const u = s.units.find(u => u.id === sc.id); if (u) { const t = S.tile(s, Math.round(u.x), Math.round(u.y)); if (t && t.t === S.T.WATER && t.wd === 2 && !u.canoe) fail.push('scout walked into deep water'); } }
// tree marks: marked tree is cut first, protected never
let wx, wy; { let best = 1e9; for (let yy = y - 18; yy <= y + 18; yy++) for (let xx = x - 18; xx <= x + 18; xx++) { if (S.checkPlacement(s, 'woodcutter', xx, yy)) continue; let n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = S.tile(s, xx + dx, yy + dy); if (t && t.trees) n++; } const sc = Math.hypot(xx - x, yy - y) - n * 2; if (n >= 4 && sc < best) { best = sc; wx = xx; wy = yy; } } } const wc = c({ type: 'place', kind: 'woodcutter', x: wx, y: wy }); const W = s.buildings[wc.id]; W.done = true; W.progress = 1; const R = BUILDINGS.woodcutter.radius;
const trees = []; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const t = S.tile(s, wx + dx, wy + dy); if (t && t.trees > 0 && !t.occ) trees.push([t, Math.max(Math.abs(dx), Math.abs(dy))]); }
trees.sort((a, b) => b[1] - a[1]);
if (trees.length >= 2) {
  const far = trees[0][0], near = trees[trees.length - 1][0], n0 = far.trees;
  if (!c({ type: 'markTree', x: far.x, y: far.y, v: 1, bid: wc.id }).ok) fail.push('mark failed');
  c({ type: 'markTree', x: near.x, y: near.y, v: 2, bid: wc.id }); const p0 = near.trees;
  for (let h = 0; h < 72; h++) S.tick(s);
  if (!(far.trees < n0 || far.tm === 1 && far.trees === 0)) fail.push('marked tree not cut first');
  if (near.trees !== p0) fail.push('protected tree was cut');
  if (c({ type: 'markTree', x: wx + R + 3, y: wy, v: 1, bid: wc.id }).ok) fail.push('mark outside reach allowed');
} else fail.push('no trees near woodcutter');
// survey claim: costs wood, blocks building inside, release frees it
s.research.done.push('prospecting'); const w0 = s.res.wood; const [sx, sy] = [x + 14, y + 14]; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const t = S.tile(s, sx + dx, sy + dy); if (t) t.vis = 1; }
const sv = c({ type: 'survey', x: sx, y: sy }); if (!sv.ok) fail.push('survey failed: ' + sv.err); else {
  if (s.res.wood !== w0 - 12) fail.push('survey did not cost wood');
  let blocked = false; for (let dy = -5; dy <= 5 && !blocked; dy++) for (let dx = -5; dx <= 5; dx++) if (S.checkPlacement(s, 'hut', sx + dx, sy + dy) === 'Survey claim') { blocked = true; break; }
  if (!blocked) fail.push('claim did not block building');
  for (let h = 0; h < 20; h++) S.tick(s); if (!S.tile(s, sx, sy).sv) fail.push('claim did not survey');
  c({ type: 'releaseClaim', id: sv.id }); if (S.tile(s, sx, sy).claim) fail.push('release failed');
}
// rubble stays until Clean Up; needs a crew building
const [hx, hy] = spot('hut'); const hut = c({ type: 'place', kind: 'hut', x: hx, y: hy }); const H = s.buildings[hut.id]; H.done = true; H.progress = 1;
const col = S.applyCommand(s, { type: 'dev', action: 'collapse', id: hut.id }); const inc = s.incidents.find(i => i.bid === hut.id);
if (!inc) fail.push('no rubble after collapse (' + JSON.stringify(col) + ')'); else {
  if (c({ type: 'cleanUp', id: hut.id }).ok) fail.push('cleanup without crew');
  for (let h = 0; h < 72; h++) S.tick(s); if (!s.incidents.find(i => i.bid === hut.id)) fail.push('rubble auto-cleared');
  const [lx, ly] = spot('lodge', 4); const lo = c({ type: 'place', kind: 'lodge', x: lx, y: ly }); s.buildings[lo.id].done = true; s.buildings[lo.id].progress = 1;
  for (let h = 0; h < 24; h++) S.tick(s);
  const cu = c({ type: 'cleanUp', id: hut.id }); if (!cu.ok) fail.push('cleanup refused: ' + cu.err);
  for (let h = 0; h < 120; h++) S.tick(s); const inc2 = s.incidents.find(i => i.bid === hut.id); if (inc2) fail.push('cleanup did not finish ' + JSON.stringify(inc2) + JSON.stringify(s.crews));
}
// save version
const sav = S.serialize(s); const o = JSON.parse(sav); o.version = 1; let msg = ''; try { S.deserialize(JSON.stringify(o)); } catch (e) { msg = e.message; } if (!/Old save not compatible/.test(msg)) fail.push('old save accepted: ' + msg);
console.log(fail.length ? 'FAIL milestone_i: ' + fail.join('; ') : 'PASS milestone_i'); if (fail.length) process.exit(1);
