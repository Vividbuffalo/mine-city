// EARTH units: one shared movement + visibility system for every mobile thing that explores
// (today: scouts on foot; later: groups, workers, soldiers, horses, ships, vehicles, aircraft, satellites).
// Units are plain data in state.units, advanced once per sim tick (1 game hour). Each unit type defines speed,
// sight and per-terrain movement cost, so new transport eras are data, not new code. A unit's path is planned
// optimistically through unknown ground and re-planned when what it sees makes the path impossible. It reveals the
// map only where it physically is. Manual top-down control later is just giving small step destinations.
import { tile, reveal, T, SIZE, addLog, rand } from './sim.js';
const WCLASS = ['ford', 'shallow', 'deep'];

export const UNIT_TYPES = {
  scout: { name: 'Scout', era: 1, speed: 2.2, sight: 3, cost: { money: 25 }, max: 3, move: { 0: 1, 1: 1.7, 2: 2.0 } /* by tile type: grass, forest, hill */,
    water: { ford: 3, shallow: 4.5, deep: Infinity, canoe: 6 } /* wading cost by river class; deep needs a raft/boat/bridge */,
    drown: { ford: 0.002, shallow: 0.008 } /* chance per water tile crossed, no warning */, steepCost: 3.2 },
  villager: { name: 'Villager', era: 1, speed: 3, sight: 2, cost: {}, max: 99, move: { 0: 1, 1: 1.6, 2: 2.2 }, water: { ford: 3, shallow: 5, deep: Infinity, canoe: 6 }, drown: { ford: 0.001, shallow: 0.004 }, steepCost: 4, quiet: true },
  ship: { name: 'Ship', era: 5, speed: 3.5, sight: 5, cost: { money: 120, wood: 30 }, max: 3, needs: 'ships', move: { 0: Infinity, 1: Infinity, 2: Infinity }, water: { ford: 1.4, shallow: 1, deep: 1 }, steepCost: Infinity },
  // future rows: horse rider (speed ~6, sight 4), boat (water only), wagon party, plane (ignores terrain), satellite (orbit sweep)
};
const UNKNOWN_COST = 1.3; // planning cost through unexplored ground (the unit doesn't know what's there)

export function moveCost(state, ut, x, y, known = true) {
  const t = tile(state, x, y); if (!t) return Infinity;
  if (!t.vis && !known) return UNKNOWN_COST;
  if (!t.vis) return UNKNOWN_COST;
  if (t.t === T.WATER) { if (t.bridge) return 1; const w = ut.water || {}, c = w[WCLASS[t.wd ?? 2]] ?? Infinity; return c === Infinity && state.flags && state.flags.canoe ? (w.canoe ?? 6) : c; }
  let c = ut.move[t.t] ?? 1; if (t.t === T.HILL && t.h >= 2 && !t.lv) c = ut.steepCost ?? c;
  if (t.road) c *= 0.5; return c;
}
// A* over tiles, 8-neighbour, no corner cutting through impassable tiles
export function findPath(state, ut, sx, sy, tx, ty) {
  if (!tile(state, tx, ty) || moveCost(state, ut, tx, ty) === Infinity) return null;
  // binary-heap A* with per-call cost cache (fast enough for 128+ maps)
  const N = SIZE * SIZE, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N), cc = new Float32Array(N).fill(-1);
  const cost = (x, y) => { if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return Infinity; const k = y * SIZE + x; let c = cc[k]; if (c < 0) c = cc[k] = moveCost(state, ut, x, y); return c; };
  const hf = (x, y) => Math.hypot(x - tx, y - ty), hk = [], hv = [];
  const push = (k, f) => { let i = hk.length; hk.push(k); hv.push(f); while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= f) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = f; };
  const pop = () => { const k = hk[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { let i = 0; const n = hk.length; for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hv[c + 1] < hv[c]) c++; if (hv[c] >= lv) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = lk; hv[i] = lv; } return k; };
  const s0 = sy * SIZE + sx, t0 = ty * SIZE + tx; g[s0] = 0; push(s0, hf(sx, sy));
  let guard = 0;
  while (hk.length && guard++ < 30000) {
    const k = pop(); if (done[k]) continue; done[k] = 1;
    const x = k % SIZE, y = (k - x) / SIZE;
    if (k === t0) { const path = []; let q = k; while (q !== s0) { path.unshift([q % SIZE, Math.floor(q / SIZE)]); q = prev[q]; } return path; }
    const gc = g[k];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; const c = cost(nx, ny); if (c === Infinity) continue;
      if (dx && dy && (cost(x + dx, y) === Infinity || cost(x, y + dy) === Infinity)) continue;
      const nk = ny * SIZE + nx; if (done[nk]) continue; const ng = gc + c * (dx && dy ? Math.SQRT2 : 1);
      if (ng < g[nk]) { g[nk] = ng; prev[nk] = k; push(nk, ng + hf(nx, ny)); }
    }
  }
  return null;
}
function unitReveal(state, u) { const ut = UNIT_TYPES[u.kind], t = tile(state, Math.round(u.x), Math.round(u.y)); reveal(state, Math.round(u.x), Math.round(u.y), ut.sight + (t && t.t === T.HILL ? 1 : 0)); }

export function spawnUnit(state, kind, x, y) {
  state.units = state.units || []; const u = { id: state.nextId++, kind, x, y, px: x, py: y, path: [], dest: null, state: 'idle', dist: 0 };
  state.units.push(u); unitReveal(state, u); state.dirty.units = true; return u;
}
export function orderMove(state, u, tx, ty) {
  const path = findPath(state, UNIT_TYPES[u.kind], Math.round(u.x), Math.round(u.y), tx, ty);
  if (!path) return { ok: false, err: 'No known way to get there' };
  u.path = path; u.dest = [tx, ty]; u.state = path.length ? 'moving' : 'idle'; state.dirty.units = true; return { ok: true };
}
export function tickUnits(state, hours = 1) {
  if ((state.units || []).some(u => u.dead)) state.units = state.units.filter(u => !u.dead);
  for (const u of state.units || []) {
    u.px = u.x; u.py = u.y; if (!u.path.length) continue;
    const ut = UNIT_TYPES[u.kind]; let budget = ut.speed * hours * (u.kind === 'scout' && state.flags && state.flags.horses ? 1.7 : 1);
    while (budget > 1e-6 && u.path.length) {
      const [nx, ny] = u.path[0], c = moveCost(state, ut, nx, ny);
      if (c === Infinity) { const r = orderMove(state, u, u.dest[0], u.dest[1]); if (!r.ok) { u.path = []; u.state = 'blocked'; if (!ut.quiet) addLog(state, `${ut.name} found no way to (${u.dest[0]}, ${u.dest[1]}).`); } break; }
      const dx = nx - u.x, dy = ny - u.y, d = Math.hypot(dx, dy), need = d * c;
      if (need <= budget) {
        u.x = nx; u.y = ny; u.path.shift(); budget -= need; u.dist += d; unitReveal(state, u);
        const wt = tile(state, nx, ny);
        if (wt && wt.t === T.WATER && !wt.bridge && rand(state) < ((ut.drown || {})[WCLASS[wt.wd ?? 2]] || 0)) { u.dead = true; addLog(state, `${ut.name} #${u.id} was swept away crossing the river at (${nx}, ${ny}).`); break; }
      }
      else { const f = budget / need; u.x += dx * f; u.y += dy * f; u.dist += d * f; budget = 0; }
    }
    if (u.dead) { state.dirty.units = true; continue; }
    if (!u.path.length && u.state === 'moving') { u.state = 'arrived'; if (!ut.quiet) addLog(state, `${ut.name} reached (${u.dest[0]}, ${u.dest[1]}).`); }
  }
  if ((state.units || []).some(u => u.dead)) state.units = state.units.filter(u => !u.dead);
}
