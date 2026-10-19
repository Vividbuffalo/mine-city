# EARTH — early playable build

Static browser game, no build step. Three.js is vendored in `vendor/`.

Run: serve this folder over HTTP (ES modules don't load from file://), e.g.
`python3 -m http.server 8080` then open http://localhost:8080/

Controls (v2.1; also in the in-game legend: ⌨️ button or `?`):
- Mouse: left-click act / select (units always win) · left-drag box-selects units (Select tool) or paints (Road, Plant, Dismantle) · right/middle-drag pan · right-click cancels the tool · wheel zoom.
- Keyboard: WASD / arrow keys pan · Q/E rotate · +/− zoom · R rotate building · U underground view (Bronze era+) · 0–6 speed (pause…50x) · Space pause · Esc cancel · ? legend.
- Touch: drag pan · pinch zoom · two-finger twist rotate · tap act · hold-then-drag box select · long-press a tool for its description.
- Dev tools are hidden; open with `?dev=1`.
Code: `src/data.js` (static data), `src/sim.js` (simulation + commands, no rendering), `src/models.js` (procedural building models + glTF landmark hook), `src/render.js` (Three.js renderer), `src/main.js` (UI + loop).

Level tool: terrace steep mountain tiles so they can be built on (needs Earthworks & Terracing research + a Carpenter's Yard, Bronze era).

Graphics quality: Low / Medium / High selector (top right or title screen), or `?q=low|medium|high`.
