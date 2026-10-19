# EARTH — early playable build

Static browser game, no build step. Three.js is vendored in `vendor/`.

Run: serve this folder over HTTP (ES modules don't load from file://), e.g.
`python3 -m http.server 8080` then open http://localhost:8080/

Controls (v2.3: drag with the Road tool to draw a whole road;  also in the in-game legend: ⌨️ button or `?`):
- Mouse: left-click act / select (units always win) · left-drag box-selects units (Select tool) or paints (Road, Plant, Dismantle) · right/middle-drag pan · right-click orders selected units (villagers: tree = wood, hill rock = stone, clay bank = clay, berry bush = food, construction site = build, ground = walk), otherwise cancels the tool · wheel zoom.
- Keyboard: WASD / arrow keys pan · Q/E rotate · +/− zoom · R rotate building · U underground view (Bronze era+) · 0–6 speed (pause…50x) · Space pause · Esc cancel · ? legend.
- Touch: drag pan · pinch zoom · two-finger twist rotate · tap act (with units selected: order them) · hold-then-drag box select · long-press a tool for its description.
- Dev tools are hidden; open with `?dev=1`.
Code: `src/data.js` (static data), `src/sim.js` (simulation + commands, no rendering), `src/units.js` + `src/villagers.js` (units, pathfinding, villager jobs), `src/models.js` (procedural building models + glTF landmark hook), `src/render.js` (Three.js renderer), `src/main.js` (UI + loop).

Level tool: terrace steep mountain tiles so they can be built on (needs Ground Levelling research + a Carpenter, Bronze era).

Graphics quality: Low / Medium / High selector (top right or title screen), or `?q=low|medium|high`.

Status panel (top left): population · housed/capacity · employed · free · villagers (tap for numbers per building), resource/happiness/health/condition bars, a 15 s report ring with per-bar changes, and the next-era goal. ▸/▾ collapses it.

Tests: `node tests/isaac.mjs` (Isaac's housing/worker case), `node tests/longrun.mjs` (60-day balance run), `node tests/haul.mjs` (material hauling).
