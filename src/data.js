// Static game data: buildings, techs, eras, block materials. Pure data, no rendering.
export const SAVE_VERSION = 1;
export const HOURS_PER_DAY = 24;

export const ERAS = {
  1: { name: 'Stone & Clay', maxDepth: 5, tier: 'Surface' },
  2: { name: 'Bronze', maxDepth: 30, tier: 'Shallow shaft' },
  3: { name: 'Iron', maxDepth: 60, tier: 'Deep shaft' },
  4: { name: 'Classical', maxDepth: 80, tier: 'Deep shaft' },
};

export const RESOURCES = ['wood', 'clay', 'stone', 'copper', 'tin', 'brick', 'bronze', 'food', 'tools', 'pots', 'wool', 'flax', 'cloth', 'ironore', 'charcoal', 'iron', 'blocks', 'horses', 'grapes', 'wine'];
export const ERA3_NOTE = 'Iron (and iron mines) arrive with the Iron era, after Bronze.';

export const DEPOSITS = {
  clay:   { name: 'Clay',   color: 0xc98a5a },
  stone:  { name: 'Stone',  color: 0x9aa0a6 },
  copper: { name: 'Copper', color: 0x3fae8c },
  tin:    { name: 'Tin',    color: 0xd7dde6 },
  ironore: { name: 'Iron ore', color: 0xa4512f },
};

// cost: money + materials. time: build hours. jobs: worker slots. weight: subsidence weight factor.
// Stone & Clay era set is kept archaeologically grounded: poles, hides, bark, wattle, daub, bone, stone, clay. No sawn planks, no metal.
// Optional fields: cap (housing), jobs, food (per day at full staff), extract/rate/radius, recipe, culture (points/day),
// happy (static happiness, decor), store (drop-off point for villagers), foodMult (food bonus), gatherMult (gathering bonus),
// mat (durability class for aging: hide/thatch/wood/daub/stone/brick), ambition (hidden structural ambition 0..1).
export const BUILDINGS = {
  // --- housing ---
  leanto:     { name: 'Lean-to Shelter', cat: 'Housing', era: 1, size: 1, cost: { wood: 3 }, time: 3, cap: 2, weight: 0.2, upkeep: 0, mat: 'hide' },
  tent:       { name: 'Teepee', cat: 'Housing', era: 1, size: 1, cost: { wood: 4 }, time: 4, cap: 3, weight: 0.2, upkeep: 0, mat: 'hide' },
  polehut:    { name: 'Bark Hut', cat: 'Housing', era: 1, size: 1, cost: { wood: 7 }, time: 6, cap: 4, weight: 0.3, upkeep: 0, mat: 'wood' },
  hut:        { name: 'Mud Hut', cat: 'Housing', era: 1, size: 1, cost: { wood: 6, clay: 2 }, time: 8, cap: 5, weight: 0.5, upkeep: 0, mat: 'daub' },
  bonehut:    { name: 'Bone Hut', cat: 'Housing', era: 1, size: 1, cost: { stone: 6, wood: 3 }, time: 10, cap: 5, weight: 0.6, upkeep: 0, mat: 'stone', happy: 1 },
  longhouse:  { name: 'Longhouse', cat: 'Housing', era: 1, size: 2, cost: { wood: 30, clay: 6 }, time: 24, cap: 14, weight: 1, upkeep: 0.2, mat: 'daub', happy: 1 },
  brickhouse: { name: 'Brick House', cat: 'Housing', era: 2, size: 1, cost: { money: 60, brick: 10, wood: 4 }, time: 24, cap: 10, weight: 1, upkeep: 0.5, mat: 'brick' },
  // --- food ---
  berryhut:   { name: 'Berry Gatherer', cat: 'Food', era: 1, size: 1, cost: { wood: 5 }, time: 5, jobs: 2, food: 12, weight: 0.3, upkeep: 0, mat: 'wood' },
  hunter:     { name: 'Hunting Lodge', cat: 'Food', era: 1, size: 1, cost: { wood: 8, stone: 2 }, time: 8, jobs: 2, food: 12, weight: 0.4, upkeep: 0, mat: 'hide' },
  weir:       { name: 'Fish Trap', cat: 'Food', era: 1, size: 1, cost: { wood: 6 }, time: 6, jobs: 1, food: 12, weight: 0.2, upkeep: 0, mat: 'wood', nearWater: true },
  field:      { name: 'Crop Field', cat: 'Food', era: 1, size: 2, cost: { wood: 4 }, time: 8, jobs: 2, food: 16, weight: 0.3, upkeep: 0, terrain: [0], mat: 'wood' },
  pen:        { name: 'Animal Pen', cat: 'Food', era: 1, size: 1, cost: { wood: 8 }, time: 8, jobs: 1, food: 8, weight: 0.3, upkeep: 0, mat: 'wood' },
  rack:       { name: 'Meat Drying Rack', cat: 'Food', era: 1, size: 1, cost: { wood: 5 }, time: 4, jobs: 1, foodMult: 0.1, weight: 0.2, upkeep: 0, mat: 'wood' },
  platform:   { name: 'Food Store', cat: 'Food', era: 1, size: 1, cost: { wood: 10 }, time: 8, store: true, foodMult: 0.05, weight: 0.4, upkeep: 0, mat: 'wood' },
  granary:    { name: 'Granary', cat: 'Food', era: 2, size: 1, cost: { money: 60, brick: 8, wood: 6 }, time: 20, jobs: 1, weight: 1.5, upkeep: 0.5, foodMult: 0.2, mat: 'brick' },
  // --- gathering & mining ---
  camp:       { name: 'Main Camp', cat: 'Gathering', era: 1, size: 1, cost: { wood: 10 }, time: 8, store: true, trains: true, weight: 0.3, upkeep: 0, mat: 'hide' },
  woodcutter: { name: 'Woodcutter', cat: 'Gathering', era: 1, size: 1, cost: { wood: 4 }, time: 6, jobs: 2, extract: 'wood', rate: 40, radius: 4, woodPerTree: 6, weight: 0.5, upkeep: 0, mat: 'wood' },
  knapper:    { name: 'Stone Tool Maker', cat: 'Gathering', era: 1, size: 1, cost: { stone: 6, wood: 2 }, time: 5, jobs: 2, gatherMult: 0.15, weight: 0.3, upkeep: 0, mat: 'stone' },
  claypit:    { name: 'Clay Pit', cat: 'Gathering', era: 1, size: 1, cost: { wood: 4 }, time: 6, jobs: 2, extract: ['clay'], rate: 16, radius: 3, maxDepth: 5, weight: 0.3, upkeep: 0, mat: 'stone' },
  quarry:     { name: 'Stone Quarry', cat: 'Gathering', era: 1, size: 1, cost: { wood: 6 }, time: 8, jobs: 3, extract: ['stone'], rate: 8, radius: 3, maxDepth: 5, weight: 0.3, upkeep: 0, mat: 'stone' },
  orepit:     { name: 'Copper Pit', cat: 'Gathering', era: 2, size: 1, cost: { money: 40, wood: 6 }, time: 12, jobs: 3, extract: ['copper', 'tin'], rate: 6, radius: 2, maxDepth: 5, weight: 0.3, upkeep: 0.3, mat: 'wood' },
  shaft:      { name: 'Deep Mine', cat: 'Gathering', era: 2, size: 1, cost: { money: 120, wood: 20, stone: 10 }, time: 30, jobs: 5, extract: ['copper', 'tin', 'stone', 'clay'], rate: 8, radius: 3, maxDepth: 30, shaft: true, needs: 'carpentry', weight: 1, upkeep: 1, mat: 'wood' },
  // --- crafts & industry ---
  kiln:       { name: 'Brick Kiln', cat: 'Industry', era: 1, size: 1, cost: { stone: 6, clay: 6, wood: 4 }, time: 12, jobs: 2, recipe: { in: { clay: 2, wood: 1 }, out: { brick: 2 }, perDay: 6 }, weight: 1.5, upkeep: 0, mat: 'daub' },
  canoe:      { name: 'Canoe Maker', cat: 'Industry', era: 1, size: 1, cost: { wood: 20, stone: 4 }, time: 16, jobs: 2, weight: 0.4, upkeep: 0, mat: 'wood', nearWater: true, enables: 'canoe' },
  smelter:    { name: 'Smelter', cat: 'Industry', era: 2, size: 1, cost: { money: 100, brick: 15, stone: 10 }, time: 30, jobs: 3, recipe: { in: { copper: 3, tin: 1, wood: 2 }, out: { bronze: 2 }, perDay: 4 }, weight: 2, upkeep: 1, mat: 'brick' },
  carpentry:  { name: 'Carpenter', cat: 'Industry', era: 2, size: 1, cost: { money: 60, wood: 15 }, time: 16, jobs: 2, weight: 0.8, upkeep: 0.5, mat: 'wood' },
  // --- culture & decoration ---
  firepit:    { name: 'Fire Pit', cat: 'Culture', era: 1, size: 1, cost: { stone: 3, wood: 2 }, time: 2, culture: 0.5, happy: 2, weight: 0.2, upkeep: 0, mat: 'stone' },
  shrine:     { name: 'Shrine', cat: 'Culture', era: 1, size: 1, cost: { stone: 5, wood: 4 }, time: 8, culture: 2, happy: 2, weight: 0.4, upkeep: 0, mat: 'stone' },
  stones:     { name: 'Standing Stones', cat: 'Culture', era: 1, size: 1, cost: { stone: 24 }, time: 30, culture: 4, happy: 3, weight: 1.5, upkeep: 0, mat: 'stone' },
  timbercircle: { name: 'Wooden Ring', cat: 'Culture', era: 1, size: 2, cost: { wood: 40 }, time: 36, culture: 6, happy: 4, weight: 0.8, upkeep: 0, mat: 'wood' },
  greathall:  { name: 'Great Hall', cat: 'Culture', era: 1, size: 2, cost: { wood: 90, stone: 20, clay: 10 }, time: 72, culture: 12, happy: 8, cap: 6, weight: 2.5, upkeep: 0.5, mat: 'wood', ambition: 0.85 },
  palisade:   { name: 'Wooden Fence', cat: 'Culture', era: 1, size: 1, cost: { wood: 3 }, time: 2, happy: 0.4, weight: 0.2, upkeep: 0, mat: 'wood', decor: true },
  trackway:   { name: 'Log Path', cat: 'Culture', era: 1, size: 1, cost: { wood: 2 }, time: 2, happy: 0.2, weight: 0.1, upkeep: 0, mat: 'wood', decor: true, flat: true },
  cairn:      { name: 'Stone Pile Marker', cat: 'Culture', era: 1, size: 1, cost: { stone: 4 }, time: 2, happy: 0.5, culture: 0.2, weight: 0.3, upkeep: 0, mat: 'stone', decor: true },
  flowers:    { name: 'Flower Patch', cat: 'Culture', era: 1, size: 1, cost: { food: 2 }, time: 2, happy: 0.5, weight: 0.05, upkeep: 0, mat: 'wood', decor: true, flat: true, plant: true },
  shrubs:     { name: 'Shrubs', cat: 'Culture', era: 1, size: 1, cost: { wood: 1 }, time: 2, happy: 0.4, weight: 0.05, upkeep: 0, mat: 'wood', decor: true, plant: true },
  garden:     { name: 'Herb Garden', cat: 'Culture', era: 1, size: 1, cost: { wood: 3, food: 3 }, time: 4, happy: 1, weight: 0.1, upkeep: 0, mat: 'wood', decor: true, flat: true, plant: true },
  // --- Bronze era ---
  mudhouse:   { name: 'Mud-Brick House', cat: 'Housing', era: 2, size: 1, cost: { brick: 6, wood: 3 }, time: 14, cap: 7, weight: 0.8, upkeep: 0.1, mat: 'brick' },
  irrfield:   { name: 'Irrigated Field', cat: 'Food', era: 2, size: 2, cost: { wood: 6, tools: 1 }, time: 12, jobs: 3, food: 30, weight: 0.3, upkeep: 0, terrain: [0], mat: 'wood', water: 3, tech: 'irrigation' },
  ditch:      { name: 'Irrigation Ditch', cat: 'Food', era: 2, size: 1, cost: { tools: 1 }, time: 6, weight: 0.05, upkeep: 0, terrain: [0], mat: 'soil', flat: true, ditch: true, tech: 'irrigation' },
  sheep:      { name: 'Sheep Pasture', cat: 'Food', era: 2, size: 2, cost: { wood: 10 }, time: 10, jobs: 1, food: 5, weight: 0.2, upkeep: 0, terrain: [0], mat: 'wood', recipe: { in: {}, out: { wool: 3 }, perDay: 1 } },
  flax:       { name: 'Flax Field', cat: 'Food', era: 2, size: 1, cost: { wood: 3 }, time: 6, jobs: 1, weight: 0.1, upkeep: 0, terrain: [0], mat: 'wood', recipe: { in: {}, out: { flax: 3 }, perDay: 1 } },
  oven:       { name: 'Bread Oven', cat: 'Food', era: 2, size: 1, cost: { brick: 6, stone: 4 }, time: 10, jobs: 1, foodMult: 0.12, weight: 0.8, upkeep: 0, mat: 'brick' },
  bronzesmith:{ name: 'Bronze Smith', cat: 'Industry', era: 2, size: 1, cost: { brick: 8, stone: 6, wood: 6 }, time: 16, jobs: 2, recipe: { in: { bronze: 1, wood: 1 }, out: { tools: 2 }, perDay: 4 }, weight: 1.2, upkeep: 0.3, mat: 'brick' },
  potter:     { name: 'Potter', cat: 'Industry', era: 2, size: 1, cost: { brick: 4, wood: 6 }, time: 10, jobs: 2, recipe: { in: { clay: 2, wood: 1 }, out: { pots: 2 }, perDay: 4 }, weight: 0.6, upkeep: 0.1, mat: 'daub' },
  weaver:     { name: 'Weaver', cat: 'Industry', era: 2, size: 1, cost: { wood: 10, brick: 4 }, time: 12, jobs: 2, recipe: { in: { wool: 1, flax: 1 }, out: { cloth: 2 }, perDay: 4 }, weight: 0.6, upkeep: 0.2, mat: 'daub' },
  cartmaker:  { name: 'Cart Maker', cat: 'Industry', era: 2, size: 1, cost: { wood: 20, bronze: 4, tools: 2 }, time: 18, jobs: 2, weight: 0.8, upkeep: 0.3, mat: 'wood', enables: 'carts' },
  raftmaker:  { name: 'Raft Builder', cat: 'Industry', era: 2, size: 1, cost: { wood: 18 }, time: 10, jobs: 1, weight: 0.4, upkeep: 0, mat: 'wood', nearWater: true, enables: 'canoe' },
  bridge:     { name: 'Wooden Bridge', cat: 'Services', era: 2, size: 1, cost: { wood: 20, tools: 1 }, time: 16, weight: 0.5, upkeep: 0.2, mat: 'wood', onWater: true },
  market:     { name: 'Market', cat: 'Services', era: 2, size: 2, cost: { brick: 10, wood: 12 }, time: 20, jobs: 4, shop: 90, sells: { pots: 0.5, cloth: 1.2, tools: 2 }, weight: 0.8, upkeep: 0.5, mat: 'wood', happy: 2 },
  tower:      { name: 'Lookout Tower', cat: 'Services', era: 2, size: 1, cost: { wood: 16, stone: 6 }, time: 12, weight: 0.6, upkeep: 0.1, mat: 'wood', sight: 7 },
  temple:     { name: 'Temple', cat: 'Culture', era: 2, size: 2, cost: { brick: 30, stone: 20, wood: 10 }, time: 48, culture: 10, happy: 6, weight: 2.5, upkeep: 1, mat: 'brick', ambition: 0.4 },
  mound:      { name: 'Burial Mound', cat: 'Culture', era: 2, size: 2, cost: { stone: 30 }, time: 30, culture: 5, happy: 2, weight: 1.5, upkeep: 0, mat: 'stone' },
  statue:     { name: 'Bronze Statue', cat: 'Culture', era: 2, size: 1, cost: { bronze: 10, stone: 6 }, time: 16, culture: 3, happy: 3, weight: 0.8, upkeep: 0, mat: 'stone', decor: true },
  // --- Iron era ---
  charcoal:   { name: 'Charcoal Burner', cat: 'Industry', era: 3, size: 1, cost: { wood: 12, stone: 4 }, time: 10, jobs: 2, recipe: { in: { wood: 3 }, out: { charcoal: 2 }, perDay: 5 }, weight: 0.3, upkeep: 0, mat: 'soil' },
  ironpit:    { name: 'Iron Ore Pit', cat: 'Gathering', era: 3, size: 1, cost: { wood: 10, tools: 2 }, time: 12, jobs: 3, extract: ['ironore'], rate: 6, radius: 2, maxDepth: 8, weight: 0.3, upkeep: 0.3, mat: 'wood' },
  bloomery:   { name: 'Bloomery', cat: 'Industry', era: 3, size: 1, cost: { stone: 24, wood: 6 }, time: 20, jobs: 3, recipe: { in: { ironore: 2, charcoal: 2 }, out: { iron: 1 }, perDay: 5 }, weight: 1, upkeep: 0.3, mat: 'stone' },
  blacksmith: { name: 'Blacksmith', cat: 'Industry', era: 3, size: 1, cost: { stone: 16, wood: 10, iron: 4 }, time: 18, jobs: 2, recipe: { in: { iron: 1, charcoal: 1 }, out: { tools: 3 }, perDay: 4 }, weight: 1, upkeep: 0.3, mat: 'stone', enables: 'ironTools' },
  mason:      { name: 'Stonemason', cat: 'Industry', era: 3, size: 1, cost: { wood: 10, tools: 2 }, time: 12, jobs: 3, recipe: { in: { stone: 3 }, out: { blocks: 2 }, perDay: 5 }, weight: 0.5, upkeep: 0.1, mat: 'stone' },
  stonehouse: { name: 'Stone House', cat: 'Housing', era: 3, size: 1, cost: { blocks: 8, wood: 4 }, time: 20, cap: 9, weight: 1.2, upkeep: 0.1, mat: 'stone' },
  stonewell:  { name: 'Stone Well', cat: 'Services', era: 3, size: 1, cost: { blocks: 6 }, time: 8, radius: 7, waterSupply: true, weight: 0.5, upkeep: 0, mat: 'stone' },
  horsefarm:  { name: 'Horse Breeder', cat: 'Food', era: 3, size: 2, cost: { wood: 24, stone: 6 }, time: 20, jobs: 2, terrain: [0], recipe: { in: { food: 4 }, out: { horses: 1 }, perDay: 0.5 }, weight: 0.4, upkeep: 0.3, mat: 'wood', enables: 'horses' },
  vineyard:   { name: 'Vineyard', cat: 'Food', era: 3, size: 2, cost: { wood: 12, tools: 1 }, time: 14, jobs: 2, terrain: [0, 2], recipe: { in: {}, out: { grapes: 3 }, perDay: 1 }, weight: 0.2, upkeep: 0, mat: 'wood', slopeOk: true },
  winepress:  { name: 'Wine Press', cat: 'Industry', era: 3, size: 1, cost: { blocks: 6, wood: 8 }, time: 14, jobs: 2, recipe: { in: { grapes: 2, pots: 1 }, out: { wine: 2 }, perDay: 3 }, weight: 0.6, upkeep: 0.1, mat: 'stone' },
  tradepost:  { name: 'Trading Post', cat: 'Services', era: 3, size: 1, cost: { wood: 20, blocks: 4 }, time: 16, jobs: 2, weight: 0.5, upkeep: 0.4, mat: 'wood', trade: 1 },
  stonewall:  { name: 'Stone Wall', cat: 'Culture', era: 3, size: 1, cost: { blocks: 2 }, time: 3, weight: 0.4, upkeep: 0, mat: 'stone', decor: true, happy: 0.2 },
  hillfort:   { name: 'Hill Fort', cat: 'Culture', era: 3, size: 2, cost: { blocks: 30, wood: 20 }, time: 60, culture: 6, happy: 2, weight: 3, upkeep: 0.8, mat: 'stone', sight: 8, slopeOk: true },
  // --- Classical era ---
  aqueduct:   { name: 'Aqueduct', cat: 'Services', era: 4, size: 1, cost: { blocks: 6, brick: 4 }, time: 10, weight: 0.8, upkeep: 0.1, mat: 'stone', aqueduct: true, slopeOk: true },
  fountain:   { name: 'Public Fountain', cat: 'Services', era: 4, size: 1, cost: { blocks: 8, bronze: 2 }, time: 10, radius: 7, waterSupply: true, needsAq: 2, happy: 2, weight: 0.6, upkeep: 0.1, mat: 'stone' },
  insula:     { name: 'Apartment Block', cat: 'Housing', era: 4, size: 1, cost: { blocks: 12, brick: 12, wood: 8 }, time: 30, cap: 18, weight: 2.2, upkeep: 0.3, mat: 'stone', ambition: 0.2 },
  villa:      { name: 'Villa', cat: 'Housing', era: 4, size: 2, cost: { blocks: 20, brick: 10, wood: 10 }, time: 36, cap: 10, happy: 2, weight: 1.6, upkeep: 0.4, mat: 'stone' },
  forum:      { name: 'Forum', cat: 'Services', era: 4, size: 2, cost: { blocks: 30, wood: 10 }, time: 40, jobs: 6, shop: 220, sells: { wine: 3, cloth: 1.5, pots: 0.6, tools: 2.5 }, culture: 3, happy: 3, weight: 1.5, upkeep: 0.8, mat: 'stone' },
  library:    { name: 'Library', cat: 'Culture', era: 4, size: 1, cost: { blocks: 16, wood: 8 }, time: 30, jobs: 2, culture: 4, research: 0.3, weight: 1.2, upkeep: 0.5, mat: 'stone' },
  baths:      { name: 'Bathhouse', cat: 'Services', era: 4, size: 2, cost: { blocks: 24, brick: 16, bronze: 4 }, time: 40, jobs: 3, needsAq: 3, health: 10, happy: 4, weight: 1.8, upkeep: 0.8, mat: 'stone' },
  theatre:    { name: 'Amphitheatre', cat: 'Culture', era: 4, size: 2, cost: { blocks: 40, wood: 10 }, time: 60, culture: 10, happy: 6, weight: 2, upkeep: 0.6, mat: 'stone', slopeOk: true },
  mint:       { name: 'Mint', cat: 'Industry', era: 4, size: 1, cost: { blocks: 12, iron: 4 }, time: 24, jobs: 2, recipe: { in: { bronze: 1 }, out: { money: 30 }, perDay: 3 }, weight: 1, upkeep: 0.3, mat: 'stone' },
  monument:   { name: 'Great Monument', cat: 'Culture', era: 4, size: 3, cost: { blocks: 200, bronze: 30, iron: 10 }, time: 240, culture: 40, happy: 8, weight: 4, upkeep: 1, mat: 'stone', ambition: 0.3, monument: true },
  // --- services & trade ---
  stall:      { name: 'Trading Spot', cat: 'Services', era: 1, size: 1, cost: { wood: 6 }, time: 6, jobs: 2, shop: 25, weight: 0.3, upkeep: 0, mat: 'wood' },
  store:      { name: 'General Store', cat: 'Services', era: 2, size: 1, cost: { money: 80, brick: 12, wood: 4 }, time: 24, jobs: 4, shop: 70, weight: 1, upkeep: 1, mat: 'brick' },
  well:       { name: 'Well', cat: 'Services', era: 1, size: 1, cost: { stone: 6 }, time: 6, radius: 5, waterSupply: true, weight: 0.5, upkeep: 0, mat: 'stone' },
  rescue:     { name: 'Healer', cat: 'Services', era: 1, size: 1, cost: { wood: 12, stone: 2 }, time: 12, jobs: 4, crews: 2, weight: 0.6, upkeep: 0.5, mat: 'wood' },
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
  timber:   { name: 'Mine Supports', era: 2, cost: 70, req: [] },
  writing:  { name: 'Writing', era: 2, cost: 90, req: [] },
  irrigation: { name: 'Irrigation', era: 2, cost: 60, req: [] },
  ironworking: { name: 'Ironworking', era: 2, cost: 140, req: ['writing'] },
  earthworks: { name: 'Ground Levelling', era: 2, cost: 60, req: [] },
  prospecting: { name: 'Prospecting', era: 2, cost: 50, req: [] },
  masonry:  { name: 'Masonry', era: 3, cost: 160, req: [] },
  currency: { name: 'Coinage', era: 3, cost: 180, req: [] },
  engineering: { name: 'Engineering', era: 4, cost: 260, req: [] },
  philosophy: { name: 'Philosophy', era: 4, cost: 300, req: [] },
};

// Terrain levelling. Bronze: cut a terrace into a steep (mountain) tile so it can be built on. Later eras: full levelling / cutting into mountains (design).
export const EARTHWORKS = { cost: { money: 40, stone: 6 }, hours: 30, needs: 'carpentry', tech: 'earthworks' };

// Deposits visible on the surface without surveying (clay banks, stone outcrops, copper stains): max depth in m
export const SURFACE_DEPTH = { clay: 2, stone: 2, copper: 3, tin: 2, ironore: 3 };
// Saplings: planting cost and growth (game hours per stage: sapling -> young -> grown tree)
export const SAPLING = { cost: { money: 3 }, stages: [48, 96], grownAt: 144 };
// Dismantling (early eras): reverse construction at this fraction of build time, refunds part of the materials
export const DISMANTLE = { timeMult: 0.6, refund: 0.5, bulldozerEra: 'Industrial' };

// Next-era milestones (shown as a plain status line): population, finished buildings, culture points, techs
export const ERA_REQ = { 1: { pop: 30, buildings: 15, culture: 100, techs: ['pottery', 'smelting'] }, 2: { pop: 70, buildings: 35, culture: 600, techs: ['writing', 'ironworking'], made: { bronze: 20, tools: 10 } }, 3: { pop: 120, buildings: 55, culture: 2000, techs: ['masonry', 'currency'], made: { iron: 30, blocks: 40 } } };
// Bronze tools: while the town has tools, gathering, extraction and building go faster; tools wear out with use
export const TOOLS = { boost: 0.25, ironBoost: 0.4, wearPerWorkerDay: 0.01 };
// horses: scouts ride (faster); with a cart maker, villagers haul with carts (bigger loads)
export const HORSES = { scoutSpeed: 1.7, cartLoad: 2 };
// neighbouring towns met through exploration; a trading post sends a caravan to each known town every few days
export const TRADE = { everyDays: 3, perTrip: 8 };

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
