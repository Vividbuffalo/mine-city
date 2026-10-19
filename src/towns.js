// EARTH neighbouring towns: small settlements of other peoples placed away from the player's start.
// They are met through exploration (any of their tiles seen), grow over time (houses, then borders),
// keep roughly the player's era, build in their own culture's style, and trade with the player's
// Trading Posts. No war. Pure data + rules; render.js draws them.
import { BUILDINGS, TRADE } from './data.js';
import { tile, T, addLog, SIZE } from './sim.js';
export const TOWN_KINDS = {
  river:  { name: 'Riverfolk', color: 0x3d7fb2, houses: { 1: ['tent', 'polehut'], 2: ['hut', 'mudhouse'], 3: ['mudhouse', 'stonehouse'], 4: ['stonehouse', 'insula'], 5: ['timberhouse', 'stonehouse'], 6: ['townhouse', 'timberhouse'] }, landmark: { 1: 'shrine', 2: 'statue', 3: 'stonewell', 4: 'fountain', 5: 'church', 6: 'clocktower' },
            buys: { tools: 3, cloth: 2, iron: 4, bronze: 3 }, sells: { food: 0.5, clay: 0.4, tin: 2.2, copper: 1.5 } },
  hill:   { name: 'Hill clans', color: 0xb5452f, houses: { 1: ['bonehut', 'hut'], 2: ['brickhouse', 'hut'], 3: ['stonehouse'], 4: ['stonehouse', 'insula'], 5: ['stonehouse', 'timberhouse'], 6: ['townhouse', 'stonehouse'] }, landmark: { 1: 'stones', 2: 'cairn', 3: 'stonewall', 4: 'statue', 5: 'gatehouse', 6: 'observatory' },
            buys: { food: 0.9, cloth: 2.2, wine: 3.5 }, sells: { stone: 0.3, pots: 1.4, copper: 1.2, tin: 1.6, ironore: 1, iron: 4 } },
  forest: { name: 'Forest people', color: 0x3f7d3a, houses: { 1: ['polehut', 'leanto'], 2: ['polehut', 'hut'], 3: ['hut', 'stonehouse'], 4: ['stonehouse'], 5: ['timberhouse', 'polehut'], 6: ['timberhouse'] }, landmark: { 1: 'firepit', 2: 'shrine', 3: 'shrine', 4: 'statue', 5: 'windmill', 6: 'windmill' },
            buys: { pots: 1.2, bronze: 3, tools: 3, wine: 3 }, sells: { wood: 0.25, wool: 0.8, tin: 1.8, copper: 1.4, iron: 4.5, horses: 20 } },
  steppe: { name: 'Horse herders', color: 0xd8a83a, houses: { 1: ['tent', 'leanto'], 2: ['tent', 'hut'], 3: ['hut', 'tent'], 4: ['stonehouse', 'tent'], 5: ['timberhouse', 'tent'], 6: ['timberhouse'] }, landmark: { 1: 'cairn', 2: 'mound', 3: 'stones', 4: 'statue', 5: 'statue', 6: 'clocktower' },
            buys: { bronze: 3, iron: 5, wine: 3, cloth: 2 }, sells: { horses: 14, wool: 0.6, food: 0.6, tin: 2, copper: 1.6 } },
  coast:  { name: 'Sea people', color: 0x2a9a9a, houses: { 1: ['polehut', 'hut'], 2: ['hut', 'mudhouse'], 3: ['mudhouse', 'stonehouse'], 4: ['insula', 'stonehouse'], 5: ['timberhouse', 'stonehouse'], 6: ['townhouse', 'timberhouse'] }, landmark: { 1: 'shrine', 2: 'temple', 3: 'stonewell', 4: 'fountain', 5: 'church', 6: 'clocktower' },
            buys: { tools: 3, wood: 0.5, iron: 4, pots: 1 }, sells: { food: 0.4, clay: 0.5, pots: 1.3, cloth: 1.4, wine: 2.5, tin: 2, copper: 1.5 } },
};
const SYL = ['ka', 'lo', 'ren', 'va', 'tu', 'mi', 'sa', 'dor', 'el', 'an', 'ib', 'ur', 'te', 'no', 'ash', 'bel', 'ki', 'mar'];
const h = (seed, a, b) => { let x = (seed * 374761393 + a * 668265263 + b * 2147483647) | 0; x = (x ^ (x >>> 13)) * 1274126177 | 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

function townName(seed, i) { const n = 2 + Math.floor(h(seed, i, 1) * 2); let s = ''; for (let k = 0; k < n; k++) s += SYL[Math.floor(h(seed, i, 10 + k) * SYL.length)]; return s[0].toUpperCase() + s.slice(1); }
const landOk = (t) => t && t.t !== T.WATER && !t.occ && !t.tocc && !t.road && !t.rp && !(t.t === T.HILL && t.h > 0.6);

export function makeTowns(state) {
  if (state.towns) return;
  state.towns = [];
  const seed = (state.seed | 0) + 9001, sx = state.start.x, sy = state.start.y;
  const cands = [];
  for (let y = 5; y < SIZE - 5; y += 2) for (let x = 5; x < SIZE - 5; x += 2) {
    const t = tile(state, x, y); if (!landOk(t) || t.t === T.HILL) continue;
    const d = Math.hypot(x - sx, y - sy); if (d < 20) continue;
    let water = 0, hill = 0, forest = 0, sea = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const n = tile(state, x + dx, y + dy); if (!n) continue; if (n.sea) sea++; if (n.t === T.WATER) water++; else if (n.t === T.HILL) hill++; else if (n.t === T.FOREST) forest++; }
    if (water - sea > 12 || sea > 22) continue;
    cands.push({ x, y, d, water, hill, forest, sea, r: h(seed, x, y) });
  }
  const picked = [];
  const nTowns = SIZE <= 64 ? 3 : 3 + Math.round((SIZE - 64) / 16);
  for (let i = 0; i < nTowns && cands.length; i++) {
    // large maps: the first town is a harbour on the sea coast, the rest spread further out
    const pool = i === 0 && SIZE > 64 && cands.some(c => c.sea > 0) ? cands.filter(c => c.sea > 0) : cands;
    pool.sort((a, b) => score(b, i) - score(a, i));
    const c = pool[0]; cands.splice(cands.indexOf(c), 1); picked.push(c);
    for (let j = cands.length - 1; j >= 0; j--) if (Math.hypot(cands[j].x - c.x, cands[j].y - c.y) < 16) cands.splice(j, 1);
  }
  function score(c, i) { return c.r * 6 - Math.abs(c.d - (SIZE <= 64 ? 28 : 26 + i * 5)) * 0.3; }
  picked.forEach((c, i) => {
    const used = state.towns.map(t => t.kind), fit = { river: (c.water - c.sea) * 2, hill: c.hill, forest: c.forest * 0.6, coast: c.sea * 3, steppe: 30 - c.forest - c.hill - c.water };
    const kinds = SIZE <= 64 ? ['river', 'hill', 'forest'] : ['river', 'hill', 'forest', 'coast', 'steppe'];
    const okK = kinds.filter(k => k !== 'coast' || c.sea > 0), free = okK.filter(k => !used.includes(k)), pool = free.length ? free : okK; const kind = c.sea > 0 && free.includes('coast') ? 'coast' : pool.sort((a, b) => fit[b] - fit[a])[0];
    const town = { id: i + 1, name: townName(seed, i), kind, x: c.x, y: c.y, era: 1, houses: [], met: false, wealth: 0, pop: 0, r: 3, grow: 0, traded: 0 };
    state.towns.push(town);
    addBuilding(state, town, TOWN_KINDS[kind].landmark[1], c.x, c.y);
    for (let k = 0; k < 4; k++) growTown(state, town);
  });
  claim(state);
}

function addBuilding(state, town, kind, x, y) {
  const t = tile(state, x, y); if (!landOk(t)) return false;
  t.tocc = town.id; if (t.trees) { t.trees = 0; state.dirty.trees = true; }
  town.houses.push({ x, y, kind, rot: Math.floor(h(town.id, x, y) * 4) });
  if (BUILDINGS[kind] && BUILDINGS[kind].cap) town.pop += BUILDINGS[kind].cap;
  state.dirty.towns = true; return true;
}
function growTown(state, town) {
  const K = TOWN_KINDS[town.kind], list = K.houses[Math.min(6, town.era)] || K.houses[Math.min(4, town.era)] || K.houses[1];
  for (let tries = 0; tries < 40; tries++) {
    const a = h(town.id * 31 + town.houses.length, tries, 3) * Math.PI * 2, rr = 1.2 + h(town.id, town.houses.length, tries) * town.r;
    const x = Math.round(town.x + Math.cos(a) * rr), y = Math.round(town.y + Math.sin(a) * rr);
    if (x < 1 || y < 1 || x >= SIZE - 1 || y >= SIZE - 1) continue;
    const kind = list[(town.houses.length + tries) % list.length];
    if (addBuilding(state, town, kind, x, y)) { town.r = Math.min(9, 2.5 + Math.sqrt(town.houses.length) * 1.1); return true; }
  }
  return false;
}
// borders: tiles within a town's radius belong to it (shown as a faint border on the map)
function claim(state) {
  for (const town of state.towns) { const R = Math.ceil(town.r + 1); for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { if (Math.hypot(dx, dy) > town.r + 1) continue; const t = tile(state, town.x + dx, town.y + dy); if (t && !t.occ && (!t.town || t.town === town.id)) t.town = town.id; } }
  state.dirty.towns = true;
}

// daily: meet towns that have been seen, grow them, and trade through the player's trading posts
export function tickTowns(state) {
  if (!state.towns) return;
  const day = Math.floor(state.tick / 24);
  let posts = 0; for (const b of Object.values(state.buildings)) if (b.done && !b.ruin && BUILDINGS[b.kind] && BUILDINGS[b.kind].trade && (b.workers || 0) > 0) posts += BUILDINGS[b.kind].trade;
  for (const town of state.towns) {
    if (!town.met && town.houses.some(p => { const t = tile(state, p.x, p.y); return t && t.vis; })) { town.met = true; addLog(state, `You have met the ${TOWN_KINDS[town.kind].name} of ${town.name}.`); state.dirty.towns = true; }
    // growth: steady, faster with trade wealth; their era follows the player's (never ahead)
    town.grow += 0.08 + Math.min(0.3, town.wealth / 2000);
    if (town.grow >= 1) { town.grow -= 1; if (town.houses.length < 40) { growTown(state, town); if (town.houses.length % 6 === 0) { const K = TOWN_KINDS[town.kind]; const lm = K.landmark[Math.min(6, town.era)] || K.landmark[Math.min(4, town.era)]; for (let k = 0; k < 10; k++) { const x = town.x + Math.round((h(day, k, town.id) - 0.5) * town.r * 2), y = town.y + Math.round((h(k, day, town.id) - 0.5) * town.r * 2); if (addBuilding(state, town, lm, x, y)) break; } } claim(state); } }
    if (town.era < state.era && h(day, town.id, 77) < 0.04) { town.era++; state.dirty.towns = true; }
    if (!town.met || !posts || day % TRADE.everyDays) continue;
    const K = TOWN_KINDS[town.kind], n = TRADE.perTrip * posts; let money = 0;
    for (const [k, price] of Object.entries(K.buys)) { const q = Math.min(n, Math.floor((state.res[k] || 0) - TRADE.keep)); if (q > 0) { state.res[k] -= q; money += q * price; } }
    for (const [k, price] of Object.entries(K.sells)) { if ((k === 'iron' || k === 'ironore') && town.era < 3) continue; if ((state.res[k] || 0) >= 30 || state.res.money < 150) continue; const q = k === 'horses' ? 1 : n; state.res[k] = (state.res[k] || 0) + q; money -= q * price; }
    state.res.money += money; town.wealth += Math.abs(money); town.traded += money; state.tradeIncome = (state.tradeIncome || 0) + money;
  }
}
