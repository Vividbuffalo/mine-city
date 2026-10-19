// EARTH units: one shared movement + visibility system for every mobile thing that explores
// (today: scouts on foot; later: groups, workers, soldiers, horses, ships, vehicles, aircraft, satellites).
// Units are plain data in state.units, advanced once per sim tick (1 game hour). Each unit type defines speed,
// sight and per-terrain movement cost, so new transport eras are data, not new code. A unit's path is planned
// optimistically through unknown ground and re-planned when what it sees makes the path impossible. It reveals the
// map only where it physically is. Manual top-down control later is just giving small step destinations.
import { tile, reveal, T, SIZE, addLog, rand } from './sim.js';
import { BUILDINGS } from './data.js';
const WCLASS = ['ford', 'shallow', 'deep'];

export const UNIT_TYPES = {
  scout: { name: 'Scout', era: 1, speed: 2.2, sight: 3, cost: { money: 25 }, max: 3, move: { 0: 1, 1: 1.7, 2: 2.0 } /* by tile type: grass, forest, hill */,
    water: { ford: 3, shallow: 4.5, deep: Infinity } /* wading cost by river class; deep water needs a canoe, boat or bridge */,
    drown: { ford: 0.002, shallow: 0.008 } /* chance per water tile crossed, no warning */, steepCost: 3.2 },
  villager: { name: 'Villager', era: 1, quiet: true, speed: 3, sight: 2, cost: {}, max: 99, move: { 0: 1, 1: 1.6, 2: 2.2 }, water: { ford: 3, shallow: 5, deep: Infinity }, drown: { ford: 0.001, shallow: 0.004 }, steepCost: 4, quiet: true },
  ship: { name: 'Ship', era: 5, speed: 3.5, sight: 5, cost: { money: 120, wood: 30 }, max: 3, needs: 'ships', move: { 0: Infinity, 1: Infinity, 2: Infinity }, water: { ford: 1.4, shallow: 1, deep: 1 }, steepCost: Infinity },
  // a scout paddling a canoe: fast on any water, carries the canoe over land (portage)
  canoeist: { name: 'Scout', era: 1, speed: 2.2, sight: 3, cost: {}, max: 0, move: { 0: 2.6, 1: 3.6, 2: 4.2 }, water: { ford: 0.75, shallow: 0.7, deep: 0.8 }, steepCost: 7 },
  // future rows: horse rider (speed ~6, sight 4), boat (water only), wagon party, plane (ignores terrain), satellite (orbit sweep)
};
export const CANOE = { buildHours: 36, wood: 6, wear: 1.2 /* hp per tile paddled (100 hp) */, drownDeep: 0.7, drownShallow: 0.15 };
// scouts carry supplies from their camp: away from it they run down, risk grows with distance and with time out; at camp they restock
export const SCOUT = { supplies: 96, home: 2.5, riskPerTile: 0.00012, starve: 0.03, idleReturn: 12 };
export function utOf(u) { return u.kind === 'scout' && u.canoe ? UNIT_TYPES.canoeist : UNIT_TYPES[u.kind]; }
const UNKNOWN_COST = 1.3; // planning cost through unexplored ground (the unit doesn't know what's there)

// real = the ground as it actually is (used when stepping: a unit never walks into deep water it hadn't seen)
export function moveCost(state, ut, x, y, known = true, real = false) {
  const t = tile(state, x, y); if (!t) return Infinity;
  if (!t.vis && !real) return UNKNOWN_COST;
  if (t.t === T.WATER) { if (t.bridge) return 1; const w = ut.water || {}; return w[WCLASS[t.wd ?? 2]] ?? Infinity; }
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
  const path = findPath(state, utOf(u), Math.round(u.x), Math.round(u.y), tx, ty);
  if (!path) return { ok: false, err: 'No known way to get there' };
  u.path = path; u.dest = [tx, ty]; u.state = path.length ? 'moving' : 'idle'; state.dirty.units = true; return { ok: true };
}
export function tickUnits(state, hours = 1) {
  if ((state.units || []).some(u => u.dead)) state.units = state.units.filter(u => !u.dead);
  for (const u of state.units || []) {
    u.px = u.x; u.py = u.y; if (!u.path.length) continue;
    const ut = utOf(u); let budget = ut.speed * hours * (u.kind === 'scout' && state.flags && state.flags.horses ? 1.7 : 1);
    while (budget > 1e-6 && u.path.length) {
      const [nx, ny] = u.path[0], c = moveCost(state, ut, nx, ny, true, true);
      if (c === Infinity) { const r = orderMove(state, u, u.dest[0], u.dest[1]); if (!r.ok) { u.path = []; u.state = 'blocked'; if (!ut.quiet) addLog(state, `${ut.name} found no way to (${u.dest[0]}, ${u.dest[1]}).`); } break; }
      const dx = nx - u.x, dy = ny - u.y, d = Math.hypot(dx, dy), need = d * c;
      if (need <= budget) {
        u.x = nx; u.y = ny; u.path.shift(); budget -= need; u.dist += d; unitReveal(state, u);
        const wt = tile(state, nx, ny);
        if (u.canoe && wt && wt.t === T.WATER && !wt.bridge) { u.canoe.hp -= CANOE.wear * d; if (u.canoe.hp <= 0) { const deep = (wt.wd ?? 2) >= 2; u.canoe = null; if (rand(state) < (deep ? CANOE.drownDeep : CANOE.drownShallow)) { u.dead = true; addLog(state, `Scout #${u.id} drowned when the canoe broke up at (${nx}, ${ny}).`); break; } addLog(state, `A canoe broke up at (${nx}, ${ny}); the scout swam ashore.`); const r = orderMove(state, u, u.dest[0], u.dest[1]); if (!r.ok) { u.path = []; u.state = 'blocked'; } break; } }
        if (!u.canoe && wt && wt.t === T.WATER && !wt.bridge && rand(state) < ((ut.drown || {})[WCLASS[wt.wd ?? 2]] || 0)) { u.dead = true; addLog(state, `${ut.name} #${u.id} was swept away crossing the river at (${nx}, ${ny}).`); break; }
      }
      else { const f = budget / need; u.x += dx * f; u.y += dy * f; u.dist += d * f; budget = 0; }
    }
    if (u.dead) { state.dirty.units = true; continue; }
    if (!u.path.length && u.state === 'moving') { u.state = 'arrived'; if (!ut.quiet) addLog(state, `${ut.name} reached (${u.dest[0]}, ${u.dest[1]}).`); }
  }
  if ((state.units || []).some(u => u.dead)) state.units = state.units.filter(u => !u.dead);
}

// ---------- scouts: supplies, risk, return home; canoes ----------
export function tickScouts(state) {
  for (const u of state.units || []) {
    if (u.kind !== 'scout' || u.dead) continue;
    const camp = state.buildings[u.home]; if (!camp || !camp.done || camp.ruin) { const c = Object.values(state.buildings).find(b => b.kind === 'scoutcamp' && b.done && !b.ruin); u.home = c ? c.id : null; }
    const h = state.buildings[u.home], hx = h ? h.x : state.start.x, hy = h ? h.y : state.start.y, d = Math.hypot(u.x - hx, u.y - hy);
    if (u.supplies === undefined) u.supplies = SCOUT.supplies;
    if (d <= SCOUT.home) { u.supplies = SCOUT.supplies; u.idle = 0; continue; }
    u.supplies = Math.max(0, u.supplies - 1);
    const risk = SCOUT.riskPerTile * d * (1 + (SCOUT.supplies - u.supplies) / SCOUT.supplies) + (u.supplies <= 0 ? SCOUT.starve : 0);
    if (rand(state) < risk) { u.dead = true; state.stats.deaths++; addLog(state, `Scout #${u.id} died ${u.supplies <= 0 ? 'of exposure' : 'in the wilds'} at (${Math.round(u.x)}, ${Math.round(u.y)}).`); state.dirty.units = true; continue; }
    // idle in the field for a while: head back to camp and wait there
    if (!u.path.length) { u.idle = (u.idle || 0) + 1; if (u.idle >= SCOUT.idleReturn) { u.idle = 0; const r = orderMove(state, u, hx, hy); if (r.ok) u.returning = true; } } else u.idle = 0;
  }
  if ((state.units || []).some(u => u.dead)) state.units = state.units.filter(u => !u.dead);
  // canoe makers build canoes over time while staffed
  for (const b of Object.values(state.buildings)) { const d = BUILDINGS[b.kind]; if (!d || !d.canoes || !b.done || b.ruin) continue;
    b.canoesN = b.canoesN || 0; if (b.canoesN >= d.canoes || !(b.workers > 0)) continue;
    b.canoeAcc = (b.canoeAcc || 0) + b.workers / (d.jobs || 1); if (b.canoeAcc >= CANOE.buildHours && (state.res.wood || 0) >= CANOE.wood) { b.canoeAcc = 0; state.res.wood -= CANOE.wood; b.canoesN++; state.dirty.buildings = true; } }
}
export const SCOUT_COMMANDS = {
  boardCanoe(state, { id }) {
    const u = (state.units || []).find(x => x.id === id && x.kind === 'scout'); if (!u) return { ok: false };
    if (u.canoe) { const b = canoeMakerNear(state, u, 3); if (b) b.canoesN = Math.min(BUILDINGS[b.kind].canoes, (b.canoesN || 0) + 1); u.canoe = null; return { ok: true, left: true }; }
    const b = canoeMakerNear(state, u, 3, true); if (!b) return { ok: false, err: 'No canoe' };
    b.canoesN--; u.canoe = { hp: 100 }; state.dirty.buildings = true; return { ok: true };
  },
};
export function canoeMakerNear(state, u, r, needCanoe = false) { for (const b of Object.values(state.buildings)) { const d = BUILDINGS[b.kind]; if (d && d.canoes && b.done && !b.ruin && Math.hypot(b.x - u.x, b.y - u.y) <= r && (!needCanoe || (b.canoesN || 0) > 0)) return b; } return null; }
