// Railways: finished track tiles and stations form networks; each network with two or more working stations
// runs one train that shuttles station to station. Every arrival brings freight income, and workshops and
// mines near a served station work faster (raw materials and goods move by rail).
import { tile, addLog } from './sim.js';
import { BUILDINGS, RAIL } from './data.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const live = (b) => b && b.done && !b.ruin && !b.dis;
function stations(state) { return Object.values(state.buildings).filter(b => live(b) && BUILDINGS[b.kind] && BUILDINGS[b.kind].needsRail); }
// track tiles touching a station (where trains stop)
function stops(state, st) { const out = []; for (const [x, y] of st.tiles) for (const [a, c] of N4) { const t = tile(state, x + a, y + c); if (t && t.rail && !out.some(p => p[0] === x + a && p[1] === y + c)) out.push([x + a, y + c]); } return out; }
// BFS along finished track between two sets of stop tiles
function railPath(state, from, to) {
  const key = (x, y) => x + ',' + y, goal = new Set(to.map(p => key(...p))), prev = new Map(), q = [];
  for (const p of from) { prev.set(key(...p), null); q.push(p); }
  while (q.length) { const [x, y] = q.shift(); const k = key(x, y);
    if (goal.has(k)) { const path = []; let c = k; while (c) { const [a, b] = c.split(',').map(Number); path.unshift([a, b]); c = prev.get(c); } return path; }
    for (const [a, c] of N4) { const nx = x + a, ny = y + c, nk = key(nx, ny), t = tile(state, nx, ny); if (!t || !t.rail || prev.has(nk)) continue; prev.set(nk, k); q.push([nx, ny]); } }
  return null;
}
// rebuild routes when track or stations change (cheap: a few dozen tiles)
export function planRail(state) {
  const sts = stations(state), served = new Set(), routes = [];
  const used = new Set();
  for (const a of sts) { if (used.has(a.id)) continue; const group = [a]; used.add(a.id);
    for (const b of sts) if (!used.has(b.id) && railPath(state, stops(state, a), stops(state, b))) { group.push(b); used.add(b.id); }
    if (group.length > 1) { routes.push(group.map(b => b.id)); group.forEach(b => served.add(b.id)); } }
  state.rail = { routes, served: [...served], sig: railSig(state) };
  // one train per route; keep existing trains on routes that still exist
  state.trains = (state.trains || []).filter(tr => routes.some(r => r.join() === tr.route.join()));
  for (const r of routes) if (!state.trains.some(tr => tr.route.join() === r.join())) state.trains.push({ id: state.nextId++, route: r, leg: 0, path: null, pos: 0, wait: 2, px: 0, py: 0, x: 0, y: 0 });
}
function railSig(state) { let n = 0, s = 0; for (const b of Object.values(state.buildings)) if (live(b) && BUILDINGS[b.kind] && (BUILDINGS[b.kind].rail || BUILDINGS[b.kind].needsRail)) { n++; s = (s * 31 + b.id) % 1e9; } return n + ':' + s; }
// hourly
export function tickRail(state) {
  if (!state.rail || state.rail.sig !== railSig(state)) planRail(state);
  for (const tr of state.trains || []) {
    tr.px = tr.x; tr.py = tr.y;
    if (tr.wait > 0) { tr.wait--; continue; }
    if (!tr.path) { const a = state.buildings[tr.route[tr.leg % tr.route.length]], b = state.buildings[tr.route[(tr.leg + 1) % tr.route.length]];
      tr.path = a && b ? railPath(state, stops(state, a), stops(state, b)) : null; tr.pos = 0; if (!tr.path) { tr.wait = 6; tr.leg++; continue; } }
    tr.pos = Math.min(tr.path.length - 1, tr.pos + RAIL.speed);
    const i = Math.floor(tr.pos), f = tr.pos - i, p0 = tr.path[i], p1 = tr.path[Math.min(tr.path.length - 1, i + 1)];
    tr.x = p0[0] + (p1[0] - p0[0]) * f; tr.y = p0[1] + (p1[1] - p0[1]) * f;
    if (tr.pos >= tr.path.length - 1) { // arrived: freight
      const pay = RAIL.base + RAIL.perTile * tr.path.length; state.res.money += pay; state.stats.freight = (state.stats.freight || 0) + 1; state.railIncome = (state.railIncome || 0) + pay;
      if (state.stats.freight === 1) addLog(state, 'The first train has arrived.');
      tr.leg++; tr.path = null; tr.wait = RAIL.stopHours; }
  }
  state.dirty.trains = true;
}
// production factor for a building near a served station
export function railF(state, b) {
  if (!state.rail || !state.rail.served.length) return 1;
  for (const id of state.rail.served) { const s = state.buildings[id]; if (s && Math.hypot(s.x - b.x, s.y - b.y) <= RAIL.radius) return 1 + RAIL.boost; }
  return 1;
}
