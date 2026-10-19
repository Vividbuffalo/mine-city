// Villagers: selectable workers on the shared unit/movement layer (units.js). Data-driven via GATHER / VILLAGER (data.js).
// Jobs: gather (walk to a tree / stone outcrop / clay bank / berry bush, work it, carry a load to the nearest store, repeat
// on nearby resources of the same kind) and build (walk to a construction site and speed it up). Ticked once per game hour.
import { tile, T, addLog, knownDeposit, rand, footprint, matAllowed } from './sim.js';
import { GATHER, VILLAGER, BUILDINGS, HORSES } from './data.js';
// with horses and carts villagers carry bigger loads
const vload = (state) => VILLAGER.load * (state.flags && state.flags.horses && state.flags.carts ? HORSES.cartLoad : 1);
import { orderMove } from './units.js';

// which resource a tile offers to a villager, if any
export function featureAt(state, x, y) {
  const t = tile(state, x, y); if (!t || !t.vis) return null;
  if (t.trees > 0) return 'wood';
  if (t.berry > 0) return 'food';
  if (knownDeposit(t) && t.dep.r === 'clay') return 'clay';
  if (t.t === T.HILL && !t.occ && (t.rock ?? 20) > 0) return 'stone'; // exposed rock: loose stone can be broken off hills (finite per tile)
  if (knownDeposit(t) && t.dep.r === 'stone') return 'stone';
  return null;
}
const isVillager = (u) => u.kind === 'villager';
export const villagers = (state) => (state.units || []).filter(isVillager);
export function maxVillagers(state, pop) { return VILLAGER.startCount + Math.floor(pop / VILLAGER.perPop); }
function dist(u, x, y) { return Math.hypot(u.x - x, u.y - y); }
function stores(state) { return Object.values(state.buildings).filter(b => b.done && !b.ruin && BUILDINGS[b.kind] && BUILDINGS[b.kind].store); }
function nearestStore(state, u) { let best = null, bd = Infinity; for (const b of stores(state)) { const d = dist(u, b.x, b.y); if (d < bd) { bd = d; best = b; } } return best; }
function findNearby(state, res, x, y, r = 6) {
  let best = null, bd = Infinity;
  for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
    if (featureAt(state, xx, yy) !== res) continue; const d = Math.hypot(xx - x, yy - y); if (d < bd) { bd = d; best = [xx, yy]; }
  }
  return best;
}
function go(state, u, x, y) { const r = orderMove(state, u, x, y); if (!r.ok) { u.vstate = 'idle'; u.job = null; u.info = 'No way there'; return false; } return true; }
function gatherBonus(state) { let m = 1; for (const b of Object.values(state.buildings)) { const d = BUILDINGS[b.kind]; if (b.done && !b.ruin && d && d.gatherMult && b.workers) m += d.gatherMult * (b.workers / d.jobs); } return Math.min(1.6, m); }

// take `amt` of resource from the feature at (x, y); returns what was actually taken
function takeFrom(state, res, x, y, amt) {
  const t = tile(state, x, y);
  if (res === 'wood') {
    if (!(t.trees > 0)) return 0;
    t.chop = (t.chop || 0) + amt;
    if (t.chop >= 6) { t.chop = 0; t.trees--; t.stumps = Math.min(4, (t.stumps || 0) + 1); state.fellN = (state.fellN || 0) + 1; (state.felled = state.felled || []).push([x, y, t.trees, state.fellN]); if (state.felled.length > 40) state.felled.shift(); state.dirty.trees = true; }
    return amt;
  }
  if (res === 'food') { const a = Math.min(amt, t.berry || 0); const b0 = Math.ceil(t.berry / 6); t.berry -= a; if (t.berry <= 0.01) t.berry = 0; if (Math.ceil(t.berry / 6) !== b0) state.dirty.berries = true; return a; }
  if (t.dep && t.dep.r === res && t.dep.amt > 0) { const a = Math.min(amt, t.dep.amt); t.dep.amt -= a; if (t.dep.amt <= 0) { t.dep.amt = 0; state.dirty.under = true; } return a; }
  if (res === 'stone' && t.t === T.HILL) { const a = Math.min(amt, t.rock ?? 40); t.rock = (t.rock ?? 20) - a; return a; }
  return 0;
}

export const VILLAGER_COMMANDS = {
  // send villagers to work a resource tile (or to build if the tile holds an unfinished building, or just walk there)
  villagerTask(state, { ids, x, y }) {
    const list = (state.units || []).filter(u => ids.includes(u.id) && isVillager(u)); if (!list.length) return { ok: false, err: 'No villagers selected' };
    const t = tile(state, x, y); if (!t) return { ok: false };
    const b = t.occ && state.buildings[t.occ];
    if (b && !b.done && !b.ruin && !b.dis) { for (const u of list) { const prev = u.job && u.job.type === 'gather' ? u.job : u.job && u.job.prev; u.job = { type: 'build', id: b.id, prev };  u.info = ''; go(state, u, b.x, b.y); } return { ok: true, task: 'build' }; }
    const res = featureAt(state, x, y);
    if (res) { list.forEach((u, i) => { let tx = x, ty = y; if (i) { const alt = findNearby(state, res, x + (i % 2 ? 1 : -1), y + (i > 1 ? 1 : 0), 2); if (alt) [tx, ty] = alt; } if (u.carry && u.carry.res !== res) u.carry = null; u.job = { type: 'gather', res, x: tx, y: ty }; u.info = ''; go(state, u, tx, ty); }); return { ok: true, task: res }; }
    for (const u of list) { u.job = null; u.vstate = 'idle'; go(state, u, x, y); } return { ok: true, task: 'move' };
  },
  trainVillager(state) {
    const camp = Object.values(state.buildings).find(b => b.kind === 'camp' && b.done && !b.ruin); if (!camp) return { ok: false, err: 'Needs a finished Gathering Camp' };
    const pop = popOf(state), n = villagers(state).length;
    if (n >= maxVillagers(state, pop)) return { ok: false, err: `Villagers: ${n} / ${maxVillagers(state, pop)}` };
    if ((state.unemployed || 0) < 1) return { ok: false, err: 'No free adult to train' };
    const cost = VILLAGER.trainCost; for (const k in cost) if ((state.res[k] || 0) < cost[k]) return { ok: false, err: 'Not enough ' + k };
    const home = Object.values(state.buildings).find(b => b.residents > 0); if (!home) return { ok: false, err: 'No free adult to train' };
    for (const k in cost) state.res[k] -= cost[k];
    home.residents--; state.unemployed--;
    const u = spawnVillager(state, camp.x, camp.y); addLog(state, `A villager was trained at the camp.`); return { ok: true, id: u.id };
  },
};
function popOf(state) { let p = 0; for (const b of Object.values(state.buildings)) p += b.residents || 0; return p + villagers(state).length; }
export function spawnVillager(state, x, y) {
  state.units = state.units || []; const u = { id: state.nextId++, kind: 'villager', x, y, px: x, py: y, path: [], dest: null, state: 'idle', dist: 0, vstate: 'idle', job: null, carry: null, info: '' };
  state.units.push(u); state.dirty.units = true; return u;
}

export function tickVillagers(state) {
  const bonus = gatherBonus(state);
  for (const u of state.units || []) {
    if (!isVillager(u)) continue;
    const j = u.job; if (u.path.length) { u.vstate = u.carry && u.carry.site ? 'hauling' : u.carry && u.carry.n >= vload(state) ? 'returning' : 'walking'; continue; }
    if (!j) { u.vstate = 'idle'; continue; }
    if (j.type === 'build') {
      const b = state.buildings[j.id];
      if (!b || b.done || b.ruin) { if (u.carry && u.carry.site) u.carry = null; const p = j.prev; u.job = p ? { type: 'gather', res: p.res, x: p.x, y: p.y } : null; u.vstate = 'idle'; if (u.job) go(state, u, p.x, p.y); continue; } // back to what they were gathering
      // delivering a load of materials
      if (u.carry && u.carry.site === b.id) {
        if (dist(u, b.x, b.y) > 1.6) { go(state, u, b.x, b.y); u.vstate = 'hauling'; continue; }
        b.mg = Math.min(b.mt || 0, (b.mg || 0) + u.carry.n); u.carry = null; u.vstate = 'building'; continue;
      }
      const need = (b.mt || 0) - (b.mg || 0) - inTransit(state, b);
      if (need > 0.5 && b.progress >= matAllowed(b) - 0.05) { // fetch materials from the nearest store
        const st = nearestStore(state, u);
        if (st) {
          if (dist(u, st.x, st.y) > 1.6) { go(state, u, st.x, st.y); u.vstate = 'fetching'; continue; }
          if (u.carry && !u.carry.site) { state.res[u.carry.res] += u.carry.n; state.stats.gathered = (state.stats.gathered || 0) + u.carry.n; }
          u.carry = { res: mainMat(b), n: Math.min(vload(state), need), site: b.id }; go(state, u, b.x, b.y); u.vstate = 'hauling'; continue;
        }
      }
      if (dist(u, b.x, b.y) > 1.6) { go(state, u, b.x, b.y); continue; }
      u.vstate = 'building'; continue;
    }
    // gather
    const full = u.carry && u.carry.n >= vload(state) - 1e-6;
    if (full || (u.carry && u.carry.n > 0 && j.done)) {
      const st = nearestStore(state, u); if (!st) { u.info = 'No camp or storage to bring goods to'; u.vstate = 'idle'; continue; }
      if (dist(u, st.x, st.y) > 1.6) { go(state, u, st.x, st.y); u.vstate = 'returning'; continue; }
      state.res[u.carry.res] += u.carry.n; state.stats.gathered = (state.stats.gathered || 0) + u.carry.n; u.carry = null;
      if (j.done) { u.job = null; u.vstate = 'idle'; continue; }
      go(state, u, j.x, j.y); continue;
    }
    if (featureAt(state, j.x, j.y) !== j.res) { // used up: move on to the nearest same resource
      const nx = findNearby(state, j.res, j.x, j.y, 6);
      if (nx) { j.x = nx[0]; j.y = nx[1]; go(state, u, j.x, j.y); continue; }
      j.done = true; if (u.carry && u.carry.n > 0) continue; u.job = null; u.vstate = 'idle'; u.info = 'Nothing left nearby'; continue;
    }
    if (dist(u, j.x, j.y) > 1.6) { go(state, u, j.x, j.y); continue; }
    const g = GATHER[j.res], amt = Math.min(g.rate * bonus, vload(state) - (u.carry ? u.carry.n : 0));
    const got = takeFrom(state, j.res, j.x, j.y, amt);
    if (!u.carry) u.carry = { res: j.res, n: 0 }; u.carry.n += got; u.vstate = 'working'; u.info = '';
  }
}
function inTransit(state, b) { let n = 0; for (const u of state.units || []) if (u.carry && u.carry.site === b.id) n += u.carry.n; return n; }
function mainMat(b) { let best = 'wood', bn = 0; for (const [k, v] of Object.entries((BUILDINGS[b.kind] || {}).cost || {})) if (k !== 'money' && v > bn) { bn = v; best = k; } return best; }
// builders currently on site for building b
export function buildersAt(state, b) { let n = 0; for (const u of state.units || []) if (isVillager(u) && u.job && u.job.type === 'build' && u.job.id === b.id && u.vstate === 'building') n++; return n; }
