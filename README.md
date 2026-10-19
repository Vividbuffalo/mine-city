# EARTH — early playable build

Static browser game, no build step. Three.js is vendored in `vendor/`.

Run: serve this folder over HTTP (ES modules don't load from file://), e.g.
`python3 -m http.server 8080` then open http://localhost:8080/

Controls: left toolbar tools · left-click act · right/middle-drag or WASD pan · wheel zoom · Q/E rotate · R rotate building
· U underground view · B block mode · 0–6 speed (pause…50x) · Esc cancel.
Code: `src/data.js` (static data), `src/sim.js` (simulation + commands, no rendering), `src/models.js` (procedural building models + glTF landmark hook), `src/render.js` (Three.js renderer), `src/main.js` (UI + loop).

Level tool: terrace steep mountain tiles so they can be built on (needs Earthworks & Terracing research + a Carpenter's Yard, Bronze era).

Graphics quality: Low / Medium / High selector (top right or title screen), or `?q=low|medium|high`.
