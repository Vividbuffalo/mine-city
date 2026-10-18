// Mine City simulation. Pure data + rules, no rendering. All mutations go through applyCommand().
import { BUILDINGS, TECHS, ERAS, ERA_REQ, BLOCKS, SAVE_VERSION, HOURS_PER_DAY, techCost } from './data.js';

// ---------- RNG ----------
function hash2(seed, x, y) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(seed, x, y, scale) {
  const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy);
  const sx = fx - x0, sy = fy - y0, u = sx * sx * (3 - 2 * sx), v = sy * sy * (3 - 2 * sy);
  const a = hash2(seed, x0, y0), b = hash2(seed, x0 + 1, y0), c = hash2(seed, x0, y0 + 1), d = hash2(seed, x0 + 1, y0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function rand(state) { // deterministic, stored in state
  let t = (state.rs = (state.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- World (chunked, planet-aware) ----------
export const SIZE = 64, CHUNK = 16;
export const T = { GRASS: 0, FOREST: 1, HILL: 2, WATER: 3 };
function chunkKey(x, y) { return ((x / CHUNK) | 0) + ',' + ((y / CHUNK) | 0); }
export function tile(state, x, y) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
  const c = state.world.chunks[chunkKey(x, y)];
  return c.tiles[(y % CHUNK) * CHUNK + (x % CHUNK)];
}
export function inBounds(x, y) { return x >= 0 && y >= 0 && x < SIZE && y < SIZE; }

function genWorld(seed) {
  const chunks = {};
  for (let cy = 0; cy < SIZE / CHUNK; cy++) for (let cx = 0; cx < SIZE / CHUNK; cx++) {
    const tiles = [];
    for (let ly = 0; ly < CHUNK; ly++) for (let lx = 0; lx < CHUNK; lx++) tiles.push({ t: 0, h: 0, trees: 0, dep: null, sv: 0, vis: 0, road: 0, occ: 0, work: null });
    chunks[cx + ',' + cy] = { cx, cy, tiles };
  }
  const world = { size: SIZE, chunkSize: CHUNK, chunks };
  const st = { world };
  // river: meanders top to bottom
  let rx = 18 + Math.floor(hash2(seed, 1, 1) * 28);
  const river = new Set();
  for (let y = 0; y < SIZE; y++) {
    rx += Math.round((noise(seed + 7, 0, y, 6) - 0.5) * 2.2);
    rx = Math.max(4, Math.min(SIZE - 5, rx));
    river.add(rx + ',' + y); river.add(rx + 1 + ',' + y);
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const tl = tile(st, x, y);
    const e = noise(seed, x, y, 14) * 0.7 + noise(seed + 3, x, y, 5) * 0.3;
    const f = noise(seed + 11, x, y, 9);
    if (river.has(x + ',' + y)) { tl.t = T.WATER; continue; }
    if (e > 0.69) { tl.t = T.HILL; tl.h = e > 0.78 ? 2 : 1; }
    else if (f > 0.58) { tl.t = T.FOREST; tl.trees = 2 + Math.floor(hash2(seed + 5, x, y) * 3); }
    // geology
    let nearRiver = false;
    for (let dy = -2; dy <= 2 && !nearRiver; dy++) for (let dx = -2; dx <= 2; dx++) if (river.has((x + dx) + ',' + (y + dy))) { nearRiver = true; break; }
    const r = hash2(seed + 21, x, y), g = noise(seed + 31, x, y, 6);
    if (nearRiver && tl.t !== T.HILL && r < 0.55) tl.dep = { r: 'clay', amt: 60 + Math.floor(r * 120), depth: 1 + Math.floor(r * 4), grade: 1 };
    else if (tl.t === T.HILL) {
      const cu = noise(seed + 41, x, y, 4), sn = noise(seed + 51, x, y, 3);
      if (cu > 0.72) tl.dep = { r: 'copper', amt: 80 + Math.floor(cu * 200), depth: cu > 0.8 ? 3 + Math.floor(r * 3) : 8 + Math.floor(r * 20), grade: cu };
      else if (sn > 0.8) tl.dep = { r: 'tin', amt: 40 + Math.floor(sn * 100), depth: sn > 0.85 ? 4 : 10 + Math.floor(r * 18), grade: sn };
      else tl.dep = { r: 'stone', amt: 150 + Math.floor(r * 150), depth: 1 + Math.floor(r * 3), grade: 1 };
    } else if (g > 0.75 && r < 0.4) {
      // buried ore under flat land (shaft-mine country)
      tl.dep = g > 0.8 ? { r: 'tin', amt: 50 + Math.floor(r * 80), depth: 12 + Math.floor(r * 15), grade: g } : { r: 'copper', amt: 80 + Math.floor(r * 150), depth: 9 + Math.floor(r * 18), grade: g };
    }
  }
  return world;
}

// ---------- State ----------
export function newGame(opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const sandbox = !!opts.sandbox, era = opts.era || 1;
  const state = {
    version: SAVE_VERSION, seed, rs: seed | 0, tick: 0, mode: sandbox ? 'sandbox' : 'normal',
    // Data-model hooks: galaxy > system > planet > region > plot (only one of each in MVP)
    location: { galaxy: 0, system: 0, planet: 'earth', region: { id: 'r0', lat: 33.45, lon: -112.07 }, plot: { id: 'p0', x0: 0, y0: 0, owner: 'player1' } },
    culture: 'default',
    world: genWorld(seed),
    era, res: { money: 600, wood: 60, clay: 0, stone: 10, copper: 0, tin: 0, brick: 0, bronze: 0, food: 40 },
    stats: { bricksMade: 0, bronzeMade: 0, deaths: 0, arrivals: 0, left: 0, collapses: 0 },
    research: { points: 0, done: [], current: null, progress: 0 },
    buildings: {}, nextId: 1, incidents: [], crews: [], surveys: [], draft: [],
    flags: { collapses: true, unlimitedMoney: sandbox, freeBlocks: sandbox, riskOverlay: false },
    happiness: 60, grief: 0, hungry: false,
    hidden: { reputation: 0 }, // hidden morality track; never shown in normal play
    log: [], dirty: { all: true },
  };
  // start area visible
  const sx = 32, sy = 32;
  let best = null;
  for (let y = 20; y < 44; y++) for (let x = 20; x < 44; x++) { const t = tile(state, x, y); if (t.t === T.GRASS && (!best || Math.hypot(x - sx, y - sy) < best.d)) best = { x, y, d: Math.hypot(x - sx, y - sy) }; }
  state.start = best ? { x: best.x, y: best.y } : { x: sx, y: sy };
  reveal(state, state.start.x, state.start.y, 9);
  if (sandbox) {
    Object.assign(state.res, { money: 100000, wood: 800, clay: 400, stone: 400, copper: 300, tin: 150, brick: 400, bronze: 200, food: 500 });
    for (const id in TECHS) if (TECHS[id].era < era || era === 2 && TECHS[id].era === 1) state.research.done.push(id);
    if (era === 2) state.research.done = ['pottery', 'smelting'];
    for (const c of Object.values(state.world.chunks)) for (const t of c.tiles) { t.sv = 1; t.vis = 1; }
  }
  addLog(state, sandbox ? `Sandbox started in the ${ERAS[era].name} era.` : 'Settlement founded.');
  return state;
}

export function addLog(state, msg) {
  state.log.push({ t: state.tick, msg });
  if (state.log.length > 200) state.log.shift();
  state.dirty.log = true;
}
export function dateStr(tick) { return `Day ${Math.floor(tick / HOURS_PER_DAY) + 1}, ${String(tick % HOURS_PER_DAY).padStart(2, '0')}:00`; }

export function reveal(state, cx, cy, r) {
  let changed = false;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const t = tile(state, x, y);
    if (t && !t.vis && (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1) { t.vis = 1; changed = true; }
  }
  if (changed) state.dirty.terrain = state.dirty.trees = state.dirty.under = true;
}

// ---------- Helpers ----------
export function footprint(kind, x, y, size) { const s = size || BUILDINGS[kind].size, out = []; for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) out.push([x + dx, y + dy]); return out; }
export function popTotal(state) { let p = 0; for (const b of Object.values(state.buildings)) p += b.residents || 0; return p; }
export function hasBuilt(state, kind) { return Object.values(state.buildings).some(b => b.kind === kind && b.done && !b.ruin); }
function roadNeighbors(state, tiles) {
  const set = new Set(tiles.map(t => t[0] + ',' + t[1])), out = [];
  for (const [x, y] of tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy, t = tile(state, nx, ny);
    if (t && t.road && !set.has(nx + ',' + ny)) out.push([nx, ny]);
  }
  return out;
}
export function roadAccess(state, b) { return roadNeighbors(state, b.tiles).length > 0; }
function canAfford(state, cost) {
  for (const k in cost) { if (k === 'money' && state.flags.unlimitedMoney) continue; if ((state.res[k] || 0) < cost[k]) return false; }
  return true;
}
function pay(state, cost) { for (const k in cost) { if (k === 'money' && state.flags.unlimitedMoney) continue; state.res[k] -= cost[k]; } }
export function costStr(cost) { return Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ') || 'free'; }

export function buildingAvailable(state, kind) {
  const d = BUILDINGS[kind];
  if (d.hidden || d.era > state.era) return false;
  return true;
}

export function checkPlacement(state, kind, x, y) {
  const d = BUILDINGS[kind];
  if (!buildingAvailable(state, kind)) return 'Not available in this era';
  const tiles = footprint(kind, x, y);
  for (const [tx, ty] of tiles) {
    const t = tile(state, tx, ty);
    if (!t) return 'Out of bounds';
    if (!t.vis) return 'Unexplored';
    if (t.t === T.WATER) return 'Water';
    if (t.occ || t.road) return 'Occupied';
    if (d.terrain && !d.terrain.includes(t.t)) return 'Needs open grassland';
  }
  if (d.needs && !hasBuilt(state, d.needs)) return `Needs a finished ${BUILDINGS[d.needs].name}`;
  if (!canAfford(state, d.cost)) return 'Not enough resources';
  return null;
}

// ---------- Pathfinding (BFS over road tiles) ----------
export function findRoadPath(state, fromTiles, toTiles) {
  const starts = roadNeighbors(state, fromTiles), goals = new Set(roadNeighbors(state, toTiles).map(p => p[0] + ',' + p[1]));
  if (!starts.length || !goals.size) return null;
  const prev = new Map(), q = [];
  for (const s of starts) { const k = s[0] + ',' + s[1]; if (!prev.has(k)) { prev.set(k, null); q.push(s); } }
  while (q.length) {
    const [x, y] = q.shift(), k = x + ',' + y;
    if (goals.has(k)) {
      const path = []; let c = k;
      while (c) { const [a, b] = c.split(',').map(Number); path.unshift([a, b]); c = prev.get(c); }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = nx + ',' + ny, t = tile(state, nx, ny);
      if (t && t.road && !prev.has(nk)) { prev.set(nk, k); q.push([nx, ny]); }
    }
  }
  return null;
}

// ---------- Commands ----------
export function applyCommand(state, cmd) {
  const fn = COMMANDS[cmd.type];
  if (!fn) return { ok: false, err: 'Unknown command ' + cmd.type };
  const r = fn(state, cmd) || { ok: true };
  return r;
}

function createBuilding(state, kind, tiles, extra = {}) {
  const id = state.nextId++;
  const [x, y] = tiles[0];
  const b = { id, kind, x, y, tiles, rot: extra.rot || 0, progress: 0, done: false, ruin: false, workers: 0, residents: 0, acc: 0, info: '', ...extra };
  state.buildings[id] = b;
  for (const [tx, ty] of tiles) tile(state, tx, ty).occ = id;
  let cx = 0, cy = 0; for (const [tx, ty] of tiles) { cx += tx; cy += ty; }
  reveal(state, Math.round(cx / tiles.length), Math.round(cy / tiles.length), 5);
  state.dirty.buildings = true;
  return b;
}
function removeBuilding(state, b) {
  for (const [tx, ty] of b.tiles) { const t = tile(state, tx, ty); if (t.occ === b.id) t.occ = 0; }
  // mines abandoned -> workings abandoned
  for (const c of Object.values(state.world.chunks)) for (const t of c.tiles) if (t.work && t.work.mine === b.id) { t.work.abandoned = true; }
  // crews belonging to a removed post vanish
  state.crews = state.crews.filter(c => c.post !== b.id);
  delete state.buildings[b.id];
  state.dirty.buildings = state.dirty.under = true;
}

const COMMANDS = {
  place(state, { kind, x, y, rot }) {
    const err = checkPlacement(state, kind, x, y);
    if (err) return { ok: false, err };
    pay(state, BUILDINGS[kind].cost);
    const tiles = footprint(kind, x, y);
    for (const [tx, ty] of tiles) { const t = tile(state, tx, ty); if (t.trees) { t.trees = 0; state.dirty.trees = true; } }
    const b = createBuilding(state, kind, tiles, { rot: rot || 0 });
    return { ok: true, id: b.id };
  },
  road(state, { x, y }) {
    const t = tile(state, x, y);
    if (!t || !t.vis || t.t === T.WATER || t.occ || t.road) return { ok: false, err: 'Cannot build road here' };
    const cost = { money: 2 };
    if (!canAfford(state, cost)) return { ok: false, err: 'Not enough money' };
    pay(state, cost); t.road = 1; if (t.trees) { t.trees = 0; state.dirty.trees = true; }
    reveal(state, x, y, 3);
    state.dirty.roads = true; return { ok: true };
  },
  bulldoze(state, { x, y }) {
    const t = tile(state, x, y); if (!t) return { ok: false };
    if (t.occ) {
      const b = state.buildings[t.occ];
      if (b.ruin) return { ok: false, err: 'Rubble must be cleared by a cleanup crew' };
      // occupants move out (population lost from this home)
      removeBuilding(state, b); return { ok: true };
    }
    if (t.road) {
      if (state.crews.some(c => c.path && c.path.some(p => p[0] === x && p[1] === y) && c.state !== 'idle')) return { ok: false, err: 'A crew is using this road' };
      t.road = 0; state.dirty.roads = true; return { ok: true };
    }
    return { ok: false };
  },
  survey(state, { x, y }) {
    const t = tile(state, x, y);
    if (!t || !t.vis) return { ok: false, err: 'Unexplored' };
    const cost = { money: 15 };
    if (!canAfford(state, cost)) return { ok: false, err: 'Not enough money' };
    pay(state, cost);
    state.surveys.push({ id: state.nextId++, x, y, r: 4, left: 12, total: 12 });
    addLog(state, `Survey started at (${x}, ${y}).`);
    return { ok: true };
  },
  research(state, { tech }) {
    const d = TECHS[tech];
    if (!d || d.era > state.era || state.research.done.includes(tech) || !d.req.every(r => state.research.done.includes(r))) return { ok: false, err: 'Cannot research' };
    if (state.research.current !== tech) { state.research.current = tech; state.research.progress = 0; }
    return { ok: true };
  },
  advanceEra(state) {
    if (!eraReady(state).ready) return { ok: false, err: 'Requirements not met' };
    state.era = 2; addLog(state, 'The Bronze era has begun.'); state.dirty.all = true; return { ok: true };
  },
  // ---- block build ----
  blockPlace(state, { x, y, m }) { // x,y in half-tile sub-cells
    const tx = x >> 1, ty = y >> 1, t = tile(state, tx, ty);
    if (!t || !t.vis || t.t === T.WATER || t.road || t.occ) return { ok: false, err: 'Cannot build blocks here' };
    if (!BLOCKS[m] || BLOCKS[m].era > state.era) return { ok: false, err: 'Material not available' };
    const col = state.draft.filter(b => b.x === x && b.y === y);
    if (col.length >= 10) return { ok: false, err: 'Too tall' };
    state.draft.push({ x, y, z: col.length, m }); state.dirty.draft = true; return { ok: true };
  },
  blockRemove(state, { x, y }) {
    let top = -1, idx = -1;
    state.draft.forEach((b, i) => { if (b.x === x && b.y === y && b.z > top) { top = b.z; idx = i; } });
    if (idx < 0) return { ok: false }; state.draft.splice(idx, 1); state.dirty.draft = true; return { ok: true };
  },
  blockClear(state) { state.draft = []; state.dirty.draft = true; return { ok: true }; },
  blockCommit(state, { func }) {
    if (!state.draft.length) return { ok: false, err: 'Nothing to build' };
    const cost = {}; for (const b of state.draft) { const r = BLOCKS[b.m].res; cost[r] = (cost[r] || 0) + 1; }
    const free = state.flags.freeBlocks;
    if (!free && !canAfford(state, cost)) return { ok: false, err: 'Not enough materials: ' + costStr(cost) };
    const tset = new Map(); for (const b of state.draft) tset.set((b.x >> 1) + ',' + (b.y >> 1), [b.x >> 1, b.y >> 1]);
    const tiles = [...tset.values()];
    for (const [tx, ty] of tiles) { const t = tile(state, tx, ty); if (t.occ || t.road || t.t === T.WATER) return { ok: false, err: 'Footprint blocked' }; }
    if (!free) pay(state, cost);
    let w = 0; for (const b of state.draft) w += BLOCKS[b.m].weight;
    const minX = Math.min(...tiles.map(t => t[0])), minY = Math.min(...tiles.map(t => t[1]));
    const blocks = state.draft.map(b => ({ ...b }));
    const n = blocks.length;
    const b = createBuilding(state, 'custom', tiles, { blocks, func, weight: Math.max(0.4, Math.min(4, w * 2)), time: 4 + n * 0.4, cap: func === 'house' ? Math.max(2, Math.floor(n / 3)) : 0, jobs: func === 'shop' ? 2 : 0, shop: func === 'shop' ? n * 2 : 0 });
    b.x = minX; b.y = minY;
    for (const [tx, ty] of tiles) { const t = tile(state, tx, ty); if (t.trees) { t.trees = 0; state.dirty.trees = true; } }
    state.draft = []; state.dirty.draft = true;
    addLog(state, `Custom ${func} (${n} blocks) construction started.`);
    return { ok: true, id: b.id };
  },
  // ---- skip (dev/test) ----
  skip(state, { what, id }) {
    if (what === 'build') { const b = state.buildings[id]; if (b && !b.done) { b.progress = 1; finishBuilding(state, b); } }
    else if (what === 'research') { if (state.research.current) completeResearch(state); }
    else if (what === 'survey') { for (const s of state.surveys) s.left = 0; tickSurveys(state); }
    else if (what === 'mine') { const b = state.buildings[id]; assignWorkers(state); if (b) for (let i = 0; i < 24; i++) runBuilding(state, b, 1); }
    else if (what === 'growth') { for (const b of Object.values(state.buildings)) { const c = capOf(b); if (c && b.done && !b.ruin && roadAccess(state, b)) { const add = c - b.residents; b.residents = c; state.stats.arrivals += add; } } }
    else if (what === 'incident') { const inc = state.incidents.find(i => i.id === id); if (inc) skipIncident(state, inc); }
    else if (what === 'era') { if (state.era < 2) { state.era = 2; for (const t of ['pottery', 'smelting']) if (!state.research.done.includes(t)) state.research.done.push(t); addLog(state, 'The Bronze era has begun (skipped).'); state.dirty.all = true; } }
    return { ok: true };
  },
  // ---- dev ----
  dev(state, { action, id, value }) {
    if (action === 'collapse') { const b = state.buildings[id]; if (b && !b.ruin) collapse(state, b, true); }
    else if (action === 'toggleCollapses') state.flags.collapses = !state.flags.collapses;
    else if (action === 'riskOverlay') { state.flags.riskOverlay = !state.flags.riskOverlay; state.dirty.overlay = true; }
    else if (action === 'money') state.res.money += value || 1000;
    else if (action === 'materials') for (const k of ['wood', 'clay', 'stone', 'copper', 'tin', 'brick', 'bronze', 'food']) state.res[k] += 100;
    else if (action === 'revealAll') { for (const c of Object.values(state.world.chunks)) for (const t of c.tiles) { t.vis = 1; t.sv = 1; } state.dirty.all = true; }
    return { ok: true };
  },
};

// ---------- Era ----------
export function eraReady(state) {
  const req = ERA_REQ[state.era];
  if (!req) return { ready: false, items: [] };
  const pop = popTotal(state);
  const items = [
    { label: `Population ${pop} / ${req.pop}`, ok: pop >= req.pop },
    { label: `Bricks made ${Math.floor(state.stats.bricksMade)} / ${req.bricksMade}`, ok: state.stats.bricksMade >= req.bricksMade },
    ...req.techs.map(t => ({ label: `${TECHS[t].name} researched`, ok: state.research.done.includes(t) })),
  ];
  return { ready: items.every(i => i.ok), items };
}
function completeResearch(state) {
  const id = state.research.current; if (!id) return;
  state.research.done.push(id); state.research.current = null; state.research.progress = 0;
  addLog(state, `Research complete: ${TECHS[id].name}.`);
}

// ---------- Simulation tick (1 tick = 1 game hour) ----------
export function capOf(b) { return b.kind === 'custom' ? b.cap || 0 : BUILDINGS[b.kind].cap || 0; }
function jobsOf(b) { return b.kind === 'custom' ? b.jobs || 0 : BUILDINGS[b.kind].jobs || 0; }
function buildTime(b) { return b.kind === 'custom' ? b.time : BUILDINGS[b.kind].time; }
export function weightOf(b) { return b.kind === 'custom' ? b.weight : BUILDINGS[b.kind].weight; }
export function stageOf(b) { if (b.done) return 3; return b.progress < 0.25 ? 0 : b.progress < 0.55 ? 1 : 2; }

function finishBuilding(state, b) {
  b.done = true; b.progress = 1; state.dirty.buildings = true;
  if (b.kind === 'rescue') addLog(state, 'Rescue & Cleanup Post is ready.');
}

export function tick(state) {
  state.tick++;
  const hour = state.tick % HOURS_PER_DAY;
  // construction
  for (const b of Object.values(state.buildings)) if (!b.done && !b.ruin) {
    b.progress = Math.min(1, b.progress + 1 / buildTime(b));
    if (b.progress >= 1) finishBuilding(state, b);
  }
  assignWorkers(state);
  for (const b of Object.values(state.buildings)) if (b.done && !b.ruin) runBuilding(state, b, 1);
  tickSurveys(state);
  tickIncidents(state);
  tickCrews(state);
  // research: points per hour
  const pop = popTotal(state);
  const rp = (pop * 0.06 + 0.4) * (state.research.done.includes('writing') ? 1.5 : 1);
  state.research.points += rp;
  if (state.research.current) {
    state.research.progress += rp;
    if (state.research.progress >= techCost(state.research.current, state.culture)) completeResearch(state);
  }
  if (hour === 0) dailyTick(state);
}

function assignWorkers(state) {
  let free = popTotal(state);
  const order = ['rescue', 'field', 'granary', 'woodcutter', 'claypit', 'quarry', 'orepit', 'shaft', 'kiln', 'smelter', 'carpentry', 'stall', 'store', 'custom', 'well', 'hut', 'brickhouse'];
  const list = Object.values(state.buildings).filter(b => b.done && !b.ruin).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  for (const b of list) {
    const j = roadAccess(state, b) ? jobsOf(b) : 0;
    b.workers = Math.min(j, free); free -= b.workers;
  }
  state.unemployed = free;
}

function eff(state, b) { const j = jobsOf(b); return j ? b.workers / j : 1; }

function runBuilding(state, b, hours) {
  const d = BUILDINGS[b.kind]; const e = eff(state, b) * (roadAccess(state, b) ? 1 : 0);
  if (d.food) {
    const mult = hasBuilt(state, 'granary') ? 1.2 : 1;
    state.res.food += d.food / 24 * e * hours * mult;
  }
  if (d.extract) {
    if (e <= 0) { b.info = roadAccess(state, b) ? 'No workers' : 'No road access'; return; }
    if (b.info === 'Depleted') { b.depCheck = (b.depCheck || 0) + 1; if (b.depCheck % 24) return; } // re-check once a day (trees regrow)
    b.acc += d.rate / 24 * e * hours;
    while (b.acc >= 1) {
      b.acc -= 1;
      if (!extractOne(state, b, d)) { b.acc = 0; if (b.info !== 'Depleted') { b.info = 'Depleted'; b.depCheck = 0; addLog(state, `${d.name} at (${b.x}, ${b.y}) has nothing left to extract.`); for (const c of Object.values(state.world.chunks)) for (const t of c.tiles) if (t.work && t.work.mine === b.id) t.work.abandoned = true; } return; }
    }
    if (b.info === 'No workers' || b.info === 'No road access') b.info = '';
  }
  if (d.recipe) {
    if (e <= 0) return;
    b.acc += d.recipe.perDay / 24 * e * hours;
    while (b.acc >= 1) {
      const inp = d.recipe.in;
      if (!Object.keys(inp).every(k => state.res[k] >= inp[k])) { b.acc = Math.min(b.acc, 1); b.info = 'Waiting for inputs'; return; }
      b.acc -= 1; b.info = '';
      for (const k in inp) state.res[k] -= inp[k];
      for (const k in d.recipe.out) { state.res[k] += d.recipe.out[k]; if (k === 'brick') state.stats.bricksMade += d.recipe.out[k]; if (k === 'bronze') state.stats.bronzeMade += d.recipe.out[k]; }
    }
  }
}

function extractOne(state, b, d) {
  const cx = b.x, cy = b.y, R = d.radius;
  if (d.extract === 'wood') {
    for (let r = 0; r <= R; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      const t = tile(state, x, y); if (t && t.trees > 0 && t.vis) { if (b.info === 'Depleted') b.info = ''; t.chop = (t.chop || 0) + 1; if (t.chop >= 10) { t.chop = 0; t.trees--; state.dirty.trees = true; } state.res.wood += 1; return true; }
    }
    return false;
  }
  const maxD = Math.min(d.maxDepth, ERAS[state.era].maxDepth);
  let best = null;
  for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
    const t = tile(state, x, y);
    if (t && t.dep && t.dep.amt > 0 && d.extract.includes(t.dep.r) && t.dep.depth <= maxD && (!d.shaft ? true : true)) {
      const dist = Math.abs(x - cx) + Math.abs(y - cy);
      if (!best || dist < best.dist) best = { t, x, y, dist };
    }
  }
  if (!best) return false;
  if (b.info === 'Depleted') b.info = '';
  const t = best.t;
  t.dep.amt -= 1; state.res[t.dep.r] += 1;
  if (t.dep.amt <= 0) { t.dep.amt = 0; state.dirty.under = true; }
  if (d.shaft && !t.work) {
    const supported = state.research.done.includes('timber') && hasBuilt(state, 'carpentry');
    t.work = { depth: t.dep.depth, age: 0, support: supported ? 0.5 : 1, mine: b.id, abandoned: false };
    state.hidden.reputation += supported ? 0.5 : -1; // hidden: unsafe workings
    // tunnels to reach the deposit also leave voids along the way
    let x = cx, y = cy;
    while (x !== best.x || y !== best.y) {
      if (x !== best.x) x += Math.sign(best.x - x); else y += Math.sign(best.y - y);
      const tt = tile(state, x, y); if (tt && !tt.work) tt.work = { depth: t.dep.depth, age: 0, support: t.work.support, mine: b.id, abandoned: false };
    }
    const own = tile(state, cx, cy); if (!own.work) own.work = { depth: t.dep.depth, age: 0, support: t.work.support, mine: b.id, abandoned: false };
    state.dirty.under = true;
  }
  return true;
}

function tickSurveys(state) {
  for (const s of state.surveys) {
    s.left--;
    if (s.left <= 0) {
      let found = {};
      for (let y = s.y - s.r; y <= s.y + s.r; y++) for (let x = s.x - s.r; x <= s.x + s.r; x++) {
        const t = tile(state, x, y); if (!t) continue; t.sv = 1; t.vis = 1; if (t.dep && t.dep.amt > 0) found[t.dep.r] = (found[t.dep.r] || 0) + 1;
      }
      const f = Object.entries(found).map(([k, v]) => `${k} ×${v}`).join(', ');
      addLog(state, `Survey at (${s.x}, ${s.y}) finished: ${f || 'nothing found'}.`);
      state.dirty.under = state.dirty.terrain = state.dirty.trees = true;
    }
  }
  state.surveys = state.surveys.filter(s => s.left > 0);
}

// ---------- Subsidence (hidden risk) ----------
export function tileRisk(state, x, y, weight = 1) {
  const t = tile(state, x, y); if (!t || !t.work) return 0;
  const w = t.work;
  const depthF = w.depth < 30 ? 1 : w.depth < 100 ? 0.3 : 0.05;
  const ageF = (1 + w.age / 20) * (w.abandoned ? 2 : 1);
  return 0.006 * depthF * w.support * ageF * weight;
}
export function buildingRisk(state, b) {
  let r = 0; for (const [x, y] of b.tiles) r = Math.max(r, tileRisk(state, x, y, weightOf(b))); return r;
}

function dailyTick(state) {
  // age workings
  for (const c of Object.values(state.world.chunks)) for (const t of c.tiles) if (t.work) t.work.age++;
  if (state.flags.riskOverlay) state.dirty.overlay = true;
  // tree regrowth
  for (const c of Object.values(state.world.chunks)) for (const t of c.tiles) if (t.t === T.FOREST && t.trees < 4 && !t.occ && !t.road && rand(state) < 0.03) { t.trees++; state.dirty.trees = true; }
  // subsidence checks (no warnings)
  if (state.flags.collapses) for (const b of Object.values(state.buildings)) {
    if (b.ruin || b.kind === 'shaft') continue;
    const r = buildingRisk(state, b);
    if (r > 0 && rand(state) < r) collapse(state, b, false);
  }
  // food
  const pop = popTotal(state);
  state.res.food -= pop * 1.0;
  state.hungry = state.res.food < 0;
  if (state.res.food < 0) state.res.food = 0;
  // economy
  const employed = pop - (state.unemployed || 0);
  let shopCap = 0, upkeep = 0;
  for (const b of Object.values(state.buildings)) {
    if (!b.done || b.ruin) continue;
    const d = BUILDINGS[b.kind]; upkeep += d.upkeep || 0;
    const sc = b.kind === 'custom' ? b.shop || 0 : d.shop || 0;
    if (sc) shopCap += sc * eff(state, b);
  }
  const shopIncome = Math.min(pop, shopCap) * 0.35;
  const income = employed * 0.8 + (pop - employed) * 0.1 + shopIncome;
  state.lastIncome = income; state.lastUpkeep = upkeep;
  state.res.money += income - upkeep;
  // happiness (numbers only)
  const homes = Object.values(state.buildings).filter(b => capOf(b) && b.done && !b.ruin);
  const wells = Object.values(state.buildings).filter(b => b.kind === 'well' && b.done);
  let watered = 0, homePop = 0;
  for (const h of homes) { homePop += h.residents; if (wells.some(w => Math.max(Math.abs(w.x - h.x), Math.abs(w.y - h.y)) <= 5)) watered += h.residents; }
  const waterFrac = homePop ? watered / homePop : 1;
  const unempFrac = pop ? (state.unemployed || 0) / pop : 0;
  let h = 50;
  h += state.hungry ? -30 : 15;
  h += waterFrac * 15 - (1 - waterFrac) * 15;
  h += unempFrac > 0.3 ? -15 : 8;
  h += pop ? Math.min(1, shopCap / pop) * 10 : 5;
  h -= state.grief;
  state.happiness = Math.max(0, Math.min(100, Math.round(h)));
  state.waterFrac = waterFrac; state.shopCap = shopCap;
  state.grief = Math.max(0, state.grief * 0.85 - 0.5);
  // migration
  if (state.happiness >= 45) {
    let arrivals = Math.min(3 + Math.floor(pop * 0.12), 40);
    for (const hm of homes) {
      if (arrivals <= 0) break;
      if (!roadAccess(state, hm)) continue;
      const add = Math.min(capOf(hm) - hm.residents, arrivals);
      if (add > 0) { hm.residents += add; arrivals -= add; state.stats.arrivals += add; }
    }
  } else if (state.happiness < 30 && pop > 0) {
    let leave = Math.max(1, Math.floor(pop * 0.05));
    for (const hm of homes) { const l = Math.min(hm.residents, leave); hm.residents -= l; leave -= l; state.stats.left += l; if (leave <= 0) break; }
  }
}

// ---------- Incidents ----------
function killPeople(state, n, prefer) {
  // remove n people: first from the collapsed building's residents, then from other homes (workers who died)
  let left = n;
  if (prefer) { const k = Math.min(prefer.residents || 0, left); prefer.residents -= k; left -= k; }
  for (const b of Object.values(state.buildings)) { if (left <= 0) break; const k = Math.min(b.residents || 0, left); b.residents -= k; left -= k; }
  state.stats.deaths += n - left; state.grief += (n - left) * 3;
}

function collapse(state, b, forced) {
  const d = BUILDINGS[b.kind];
  const occupants = (b.residents || 0) + (b.workers || 0) + (b.done ? 0 : 2);
  const name = b.kind === 'custom' ? 'Custom ' + b.func : d.name;
  const initialDead = Math.round(occupants * (0.2 + rand(state) * 0.2));
  const escaped = Math.round((occupants - initialDead) * 0.3);
  const trapped = occupants - initialDead - escaped;
  killPeople(state, initialDead, b);
  // escaped residents become homeless (leave town)
  const homeless = Math.min(b.residents || 0, escaped + trapped);
  b.residents = Math.max(0, (b.residents || 0) - homeless);
  b.ruin = true; b.done = true; b.workers = 0;
  state.stats.collapses++;
  const inc = { id: state.nextId++, bid: b.id, x: b.x, y: b.y, tiles: b.tiles, name, dead: initialDead, trapped, saved: 0, stage: 'rescue', crew: null, waited: 0, t0: state.tick };
  state.incidents.push(inc);
  if (!hasBuilt(state, 'rescue')) state.hidden.reputation -= 1;
  addLog(state, `${name} at (${b.x}, ${b.y}) collapsed: ${initialDead} dead${trapped ? `, ${trapped} trapped` : ''}.`);
  state.dirty.buildings = true; state.dirty.incidents = true;
}

function tickIncidents(state) {
  for (const inc of state.incidents) {
    if (inc.stage === 'rescue') {
      inc.waited++;
      // trapped people die over time while waiting
      if (inc.trapped > 0) {
        let died = 0; const p = 0.03 + inc.waited * 0.002;
        for (let i = 0; i < inc.trapped; i++) if (rand(state) < p || inc.waited > 72) died++;
        if (died) { inc.trapped -= died; inc.dead += died; state.stats.deaths += died; state.grief += died * 3; }
        if (inc.trapped === 0 && !inc.crew && !inc.loggedLost) { inc.loggedLost = true; if (inc.dead) addLog(state, `No one trapped at (${inc.x}, ${inc.y}) survived. ${inc.dead} dead in total.`); }
      }
      if (!inc.crew) dispatch(state, inc, 'rescue');
    } else if (inc.stage === 'cleanup' && !inc.crew) dispatch(state, inc, 'cleanup');
  }
  state.incidents = state.incidents.filter(i => i.stage !== 'done');
}

function posts(state) { return Object.values(state.buildings).filter(b => b.kind === 'rescue' && b.done && !b.ruin); }
function crewsAt(state, post) {
  const n = post.workers >= 3 ? 2 : post.workers >= 1 ? 1 : 0;
  let list = state.crews.filter(c => c.post === post.id);
  while (list.length < n) { const c = { id: state.nextId++, post: post.id, state: 'idle', task: null, inc: null, path: null, pos: 0, work: 0 }; state.crews.push(c); list.push(c); }
  return list.slice(0, n);
}

function dispatch(state, inc, task) {
  let best = null;
  for (const p of posts(state)) for (const c of crewsAt(state, p)) {
    if (c.state !== 'idle') continue;
    const path = findRoadPath(state, p.tiles, inc.tiles);
    if (path && (!best || path.length < best.path.length)) best = { c, path };
  }
  if (!best) return;
  const c = best.c;
  Object.assign(c, { state: 'out', task, inc: inc.id, path: best.path, pos: 0, work: 0 });
  inc.crew = c.id; state.dirty.vehicles = true;
  if (task === 'rescue') addLog(state, `Rescue crew dispatched to (${inc.x}, ${inc.y}).`);
}

export const CREW_SPEED = 3; // tiles per hour (horse wagon)
function tickCrews(state) {
  for (const c of state.crews) {
    const inc = state.incidents.find(i => i.id === c.inc);
    if (c.state === 'out') {
      c.pos += CREW_SPEED;
      if (c.pos >= c.path.length - 1) { c.pos = c.path.length - 1; c.state = 'onsite'; c.work = c.task === 'rescue' ? 3 : 8; }
    } else if (c.state === 'onsite') {
      if (--c.work <= 0) finishOnsite(state, c, inc);
    } else if (c.state === 'back') {
      c.pos += CREW_SPEED;
      if (c.pos >= c.path.length - 1) { c.state = 'idle'; c.path = null; c.inc = null; c.task = null; state.dirty.vehicles = true; }
    }
  }
}

function finishOnsite(state, c, inc) {
  if (inc) {
    if (c.task === 'rescue') {
      let saved = 0, died = 0;
      for (let i = 0; i < inc.trapped; i++) (rand(state) < 0.85 ? saved++ : died++);
      inc.saved += saved; inc.dead += died; inc.trapped = 0; state.stats.deaths += died; state.grief += died * 3;
      if (saved || died) addLog(state, `Rescue at (${inc.x}, ${inc.y}): ${saved} saved, ${died} died during rescue. ${inc.dead} dead in total.`);
      else addLog(state, `Rescue crew reached (${inc.x}, ${inc.y}). ${inc.dead} dead in total.`);
      if (inc.dead) state.hidden.reputation += 0.2;
      inc.stage = 'cleanup'; inc.crew = null;
    } else {
      const b = state.buildings[inc.bid];
      if (b) removeBuilding(state, b);
      addLog(state, `Rubble cleared at (${inc.x}, ${inc.y}). The plot can be rebuilt.`);
      inc.stage = 'done'; inc.crew = null;
    }
  }
  c.state = 'back'; c.path = c.path.slice().reverse(); c.pos = 0; c.task = c.task; state.dirty.vehicles = true;
}

function skipIncident(state, inc) {
  const c = state.crews.find(c => c.id === inc.crew);
  if (!c) { // no crew on the way: skip the wait (still needs a crew to respond)
    if (inc.stage === 'rescue') { inc.waited += 24; tickIncidents(state); }
    return;
  }
  if (c.state === 'out') { c.pos = c.path.length - 1; c.state = 'onsite'; c.work = 1; }
  else if (c.state === 'onsite') { c.work = 1; }
  finishOnsite(state, c, inc);
}

// ---------- Save / load ----------
export function serialize(state) { const { dirty, ...rest } = state; return JSON.stringify(rest); }
export function deserialize(json) {
  const s = JSON.parse(json);
  if (s.version !== SAVE_VERSION) throw new Error('Save version mismatch');
  s.dirty = { all: true };
  return s;
}
