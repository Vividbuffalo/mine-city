// Static game data: buildings, techs, eras, block materials. Pure data, no rendering.
export const SAVE_VERSION = 1;
export const HOURS_PER_DAY = 24;

export const ERAS = {
  1: { name: 'Stone & Clay', maxDepth: 5, tier: 'Surface' },
  2: { name: 'Bronze', maxDepth: 30, tier: 'Shallow shaft' },
};

export const RESOURCES = ['wood', 'clay', 'stone', 'copper', 'tin', 'brick', 'bronze', 'food'];
export const ERA3_NOTE = 'Iron (and iron mines) arrive with the Iron era, after Bronze.';

export const DEPOSITS = {
  clay:   { name: 'Clay',   color: 0xc98a5a },
  stone:  { name: 'Stone',  color: 0x9aa0a6 },
  copper: { name: 'Copper', color: 0x3fae8c },
  tin:    { name: 'Tin',    color: 0xd7dde6 },
};

// cost: money + materials. time: build hours. jobs: worker slots. weight: subsidence weight factor.
// Stone & Clay era set is kept archaeologically grounded: poles, hides, bark, wattle, daub, bone, stone, clay. No sawn planks, no metal.
// Optional fields: cap (housing), jobs, food (per day at full staff), extract/rate/radius, recipe, culture (points/day),
// happy (static happiness, decor), store (drop-off point for villagers), foodMult (food bonus), gatherMult (gathering bonus),
// mat (durability class for aging: hide/thatch/wood/daub/stone/brick), ambition (hidden structural ambition 0..1).
export const BUILDINGS = {
  // --- housing ---
  leanto:     { name: 'Lean-to Windbreak', cat: 'Housing', era: 1, size: 1, cost: { wood: 3 }, time: 3, cap: 2, weight: 0.2, upkeep: 0, mat: 'hide' },
  tent:       { name: 'Hide Tent', cat: 'Housing', era: 1, size: 1, cost: { wood: 4 }, time: 4, cap: 3, weight: 0.2, upkeep: 0, mat: 'hide' },
  polehut:    { name: 'Bark-Covered Pole Hut', cat: 'Housing', era: 1, size: 1, cost: { wood: 7 }, time: 6, cap: 4, weight: 0.3, upkeep: 0, mat: 'wood' },
  hut:        { name: 'Wattle-and-Daub Hut', cat: 'Housing', era: 1, size: 1, cost: { wood: 6, clay: 2 }, time: 8, cap: 5, weight: 0.5, upkeep: 0, mat: 'daub' },
  bonehut:    { name: 'Mammoth-Bone Hut', cat: 'Housing', era: 1, size: 1, cost: { stone: 6, wood: 3 }, time: 10, cap: 5, weight: 0.6, upkeep: 0, mat: 'stone', happy: 1 },
  longhouse:  { name: 'Longhouse', cat: 'Housing', era: 1, size: 2, cost: { wood: 30, clay: 6 }, time: 24, cap: 14, weight: 1, upkeep: 0.2, mat: 'daub', happy: 1 },
  brickhouse: { name: 'Brick House', cat: 'Housing', era: 2, size: 1, cost: { money: 60, brick: 10, wood: 4 }, time: 24, cap: 10, weight: 1, upkeep: 0.5, mat: 'brick' },
  // --- food ---
  berryhut:   { name: "Gatherer's Hut", cat: 'Food', era: 1, size: 1, cost: { wood: 5 }, time: 5, jobs: 2, food: 12, weight: 0.3, upkeep: 0, mat: 'wood' },
  hunter:     { name: "Hunter's Lodge", cat: 'Food', era: 1, size: 1, cost: { wood: 8, stone: 2 }, time: 8, jobs: 2, food: 12, weight: 0.4, upkeep: 0, mat: 'hide' },
  weir:       { name: 'Fish Weir', cat: 'Food', era: 1, size: 1, cost: { wood: 6 }, time: 6, jobs: 1, food: 12, weight: 0.2, upkeep: 0, mat: 'wood', nearWater: true },
  field:      { name: 'Field', cat: 'Food', era: 1, size: 2, cost: { wood: 4 }, time: 8, jobs: 2, food: 16, weight: 0.3, upkeep: 0, terrain: [0], mat: 'wood' },
  pen:        { name: 'Animal Pen', cat: 'Food', era: 1, size: 1, cost: { wood: 8 }, time: 8, jobs: 1, food: 8, weight: 0.3, upkeep: 0, mat: 'wood' },
  rack:       { name: 'Drying & Smoking Rack', cat: 'Food', era: 1, size: 1, cost: { wood: 5 }, time: 4, jobs: 1, foodMult: 0.1, weight: 0.2, upkeep: 0, mat: 'wood' },
  platform:   { name: 'Raised Storage Platform', cat: 'Food', era: 1, size: 1, cost: { wood: 10 }, time: 8, store: true, foodMult: 0.05, weight: 0.4, upkeep: 0, mat: 'wood' },
  granary:    { name: 'Granary', cat: 'Food', era: 2, size: 1, cost: { money: 60, brick: 8, wood: 6 }, time: 20, jobs: 1, weight: 1.5, upkeep: 0.5, foodMult: 0.2, mat: 'brick' },
  // --- gathering & mining ---
  camp:       { name: 'Gathering Camp', cat: 'Gathering', era: 1, size: 1, cost: { wood: 10 }, time: 8, store: true, trains: true, weight: 0.3, upkeep: 0, mat: 'hide' },
  woodcutter: { name: "Woodcutter's Camp", cat: 'Gathering', era: 1, size: 1, cost: { wood: 4 }, time: 6, jobs: 2, extract: 'wood', rate: 40, radius: 4, woodPerTree: 6, weight: 0.5, upkeep: 0, mat: 'wood' },
  knapper:    { name: 'Knapping Site', cat: 'Gathering', era: 1, size: 1, cost: { stone: 6, wood: 2 }, time: 5, jobs: 2, gatherMult: 0.15, weight: 0.3, upkeep: 0, mat: 'stone' },
  claypit:    { name: 'Clay Pit', cat: 'Gathering', era: 1, size: 1, cost: { wood: 4 }, time: 6, jobs: 2, extract: ['clay'], rate: 20, radius: 3, maxDepth: 5, weight: 0.3, upkeep: 0, mat: 'stone' },
  quarry:     { name: 'Stone Quarry', cat: 'Gathering', era: 1, size: 1, cost: { wood: 6 }, time: 8, jobs: 3, extract: ['stone'], rate: 12, radius: 3, maxDepth: 5, weight: 0.3, upkeep: 0, mat: 'stone' },
  orepit:     { name: 'Copper Ore Pit', cat: 'Gathering', era: 2, size: 1, cost: { money: 40, wood: 6 }, time: 12, jobs: 3, extract: ['copper', 'tin'], rate: 6, radius: 2, maxDepth: 5, weight: 0.3, upkeep: 0.3, mat: 'wood' },
  shaft:      { name: 'Shaft Mine', cat: 'Gathering', era: 2, size: 1, cost: { money: 120, wood: 20, stone: 10 }, time: 30, jobs: 5, extract: ['copper', 'tin', 'stone', 'clay'], rate: 8, radius: 3, maxDepth: 30, shaft: true, needs: 'carpentry', weight: 1, upkeep: 1, mat: 'wood' },
  // --- crafts & industry ---
  kiln:       { name: 'Pottery Kiln', cat: 'Industry', era: 1, size: 1, cost: { stone: 6, clay: 6, wood: 4 }, time: 12, jobs: 2, recipe: { in: { clay: 2, wood: 1 }, out: { brick: 2 }, perDay: 6 }, weight: 1.5, upkeep: 0, mat: 'daub' },
  canoe:      { name: 'Dugout Canoe Maker', cat: 'Industry', era: 1, size: 1, cost: { wood: 20, stone: 4 }, time: 16, jobs: 2, weight: 0.4, upkeep: 0, mat: 'wood', nearWater: true, enables: 'canoe' },
  smelter:    { name: 'Smelter', cat: 'Industry', era: 2, size: 1, cost: { money: 100, brick: 15, stone: 10 }, time: 30, jobs: 3, recipe: { in: { copper: 3, tin: 1, wood: 2 }, out: { bronze: 2 }, perDay: 4 }, weight: 2, upkeep: 1, mat: 'brick' },
  carpentry:  { name: "Carpenter's Yard", cat: 'Industry', era: 2, size: 1, cost: { money: 60, wood: 15 }, time: 16, jobs: 2, weight: 0.8, upkeep: 0.5, mat: 'wood' },
  // --- culture & decoration ---
  firepit:    { name: 'Fire Pit', cat: 'Culture', era: 1, size: 1, cost: { stone: 3, wood: 2 }, time: 2, culture: 0.5, happy: 2, weight: 0.2, upkeep: 0, mat: 'stone' },
  shrine:     { name: 'Shrine', cat: 'Culture', era: 1, size: 1, cost: { stone: 5, wood: 4 }, time: 8, culture: 2, happy: 2, weight: 0.4, upkeep: 0, mat: 'stone' },
  stones:     { name: 'Standing Stones', cat: 'Culture', era: 1, size: 1, cost: { stone: 24 }, time: 30, culture: 4, happy: 3, weight: 1.5, upkeep: 0, mat: 'stone' },
  timbercircle: { name: 'Timber Circle', cat: 'Culture', era: 1, size: 2, cost: { wood: 40 }, time: 36, culture: 6, happy: 4, weight: 0.8, upkeep: 0, mat: 'wood' },
  greathall:  { name: 'Great Timber Hall', cat: 'Culture', era: 1, size: 2, cost: { wood: 90, stone: 20, clay: 10 }, time: 72, culture: 12, happy: 8, cap: 6, weight: 2.5, upkeep: 0.5, mat: 'wood', ambition: 0.85 },
  palisade:   { name: 'Palisade Section', cat: 'Culture', era: 1, size: 1, cost: { wood: 3 }, time: 2, happy: 0.4, weight: 0.2, upkeep: 0, mat: 'wood', decor: true },
  trackway:   { name: 'Wooden Trackway', cat: 'Culture', era: 1, size: 1, cost: { wood: 2 }, time: 2, happy: 0.2, weight: 0.1, upkeep: 0, mat: 'wood', decor: true, flat: true },
  cairn:      { name: 'Stone Cairn', cat: 'Culture', era: 1, size: 1, cost: { stone: 4 }, time: 2, happy: 0.5, culture: 0.2, weight: 0.3, upkeep: 0, mat: 'stone', decor: true },
  // --- services & trade ---
  stall:      { name: 'Barter Place', cat: 'Services', era: 1, size: 1, cost: { wood: 6 }, time: 6, jobs: 2, shop: 25, weight: 0.3, upkeep: 0, mat: 'wood' },
  store:      { name: 'General Store', cat: 'Services', era: 2, size: 1, cost: { money: 80, brick: 12, wood: 4 }, time: 24, jobs: 4, shop: 70, weight: 1, upkeep: 1, mat: 'brick' },
  well:       { name: 'Well', cat: 'Services', era: 1, size: 1, cost: { stone: 6 }, time: 6, radius: 5, weight: 0.5, upkeep: 0, mat: 'stone' },
  rescue:     { name: 'Healer & Rescue Post', cat: 'Services', era: 1, size: 1, cost: { wood: 12, stone: 2 }, time: 12, jobs: 4, crews: 2, weight: 0.6, upkeep: 0.5, mat: 'wood' },
  custom:     { name: 'Custom Build', cat: 'Custom', era: 1, size: 1, cost: {}, time: 4, weight: 1, upkeep: 0.2, hidden: true },
};

// Villagers (shared unit system): what they gather from which map feature, rates per game hour, load size
export const GATHER = {
  wood:  { name: 'Chopping wood', rate: 0.55, from: 'tree' },
  stone: { name: 'Breaking stone', rate: 0.35, from: 'outcrop' },
  clay:  { name: 'Digging clay', rate: 0.45, from: 'claybank' },
  food:  { name: 'Picking berries', rate: 0.7, from: 'berry' },
};
export const VILLAGER = { load: 10, trainCost: { food: 10 }, startCount: 3, perPop: 8 /* +1 max villager per 8 people */, haul: 0.5 /* townsfolk carry materials at the base build pace */ };
// Aging: condition (0..100) lost per day by durability class; maintenance by idle hands restores it using a little wood
export const DECAY = { hide: 0.9, thatch: 0.7, wood: 0.5, daub: 0.45, stone: 0.12, brick: 0.18 };
export const CONDITION_STAGES = [[75, 'Good'], [50, 'Weathered'], [25, 'Worn'], [1, 'Derelict']];

export const CATEGORIES = ['Housing', 'Food', 'Gathering', 'Industry', 'Culture', 'Services'];

export const TECHS = {
  pottery:  { name: 'Pottery', era: 1, cost: 40, req: [] },
  smelting: { name: 'Smelting', era: 1, cost: 80, req: ['pottery'] },
  timber:   { name: 'Timber Supports', era: 2, cost: 70, req: [] },
  writing:  { name: 'Writing', era: 2, cost: 90, req: [] },
  earthworks: { name: 'Earthworks & Terracing', era: 2, cost: 60, req: [] },
  prospecting: { name: 'Prospecting (Survey)', era: 2, cost: 50, req: [] },
};

// Terrain levelling. Bronze: cut a terrace into a steep (mountain) tile so it can be built on. Later eras: full levelling / cutting into mountains (design).
export const EARTHWORKS = { cost: { money: 40, stone: 6 }, hours: 30, needs: 'carpentry', tech: 'earthworks' };

// Deposits visible on the surface without surveying (clay banks, stone outcrops, copper stains): max depth in m
export const SURFACE_DEPTH = { clay: 2, stone: 2, copper: 3, tin: 2 };
// Saplings: planting cost and growth (game hours per stage: sapling -> young -> grown tree)
export const SAPLING = { cost: { money: 3 }, stages: [48, 96], grownAt: 144 };
// Dismantling (early eras): reverse construction at this fraction of build time, refunds part of the materials
export const DISMANTLE = { timeMult: 0.6, refund: 0.5, bulldozerEra: 'Industrial' };

// Next-era milestones (shown as a plain status line): population, finished buildings, culture points, techs
export const ERA_REQ = { 1: { pop: 30, buildings: 15, culture: 100, techs: ['pottery', 'smelting'] } };

// Block-build materials (0.5-tile blocks)
export const BLOCKS = {
  mud:    { name: 'Mud brick', res: 'clay', era: 1, color: 0xb08860, weight: 0.03 },
  wood:   { name: 'Timber', res: 'wood', era: 1, color: 0x8a5a32, weight: 0.015 },
  stone:  { name: 'Stone', res: 'stone', era: 1, color: 0xa7a9ab, weight: 0.05 },
  brick:  { name: 'Brick', res: 'brick', era: 1, color: 0xa8453a, weight: 0.04 },
  bronze: { name: 'Bronze', res: 'bronze', era: 2, color: 0xc8913a, weight: 0.06 },
};
export const CUSTOM_FUNCS = { house: 'House', shop: 'Shop', monument: 'Monument' };

// Per-culture overrides hook (design doc: era progression varies by civilization).
// MVP uses only 'default'. A culture can override era timings, tech costs/order, or add techs.
export const CULTURES = { default: { techCostMult: 1, eraOverrides: {}, extraTechs: {} } };
export function techCost(id, culture = 'default') {
  const c = CULTURES[culture] || CULTURES.default;
  return Math.round(TECHS[id].cost * c.techCostMult);
}
