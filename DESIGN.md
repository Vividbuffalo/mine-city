# Mine City — Game Design Document (draft v0.7)

*Working title. Design only — nothing is built yet. Everything here is meant to be reacted to and changed.*
*v0.7 changes: rank ladder (Village Elder → President → World Leader) and classified secrets (Area 51-style ships, advanced tech) unlocked by rank/top tech goals, and a leadership style spectrum (Good President ↔ Dictator) driven by policies (A.8); player driving (cars → aircraft/ships/spacecraft) with the 3D view (A.1). Not MVP.*
*v0.6 changes: win = take over the Earth, which unlocks a ship-building, space-exploration post-win stage; realistic ship engineering with reset-to-Earth on death; Solo Earth setup option (wilderness or neutral settlements); emergent borders from Stone Age; war out of scope (future).*
*v0.5 changes: pick-or-random start location sets your country, three game modes (Solo Earth, Country, USA vs World), sky/space tier hidden until reached, sky control = military + economic dominance.*
*v0.4 changes: automatic crew dispatch (no manual dispatch, no rescue scene), long-term goal (rule the sky → space), AI rival civs, Earth-scale world plan, space and galactic tiers, world/planet hooks in the data model; long-term roadmap moved to Appendix A.*
*v0.3 changes: underground view shows mines and their workings, collapses can kill, no tutorial or advisor hints, difficulty curve (forgiving early eras, harder and longer later), emergency services with an incident pipeline (rescue → cleanup → rebuild), vehicles on roads (no pedestrians), placement is the core gameplay (no drag tool), building variety up to skyscrapers.*
*v0.2 changes: modern art style, PC browser only, place-your-own buildings (no zone auto-fill), mining depth gated by progress, hidden subsidence/collapse, visible construction stages, trade/competition/war deferred, optional Stellar/XLM later phase.*

---

## 1. Pitch

A PC browser city builder where you **dig your civilization out of the ground**. You start with one small plot on a big isometric map. On the surface it plays like a simplified **SimCity 3000**, except you choose and place **every building yourself** and watch each one go up stage by stage. Underneath is a **realistic mining game**: survey real geology, place mines on clay, stone, copper, tin, iron and coal, and turn them into bricks, bronze and steel through real processing chains. Zoomed out it feels like **old-school Civilization**: your town moves through historical eras, and each era lets you dig deeper and build more. You can also **free-build** custom buildings block by block, Minecraft-style, without Minecraft's first-person movement.

**Long-term goal:** an "Elon Musk" arc, from mud huts to rockets. Advance through the eras to aerospace and orbit, and use control of the sky to **take over the Earth**. That is the win, and it unlocks the post-win stage: design a spaceship and leave to explore planets and a galaxy. The map becomes a scaled-down Earth; you pick (or randomize) a start location, which sets your country, and play solo or against AI civs (Appendix A).

Current scope is **building and flow**: placing, mining, processing, growing. Rivals, trade and competition are parked for later phases. **War is out of scope**: possibly in the future, not designed now.

## 2. Design pillars

1. **Simple to read, deep underneath.** Clear tiles, clear tools, clear numbers. Complexity lives in the systems, not the UI.
2. **Realism, grounded in real history and geology.** Ore forms where it would really form. Metal comes from real refining chains (ore → smelting → metal; clay → kiln → brick). Tech follows a historically believable order. Hauling distance matters. People need food, water and shelter before luxuries. And the ground has consequences: dig under your town and it may sink.
3. **The ground is the engine.** Resources are finite and uneven. Running out pushes you to explore, expand, dig deeper and advance.
4. **Every building is placed and seen.** The player picks each building and its spot, and every building visibly rises from foundation to finished.
5. **Earned progress, optional speed.** Normal play is slow. During development, every wait can be sped up or skipped (see §11).
6. **Figure it out yourself.** No tutorial, no guided steps, no hint popups and no advisor telling you what to do. The game shows plain information (numbers, info cards, the underground view, an event log of what happened) and the player works out the rest. Early eras are simply forgiving: cheap mistakes and short timers.
7. **Multiplayer-ready, single-player first.** Keep the game's data and rules structured so a shared server can be added later.

## 3. Core loop

1. **Survey** nearby land → discover what is underground and roughly how much.
2. **Place a mine** (pit, quarry or shaft). It needs workers and a road. How deep it can go depends on your era, tech and support buildings.
3. **Haul** raw material to a processor (kiln, smelter, sawmill). Distance and road quality affect cost and speed.
4. **Process** into usable goods (brick, bronze, iron, tools).
5. **Place buildings** with those goods — homes, shops, farms, workshops — and watch them get built.
6. **Grow** — more people, more money, more workers, more research.
7. **Advance** — research unlocks the next era: deeper mining, new resources, new buildings.
8. **Expand** — local deposits run out (or get too deep for now), so you claim new land or unlock deeper mining and repeat.

## 4. Art style, view and platform

- **Platform:** PC web browser only (mouse + keyboard) for now.
- **Look:** smooth, modern, clean — soft lighting, gentle shadows, stylized low-poly models with smooth shading. **Not pixel art.** Readable at a glance like SimCity 3000, but contemporary.
- **View:** isometric camera over the grid. Rotate in 90° steps, smooth zoom. No character to walk around.
- **How it's drawn (suggested):** real 3D models viewed through a fixed isometric (orthographic) camera. This gives the smooth modern look, makes construction stages and crossfades easy, and means the later free-3D camera reuses the same models.

## 5. Map and terrain

- **Map:** one large world divided into **plots** (e.g. 64×64 tiles). Start with one; claim neighbours as you grow. MVP uses a small generated region; the long-term world is a ~1:50 Earth (Appendix A.3).
- **Terrain:** grassland, forest, hills, mountains, river, lake, coast, marsh. Hills are slower to build on but likelier to hold ore.
- **Underground layer:** each tile has a column of rock layers. A separate **underground view** (toggle) shows surveyed deposits **and your mines and their workings (shafts, tunnels, worked-out areas) as they grow**. It never shows risk numbers or warnings (see §7).
- **Fog of war (Civilization-style):** the map starts dark except a small area around the start. Land is revealed by building outward (buildings and roads reveal what's around them) and by surveying. Underground deposits stay hidden until surveyed. You can only build on revealed land. Dev panel: reveal all.
- **Generation:** from a seed, so the same seed always makes the same world (good for saves and multiplayer later).

## 6. Resources and realistic mining

### Geology (where things are)

| Resource | Where it realistically forms | Typical extraction |
|---|---|---|
| Clay | River banks, lake beds, low wet ground | Shallow pit |
| Stone (limestone, granite) | Hills and mountains, under shallow soil | Quarry |
| Copper | Hills/mountains, near volcanic rock; green surface staining hints at it | Open pit, later shaft |
| Tin | Rare; granite areas, sometimes in river gravels | Placer digging, then shaft |
| Iron | Bog iron in marshes (low grade), hematite in hills (high grade) | Bog digging, pit, then shaft |
| Coal | Sedimentary basins, lowlands, in seams at depth | Surface strip, then deep shaft |
| Later: salt, gold, sulfur, oil | Basins, quartz veins, volcanic, deep sediment | Varies by era |

Deposits have **size**, **grade** (richness) and **depth**. Shallow, rich deposits are rare.

### Surveying
- **Era 1:** read surface signs (outcrops, stained rock, river clay). Cheap, vague.
- **Later:** test pits → core drilling → survey office. Each step gives more exact size, grade and depth.
- Results show as a heat-map overlay.

### Placing mines (no manual tunneling)
The player **places a mine building** on the surface; the mine works the deposit underneath by itself. You never dig tunnels by hand. Each mine has a **max depth** set by what your city has unlocked:

| Depth tier | Max depth | Unlocked by |
|---|---|---|
| Surface | 0–5 m (pits, quarries, strip) | Start (Era 1) |
| Shallow shaft | to ~30 m | Bronze era + Carpenter's Yard (timber supports) |
| Deep shaft | to ~100 m | Iron era + Mine Engineer's Office + Pump House (horse-powered) |
| Industrial deep | to ~400 m+ | Industrial era + Steam Pump + Ventilation Works |

A deposit deeper than your current tier is visible on the survey but can't be mined yet — a built-in reason to advance. Mines can be **upgraded in place** when a new tier unlocks.

### Extraction and depletion
- Output depends on grade, depth, workers and tools.
- Each deposit has a fixed total; as it drains, output falls and costs rise.
- Exhausted mines leave pits, spoil heaps and **underground voids** (see §7).

### Processing chains (realistic, kept short)
- **Clay → kiln (+ wood or coal) → brick / pottery**
- **Stone → stonecutter → building blocks; limestone → lime kiln → mortar**
- **Wood → charcoal kiln → charcoal** (fuel for early smelting — forests matter)
- **Copper ore + tin ore → smelter (+ charcoal) → bronze**
- **Iron ore + charcoal → bloomery → wrought iron**; later **iron ore + coke + limestone → blast furnace → pig iron → steel**

Each step is one building with a simple "inputs → output" card.

### Logistics
- Carts on roads first; later rivers/canals, rail, trucks.
- Every haul has a **distance cost**; smelting near the mine vs. near town is a real choice.
- Goods flow automatically along roads to the nearest building that needs them (no route micromanagement in the MVP).

## 7. Subsidence, incidents and emergency response

### Subsidence: what the player sees
Real mines leave empty space underground, and the ground above can sink. **Building on top of mine workings can make buildings collapse.** The **underground view** shows your mines and their workings as they're dug, so the player can see what's under a spot. Whether to build there is the player's common-sense call. Normal play shows **no risk numbers, no warning icons and no advisor messages**, and there are **no purchasable risk maps or safety surveys**. The underground view is the only information you get. Open pits and quarries are visible holes; this risk applies to shafts and tunnels.

### Hidden risk model
For every surface tile above worked ground, the game keeps a hidden **risk score**, checked once per game day:

- **Depth:** shallow workings are the most dangerous (like real "crown holes"). Risk is highest under 30 m, drops a lot past 100 m, and is tiny past 300 m.
- **Support:** none (×1.0), timber (×0.5), stone pillars / backfill (×0.2), engineered supports + backfill (×0.05). Supports come from tech and buildings.
- **Mine age:** risk climbs with years since the area was worked, and faster once a mine is **abandoned** (supports rot, pumps stop, water gets in).
- **Building weight:** light (hut, shed) ×0.5, medium (house, shop) ×1, heavy (smelter, factory, stone hall) ×2–3, **tall buildings and skyscrapers ×4–6**. Block-builds get weight from block count and material.

Roughly: **daily collapse chance = base × depth × support × age × weight.** Tuned in playtesting so it's rare but real.

### Collapses cost lives
The ground sinks and the building crumbles (short animation). **People inside can die.** Deaths lower population and hit happiness across the town, hardest in the neighbourhood itself. Roads over the spot crack and need repair. How many die depends heavily on the emergency response (below).

### Emergency services (optional, but you'll feel it)
Response only happens if the right service exists, **with enough capacity and coverage** (road travel time) to reach the incident. The player is never forced to build any of these, in any order or amount. Without them, outcomes get worse.

| Service building | Responds to | Without it / too far away |
|---|---|---|
| Fire watch → fire station | Fires (smelters, kilns, wooden houses) | Fires burn longer and spread to neighbours |
| Healer → clinic → hospital (ambulance) | Injured people at any incident | More of the trapped and injured die |
| Mine rescue station | Mine accidents, collapses over workings | Trapped people can't be reached; deaths rise |
| Demolition / cleanup yard | Rubble removal after any incident | Rubble sits; the plot stays blocked, nearby land value and happiness drop |

### Incident pipeline
Every incident (collapse, fire, mine accident) goes through the same steps, and each one is visible:

1. **Incident** happens; a notification appears *after* it happens (never before).
2. **Dispatch (fully automatic):** the nearest station with a **free crew** sends one as soon as one is available. Each station has a fixed number of crews (e.g. 2). If the only crew is busy or the station is far away, help arrives late or not in time. **No station = no response.** There is no manual dispatch and no priority setting.
3. **Travel:** the crew vehicle drives there on the road network. **Travel time matters**: survival chance for trapped people drops every hour, and fires spread while waiting. No road connection means no response.
4. **Response on site:** no rescue scene. The vehicle arrives, waits a short moment, and the result appears in the event log (survivors, deaths, fire out). Survivors go to a clinic (limited beds). Larger incidents need more crew time or several crews.
5. **Cleanup:** a demolition crew comes and clears rubble (takes time; the yard has limited crews too).
6. **Rebuild:** the plot is free again. The player chooses what to place, and it goes through the normal four construction stages (§8). Building back on the same workings carries the same risk.

The info card on an incident shows its current step ("waiting for rescue crew", "clearing rubble"). The Skip button works here too in dev mode.

### Vehicles on roads (no pedestrians)
There are **no walking people** on the map. This is not GTA. But service vehicles are visible and **drive along real roads using road pathfinding** (shortest travel-time route):

- Fire, ambulance, mine rescue and cleanup/demolition vehicles, plus construction and haul vehicles (and later haul trucks).
- **Era-appropriate:** hand carts and horse wagons with lanterns early on, then steam wagons, then motor trucks with flashing lights in later eras.
- Decent low-poly models, **smooth turning** at corners (curved paths, not grid snapping), and **lights** (lanterns, headlights, emergency flashers) that read well at night.
- **Performance:** one shared, instanced model per vehicle type (draw many with one GPU call), small vehicle counts (dozens, not thousands), and only vehicles with a job exist on the map. Route results are cached and recalculated only when roads change.

**Dev/test only:** dev panel has "show subsidence risk", "collapses on/off" and "trigger incident here".

## 8. Buildings, placement and economy

### Individual placement (replaces zone drawing)
Unlike SimCity, you **don't paint zones and wait for houses to appear**. You pick the exact building from a menu and place it on the exact tile(s), rotated how you like. Every building on the map was put there by you (or block-built by you). **This is the core gameplay**: there is deliberately **no drag-to-place-a-row tool**, so towns don't become cookie-cutter grids.

**Decision on zones:** zones are replaced by **building categories** in the build menu — they organize the menu, they don't auto-fill land:

| Category | Examples (early → later) | Needs |
|---|---|---|
| Housing | Hut, mud-brick house, brick house, stone townhouse, row housing | Road, water, food, nearby jobs |
| Shops & markets | Market stall, potter's shop, general store | Road, customers, goods |
| Food | Field, orchard, granary, mill, bakery | Fertile land, water, workers |
| Mining | Clay pit, quarry, shaft mine, pump house | Deposit, workers, road |
| Industry | Kiln, smelter, smithy, sawmill, factory | Workers, inputs, road |
| Services | Well, healer, school, temple | Road, workers |
| Emergency | Fire watch/station, clinic/hospital, mine rescue station, demolition yard | Road, workers, coverage |
| Civic & landmarks | Town hall, bathhouse, theatre, clock tower, monuments | Road, materials |

- People **move in automatically** to homes you've placed (if needs are met), and take jobs in buildings you've placed. You control *what and where*; the sim handles *who*.
- A plain **town stats panel** shows numbers only: homes vs. people, jobs vs. workers, food made vs. eaten, water supply. It never tells the player what to build.
- **Building variety is a goal:** each category has several sizes and styles per era, and each building has 2–3 looks so streets don't repeat.
- **Height grows with eras:** 1-storey huts → 2–3 storey brick and stone → 4–6 storey industrial tenements and mills → tall office blocks, apartment towers and **skyscrapers** in the Modern era. Tall buildings need steel, elevators and power, and they're heavy (§7).
- Optional later: **district tags** you paint over areas just for stats and simple rules (tax rate, quiet zone).

### Construction stages (shown every time)
Every building — menu building or block-build — visibly goes through **four stages**:

1. **Foundation** — cleared ground, footings, stakes and string
2. **Frame** — timber/stone/iron skeleton, scaffolding
3. **Half-built** — walls partly up, roof missing, materials piled nearby
4. **Finished**

Transitions use a **smooth crossfade** (about 1–2 seconds, scaled to game speed) so stages blend instead of popping. Construction vehicles (carts, later trucks) visibly bring materials during construction; no workers on foot. Block-builds generate their stages automatically (footprint → outline → lower half → complete). Skipping construction still plays a quick crossfade through the stages so it never just pops in.

### Population needs
1. **Survival:** food, clean water, shelter
2. **Security & health:** sanitation, wells, healer → hospital, fire safety
3. **Comfort:** goods (pottery, tools, cloth), markets, winter fuel
4. **Culture & advancement:** temples, schools, entertainment (feeds research)

Pressures: bad water causes disease, mines and smelters pollute, overcrowding hurts health, famine shrinks population, collapses and fires kill people, and slow emergency response makes it worse.

### Money and happiness
- **Money:** taxes from homes and shops, selling surplus goods to an off-map market. Spending on construction, upkeep, services.
- **Happiness:** 0–100 per neighbourhood from needs met, pollution, jobs, taxes. Low → people leave; high → growth and faster research.
- **Research:** from population, schools, and first-time "discoveries" (e.g. first bronze).

## 9. Block-build mode

- Toggle on any plot you own. Place cubes (slopes/half-blocks later) layer by layer: place, remove, fill, copy/paste, rotate, layer slicer.
- **Blocks cost real materials** (brick from kilns, bronze from smelters). Sandbox: free blocks.
- Give the finished build a **function** (house, shop, workshop, monument) so it joins the simulation.
- Builds are constructed in stages like any building (§8), have a **weight** for subsidence (§7), can collapse and be rebuilt like any building, and can be saved as **blueprints**.

## 10. Eras and tech tree

| Era | Key discoveries | Resources | Buildings | Mining depth | Transport |
|---|---|---|---|---|---|
| 1. Stone & Clay | Pottery, kilns, quarrying, farming | Clay, stone, wood | Huts, kiln, quarry, fields, market | Surface | Dirt roads, carts |
| 2. Bronze | Smelting, alloying, timber supports, writing | Copper, tin, charcoal | Smelter, carpenter's yard, brick houses, granary, school | Shallow shaft | Paved roads, river boats |
| 3. Iron | Bloomery, iron tools, mine engineering | Iron, lime | Bloomery, smithy, stone buildings, pump house, aqueduct | Deep shaft | Bridges |
| 4. Industrial | Coking, blast furnace, steam power | Coal, coke, steel | Factories, steam pump, ventilation works, rail yard | Industrial deep | Canals, rail |
| 5. Modern (later) | Electricity, chemistry | Oil, gold, sulfur, aluminum | Power plants, refineries | Deeper | Trucks |
| 6. Aerospace (later, hidden) | Flight, jet engines, rocketry | Titanium, rare earths, rocket fuel | Airfields, aircraft plants, launch site | Deepest | Aircraft |
| 7. Orbital (later, hidden) | Satellites, reusable rockets | (same, at scale) | Spaceport, satellite works, orbital station | n/a | Rockets |
| 8. Interplanetary (post-win, hidden) | Life support, off-world mining | Moon/planet resources (regolith, ice, helium-3) | Off-world colonies and mines | Per planet | Spacecraft |
| 9. Galactic (post-win, far future, hidden) | Interstellar drives | Procedural planets' resources | Player-designed ships, colonies | Per planet | Starships |

**Hidden sky tier:** in-game, the era list and tech tree show every era up to Modern, but **Aerospace onward is not shown at all** (no "???" placeholders) until the player reaches it. Dev panel and sandbox can still open it.

Emergency services and height by era: Era 1 fire watch (bucket cart) + healer, 1-storey; Era 2 clinic, mine rescue station, demolition yard (horse wagons), 2–3 storeys; Era 3 fire station, 3–4 storeys; Era 4 steam fire engines, hospital, 4–6 storey tenements and mills; Era 5 motor ambulances and trucks with flashers, office towers and skyscrapers.

Research tree: 4–6 nodes per era. Entering an era needs key techs **plus** having produced something (no Bronze era until you've smelted copper).

### Difficulty curve
Early eras are **quick, easy and forgiving**, cheap mistakes, short timers, cheap buildings, shallow mines, one-step processing, and very rare incidents. Each later era gets **harder and longer**: deeper mines, longer and more complex processing chains, more people and services needed, higher costs and upkeep, and more incident risk (deeper workings, heavier and taller buildings, fire-prone industry).

| Era | Target time at 1x (rough) | Feel | To advance to next era |
|---|---|---|---|
| 1. Stone & Clay | ~1.5 h | Easy and forgiving; collapses almost impossible | Pop 50; 100 bricks made; Pottery + Smelting researched |
| 2. Bronze | ~4 h | First real choices; first shaft mines and collapses | Pop 250; 50 bronze smelted; clinic + rescue/cleanup post; Iron Working researched |
| 3. Iron | ~8 h | Logistics and depth start to matter | Pop 1,000; 200 wrought iron; deep shaft running; fire station + clinic coverage over most homes; Coking + Steam researched |
| 4. Industrial | ~14 h | Long multi-step chains (coal → coke → steel), pollution, frequent incidents | Pop 5,000; 500 steel; rail link; hospital; mine rescue at every deep mine; Electricity researched |
| 5. Modern (later) | ~22 h | Big city management, skyscrapers, heavy service load | Pop 20,000+; electricity grid; Flight researched |
| 6. Aerospace (hidden) | ~22 h | Air control, global logistics | Orbital tech |
| 7. Orbital (hidden) | ~28 h | Satellites, launches, taking over Earth | **Legitimate win** → space unlocks (A.2) |
| **Total to space** | **~100 h** | | |

Target: **about 100 hours of normal play to unlock space.** All numbers are first guesses to tune in playtesting. (The MVP uses much shorter timers so it can be tested.) The **speed (1x–50x) and skip controls are unchanged** and work in every era.

## 11. Time controls and skip system

Normal play takes a while. For development and testing:

- **Speed:** Pause, 1x, 2x, 5x, 10x, 25x, **50x** (hotkeys 0–6).
- **Skip button** on anything with a timer: construction (crossfades quickly through the stages), incident steps (rescue, cleanup), research, mining/processing, population growth, survey, era jump.
- **Sandbox mode:** start in any era (including the hidden sky tier) with earlier techs done, chosen resources unlocked, starting stockpile, unlimited money toggle, free blocks.
- **Dev panel:** reveal underground, add money/materials, toggle needs, **show subsidence risk**, **collapses on/off**, **trigger incident**.

> **These skips are temporary.** They exist so Isaac can see every stage quickly. Before release we decide what stays (speed control likely), what becomes sandbox-only, and what's removed. Skips just jump the same timers forward, so removing them breaks nothing.

## 12. UI layout (in words)

- **Top bar:** money, population, happiness, era, date, speed buttons.
- **Left toolbar:** Roads, Build menu (by category), Mining, Services & Emergency, Survey, Block Build, Bulldoze, **Underground view** toggle.
- **Placement:** pick a building → a see-through preview follows the mouse, snaps to the grid, R rotates, green/red shows if it fits (fit only, never subsidence risk; switch to underground view to look at workings below). Click to place; construction starts.
- **Bottom-right:** minimap; overlay buttons (deposits, pollution, happiness, land value, traffic, **service coverage**).
- **Right panel (selected item):** info card — inputs → output, workers, construction stage, mine depth tier, Skip button.
- **Top-right:** tech tree, town stats, a plain **event log** of things that already happened ("House collapsed: 3 dead", "Rescue crew arrived") — no advice or hints, save/load, dev panel (dev builds only).
- **Block-build mode:** toolbar swaps to a block palette; layer slider on the right.

## 13. First playable version (MVP)

- PC browser, smooth modern isometric look, one 64×64 plot, rotate + zoom
- Terrain: grass, forest, hills, river
- Dirt roads
- **Individual building placement** from a categorized menu (~12–15 buildings: housing, shops, food, mining, industry, a well)
- **4-stage construction with crossfades** for every building
- 4 resources: clay, stone, wood, copper (+ tin if easy)
- 2 eras: Stone & Clay → Bronze (easy, short timers, per the difficulty curve); 2 mining depth tiers (surface, shallow shaft)
- 2 processing chains: clay → kiln → brick; copper (+ tin) → smelter → bronze
- Surveying overlay; depleting deposits
- **Fog of war** (dark map; revealed by building/roads/surveys; dev reveal-all)
- **Underground view** showing deposits, mines and workings
- **Hidden subsidence** over shallow shaft mines (simple §7 model), collapses can kill + dev overlay/toggle
- **One "Rescue & Cleanup Post"** building (1–2 crews) that handles rescue and then rubble clearing; full pipeline incident → travel → rescue → cleanup → rebuild
- **Vehicles on roads** with pathfinding: one rescue cart and one cleanup cart model, smooth turning, lanterns
- Basic needs (food, water, housing, jobs) → happiness; money and population loop
- Block-build mode with 4–6 block types that cost materials
- Speed 1x–50x, skip buttons, sandbox start in either era
- Save/load in the browser + export to file
- No tutorial or hints; plain stats panel and event log only
- **Not in MVP:** fires, separate fire/medical/mine-rescue services, tall buildings, trade, competition, war, multiplayer, multiple plots, Stellar/XLM

**Tech approach (suggested):** TypeScript in the browser, Three.js with an orthographic isometric camera, simple low-poly models per construction stage, instanced vehicle models. Simulation runs in fixed ticks, separate from drawing.

**Multiplayer-friendly choices from day one:** game state is plain data separate from graphics; every change is a **command** ("place kiln at x,y") that could later go to a server; deterministic simulation from a seed; plots have owners (just "player 1" for now).

**World/planet hooks in the data model (MVP builds none of the extra content):**

- Every location is stored as **galaxy → star system → planet → region → chunk → tile**. The MVP has exactly one of each above "region" (galaxy 0, system 0, planet "Earth").
- Each **planet** carries its own geology rules (which rocks and ores form where), gravity and atmosphere flags. Resources are defined per planet, not hard-coded.
- Regions map to **real latitude/longitude** so a region can later be placed on the 1:50 Earth.
- World is split into **chunks** from day one, so it can later stream in pieces.
- **Owners** can be a player or an AI civ (only "player 1" exists in the MVP).

## 14. Roadmap (summary)

Phase 2 Iron era and services → Phase 3 Industrial → Phase 4 Modern + Earth-scale world → Phase 5 AI rival civs → Phase 6 multiplayer → Phase 7 Aerospace & Orbital (rule the sky, take over Earth = win) → Phase 8 post-win: spaceship + Interplanetary → Phase 9 Galactic. War: possible future, not designed. Free 3D camera and the optional Stellar/XLM layer can slot in later. Details in **Appendix A**.

## 15. Open questions for Isaac

**Answered**

- ~~Look~~ → Smooth, modern; not pixel art.
- ~~Platform~~ → PC browser only for now.
- ~~Underground: dig tunnels yourself?~~ → No. Place mines; depth is gated by era/tech/buildings.
- ~~War / competition / rival towns?~~ → Rivals and competition later (A.2); war out of scope, possible future.
- ~~Mine collapses?~~ → Yes: hidden subsidence under buildings, no warning (§7).
- ~~Zones auto-fill or player-placed?~~ → Player places every building; zones become menu categories (§8).
- ~~Collapse casualties?~~ → Yes, people die; affects population and happiness. Outcomes depend on emergency services (§7).
- ~~Any way to learn risk?~~ → No purchasable risk maps or surveys. The visible underground view is the info; building on top is the player's call.
- ~~Drag tool for rows of houses?~~ → No. Individual placement is the core gameplay.
- ~~Pedestrians?~~ → No walking people; only vehicles on roads.
- ~~Rescue scene?~~ → No. Vehicle arrives, then the result.
- ~~Crew control?~~ → Fully automatic when a crew is free; busy/far crews arrive late or too late; no station means no response; no manual dispatch.
- ~~Map scale?~~ → One civilization expanding from a starting plot, eventually across a ~1:50 Earth, then space.
- ~~Start location?~~ → Player picks a spot or Random; it sets the country (A.2).
- ~~Game modes?~~ → Solo Earth, Country, USA vs World (A.2).
- ~~What does dominating the world mean?~~ → Win = take over the Earth via sky control; winning unlocks the spaceship (A.2).
- ~~Borders?~~ → Emergent: countries start small in the Stone Age and grow their own territory.
- ~~Solo Earth: wilderness or settlements?~~ → Setup option for either.
- ~~Space failure?~~ → Realistic ship engineering; dying in space resets you to Earth with your civ intact (A.5).
- ~~Show the space eras early?~~ → No. Aerospace onward stays hidden until reached; dev/sandbox can access it.
- ~~Pace per era?~~ → Rising difficulty curve, ~1.5 h for Era 1, ~100 h total to unlock space at 1x (§10), to be tuned.

**Still open**

1. **How realistic is too realistic?** Detailed ore grades and mining waste, or just rich/poor? Worker injuries?
2. **Block building:** decoration + function tag, or should block layout matter (bigger furnace = more output)?
3. **Disasters and seasons:** in or out?
4. **Multiplayer:** friends only or public? Everyone at once, or drop in and out?


---

## Appendix A: Long-term roadmap

### A.1 Phases
- **Phase 2:** Iron era; separate fire, medical and mine rescue services; fires and fire spread; deep shafts + pump house; more terrain; multiple plots + land claiming; warehouses; better surveying; seasons.
- **Phase 3:** Industrial era: coal, coke, steel, industrial-depth mines, rail, 4–6 storey buildings, steam fire engines, haul wagons, pollution and health, blueprints, backfilling old mines.
- **Phase 4:** Modern era (skyscrapers, motor emergency vehicles, haul trucks) and the move to an Earth-scale world (A.3).
- **Phase 5: Game modes + AI civs** (A.2), before or alongside multiplayer. Trade and competition come in here.
- **Phase 6: Multiplayer:** shared server world; neighbouring player plots; connected roads and rail. The server holds the true state.
- **Phase 7: Aerospace and Orbital**, and the win condition (A.2, A.4).
- **Phase 8: Post-win spaceship + Interplanetary**, **Phase 9: Galactic** (A.5).
- **Future, not designed:** war.
- **Later (any Earth phase):** rank ladder and classified secrets (A.8).
- **Later, with the 3D view: player driving** becomes a big part of the game. You drive your own city's roads, and later fly aircraft, sail ships and pilot spacecraft. The MVP's road graph, pathfinding and vehicle system are the foundation for it. Personal transport is gated by **era and wealth**: horse-drawn carriage early, then cars, and with a higher rank plus enough money you can buy a helicopter, then planes. Early ages are short, so the first vehicles come quickly.
- **Later: custom map mode / map editor.** Sculpt terrain, water and mountains, place deposits and geology, and set start points and civs. Save and play custom maps; sharing could come later. It uses the same seed/chunk world format.
- **Any time later:** free 3D camera over the same models; disasters; mod/blueprint sharing; optional Stellar/XLM layer (A.7).

### A.2 Start location, game modes and win condition
**Start location:** the player picks a spot on the Earth map or hits Random. The spot sets your **civilization/country** (e.g. Arizona = USA) and your local geology.

**Emergent borders:** no fixed modern borders. Every country starts as a small Stone Age settlement and grows its own territory by claiming land; borders form where civs meet, so they differ every game.

**Game modes:**

| Mode | You play | Everyone else |
|---|---|---|
| Solo Earth | The whole Earth, from your start spot outward | No rivals. Setup option: **empty wilderness** or **neutral settlements** that don't compete (they can be absorbed as you grow) |
| Country | One country | Every other country is an AI civ |
| USA vs World | One US state to start, growing into the USA | The rest of the world is AI |

**AI civs:** each has its country's general character: architecture style, priorities (e.g. trade, industry, farming), and layout tendencies (grid vs. organic streets). Their growth is **procedural**, so every new world has different buildings and town layouts, even for the same country. They compete for land and deposits and race you up the tech tree. You find them by exploring; no advisor points them out.

**Era progression varies by civilization:** pacing, order and some techs and paths within eras differ by country/culture, shaped by local geology and resources and grounded in history (e.g. a tin-poor region reaches bronze later and may lean on early iron; a river-valley civ farms and builds with clay brick early). Era and tech data is a shared base that each culture can **override** (timings, order, extra or replacement techs).

**Win condition: take over the Earth.** The "become Elon Musk" arc: whoever controls the sky (air, then orbit) controls the world. Sky control brings both economic dominance (flight routes, launch capacity, satellites for survey and communications, control of trade and resources) and strategic reach. In Solo Earth, taking over means your civ covers the planet; in the other modes it means out-growing and absorbing the AI civs. Exact thresholds get tuned with the AI phase. **War is out of scope** for now and may come in the future; it is not designed here.

**Winning unlocks the spaceship** and the post-win stage (A.5). **Only a legitimate win unlocks space.** The bad-guy/dictator route can never reach space: it caps out as an isolated, internationally disrespected regime (Kim Jong-un style) and is ultimately unsuccessful.

### A.3 The world: a ~1:50 Earth
- **Goal:** a roughly 1:50 scaled replica of Earth. Real continents, rivers and mountains, with deposits placed by real geology (Cornish tin, Andean copper, Appalachian coal, and so on). The player starts on one plot and expands.
- **Feasibility caveat:** at 1:50, Earth is still about 800 km around the equator and roughly 200,000 km² of surface (a bit smaller than the UK). At ~10 m per tile that's on the order of **2 billion tiles**, far too much to generate, store or draw at once in a browser. It is only realistic with:
  - **Chunked streaming:** load only chunks near the camera and the player's territory; everything else is stored compactly or regenerated from the seed on demand.
  - **Generated from real elevation data:** terrain built from public elevation and geology datasets, preprocessed offline into chunk tiles, not hand-made.
  - **Levels of detail:** full detail only near the camera; far land drawn as simplified terrain; whole continents as a map view.
  - **Vertical scale:** heights and mine depths stay at game scale (not divided by 50), or mountains would be flat and mines meaningless.
  - **Simulation detail by distance:** distant or AI towns run a cheap summary simulation instead of tile-by-tile.
- **Practical path:** ship regional maps first (one generated region, then one real-world region such as a slice of Europe or the US Southwest). Store coordinates as lat/long plus chunk/tile from day one, and keep saves Earth-compatible, so regions can later be stitched into the full Earth without breaking saves.

### A.4 Space eras
- **Aerospace:** airfields, aircraft plants, air routes; air control over regions.
- **Orbital:** spaceport, launches, satellites (map-wide survey and communications), orbital stations. Controlling orbit is the strongest position on Earth.
- Aerospace and Orbital are how you take over the Earth. **Not in the MVP**, but the data model already has a planet level (§13).

### A.5 Post-win: spaceship, planets, galaxy (far future)
- **Unlocked by winning.** In the spirit of No Man's Sky: the player **designs and builds a spaceship** (block-build carries over to ship design), leaves Earth, and explores the Moon and planets, then a **procedurally generated galaxy**. Each planet has its own geology, gravity and atmosphere and the same mine/process/build loop.
- **Realistic engineering, and the design matters:**
  - **Thrusters:** thrust vs. ship mass decides whether you can lift off and land.
  - **Fuel:** a fuel budget (delta-v) decides how far you can go and whether you can get back.
  - **Life support:** oxygen, water, food and power per crew per day; recycling extends range.
  - **Structure:** hull strength, heat shielding for re-entry, and stress under acceleration.
- **Dying in space resets you to Earth.** A bad design (out of fuel, out of air, hull failure, burn-up) kills the crew and the ship is lost. You go back to Earth, where your civ is untouched, to build a better ship. The event log states plainly what failed; it doesn't suggest fixes.
- The data model already generalizes: **galaxy → star system → planet → region → plot**. Earth is just one planet in system 0, galaxy 0.

### A.6 Architecture notes for the long term
- One world model for every scale. Planets differ by data (geology rules, gravity, atmosphere), not by code.
- Chunked, seed-based generation everywhere, so Earth regions, other planets and procedural galaxies all use the same loading path.
- Owners are generic (player or AI civ), so AI rivals and multiplayer reuse the same rules.

### A.7 Stellar / XLM integration (optional)

An **optional** layer for after multiplayer exists. **Never pay-to-win**: nothing bought with crypto makes your city produce more, mine deeper, build faster or win anything gameplay-wise. The game must be fully playable without a wallet.

Ideas:

- **Land plots as tradeable Stellar assets** — ownership of a plot on a shared server, transferable between players.
- **Blueprint marketplace** — sell/buy block-build and building designs for XLM or USDC (the buyer still has to build them with in-game materials).
- **Cosmetic skins** — building styles, roof colours, decorations. Looks only.
- **Player tips** — send a small tip to a builder whose city or blueprint you like.
- **Weekly build contests** — prizes for the best builds, funded by a fixed prize budget.

Hard rules (no gambling, pyramid or securities-like mechanics):

- **No cash-out of in-game resources** — ore, bricks, bronze, money and research stay in the game.
- **No returns funded by new players**, no "invest and earn", no yield, staking or passive income.
- **No loot boxes or random paid rewards.**
- Get legal advice before launch (plot assets and contest prizes especially).

**Not in MVP** or any early phase.

### A.8 Rank ladder, leadership style and classified secrets (later, not MVP)
- **Rank ladder** tied to city/country progress (population, territory, era, key goals):
  Village Elder → Mayor → Governor → Senator → **President** → World Leader.
  Rank shows as plain info in the top bar; each rank lists its requirements as numbers, nothing more.
- **Classified secrets unlock by rank or top tech goals, not by exploring.** For example, reaching President or a top tech level reveals classified knowledge: Area 51-style recovered ships, advanced or alien tech, secret projects.
- **Never hinted beforehand:** no teasers or "???" entries. They simply appear in the tech tree when unlocked (same as the hidden sky tier).
- **Rewards:** better buildings, materials and blueprints that shortcut the path toward the sky/space tier. They help, but they don't win the game on their own.
- **Leadership style** (a spectrum, Good President ↔ Dictator) is set by the player's own policies and actions, not picked from a menu: taxes, forced labour or overtime, curfews, spending on services, how incidents are handled. It shapes, and is shaped by, the people:
  - **Toward Dictator:** forced output and faster construction and research, but lower happiness, people leaving, and a rising **unrest** risk (strikes, riots, slowdowns).
  - **Toward Good President:** higher happiness, growth and steady advancement, but no forced short-term gains.
  - Unhappy people push a leader toward harsher policies to keep output up, and happy people make gentle policies work. Each rank (e.g. Governor, President) behaves differently along the spectrum, and some secrets or projects may need a certain standing.
  - **Third path, "Batman":** a secret billionaire. A public company front runs normally while a hidden operation and secret tech base build advanced projects out of view.
  - **No style meter.** The player only sees the effects (happiness, output, unrest numbers). No advice on which way to lean.
- **Hidden reputation / morality track:** from the very start, choices like fair vs. low wages, safe vs. unsupported mines, building rescue services vs. skipping safety, and honest vs. corner-cutting quietly build a hidden reputation. Later it opens or closes paths: Good President / "Iron Man" (public genius-builder) vs. Dictator / shady "Batman". **Never shown**: no meter, no hints, no "your reputation changed" messages. (The MVP only records a hidden value from mine safety and incident response; it has no effect yet.)
- Dev/sandbox can set rank and unlock secrets for testing.
