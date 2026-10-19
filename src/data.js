// Static game data: buildings, techs, eras, block materials. Pure data, no rendering.
// survey claim: a fenced square (radius r) staked out for prospecting; only pits and mines may be built inside it
export const SURVEY = { r: 6, cost: { money: 15, wood: 12 }, hours: 18 };
export const SAVE_VERSION = 2; // older saves are not loaded
// public release: set false to hide the start-era selector and always start in the first era
export const ALLOW_ERA_SELECT = true;
export const HOURS_PER_DAY = 24;

export const ERAS = {
  1: { name: 'Stone & Clay', maxDepth: 5, tier: 'Surface' },
  2: { name: 'Bronze', maxDepth: 30, tier: 'Shallow shaft' },
  3: { name: 'Iron', maxDepth: 60, tier: 'Deep shaft' },
  4: { name: 'Classical', maxDepth: 80, tier: 'Deep shaft' },
  5: { name: 'Medieval', maxDepth: 120, tier: 'Deep shaft' },
  6: { name: 'Renaissance', maxDepth: 160, tier: 'Deep shaft' },
  7: { name: 'Industrial', maxDepth: 300, tier: 'Colliery' },
};

export const RESOURCES = ['wood', 'clay', 'stone', 'copper', 'tin', 'brick', 'bronze', 'food', 'tools', 'pots', 'wool', 'flax', 'cloth', 'ironore', 'charcoal', 'iron', 'blocks', 'horses', 'grapes', 'wine', 'coal', 'steel'];
export const ERA3_NOTE = 'Iron (and iron mines) arrive with the Iron era, after Bronze.';

export const DEPOSITS = {
  clay:   { name: 'Clay',   color: 0xc98a5a },
  stone:  { name: 'Stone',  color: 0x9aa0a6 },
  copper: { name: 'Copper', color: 0x3fae8c },
  tin:    { name: 'Tin',    color: 0xd7dde6 },
  ironore: { name: 'Iron ore', color: 0xa4512f },
  coal:   { name: 'Coal',   color: 0x2b2b30 },
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
  scoutcamp:  { name: 'Scout Camp', cat: 'Services', era: 1, size: 1, cost: { wood: 12, food: 10 }, time: 8, jobs: 1, scouts: 2, weight: 0.3, upkeep: 0, mat: 'hide' },
  canoe:      { name: 'Canoe Maker', cat: 'Industry', era: 1, size: 1, cost: { wood: 20, stone: 4 }, time: 16, jobs: 2, canoes: 3, weight: 0.4, upkeep: 0, mat: 'wood', nearWater: true, enables: 'canoe' },
  smelter:    { name: 'Smelter', cat: 'Industry', era: 2, size: 1, cost: { money: 100, brick: 15, stone: 10 }, time: 30, jobs: 3, recipe: { in: { copper: 3, tin: 1, wood: 2 }, out: { bronze: 2 }, perDay: 4 }, weight: 2, upkeep: 1, mat: 'brick' },
  carpentry:  { name: 'Carpenter', cat: 'Industry', era: 2, size: 1, cost: { money: 60, wood: 15 }, time: 16, jobs: 2, weight: 0.8, upkeep: 0.5, mat: 'wood' },
  // --- culture & decoration ---
  firepit:    { name: "Elder's Fire", study: 2, cat: 'Culture', era: 1, size: 1, cost: { stone: 3, wood: 2 }, time: 2, culture: 0.5, happy: 2, weight: 0.2, upkeep: 0, mat: 'stone' },
  shrine:     { name: 'Shrine', study: 2, cat: 'Culture', era: 1, size: 1, cost: { stone: 5, wood: 4 }, time: 8, culture: 2, happy: 2, weight: 0.4, upkeep: 0, mat: 'stone' },
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
  bronzesmith:{ name: 'Bronze Smith', cat: 'Industry', era: 2, size: 1, cost: { brick: 8, stone: 6, wood: 6 }, time: 16, jobs: 2, recipe: { in: { bronze: 1, wood: 1 }, out: { tools: 2 }, perDay: 4, keep: { bronze: 30 } }, weight: 1.2, upkeep: 0.3, mat: 'brick' },
  potter:     { name: 'Potter', cat: 'Industry', era: 2, size: 1, cost: { brick: 4, wood: 6 }, time: 10, jobs: 2, recipe: { in: { clay: 2, wood: 1 }, out: { pots: 2 }, perDay: 4 }, weight: 0.6, upkeep: 0.1, mat: 'daub' },
  weaver:     { name: 'Weaver', cat: 'Industry', era: 2, size: 1, cost: { wood: 10, brick: 4 }, time: 12, jobs: 2, recipe: { in: { wool: 1, flax: 1 }, out: { cloth: 2 }, perDay: 4 }, weight: 0.6, upkeep: 0.2, mat: 'daub' },
  cartmaker:  { name: 'Cart Maker', cat: 'Industry', era: 2, size: 1, cost: { wood: 20, bronze: 4, tools: 2 }, time: 18, jobs: 2, weight: 0.8, upkeep: 0.3, mat: 'wood', enables: 'carts' },
  raftmaker:  { name: 'Raft Builder', cat: 'Industry', era: 2, size: 1, cost: { wood: 18 }, time: 10, jobs: 1, weight: 0.4, upkeep: 0, mat: 'wood', nearWater: true, enables: 'canoe' },
  bridge:     { name: 'Wooden Bridge', cat: 'Services', era: 2, size: 1, cost: { wood: 20, tools: 1 }, time: 16, weight: 0.5, upkeep: 0.2, mat: 'wood', onWater: true },
  market:     { name: 'Market', cat: 'Services', era: 2, size: 2, cost: { brick: 10, wood: 12 }, time: 20, jobs: 4, shop: 90, sells: { pots: 0.5, cloth: 1.2, tools: 2 }, weight: 0.8, upkeep: 0.5, mat: 'wood', happy: 2 },
  tower:      { name: 'Lookout Tower', cat: 'Services', era: 2, size: 1, cost: { wood: 16, stone: 6 }, time: 12, weight: 0.6, upkeep: 0.1, mat: 'wood', sight: 7 },
  scholar:    { name: "Scholar's Hut", study: 2, cat: 'Culture', era: 2, size: 1, cost: { wood: 14, clay: 6 }, time: 10, culture: 1, weight: 0.5, upkeep: 0.2, mat: 'daub' },
  temple:     { name: 'Temple', study: 3, cat: 'Culture', era: 2, size: 2, cost: { brick: 30, stone: 20, wood: 10 }, time: 48, culture: 10, happy: 6, weight: 2.5, upkeep: 1, mat: 'brick', ambition: 0.4 },
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
  tradepost:  { name: 'Trading Post', cat: 'Services', era: 2, size: 1, cost: { wood: 20, brick: 4 }, time: 16, jobs: 2, weight: 0.5, upkeep: 0.4, mat: 'wood', trade: 1 },
  stonewall:  { name: 'Stone Wall', cat: 'Culture', era: 3, size: 1, cost: { blocks: 2 }, time: 3, weight: 0.4, upkeep: 0, mat: 'stone', decor: true, happy: 0.2 },
  hillfort:   { name: 'Hill Fort', cat: 'Culture', era: 3, size: 2, cost: { blocks: 30, wood: 20 }, time: 60, culture: 6, happy: 2, weight: 3, upkeep: 0.8, mat: 'stone', sight: 8, slopeOk: true },
  // --- Classical era ---
  aqueduct:   { name: 'Aqueduct', cat: 'Services', era: 4, size: 1, cost: { blocks: 6, brick: 4 }, time: 10, weight: 0.8, upkeep: 0.1, mat: 'stone', aqueduct: true, slopeOk: true },
  fountain:   { name: 'Public Fountain', cat: 'Services', era: 4, size: 1, cost: { blocks: 8, bronze: 2 }, time: 10, radius: 7, waterSupply: true, needsAq: 2, happy: 2, weight: 0.6, upkeep: 0.1, mat: 'stone' },
  insula:     { name: 'Apartment Block', cat: 'Housing', era: 4, size: 1, cost: { blocks: 12, brick: 12, wood: 8 }, time: 30, cap: 18, weight: 2.2, upkeep: 0.3, mat: 'stone', ambition: 0.2 },
  villa:      { name: 'Villa', cat: 'Housing', era: 4, size: 2, cost: { blocks: 20, brick: 10, wood: 10 }, time: 36, cap: 10, happy: 2, weight: 1.6, upkeep: 0.4, mat: 'stone' },
  forum:      { name: 'Forum', cat: 'Services', era: 4, size: 2, cost: { blocks: 30, wood: 10 }, time: 40, jobs: 6, shop: 220, sells: { wine: 3, cloth: 1.5, pots: 0.6, tools: 2.5 }, culture: 3, happy: 3, weight: 1.5, upkeep: 0.8, mat: 'stone' },
  library:    { name: 'Library', study: 3, cat: 'Culture', era: 4, size: 1, cost: { blocks: 16, wood: 8 }, time: 30, jobs: 2, culture: 4, research: 0.3, weight: 1.2, upkeep: 0.5, mat: 'stone' },
  baths:      { name: 'Bathhouse', cat: 'Services', era: 4, size: 2, cost: { blocks: 24, brick: 16, bronze: 4 }, time: 40, jobs: 3, needsAq: 3, health: 10, happy: 4, weight: 1.8, upkeep: 0.8, mat: 'stone' },
  theatre:    { name: 'Amphitheatre', cat: 'Culture', era: 4, size: 2, cost: { blocks: 40, wood: 10 }, time: 60, culture: 10, happy: 6, weight: 2, upkeep: 0.6, mat: 'stone', slopeOk: true },
  mint:       { name: 'Mint', cat: 'Industry', era: 4, size: 1, cost: { blocks: 12, iron: 4 }, time: 24, jobs: 2, recipe: { in: { bronze: 1 }, out: { money: 30 }, perDay: 3, keep: { bronze: 40 } }, weight: 1, upkeep: 0.3, mat: 'stone' },
  monument:   { name: 'Great Monument', cat: 'Culture', era: 4, size: 3, cost: { blocks: 200, bronze: 30, iron: 10 }, time: 240, culture: 40, happy: 8, weight: 4, upkeep: 1, mat: 'stone', ambition: 0.3, monument: true },
  // --- Medieval era ---
  castle:     { name: 'Castle', cat: 'Culture', era: 5, size: 2, cost: { blocks: 120, wood: 40, iron: 10 }, time: 160, terrain: [2], terrace: true, culture: 12, happy: 3, sight: 9, weight: 4, upkeep: 2, mat: 'stone', ambition: 0.2 },
  stonebridge:{ name: 'Stone Bridge', cat: 'Services', era: 5, size: 1, cost: { blocks: 24 }, time: 30, weight: 1, upkeep: 0, mat: 'stone', onWater: true },
  watermill:  { name: 'Watermill', cat: 'Food', era: 5, size: 1, cost: { blocks: 10, wood: 16, iron: 2 }, time: 24, jobs: 2, foodMult: 0.15, nearWater: true, weight: 0.8, upkeep: 0.2, mat: 'wood' },
  windmill:   { name: 'Windmill', cat: 'Food', era: 5, size: 1, cost: { blocks: 6, wood: 20, cloth: 4 }, time: 24, jobs: 1, foodMult: 0.12, weight: 0.8, upkeep: 0.2, mat: 'wood', slopeOk: true },
  guildhall:  { name: 'Guild Hall', cat: 'Industry', era: 5, size: 1, cost: { blocks: 24, wood: 12, cloth: 6 }, time: 40, jobs: 3, guild: 0.2, culture: 2, weight: 1.4, upkeep: 0.6, mat: 'stone', tech: 'guilds' },
  timberhouse:{ name: 'Timber-Frame House', cat: 'Housing', era: 5, size: 1, cost: { wood: 18, blocks: 4, brick: 6 }, time: 24, cap: 12, weight: 1.2, upkeep: 0.2, mat: 'wood' },
  church:     { name: 'Parish Church', cat: 'Culture', era: 5, size: 2, cost: { blocks: 60, wood: 20, bronze: 4 }, time: 80, culture: 6, happy: 4, weight: 2.4, upkeep: 0.6, mat: 'stone' },
  monastery:  { name: 'Monastery', study: 4, cat: 'Culture', era: 5, size: 2, cost: { blocks: 50, wood: 20 }, time: 70, jobs: 4, food: 8, culture: 5, research: 0.2, weight: 2, upkeep: 0.5, mat: 'stone' },
  inn:        { name: 'Inn', cat: 'Services', era: 5, size: 1, cost: { wood: 20, blocks: 6 }, time: 20, jobs: 2, shop: 70, happy: 3, weight: 0.9, upkeep: 0.3, mat: 'wood' },
  townwall:   { name: 'Town Wall', cat: 'Culture', era: 5, size: 1, cost: { blocks: 4 }, time: 6, weight: 0.6, upkeep: 0, mat: 'stone', decor: true, happy: 0.3 },
  gatehouse:  { name: 'Gatehouse', cat: 'Culture', era: 5, size: 1, cost: { blocks: 16, wood: 6 }, time: 20, weight: 1, upkeep: 0.1, mat: 'stone', culture: 1, happy: 1 },
  markethall: { name: 'Market Hall', cat: 'Services', era: 5, size: 1, cost: { blocks: 20, wood: 16 }, time: 30, jobs: 4, shop: 150, sells: { cloth: 1.6, pots: 0.7, wine: 3, tools: 2.5 }, weight: 1.2, upkeep: 0.5, mat: 'stone' },
  shipyard:   { name: 'Shipyard', cat: 'Industry', era: 5, size: 2, cost: { wood: 60, iron: 6, cloth: 10 }, time: 60, jobs: 4, nearWater: true, weight: 0.8, upkeep: 0.6, mat: 'wood', enables: 'ships', tech: 'navigation' },
  // --- Renaissance era ---
  // ---- Industrial (era 7): coal, steam, steel, rail ----
  rowhouse:   { name: 'Row Houses', cat: 'Housing', era: 7, size: 1, cost: { brick: 30, wood: 8, iron: 2 }, time: 24, cap: 20, weight: 1.6, upkeep: 0.3, mat: 'brick' },
  colliery:   { name: 'Coal Mine', cat: 'Gathering', era: 7, size: 1, cost: { blocks: 20, iron: 10, tools: 4 }, time: 40, jobs: 6, extract: ['coal'], rate: 12, radius: 3, maxDepth: 40, shaft: true, tech: 'steampower', weight: 1.2, upkeep: 1, mat: 'brick' },
  steelworks: { name: 'Steelworks', cat: 'Industry', era: 7, size: 2, cost: { brick: 60, iron: 20, blocks: 20 }, time: 60, jobs: 8, recipe: { in: { iron: 2, coal: 2 }, out: { steel: 1 }, perDay: 6 }, tech: 'steelmaking', weight: 2.5, upkeep: 1.5, mat: 'brick' },
  textilemill:{ name: 'Textile Mill', cat: 'Industry', era: 7, size: 2, cost: { brick: 50, iron: 10, wood: 20 }, time: 50, jobs: 8, recipe: { in: { wool: 2, flax: 2, coal: 1 }, out: { cloth: 5 }, perDay: 6 }, tech: 'steampower', weight: 2, upkeep: 1, mat: 'brick' },
  rail:       { name: 'Railway Track', cat: 'Services', era: 7, size: 1, cost: { money: 5, iron: 2, wood: 2 }, time: 4, weight: 0.2, upkeep: 0.05, mat: 'stone', rail: true, tech: 'railways' },
  station:    { name: 'Railway Station', cat: 'Services', era: 7, size: 2, cost: { brick: 40, iron: 20, wood: 10 }, time: 50, jobs: 4, needsRail: true, trade: 2, shop: 40, weight: 1.5, upkeep: 0.8, mat: 'brick', tech: 'railways' },
  townhouse:  { name: 'Townhouse', cat: 'Housing', era: 6, size: 1, cost: { brick: 20, blocks: 8, wood: 10 }, time: 30, cap: 16, weight: 1.6, upkeep: 0.3, mat: 'brick' },
  palazzo:    { name: 'Palazzo', cat: 'Housing', era: 6, size: 2, cost: { blocks: 60, brick: 30, wood: 20 }, time: 70, cap: 14, happy: 3, weight: 2.4, upkeep: 0.6, mat: 'stone' },
  university: { name: 'University', study: 6, cat: 'Culture', era: 6, size: 2, cost: { blocks: 80, brick: 30, wood: 20 }, time: 90, jobs: 6, research: 0.5, culture: 8, weight: 2.4, upkeep: 1.2, mat: 'stone' },
  printing:   { name: 'Printing Press', cat: 'Industry', era: 6, size: 1, cost: { blocks: 12, wood: 12, iron: 6 }, time: 30, jobs: 3, research: 0.4, culture: 2, weight: 1, upkeep: 0.4, mat: 'stone', tech: 'printing' },
  bank:       { name: 'Bank', cat: 'Services', era: 6, size: 1, cost: { blocks: 30, bronze: 10 }, time: 40, jobs: 3, bank: 0.002, weight: 1.6, upkeep: 0.4, mat: 'stone', tech: 'banking' },
  observatory:{ name: 'Observatory', cat: 'Culture', era: 6, size: 1, cost: { blocks: 24, bronze: 6, cloth: 4 }, time: 40, jobs: 1, research: 0.2, culture: 3, sight: 11, weight: 1.2, upkeep: 0.3, mat: 'stone', slopeOk: true },
  harbour:    { name: 'Harbour', cat: 'Services', era: 6, size: 2, cost: { blocks: 50, wood: 40 }, time: 70, jobs: 6, nearWater: true, trade: 2, shop: 60, weight: 1.5, upkeep: 0.8, mat: 'stone' },
  clocktower: { name: 'Clock Tower', cat: 'Culture', era: 6, size: 1, cost: { blocks: 20, bronze: 8 }, time: 40, culture: 3, happy: 2, weight: 1.5, upkeep: 0.2, mat: 'stone' },
  cathedral:  { name: 'Cathedral', cat: 'Culture', era: 6, size: 3, cost: { blocks: 300, brick: 80, bronze: 20, cloth: 20 }, time: 360, culture: 50, happy: 10, weight: 5, upkeep: 2, mat: 'stone', ambition: 0.3, monument: true },
  // --- services & trade ---
  stall:      { name: 'Trading Spot', cat: 'Services', era: 1, size: 1, cost: { wood: 6 }, time: 6, jobs: 2, shop: 25, weight: 0.3, upkeep: 0, mat: 'wood' },
  store:      { name: 'General Store', cat: 'Services', era: 2, size: 1, cost: { money: 80, brick: 12, wood: 4 }, time: 24, jobs: 4, shop: 70, weight: 1, upkeep: 1, mat: 'brick' },
  well:       { name: 'Well', cat: 'Services', era: 1, size: 1, cost: { stone: 6 }, time: 6, radius: 5, waterSupply: true, weight: 0.5, upkeep: 0, mat: 'stone' },
  lodge:      { name: "Builders' Lodge", cat: 'Services', era: 1, size: 1, cost: { wood: 14, stone: 4 }, time: 10, jobs: 2, cleanup: 1, weight: 0.5, upkeep: 0.2, mat: 'wood' },
  masonsguild:{ name: "Masons' Guild", cat: 'Services', era: 4, size: 1, cost: { blocks: 20, wood: 10, tools: 4 }, time: 30, jobs: 4, cleanup: 2, weight: 1.2, upkeep: 0.6, mat: 'stone' },
  worksdepot: { name: 'Public Works Depot', cat: 'Services', era: 7, size: 2, cost: { brick: 40, steel: 6, wood: 20 }, time: 40, jobs: 6, cleanup: 3, weight: 1.6, upkeep: 1, mat: 'brick' },

  // ---- milestone I additions (plain names; decorative ones only add happiness / culture) ----
  dryhut:     { name: 'Drying Hut', cat: 'Food', era: 1, size: 1, cost: { wood: 8 }, time: 6, jobs: 1, foodMult: 0.05, weight: 0.3, upkeep: 0, mat: 'wood' },
  totem:      { name: 'Carved Post', cat: 'Culture', era: 1, size: 1, cost: { wood: 5 }, time: 4, culture: 0.5, happy: 0.5, weight: 0.1, upkeep: 0, mat: 'wood', decor: true },
  logbench:   { name: 'Log Bench', cat: 'Culture', era: 1, size: 1, cost: { wood: 3 }, time: 2, happy: 0.4, weight: 0.05, upkeep: 0, mat: 'wood', decor: true, flat: true },
  roundhouse: { name: 'Roundhouse', cat: 'Housing', era: 2, size: 1, cost: { wood: 14, clay: 6 }, time: 14, cap: 8, weight: 0.8, upkeep: 0.1, mat: 'daub' },
  beehives:   { name: 'Beehives', cat: 'Food', era: 2, size: 1, cost: { wood: 6, pots: 2 }, time: 6, jobs: 1, foodMult: 0.06, weight: 0.2, upkeep: 0, mat: 'wood' },
  orchard:    { name: 'Orchard', cat: 'Food', era: 2, size: 2, cost: { wood: 10 }, time: 16, jobs: 2, foodMult: 0.1, happy: 1, weight: 0.3, upkeep: 0, mat: 'wood', flat: true, plant: true },
  obelisk:    { name: 'Standing Pillar', cat: 'Culture', era: 2, size: 1, cost: { stone: 12 }, time: 10, culture: 1.5, happy: 1, weight: 0.8, upkeep: 0, mat: 'stone', decor: true },
  tannery:    { name: 'Tannery', cat: 'Industry', era: 3, size: 1, cost: { wood: 12, stone: 6 }, time: 14, jobs: 2, recipe: { in: { wool: 1 }, out: { cloth: 1 }, perDay: 3 }, weight: 0.6, upkeep: 0.2, mat: 'wood' },
  toolmaker:  { name: 'Toolmaker', cat: 'Industry', era: 3, size: 1, cost: { wood: 10, stone: 8 }, time: 14, jobs: 2, recipe: { in: { iron: 1, wood: 1 }, out: { tools: 2 }, perDay: 3 }, weight: 0.7, upkeep: 0.2, mat: 'stone' },
  farmstead:  { name: 'Farmstead', cat: 'Housing', era: 3, size: 1, cost: { wood: 16, stone: 10 }, time: 18, cap: 10, foodMult: 0.04, weight: 0.9, upkeep: 0.1, mat: 'stone' },
  beacon:     { name: 'Beacon', cat: 'Services', era: 3, size: 1, cost: { wood: 10, stone: 8 }, time: 10, happy: 0.5, weight: 0.5, upkeep: 0, mat: 'stone' },
  herbgarden: { name: 'Herb Garden', cat: 'Culture', era: 3, size: 1, cost: { wood: 4, stone: 2 }, time: 4, happy: 1, weight: 0.05, upkeep: 0, mat: 'wood', decor: true, flat: true, plant: true },
  stonearch:  { name: 'Stone Arch', cat: 'Culture', era: 3, size: 1, cost: { stone: 16 }, time: 12, culture: 1, happy: 1.5, weight: 0.9, upkeep: 0, mat: 'stone', decor: true },
  bakery:     { name: 'Bakery', cat: 'Food', era: 4, size: 1, cost: { blocks: 8, wood: 6 }, time: 14, jobs: 2, foodMult: 0.12, weight: 0.8, upkeep: 0.2, mat: 'stone' },
  warehouse:  { name: 'Warehouse', cat: 'Services', era: 4, size: 2, cost: { blocks: 14, wood: 16 }, time: 20, jobs: 2, store: true, weight: 1, upkeep: 0.3, mat: 'stone' },
  colonnade:  { name: 'Colonnade', cat: 'Culture', era: 4, size: 1, cost: { blocks: 12 }, time: 12, culture: 1.5, happy: 2, weight: 0.9, upkeep: 0, mat: 'stone', decor: true },
  plaza:      { name: 'Paved Square', cat: 'Culture', era: 4, size: 2, cost: { blocks: 10 }, time: 10, happy: 2, weight: 0.4, upkeep: 0, mat: 'stone', decor: true, flat: true },
  watchtower: { name: 'Watchtower', cat: 'Services', era: 5, size: 1, cost: { blocks: 12, wood: 8 }, time: 16, jobs: 1, happy: 0.5, weight: 1.2, upkeep: 0.1, mat: 'stone' },
  brewery:    { name: 'Brewery', cat: 'Industry', era: 5, size: 1, cost: { wood: 16, blocks: 6 }, time: 18, jobs: 2, recipe: { in: { food: 3 }, out: { wine: 1 }, perDay: 3 }, weight: 0.9, upkeep: 0.2, mat: 'wood' },
  almshouse:  { name: 'Almshouse', cat: 'Housing', era: 5, size: 1, cost: { blocks: 12, wood: 12 }, time: 22, cap: 12, happy: 1, weight: 1.1, upkeep: 0.3, mat: 'stone' },
  marketcross:{ name: 'Market Cross', cat: 'Culture', era: 5, size: 1, cost: { blocks: 8 }, time: 8, culture: 1, happy: 1.5, weight: 0.6, upkeep: 0, mat: 'stone', decor: true },
  dovecote:   { name: 'Dovecote', cat: 'Food', era: 5, size: 1, cost: { blocks: 6, wood: 4 }, time: 10, jobs: 1, foodMult: 0.05, weight: 0.6, upkeep: 0, mat: 'stone' },
  glassworks: { name: 'Glassworks', cat: 'Industry', era: 6, size: 1, cost: { brick: 16, wood: 10 }, time: 22, jobs: 3, recipe: { in: { charcoal: 1, stone: 1 }, out: { pots: 2 }, perDay: 3 }, weight: 1, upkeep: 0.3, mat: 'brick' },
  merchanthouse:{ name: "Merchant's House", cat: 'Housing', era: 6, size: 1, cost: { brick: 18, blocks: 8, wood: 8 }, time: 28, cap: 12, happy: 1, weight: 1.4, upkeep: 0.4, mat: 'brick' },
  formalgarden:{ name: 'Formal Garden', cat: 'Culture', era: 6, size: 2, cost: { blocks: 6, wood: 6 }, time: 12, happy: 3, weight: 0.2, upkeep: 0.1, mat: 'stone', decor: true, flat: true, plant: true },
  bandstand:  { name: 'Bandstand', cat: 'Culture', era: 6, size: 1, cost: { wood: 12, blocks: 4 }, time: 10, culture: 1, happy: 2, weight: 0.4, upkeep: 0.1, mat: 'wood', decor: true },
  customhouse:{ name: 'Customs House', cat: 'Services', era: 6, size: 1, cost: { brick: 20, blocks: 10 }, time: 26, jobs: 3, shop: 60, weight: 1.4, upkeep: 0.4, mat: 'brick' },
  gasworks:   { name: 'Gasworks', cat: 'Industry', era: 7, size: 2, cost: { brick: 30, iron: 10 }, time: 30, jobs: 4, recipe: { in: { coal: 2 }, out: { charcoal: 2 }, perDay: 4 }, weight: 2, upkeep: 0.6, mat: 'brick' },
  brickworks: { name: 'Brickworks', cat: 'Industry', era: 7, size: 1, cost: { brick: 16, iron: 4 }, time: 22, jobs: 4, recipe: { in: { clay: 2, coal: 1 }, out: { brick: 4 }, perDay: 4 }, weight: 1.4, upkeep: 0.4, mat: 'brick' },
  tenement:   { name: 'Tenement', cat: 'Housing', era: 7, size: 1, cost: { brick: 36, iron: 4, wood: 6 }, time: 30, cap: 28, weight: 2, upkeep: 0.4, mat: 'brick' },
  park:       { name: 'Public Park', cat: 'Culture', era: 7, size: 2, cost: { iron: 4, wood: 8 }, time: 12, happy: 3.5, weight: 0.2, upkeep: 0.2, mat: 'wood', decor: true, flat: true, plant: true },
  waterworks: { name: 'Pumping Station', cat: 'Services', era: 7, size: 1, cost: { brick: 24, iron: 8 }, time: 26, jobs: 2, radius: 10, waterSupply: true, weight: 1.6, upkeep: 0.5, mat: 'brick' },
  clockpost:  { name: 'Street Clock', cat: 'Culture', era: 7, size: 1, cost: { iron: 4 }, time: 4, happy: 1, culture: 0.5, weight: 0.1, upkeep: 0, mat: 'stone', decor: true },
  memorial:   { name: 'War Memorial', cat: 'Culture', era: 7, size: 1, cost: { blocks: 14, bronze: 4 }, time: 14, culture: 2, happy: 1, weight: 0.8, upkeep: 0, mat: 'stone', decor: true },
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

// Research: each tech is studied at a place (any of `at`, finished), by `staff` scholars (townsfolk taken from the workforce while it runs),
// for `hours` game hours at full staff, consuming `mat` when it starts; `used` = a building of that kind must have been staffed, `built` = finished.
const AT1 = ['firepit', 'shrine'], AT2 = ['scholar', 'temple'], AT3 = ['scholar', 'temple', 'library'], AT4 = ['library', 'monastery', 'university'], AT6 = ['university', 'library'], AT7 = ['university'];
export const TECHS = {
  pottery:  { name: 'Pottery', era: 1, cost: 40, req: [], at: AT1, staff: 2, mat: { clay: 4 }, used: 'claypit' },
  smelting: { name: 'Smelting', era: 1, cost: 80, req: ['pottery'], at: AT1, staff: 2, mat: { clay: 6, wood: 10 }, built: 'kiln' },
  timber:   { name: 'Mine Supports', era: 2, cost: 70, req: [], at: AT2, staff: 2, mat: { wood: 20 }, built: 'carpentry' },
  writing:  { name: 'Writing', era: 2, cost: 90, req: [], at: AT2, staff: 2, mat: { clay: 10 }, used: 'potter' },
  irrigation: { name: 'Irrigation', era: 2, cost: 60, req: [], at: AT2, staff: 2, mat: { wood: 10 }, built: 'field' },
  ironworking: { name: 'Ironworking', era: 2, cost: 140, req: ['writing'], at: AT2, staff: 2, mat: { bronze: 5 }, used: 'smelter' },
  earthworks: { name: 'Ground Levelling', era: 2, cost: 60, req: [], at: AT2, staff: 2, mat: { stone: 10 }, built: 'carpentry' },
  prospecting: { name: 'Prospecting', era: 2, cost: 50, req: [], at: AT2, staff: 2, mat: { stone: 6 }, built: 'orepit' },
  masonry:  { name: 'Masonry', era: 3, cost: 160, req: [], at: AT3, staff: 3, mat: { stone: 30 }, used: 'quarry' },
  currency: { name: 'Coinage', era: 3, cost: 180, req: [], at: AT3, staff: 3, mat: { bronze: 10 }, built: 'tradepost' },
  engineering: { name: 'Engineering', era: 4, cost: 260, req: [], at: AT4, staff: 3, mat: { blocks: 20, wood: 20 }, used: 'mason' },
  philosophy: { name: 'Philosophy', era: 4, cost: 300, req: [], at: AT4, staff: 3, mat: { pots: 10 }, used: 'library' },
  guilds:   { name: 'Guilds', era: 5, cost: 380, req: [], at: AT4, staff: 4, mat: { tools: 10 }, used: 'blacksmith' },
  navigation: { name: 'Navigation', era: 5, cost: 420, req: [], at: AT4, staff: 4, mat: { wood: 60, cloth: 10 }, built: 'raftmaker' },
  printing: { name: 'Printing', era: 6, cost: 520, req: [], at: AT6, staff: 4, mat: { iron: 10, cloth: 20 }, used: 'weaver' },
  banking:  { name: 'Banking', era: 6, cost: 520, req: [], at: AT6, staff: 4, mat: { money: 300 }, built: 'mint' },
  steampower: { name: 'Steam Power', era: 7, cost: 700, req: [], at: AT7, staff: 4, mat: { iron: 40, coal: 20 }, built: 'watermill' },
  railways:   { name: 'Railways', era: 7, cost: 800, req: ['steampower'], at: AT7, staff: 4, mat: { steel: 20, wood: 40 }, used: 'colliery' },
  steelmaking:{ name: 'Steelmaking', era: 7, cost: 800, req: ['steampower'], at: AT7, staff: 4, mat: { iron: 40, coal: 40 }, used: 'bloomery' },
  machinery:  { name: 'Machinery', era: 7, cost: 900, req: ['steampower'], at: AT7, staff: 4, mat: { steel: 30 }, used: 'steelworks' },
};
// Start-era presets for a normal game (New game > Start era): a settled town for that era. Lists are cumulative (each era adds to the one before).
export const START_ERAS = {
  2: { villagers: 4, res: { money: 600, wood: 120, clay: 40, stone: 60, food: 160, copper: 10, tin: 5 },
       build: ['hut', 'hut', 'hut', 'hut', 'mudhouse', 'mudhouse', 'berryhut', 'hunter', 'field', 'woodcutter', 'quarry', 'claypit', 'kiln', 'firepit', 'shrine', 'well', 'stall', 'platform', 'scholar'] },
  3: { villagers: 5, res: { money: 1200, wood: 200, clay: 60, stone: 120, brick: 60, copper: 30, tin: 15, bronze: 40, tools: 10, food: 260, pots: 20 },
       build: ['mudhouse', 'mudhouse', 'brickhouse', 'brickhouse', 'granary', 'orepit', 'smelter', 'carpentry', 'bronzesmith', 'potter', 'store', 'tradepost', 'irrfield'] },
  4: { villagers: 6, res: { money: 2500, wood: 300, clay: 60, stone: 250, brick: 120, bronze: 60, tools: 30, iron: 20, ironore: 20, charcoal: 20, food: 400, pots: 30, cloth: 20 },
       build: ['stonehouse', 'stonehouse', 'stonehouse', 'stonehouse', 'charcoal', 'bloomery', 'blacksmith', 'mason', 'stonewell', 'horsefarm', 'weaver', 'sheep'] },
  5: { villagers: 7, res: { money: 4000, wood: 400, stone: 300, brick: 150, bronze: 60, tools: 50, iron: 40, blocks: 120, food: 500, pots: 40, cloth: 40 },
       build: ['insula', 'insula', 'library', 'mint', 'fountain', 'irrfield', 'field'] },
  6: { villagers: 8, res: { money: 6000, wood: 500, stone: 300, brick: 150, tools: 60, iron: 60, blocks: 200, food: 600, pots: 50, cloth: 60 },
       build: ['timberhouse', 'timberhouse', 'timberhouse', 'timberhouse', 'guildhall', 'inn', 'markethall', 'irrfield', 'windmill', 'granary'] },
  7: { villagers: 9, res: { money: 9000, wood: 600, stone: 300, brick: 200, tools: 100, iron: 120, coal: 40, blocks: 300, food: 800, pots: 60, cloth: 100 },
       build: ['townhouse', 'townhouse', 'townhouse', 'university', 'printing', 'bank', 'irrfield', 'irrfield', 'field'] },
};
export const RESEARCH = { hoursPerCost: 0.2 /* game hours at full staff per old research point */, writingBoost: 0.25 };
export function techHours(id, culture = 'default') { return Math.max(4, Math.round(techCost(id, culture) * RESEARCH.hoursPerCost)); }

// Terrain levelling. Bronze: cut a terrace into a steep (mountain) tile so it can be built on. Later eras: full levelling / cutting into mountains (design).
export const EARTHWORKS = { cost: { money: 40, stone: 6 }, hours: 30, needs: 'carpentry', tech: 'earthworks' };

// Deposits visible on the surface without surveying (clay banks, stone outcrops, copper stains): max depth in m
export const SURFACE_DEPTH = { clay: 2, stone: 2, copper: 3, tin: 2, ironore: 3, coal: 2 };
// Saplings: planting cost and growth (game hours per stage: sapling -> young -> grown tree)
export const SAPLING = { cost: { money: 3 }, stages: [48, 96], grownAt: 144 };
// Dismantling (early eras): reverse construction at this fraction of build time, refunds part of the materials
export const DISMANTLE = { timeMult: 0.6, refund: 0.5, bulldozerEra: 'Industrial' };

// Next-era milestones (shown as a plain status line): population, finished buildings, culture points, techs
export const ERA_REQ = { 1: { pop: 30, buildings: 15, culture: 100, techs: ['pottery', 'smelting'] }, 2: { pop: 70, buildings: 35, culture: 600, techs: ['writing', 'ironworking'], made: { bronze: 20, tools: 10 } }, 3: { pop: 120, buildings: 55, culture: 2000, techs: ['masonry', 'currency'], made: { iron: 30, blocks: 40 } }, 4: { pop: 200, buildings: 80, culture: 4000, techs: ['engineering', 'philosophy'], made: { wine: 60 }, built: ['monument'] }, 5: { pop: 320, buildings: 110, culture: 6000, techs: ['guilds', 'navigation'], made: { cloth: 200 }, built: ['castle'] }, 6: { pop: 450, buildings: 140, culture: 10000, techs: ['printing', 'banking'], made: { cloth: 400 }, built: ['cathedral'] } };
// Bronze tools: while the town has tools, gathering, extraction and building go faster; tools wear out with use
export const TOOLS = { boost: 0.25, ironBoost: 0.4, wearPerWorkerDay: 0.01 };
// horses: scouts ride (faster); with a cart maker, villagers haul with carts (bigger loads)
export const HORSES = { scoutSpeed: 1.7, cartLoad: 2 };
// neighbouring towns met through exploration; a trading post sends a caravan to each known town every few days
// railways: train speed (tiles/hour), stop time, freight income per arrival, production boost near served stations
export const RAIL = { speed: 4, stopHours: 3, base: 6, perTile: 0.6, radius: 5, boost: 0.25 };
export const TRADE = { everyDays: 3, perTrip: 8, keep: 60 }; // towns only buy what you have beyond the keep stock

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
