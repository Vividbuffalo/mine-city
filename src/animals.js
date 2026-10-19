// EARTH wildlife: herds and packs that live in home ranges, graze/wander, and never roam far.
// Prey (deer) flee people; boar fight back when someone comes too close; wolves and bears defend their territory.
// A person takes two hits: when hit they run away, so a fight only sometimes ends in a death. Hunters thin herds for food.
import { tile, T, SIZE, addLog, rand } from './sim.js';
import { orderMove } from './units.js';

export const ANIMALS = {
  deer: { name: 'Deer', biome: [0, 1], herds: 6, herd: [3, 5], range: 6, speed: 1.4, prey: true, flee: 2.6, minStart: 7 },
  boar: { name: 'Wild boar', biome: [1], herds: 3, herd: [2, 3], range: 5, speed: 1.2, prey: true, provoke: 1.2, minStart: 9 },
  wolf: { name: 'Wolf', biome: [1], herds: 2, herd: [2, 3], range: 7, speed: 2.0, territory: 2.2, minStart: 15 },
  bear: { name: 'Brown bear', biome: [1, 2], herds: 2, herd: [1, 1], range: 5, speed: 1.1, territory: 1.6, nearHill: true, minStart: 14 },
};
const HIT = 0.35; // chance per hour of contact that an attack lands

function passable(state, x, y) { const t = tile(state, Math.round(x), Math.round(y)); return !!t && t.t !== T.WATER && !t.occ && !(t.t === T.HILL && t.h >= 2 && !t.lv); }
function near(state, x, y, kind, r) { let n = 0; for (const a of state.animals || []) if (a.kind === kind && Math.hypot(a.x - x, a.y - y) <= r) n++; return n; }

export function spawnAnimals(state) {
  state.animals = []; state.herds = [];
  const s = state.start || { x: 32, y: 32 };
  for (const [kind, A] of Object.entries(ANIMALS)) {
    let placed = 0, guard = 0;
    const want = Math.round(A.herds * (SIZE / 64) ** 2);
    while (placed < want && guard++ < 600 * (SIZE / 64) ** 2) {
      const x = 2 + Math.floor(rand(state) * (SIZE - 4)), y = 2 + Math.floor(rand(state) * (SIZE - 4)), t = tile(state, x, y);
      if (!t || !A.biome.includes(t.t) || !passable(state, x, y) || Math.hypot(x - s.x, y - s.y) < A.minStart) continue;
      if (A.nearHill) { let h = false; for (let dy = -3; dy <= 3 && !h; dy++) for (let dx = -3; dx <= 3; dx++) { const n = tile(state, x + dx, y + dy); if (n && n.t === T.HILL) { h = true; break; } } if (!h) continue; }
      if (state.herds.some(h => Math.hypot(h.x - x, h.y - y) < 6)) continue;
      const herd = { id: state.nextId++, kind, x, y, size: A.herd[0] + Math.floor(rand(state) * (A.herd[1] - A.herd[0] + 1)) };
      state.herds.push(herd);
      for (let i = 0; i < herd.size; i++) addAnimal(state, herd);
      placed++;
    }
  }
}
function addAnimal(state, herd) {
  const x = herd.x + (rand(state) - 0.5) * 2, y = herd.y + (rand(state) - 0.5) * 2;
  const a = { id: state.nextId++, kind: herd.kind, herd: herd.id, x, y, px: x, py: y, hx: herd.x, hy: herd.y, tx: x, ty: y, st: 'graze', cd: 0, rest: Math.floor(rand(state) * 4) };
  state.animals.push(a); return a;
}
// prey within reach of a hunter's lodge: food scales with it
export function preyNear(state, x, y, r = 8) { let n = 0; for (const a of state.animals || []) if (ANIMALS[a.kind].prey && Math.hypot(a.x - x, a.y - y) <= r) n++; return n; }

function stepToward(state, a, tx, ty, sp) {
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy); if (d < 0.05) return true;
  const k = Math.min(1, sp / d), nx = a.x + dx * k, ny = a.y + dy * k;
  if (passable(state, nx, ny)) { a.x = nx; a.y = ny; } else { a.tx = a.x; a.ty = a.y; return true; }
  return k >= 1;
}
function hitUnit(state, a, u) {
  const A = ANIMALS[a.kind];
  u.hp = (u.hp ?? 2) - 1; u.hurtT = state.tick; a.cd = 2; a.calm = 36; // after driving someone off the animal settles down for a while
  const ut = u.kind === 'villager' ? 'Villager' : 'Scout';
  if (u.hp <= 0) { u.dead = true; state.dirty.units = true; addLog(state, `${ut} killed by a ${A.name.toLowerCase()} at (${Math.round(u.x)}, ${Math.round(u.y)}).`); state.stats.deaths++; state.grief = (state.grief || 0) + 2; return; }
  // wounded: run away from the animal
  const dx = u.x - a.x, dy = u.y - a.y, d = Math.hypot(dx, dy) || 1;
  for (const r of [5, 4, 3, 2]) { const fx = Math.round(u.x + dx / d * r), fy = Math.round(u.y + dy / d * r); if (passable(state, fx, fy) && orderMove(state, u, fx, fy).ok) { u.fleeing = true; if (u.job) u.job = null; u.vstate = 'idle'; break; } }
}

export function tickAnimals(state) {
  if (!state.animals) spawnAnimals(state);
  const units = (state.units || []).filter(u => !u.dead && u.kind !== 'ship');
  for (const a of state.animals) {
    a.px = a.x; a.py = a.y; const A = ANIMALS[a.kind]; if (a.cd > 0) a.cd--; if (a.calm > 0) a.calm--;
    const homeD = Math.hypot(a.x - a.hx, a.y - a.hy);
    let nearest = null, nd = 1e9; for (const u of units) { const d = Math.hypot(u.x - a.x, u.y - a.y); if (d < nd) { nd = d; nearest = u; } }
    if (A.flee && nearest && nd < A.flee) { // prey bolts away (but stays near home)
      const dx = a.x - nearest.x, dy = a.y - nearest.y, d = Math.hypot(dx, dy) || 1; let tx = a.x + dx / d * 3, ty = a.y + dy / d * 3;
      if (Math.hypot(tx - a.hx, ty - a.hy) > A.range + 2) { tx = a.hx; ty = a.hy; }
      a.st = 'run'; stepToward(state, a, tx, ty, A.speed * 1.8); continue;
    }
    const reach = A.territory || A.provoke || 0;
    if (reach && !(a.calm > 0) && nearest && nd < reach && homeD < A.range + 1 && !(nearest.fleeing && nearest.path && nearest.path.length)) {
      a.st = 'attack'; stepToward(state, a, nearest.x, nearest.y, A.speed * 1.4);
      if (Math.hypot(nearest.x - a.x, nearest.y - a.y) <= 1.05 && a.cd <= 0) { if (rand(state) < HIT) hitUnit(state, a, nearest); else a.cd = 1; }
      continue;
    }
    if (homeD > A.range) { a.st = 'walk'; a.tx = a.hx; a.ty = a.hy; }
    if (a.rest > 0) { a.rest--; a.st = 'graze'; continue; }
    if (Math.hypot(a.tx - a.x, a.ty - a.y) < 0.1) {
      for (let k = 0; k < 6; k++) { const ang = rand(state) * 6.283, r = rand(state) * A.range * 0.8, tx = a.hx + Math.cos(ang) * r, ty = a.hy + Math.sin(ang) * r; if (passable(state, tx, ty)) { a.tx = tx; a.ty = ty; break; } }
      a.rest = 1 + Math.floor(rand(state) * 4); a.st = 'graze'; continue;
    }
    a.st = 'walk'; if (stepToward(state, a, a.tx, a.ty, A.speed * 0.6)) { a.tx = a.x; a.ty = a.y; }
  }
  // wounded people recover after a day away from danger
  for (const u of units) { if (u.fleeing && !(u.path && u.path.length)) u.fleeing = false; if ((u.hp ?? 2) < 2 && state.tick - (u.hurtT || 0) > 24) { u.hp = 2; } }
  if ((state.units || []).some(u => u.dead)) state.units = state.units.filter(u => !u.dead);
  // hunting: each working hunter's lodge takes an animal every ~30 h while the herd nearby is above two
  for (const b of Object.values(state.buildings)) {
    if (b.kind !== 'hunter' || !b.done || b.ruin || !(b.workers > 0)) continue;
    b.huntAcc = (b.huntAcc || 0) + b.workers / 2; if (b.huntAcc < 30) continue; b.huntAcc = 0;
    let best = null, bd = 1e9; for (const a of state.animals) { if (!ANIMALS[a.kind].prey) continue; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d <= 8 && d < bd && near(state, a.hx, a.hy, a.kind, 4) > 2) { bd = d; best = a; } }
    if (best) { state.animals = state.animals.filter(a => a !== best); state.res.food += 12; b.pop = state.tick; b.popRes = 'food'; }
  }
  // herds slowly recover
  if (state.tick % 24 === 0) for (const h of state.herds || []) { const n = state.animals.filter(a => a.herd === h.id).length; if (n < h.size && rand(state) < 0.2) addAnimal(state, h); }
}
