// Static game data: buildings, techs, eras, block materials. Pure data, no rendering.
export const SAVE_VERSION = 1;
export const HOURS_PER_DAY = 24;

export const ERAS = {
  1: { name: 'Stone & Clay', maxDepth: 5, tier: 'Surface' },
  2: { name: 'Bronze', maxDepth: 30, tier: 'Shallow shaft' },
};

export const RESOURCES = ['wood', 'clay', 'stone', 'copper', 'tin', 'brick', 'bronze', 'food'];

export const DEPOSITS = {
  clay:   { name: 'Clay',   color: 0xc98a5a },
  stone:  { name: 'Stone',  color: 0x9aa0a6 },
  copper: { name: 'Copper', color: 0x3fae8c },
  tin:    { name: 'Tin',    color: 0xd7dde6 },
};

// cost: money + materials. time: build hours. jobs: worker slots. weight: subsidence weight factor.
export const BUILDINGS = {
  hut:        { name: 'Hut', cat: 'Housing', era: 1, size: 1, cost: { money: 20, wood: 6 }, time: 10, cap: 4, weight: 0.5, upkeep: 0 },
  brickhouse: { name: 'Brick House', cat: 'Housing', era: 2, size: 1, cost: { money: 60, brick: 10, wood: 4 }, time: 24, cap: 10, weight: 1, upkeep: 0.5 },
  stall:      { name: 'Market Stall', cat: 'Shops', era: 1, size: 1, cost: { money: 30, wood: 6 }, time: 10, jobs: 2, shop: 25, weight: 0.5, upkeep: 0.5 },
  store:      { name: 'General Store', cat: 'Shops', era: 2, size: 1, cost: { money: 80, brick: 12, wood: 4 }, time: 24, jobs: 4, shop: 70, weight: 1, upkeep: 1 },
  field:      { name: 'Field', cat: 'Food', era: 1, size: 2, cost: { money: 15, wood: 2 }, time: 8, jobs: 2, food: 14, weight: 0.3, upkeep: 0, terrain: [0] },
  granary:    { name: 'Granary', cat: 'Food', era: 2, size: 1, cost: { money: 60, brick: 8, wood: 6 }, time: 20, jobs: 1, weight: 1.5, upkeep: 0.5 },
  woodcutter: { name: 'Woodcutter', cat: 'Mining', era: 1, size: 1, cost: { money: 20 }, time: 6, jobs: 2, extract: 'wood', rate: 16, radius: 3, woodPerTree: 4, weight: 0.5, upkeep: 0 },
  claypit:    { name: 'Clay Pit', cat: 'Mining', era: 1, size: 1, cost: { money: 25, wood: 2 }, time: 8, jobs: 2, extract: ['clay'], rate: 10, radius: 2, maxDepth: 5, weight: 0.3, upkeep: 0.2 },
  quarry:     { name: 'Quarry', cat: 'Mining', era: 1, size: 1, cost: { money: 30, wood: 4 }, time: 10, jobs: 3, extract: ['stone'], rate: 8, radius: 2, maxDepth: 5, weight: 0.3, upkeep: 0.3 },
  orepit:     { name: 'Ore Pit', cat: 'Mining', era: 1, size: 1, cost: { money: 40, wood: 6 }, time: 12, jobs: 3, extract: ['copper', 'tin'], rate: 5, radius: 2, maxDepth: 5, weight: 0.3, upkeep: 0.3 },
  shaft:      { name: 'Shaft Mine', cat: 'Mining', era: 2, size: 1, cost: { money: 120, wood: 20, stone: 10 }, time: 30, jobs: 5, extract: ['copper', 'tin', 'stone', 'clay'], rate: 8, radius: 3, maxDepth: 30, shaft: true, needs: 'carpentry', weight: 1, upkeep: 1 },
  kiln:       { name: 'Kiln', cat: 'Industry', era: 1, size: 1, cost: { money: 40, stone: 6, wood: 4 }, time: 14, jobs: 2, recipe: { in: { clay: 2, wood: 1 }, out: { brick: 2 }, perDay: 6 }, weight: 1.5, upkeep: 0.5 },
  smelter:    { name: 'Smelter', cat: 'Industry', era: 2, size: 1, cost: { money: 100, brick: 15, stone: 10 }, time: 30, jobs: 3, recipe: { in: { copper: 3, tin: 1, wood: 2 }, out: { bronze: 2 }, perDay: 4 }, weight: 2, upkeep: 1 },
  carpentry:  { name: "Carpenter's Yard", cat: 'Industry', era: 2, size: 1, cost: { money: 60, wood: 15 }, time: 16, jobs: 2, weight: 0.8, upkeep: 0.5 },
  well:       { name: 'Well', cat: 'Services', era: 1, size: 1, cost: { money: 15, stone: 4 }, time: 6, radius: 5, weight: 0.5, upkeep: 0.1 },
  rescue:     { name: 'Rescue & Cleanup Post', cat: 'Services', era: 1, size: 1, cost: { money: 80, wood: 10 }, time: 16, jobs: 4, crews: 2, weight: 1, upkeep: 2 },
  custom:     { name: 'Custom Build', cat: 'Custom', era: 1, size: 1, cost: {}, time: 4, weight: 1, upkeep: 0.2, hidden: true },
};

export const CATEGORIES = ['Housing', 'Shops', 'Food', 'Mining', 'Industry', 'Services'];

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

export const ERA_REQ = { 1: { pop: 50, bricksMade: 100, techs: ['pottery', 'smelting'] } };

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
