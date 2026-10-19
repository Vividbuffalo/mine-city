// UI + game loop. Player actions become commands applied to the sim (sim/render separation).
// v2.2: villagers, status bars + 15 s report cycle, population readout, era goal, production bars.
// v2.1: mobile-first layout, pointer/touch input (pan, pinch, twist, tap), smooth camera, build thumbnails,
// dismantle / plant tools, era-gated survey + underground view, box unit selection, controls legend.
import { Renderer, QUALITY } from './render.js';
import * as S from './sim.js';
import { BUILDINGS, CATEGORIES, TECHS, ERAS, CUSTOM_FUNCS, DEPOSITS, techCost, SAPLING, DISMANTLE, GATHER, VILLAGER, ERA3_NOTE } from './data.js';

const $ = (id) => document.getElementById(id);
const SPEEDS = [0, 1, 2, 5, 10, 25, 50];
const SAVE_KEY = 'earth.save.v1', OLD_SAVE_KEY = 'minecity.save.v1';
const params = new URLSearchParams(location.search);
let DEV = params.get('dev') === '1' || localStorage.getItem('earth.dev') === '1';
let quality = params.get('q') || localStorage.getItem('earth.quality') || 'auto';
const autoQ = quality === 'auto'; if (autoQ) quality = matchMedia('(pointer: coarse)').matches ? 'low' : 'medium'; // auto: start by device, the renderer's watchdog steps down if it is slow
const STAGE_NAMES = ['Foundation', 'Frame', 'Half-built', 'Finished'];
const TERRAIN_NAMES = ['Grassland', 'Forest', 'Hills', 'River'];
const TOUCH = matchMedia('(pointer: coarse)').matches;

const renderer = new Renderer($('view'), quality);
renderer.autoQ = autoQ;
let state = S.newGame({ seed: Number(params.get('seed')) || undefined });
renderer.setState(state);
const ui = { tool: 'select', kind: null, cat: 'Housing', rot: 0, sel: null, selTile: null, units: [], unitCard: false, speed: 1, lastSpeed: 1, acc: 0, hover: null, panel: null, under: false, roadA: null };

function cmd(c) { const r = S.applyCommand(state, c); if (!r.ok && r.err) toast(r.err, true); return r; }

// ---------- toasts (event log + feedback); full log lives in the menu ----------
function toast(msg, err = false) {
  const box = $('toasts'), el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
  box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 450); }, err ? 2200 : 3200);
}

// ---------- unlocks ----------
const unlocked = {
  survey: () => state.research.done.includes('prospecting'),
  level: () => state.era >= 2,
  under: () => S.undergroundUnlocked(state),
};
function refreshUnlocks() {
  for (const k of ['survey', 'level']) document.querySelector(`#toolbar [data-tool="${k}"]`).classList.toggle('hidden', !unlocked[k]());
  $('btn-under').classList.toggle('hidden', !unlocked.under());
  if (ui.under && !unlocked.under()) toggleUnder(false);
  if ((ui.tool === 'survey' || ui.tool === 'level') && !unlocked[ui.tool]()) setTool('select');
  $('m-dev').classList.toggle('hidden', !DEV);
}

// ---------- sheets: only one open at a time, never overlapping ----------
function closeSheets(except) {
  if (except !== 'info') { ui.sel = null; ui.selTile = null; ui.unitCard = false; ui.popCard = false; $('info').classList.add('hidden'); }
  if (except !== 'panel') { ui.panel = null; $('panel').classList.add('hidden'); }
  if (except !== 'build') $('buildmenu').classList.add('hidden');
  if (except !== 'legend') setLegend(false, false);
  if (except !== 'menu') $('menu').classList.add('hidden');
}
const closeInfo = () => { ui.sel = null; ui.selTile = null; ui.unitCard = false; ui.popCard = false; $('info').classList.add('hidden'); };
const closePanel = () => { ui.panel = null; $('panel').classList.add('hidden'); };

// ---------- tools ----------
function setTool(t) {
  if (t === 'bulldoze') t = 'dismantle';
  ui.tool = t; if (t !== 'build') { ui.kind = null; $('placing').classList.add('hidden'); }
  ui.roadA = null;
  document.querySelectorAll('#toolbar button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  if (t === 'build') { if (ui.kind) showPlacing(); else { closeSheets('build'); $('buildmenu').classList.remove('hidden'); renderBuildMenu(); } }
  else $('buildmenu').classList.add('hidden');
  if (t === 'scout') { closeSheets('info'); ui.unitCard = true; if (!ui.units.length && (state.units || []).length) setUnits([state.units[0].id]); renderInfo(); }
  renderer.setGhost(null);
}
// disarm the active tool (Esc / right-click / selecting a unit) without closing what the player is looking at
function disarm() { if (ui.tool !== 'select') setTool('select'); }
document.querySelectorAll('#toolbar button[data-tool]').forEach(b => b.onclick = () => { if (b.dataset.tool === ui.tool && ui.tool !== 'select') { disarm(); $('buildmenu').classList.add('hidden'); } else setTool(b.dataset.tool); });
$('btn-under').onclick = () => toggleUnder();
function toggleUnder(on = !ui.under) { if (on && !unlocked.under()) return toast('Underground view unlocks in the Bronze era', true); ui.under = on; renderer.setUnderground(on); $('btn-under').classList.toggle('on', on); }
function setUnits(ids) { ui.units = ids.filter(id => (state.units || []).some(u => u.id === id)); renderer.selUnits = new Set(ui.units); renderer.selUnit = ui.units[0] ?? null; }

// long-press on toolbar buttons shows the full tooltip
let tipT = 0;
document.querySelectorAll('#toolbar button, #viewctl button').forEach(b => {
  const tip = b.dataset.tip || b.title; if (!tip) return; if (!b.title) b.title = tip;
  b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; clearTimeout(tipT); tipT = setTimeout(() => { const r = b.getBoundingClientRect(), el = $('tip'); el.textContent = tip; el.classList.remove('hidden'); el.style.left = Math.min(innerWidth - 250, Math.max(6, r.left)) + 'px'; el.style.top = Math.max(6, r.top - 44) + 'px'; b._tipShown = true; }, 450); });
  const end = () => { clearTimeout(tipT); setTimeout(() => $('tip').classList.add('hidden'), 900); };
  b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('pointerleave', end);
  b.addEventListener('click', (e) => { if (b._tipShown) { b._tipShown = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
});

// ---------- build menu with picture thumbnails rendered from the in-game models ----------
const TOOL_ITEMS = {
  road: { name: 'Dirt road', cost: '2 money / tile', tool: 'road' },
  plant: { name: 'Plant trees', cost: S.costStr(SAPLING.cost) + ' / sapling', tool: 'plant' },
  level: { name: 'Terrace ground', cost: 'Earthworks', tool: 'level', lock: () => unlocked.level() ? '' : 'Bronze era' },
  survey: { name: 'Survey', cost: '15 money', tool: 'survey', lock: () => unlocked.survey() ? '' : 'Research Prospecting (Bronze)' },
  bulldozer: { name: 'Bulldozer', cost: 'instant demolition', tool: 'bulldoze', lock: () => state.era < 7 ? `${DISMANTLE.bulldozerEra} era` : state.research.done.includes('machinery') ? '' : 'Research Machinery' },
};
const BM_CATS = [...CATEGORIES, 'Tools'];
function lockReason(k) {
  const d = BUILDINGS[k]; if (d.era > state.era) return `${ERAS[d.era] ? ERAS[d.era].name : 'Later'} era`;
  const a = S.buildingAvailable(state, k); return a === true || a == null || a === '' ? '' : typeof a === 'string' ? a : '';
}
function thumb(k) { try { return renderer.thumb(k); } catch (e) { return ''; } }
function renderBuildMenu() {
  $('bm-cats').innerHTML = BM_CATS.map(c => `<button class="${c === ui.cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('');
  $('bm-cats').querySelectorAll('button').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; renderBuildMenu(); });
  let html = '';
  if (ui.cat === 'Tools') html = Object.entries(TOOL_ITEMS).map(([k, it]) => { const lk = it.lock ? it.lock() : ''; return `<button class="bitem ${lk ? 'locked' : ''}" data-tool-item="${k}" title="${it.name}${lk ? ' (locked: ' + lk + ')' : ''}"><img src="${thumb(k === 'bulldozer' ? 'level' : k)}" alt=""><b>${it.name}</b><small>${lk ? '🔒 ' + lk : it.cost}</small></button>`; }).join('');
  else {
    const items = Object.entries(BUILDINGS).filter(([k, d]) => d.cat === ui.cat && !d.hidden && d.era <= state.era + 1);
    html = items.map(([k, d]) => { const lk = lockReason(k); return `<button class="bitem ${ui.kind === k ? 'on' : ''} ${lk ? 'locked' : ''}" data-k="${k}" title="${d.name}: ${bdetail(k)}"><img src="${thumb(k)}" alt=""><b>${d.name}</b><small>${lk ? '🔒 ' + lk : S.costStr(d.cost)}</small></button>`; }).join('') || '<small>Nothing in this category yet.</small>';
  }
  $('bm-items').innerHTML = html;
  $('bm-items').querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const k = b.dataset.k, lk = lockReason(k); if (lk) return toast(`${BUILDINGS[k].name}: locked (${lk})`, true); ui.kind = k; showPlacing(); });
  $('bm-items').querySelectorAll('[data-tool-item]').forEach(b => b.onclick = () => { const it = TOOL_ITEMS[b.dataset.toolItem], lk = it.lock ? it.lock() : ''; if (lk || !it.tool) return toast(`${it.name}: locked (${lk})`, true); $('buildmenu').classList.add('hidden'); setTool(it.tool); });
  $('bm-res').innerHTML = resHTML(state.era >= 2 ? ['wood', 'clay', 'stone', 'brick', 'copper', 'bronze', 'tools'] : ['wood', 'clay', 'stone', 'brick', 'copper', 'bronze']);
}
function bdetail(k) {
  const d = BUILDINGS[k], parts = [`${d.time} h`];
  if (d.cap) parts.push(`houses ${d.cap}`); if (d.jobs) parts.push(`${d.jobs} jobs`);
  if (d.recipe) parts.push(Object.entries(d.recipe.in).map(([r, n]) => n + ' ' + r).join(' + ') + ' → ' + Object.entries(d.recipe.out).map(([r, n]) => n + ' ' + r).join(', '));
  if (d.extract) parts.push('extracts ' + (Array.isArray(d.extract) ? d.extract.join('/') : d.extract));
  if (d.food) parts.push(`${d.food} food/day`); if (d.culture) parts.push(`culture +${d.culture}/day`); if (d.happy) parts.push(`happiness +${d.happy}`); if (d.store) parts.push('storage'); if (d.trains) parts.push('trains villagers');
  if (d.nearWater) parts.push('by the river');
  if (d.size > 1) parts.push(`${d.size}×${d.size}`); return parts.join(' · ');
}
// armed build tool: the sheet collapses to a small chip so the map stays usable
function showPlacing() {
  $('buildmenu').classList.add('hidden'); const d = BUILDINGS[ui.kind];
  $('pl-img').src = thumb(ui.kind); $('pl-name').textContent = `${d.name} · ${S.costStr(d.cost)}`; $('pl-name').title = bdetail(ui.kind);
  $('placing').classList.remove('hidden');
}
$('pl-x').onclick = () => disarm();
$('pl-rot').onclick = () => { ui.rot = (ui.rot + 1) % 4; updateGhost(); };
$('pl-menu').onclick = () => { $('placing').classList.add('hidden'); ui.kind = null; closeSheets('build'); $('buildmenu').classList.remove('hidden'); renderBuildMenu(); };
$('bm-close').onclick = () => { $('buildmenu').classList.add('hidden'); if (!ui.kind) setTool('select'); };

// ---------- speed ----------
function setSpeed(s) { if (s > 0) ui.lastSpeed = s; ui.speed = s; $('sp-pause').textContent = s ? '⏸' : '▶'; $('sp-pause').classList.toggle('on', !s); $('sp-speed').textContent = (s || ui.lastSpeed) + 'x'; }
$('sp-pause').onclick = () => setSpeed(ui.speed ? 0 : ui.lastSpeed);
$('sp-speed').onclick = () => { const i = SPEEDS.indexOf(ui.speed || ui.lastSpeed); setSpeed(SPEEDS[i >= SPEEDS.length - 1 ? 1 : i + 1]); };
setSpeed(1);

// ---------- pointer input: mouse + touch (pan, pinch zoom, twist rotate, tap vs drag, box select) ----------
const cv = $('view');
cv.addEventListener('contextmenu', e => e.preventDefault());
const ptrs = new Map(); let gesture = null, lastMoveT = 0;
const TAP_PX = 9;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), type: e.pointerType, button: e.button });
  $('menu').classList.add('hidden');
  if (ptrs.size === 2) { // pinch / twist
    const [a, b] = [...ptrs.values()]; clearTimeout(gesture && gesture.lp);
    gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    renderer.dragEnd(false); $('selbox').classList.add('hidden'); return;
  }
  if (ptrs.size > 2) return;
  const mouse = e.pointerType === 'mouse';
  if (mouse && (e.button === 2 || e.button === 1)) { gesture = { kind: 'pan', right: e.button === 2 }; return; }
  gesture = { kind: 'pending', mouse };
  // touch: hold still ~0.45 s, then drag = box select
  if (!mouse && ui.tool === 'select') gesture.lp = setTimeout(() => { if (gesture && gesture.kind === 'pending') { gesture.kind = 'box'; if (navigator.vibrate) navigator.vibrate(15); } }, 450);
  // mouse painting tools act immediately on press
  if (mouse && e.button === 0 && ui.tool === 'road' && !unitClick(e.clientX, e.clientY)) { const q = renderer.pick(e.clientX, e.clientY); if (q) { gesture.kind = 'road'; ui.roadPath = [[q.x, q.y]]; roadPreview(); } }
  else if (mouse && e.button === 0 && ['dismantle', 'plant'].includes(ui.tool) && !unitClick(e.clientX, e.clientY)) { gesture.kind = 'paint'; gesture.last = null; paintAt(e.clientX, e.clientY, true); }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) { if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY); return; }
  const now = performance.now(), dt = Math.min(0.05, (now - lastMoveT) / 1000) || 0.016; lastMoveT = now;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.kind === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (gesture.d > 10) renderer.zoomBy(d / gesture.d);
    let da = ang - gesture.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    if (Math.abs(da) < 0.5) renderer.twist(da);
    renderer.dragPan(mx - gesture.mx, my - gesture.my, dt);
    Object.assign(gesture, { d, ang, mx, my }); return;
  }
  const moved = Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_PX;
  if (gesture.kind === 'pending' && moved) { clearTimeout(gesture.lp); gesture.kind = gesture.mouse && ui.tool === 'select' && p.button === 0 ? 'box' : 'pan'; }
  if (gesture.kind === 'pan') renderer.dragPan(dx, dy, dt);
  else if (gesture.kind === 'paint') { paintAt(e.clientX, e.clientY, false); hoverAt(e.clientX, e.clientY); }
  else if (gesture.kind === 'road') { const q = renderer.pick(e.clientX, e.clientY); if (q) { roadExtend(q.x, q.y); roadPreview(); } }
  else if (gesture.kind === 'box') { const el = $('selbox'); el.classList.remove('hidden'); Object.assign(el.style, { left: Math.min(p.x0, p.x) + 'px', top: Math.min(p.y0, p.y) + 'px', width: Math.abs(p.x - p.x0) + 'px', height: Math.abs(p.y - p.y0) + 'px' }); }
  if (e.pointerType === 'mouse' && gesture.kind !== 'paint') hoverAt(e.clientX, e.clientY);
});
function endPointer(e, cancel) {
  const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
  const g = gesture;
  if (g && g.kind === 'pinch') { if (ptrs.size < 2) { renderer.snapRotation(); renderer.dragEnd(true); gesture = ptrs.size ? { kind: 'pan' } : null; } return; }
  if (ptrs.size) return;
  gesture = null; if (!g || cancel) { renderer.dragEnd(false); return; }
  clearTimeout(g.lp);
  if (g.kind === 'pan') { renderer.dragEnd(true); if (g.right && Math.hypot(p.x - p.x0, p.y - p.y0) <= TAP_PX) { if (ui.units.length && ui.tool === 'select') { const q = renderer.pick(p.x, p.y); if (q) orderSelected(q); } else disarm(); } return; } // right-click: order selected units, else cancel / disarm
  if (g.kind === 'box') { $('selbox').classList.add('hidden'); const ids = renderer.unitsInRect(p.x0, p.y0, p.x, p.y); if (ids.length) { setUnits(ids); showUnits(); toast(`${ids.length} unit${ids.length > 1 ? 's' : ''} selected`); } return; }
  if (g.kind === 'paint') return;
  if (g.kind === 'road') { const tiles = ui.roadPath || []; ui.roadPath = null; renderer.setRoadPreview(null); if (tiles.length) { const r = cmd({ type: 'roadLine', tiles }); if (r.ok) toast(`${r.n} road tile${r.n === 1 ? '' : 's'} planned`); } return; }
  tapAt(p.x, p.y, e);
}
cv.addEventListener('pointerup', e => endPointer(e, false));
cv.addEventListener('pointercancel', e => endPointer(e, true));
cv.addEventListener('wheel', e => { e.preventDefault(); renderer.zoomBy(Math.pow(1.0015, -e.deltaY * (e.deltaMode === 1 ? 30 : 1))); }, { passive: false });
// block browser pinch-zoom / scroll everywhere outside scrollable sheets
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (!e.target.closest('.sheet, #menu')) e.preventDefault(); }, { passive: false });

// order the selected units: villagers gather / build / walk (by what is on the tile), scouts walk
function orderSelected(p) {
  const sel = (state.units || []).filter(u => ui.units.includes(u.id)), vil = sel.filter(u => u.kind === 'villager').map(u => u.id), oth = sel.filter(u => u.kind !== 'villager');
  let ok = false;
  if (vil.length) { const r = cmd({ type: 'villagerTask', ids: vil, x: p.x, y: p.y }); ok = r.ok; if (r.ok && r.task !== 'move') toast(r.task === 'build' ? 'Villagers sent to build' : `Villagers sent: ${GATHER[r.task].name.toLowerCase()}`); }
  for (const u of oth) ok = cmd({ type: 'orderUnit', id: u.id, x: p.x, y: p.y }).ok || ok;
  if (ok && renderer.flashTarget) renderer.flashTarget(p.x, p.y);
  renderInfo(); return ok;
}
// a unit under the pointer always wins (any tool), selects it and disarms the tool
function unitClick(cx, cy) {
  const rad = Math.max(24, 0.2 * renderer.pxPerUnit(renderer.target)); // generous screen-space radius, grows when zoomed in
  const id = renderer.unitAtScreen(cx, cy, rad); if (id == null) return false;
  disarm(); setUnits([id]); showUnits(); return true;
}
function showUnits() { closeSheets('info'); ui.popCard = false; ui.unitCard = true; renderInfo(); }
function tapAt(cx, cy, e) {
  if (unitClick(cx, cy)) return;
  const p = renderer.pick(cx, cy); if (!p) return;
  ui.hover = p;
  const t = ui.tool;
  if (t === 'road') { roadTap(p); }
  else if (t === 'dismantle' || t === 'plant') paintAt(cx, cy, true);
  else if (t === 'build' && ui.kind) { const r = cmd({ type: 'place', kind: ui.kind, x: p.x, y: p.y, rot: ui.rot }); if (r.ok) toast(`${BUILDINGS[ui.kind].name} placed`); }
  else if (t === 'survey') cmd({ type: 'survey', x: p.x, y: p.y });
  else if (t === 'level') cmd({ type: 'level', x: p.x, y: p.y });
  else if (t === 'devcollapse') { const tt = S.tile(state, p.x, p.y); if (tt.occ) { cmd({ type: 'dev', action: 'collapse', id: tt.occ }); select(tt.occ); } setTool('select'); }
  else if (t === 'scout' || (t === 'select' && ui.units.length && ui.unitCard)) {
    if (ui.units.length) orderSelected(p);
    if (t === 'select' && !ui.units.length) selectAt(p);
  } else selectAt(p);
  updateGhost();
}
function selectAt(p) {
  const tt = S.tile(state, p.x, p.y);
  if (tt.occ) return select(tt.occ);
  // tapping empty ground while a card is open just closes it (tap again for tile details)
  if (!$('info').classList.contains('hidden') && !ui.selTile) { closeInfo(); setUnits([]); return; }
  if (ui.selTile && ui.selTile.x === p.x && ui.selTile.y === p.y) return closeInfo();
  setUnits([]); selectTile(p.x, p.y);
}
// road: tap tiles one by one, or two taps in the same row/column fill the line between
function roadTap(p) {
  const a = ui.roadA;
  if (a && Math.abs(a.x - p.x) + Math.abs(a.y - p.y) > 1 && performance.now() - a.t < 8000) {
    ui.roadPath = [[a.x, a.y]]; roadExtend(p.x, p.y); const tiles = ui.roadPath; ui.roadPath = null; renderer.setRoadPreview(null);
    const r = cmd({ type: 'roadLine', tiles }); if (r.ok) toast(`${r.n} road tile${r.n === 1 ? '' : 's'} planned`); ui.roadA = null; return;
  }
  const t = S.tile(state, p.x, p.y); if (t && !t.road && !t.rp) cmd({ type: 'road', x: p.x, y: p.y });
  ui.roadA = { x: p.x, y: p.y, t: performance.now() };
}
// extend the drawn road to (x, y) with 4-connected steps along the straightest line; stepping back undoes
function roadExtend(x, y) {
  const P = ui.roadPath; let [cx, cy] = P[P.length - 1]; if (cx === x && cy === y) return;
  const ax = Math.abs(x - cx), ay = Math.abs(y - cy), sx = Math.sign(x - cx), sy = Math.sign(y - cy);
  for (let g = 0; (cx !== x || cy !== y) && g < 400; g++) {
    const rx = Math.abs(x - cx), ry = Math.abs(y - cy);
    if (rx > 0 && rx * ay >= ry * ax) cx += sx; else cy += sy;
    const k = P.length; if (k >= 2 && P[k - 2][0] === cx && P[k - 2][1] === cy) P.pop(); else if (!P.some(q => q[0] === cx && q[1] === cy)) P.push([cx, cy]);
  }
}
function roadPreview() {
  const P = ui.roadPath || []; let prev = null;
  renderer.setRoadPreview(P.map(([x, y]) => { const t = S.tile(state, x, y); let ok = !!t && t.vis && t.t !== S.T.WATER && !t.occ && !S.isSteep(t); if (ok && prev && Math.abs(S.tileTopH(t) - S.tileTopH(prev)) > 0.3) ok = false; if (t) prev = t; return [x, y, ok ? (t.trees ? 2 : 1) : 0]; }));
}
function paintAt(cx, cy, first) {
  const p = renderer.pick(cx, cy); if (!p) return;
  if (gesture && gesture.last && gesture.last.x === p.x && gesture.last.y === p.y) return; if (gesture) gesture.last = p;
  const t = S.tile(state, p.x, p.y);
  if (ui.tool === 'dismantle') { const r = first ? cmd({ type: 'dismantle', x: p.x, y: p.y }) : S.applyCommand(state, { type: 'dismantle', x: p.x, y: p.y }); if (r.ok && r.id) select(r.id); }
  else if (ui.tool === 'plant') { if (first) cmd({ type: 'plant', x: p.x, y: p.y }); else S.applyCommand(state, { type: 'plant', x: p.x, y: p.y }); }
}
function hoverAt(cx, cy) { ui.hover = renderer.pick(cx, cy); updateGhost(); cv.style.cursor = renderer.unitAtScreen(cx, cy, 24) != null ? 'pointer' : ''; }
function updateGhost() {
  const p = ui.hover; if (!p || TOUCH) return renderer.setGhost(null);
  const t = S.tile(state, p.x, p.y);
  if (ui.tool === 'build' && ui.kind) { const ok = !S.checkPlacement(state, ui.kind, p.x, p.y); renderer.setGhost({ x: p.x, y: p.y, size: BUILDINGS[ui.kind].size, ok, level: ok && ui.kind !== 'quarry' && S.needsLevel(state, S.footprint(ui.kind, p.x, p.y)) }); }
  else if (ui.tool === 'road') renderer.setGhost({ x: p.x, y: p.y, h: 0.05, ok: t.vis && !t.occ && t.t !== S.T.WATER && !S.isSteep(t) });
  else if (ui.tool === 'plant') renderer.setGhost({ x: p.x, y: p.y, h: 0.05, ok: t.vis && !t.occ && !t.road && t.t !== S.T.WATER && !S.isSteep(t) });
  else if (ui.tool === 'dismantle') renderer.setGhost({ x: p.x, y: p.y, h: 0.1, ok: !!(t.occ || t.road || t.rp) });
  else if (ui.tool === 'survey') renderer.setGhost({ x: p.x, y: p.y, h: 0.05, ok: true });
  else if (ui.tool === 'level') renderer.setGhost({ x: p.x, y: p.y, h: 0.12, ok: S.isSteep(t) && !t.occ && !t.road && !t.lvJob });
  else renderer.setGhost(null);
}
$('rot-l').onclick = () => renderer.rotate(-1);
$('rot-r').onclick = () => renderer.rotate(1);

// ---------- keyboard ----------
const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase(); keys.add(k);
  if (k.startsWith('arrow')) e.preventDefault();
  if (/^[0-6]$/.test(e.key)) setSpeed(SPEEDS[+e.key]);
  else if (e.key === ' ') { e.preventDefault(); setSpeed(ui.speed ? 0 : ui.lastSpeed); }
  else if (k === 'q') renderer.rotate(-1);
  else if (k === 'e') renderer.rotate(1);
  else if (k === 'r') { ui.rot = (ui.rot + 1) % 4; updateGhost(); }
  else if (k === 'u') toggleUnder();
  else if (k === '+' || k === '=') renderer.zoomBy(1.25);
  else if (k === '-' || k === '_') renderer.zoomBy(0.8);
  else if (e.key === '?' || (k === '/' && e.shiftKey)) setLegend(!legendOpen());
  else if (e.key === 'Escape') { if (ui.tool !== 'select') disarm(); else { closeSheets(); setUnits([]); } }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

// ---------- info card (bottom sheet on phones) ----------
function select(id) { ui.popCard = false; if (ui.units.length) ui.lastUnits = ui.units.slice(); closeSheets('info'); setUnits([]); ui.sel = id; ui.selTile = null; ui.unitCard = false; renderInfo(); }
function selectTile(x, y) { closeSheets('info'); ui.popCard = false; ui.sel = null; ui.selTile = { x, y }; ui.unitCard = false; renderInfo(); }
function setHTML(el, h) { if (el._h === h) return false; el._h = h; el.innerHTML = h; return true; }
const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
const head = (title) => `<div class="sh-head"><b>${title}</b><button class="x" data-close="1">✕</button></div>`;
function treesNear(b, r) { let n = 0, sp = 0; for (let y = b.y - r; y <= b.y + r; y++) for (let x = b.x - r; x <= b.x + r; x++) { const t = S.tile(state, x, y); if (t && !t.occ) { n += t.trees; sp += t.sp ? t.sp.length : 0; } } return { n, sp }; }
function renderInfo() {
  const el = $('info'); let h = '', btns = [];
  if (ui.popCard) {
    h = head('Population'); h += popDetail();
  } else if (ui.unitCard) {
    const units = state.units || [], sel = units.filter(u => ui.units.includes(u.id)), u = sel[0];
    const allV = sel.length && sel.every(x => x.kind === 'villager'), nm = (x) => x.kind === 'villager' ? 'Villager' : 'Scout';
    h = head(sel.length > 1 ? `${sel.length} ${allV ? 'villagers' : 'units'} selected` : u ? `${nm(u)} #${u.id}` : 'Units');
    if (u && sel.length === 1) {
      if (u.kind === 'villager') h += row('Status', vStatus(u)) + (u.carry && u.carry.n > 0.5 ? row('Carrying', `${Math.floor(u.carry.n)} / ${VILLAGER.load} ${u.carry.res}`) : '');
      else h += row('Status', u.state === 'moving' ? `Travelling to ${u.dest[0]}, ${u.dest[1]}` : u.state === 'arrived' ? 'Arrived' : u.state === 'blocked' ? 'Stopped' : 'Waiting') + row('Walked', `${u.dist.toFixed(1)} tiles`);
    } else if (sel.length > 1) { const c = {}; for (const x of sel) { const k = x.kind === 'villager' ? vStatus(x).split(':')[0] : (x.state === 'moving' ? 'Travelling' : 'Waiting'); c[k] = (c[k] || 0) + 1; } h += Object.entries(c).map(([k, n]) => row(k, n)).join(''); }
    const nv = units.filter(x => x.kind === 'villager').length, ns = units.filter(x => x.kind === 'scout').length;
    h += row('Villagers', `${nv} / ${S.maxVillagers(state, S.popTotal(state))}`) + row('Scouts', `${ns} / 3`);
    btns.push(`<button data-act="hire">Hire scout (25)</button>`); if (state.flags.ships) btns.push(`<button data-act="hireShip">Build ship (120, 30 wood)</button>`); if (u) btns.push(`<button data-act="stop">Stop</button>`);
    for (const x of units) btns.push(`<button data-unit="${x.id}" class="${ui.units.includes(x.id) ? 'on' : ''}">${x.kind === 'villager' ? '🧑‍🌾' : '🚶'}${x.id}</button>`);
  } else if (ui.sel) {
    const b = state.buildings[ui.sel]; if (!b) return closeInfo();
    const d = BUILDINGS[b.kind]; const name = b.kind === 'custom' ? `Legacy custom building` : d.name;
    h = head(name);
    if (b.ruin) {
      const inc = state.incidents.find(i => i.bid === b.id); h += row('Status', 'Collapsed');
      if (inc) { const crew = state.crews.find(c => c.id === inc.crew); const step = inc.stage === 'rescue' ? (crew ? (crew.state === 'out' ? 'Rescue crew on the way' : 'Rescue in progress') : 'Waiting for rescue crew') : (crew ? (crew.state === 'out' ? 'Cleanup crew on the way' : 'Clearing rubble') : 'Waiting for cleanup crew'); h += row('Step', step) + row('Dead / trapped / saved', `${inc.dead} / ${inc.trapped} / ${inc.saved}`); btns.push(`<button data-skip="incident" data-id="${inc.id}">Skip step ⏭</button>`); }
    } else if (b.dis) {
      h += row('Status', 'Being dismantled') + row('Stage', STAGE_NAMES[S.stageOf(b)]) + `<div class="bar"><i style="width:${Math.round((1 - b.progress) * 100)}%"></i></div>` + row('Recovers', `~${Math.round(DISMANTLE.refund * 100)}% of materials`);
      btns.push(`<button data-skip="dismantle">Skip ⏭</button>`);
    } else {
      const st = S.stageOf(b); h += row('Stage', STAGE_NAMES[st]);
      if (!b.done && b.levelLeft > 0) h += row('Levelling ground', `${Math.round((1 - b.levelLeft / b.levelTotal) * 100)}%`);
      if (!b.done) { h += `<div class="bar"><i style="width:${Math.round(b.progress * 100)}%"></i></div>` + row('Builders', `${b.builders || 0}`) + (b.mt ? row('Materials on site', `${Math.floor(b.mg || 0)} / ${b.mt}`) : ''); btns.push(`<button data-act="sendbuild">Send selected villagers</button>`); btns.push(`<button data-skip="build" data-id="${b.id}">Skip ⏭</button>`); }
      if (b.done && b.cond !== undefined) h += row('Condition', `${S.condName(b)} (${Math.round(b.cond)}%)`) + `<div class="bar cond"><i style="width:${Math.round(b.cond)}%;background:${condCol(b.cond)}"></i></div>`;
      if (b.done && d.culture) h += row('Culture', `+${d.culture}/day`);
      if (b.done && d.trains) { h += row('Villagers', `${S.villagers(state).length} / ${S.maxVillagers(state, S.popTotal(state))}`) + row('Train', `${S.costStr(VILLAGER.trainCost)} + a free adult`); btns.push(`<button data-act="train">Train villager</button>`); }
      if (!S.roadAccess(state, b)) h += row('Road access', '<span class="no">None</span>');
      const cap = S.capOf(b); if (cap) h += row('Residents', `${b.residents} / ${cap}`);
      const jobs = b.kind === 'custom' ? b.jobs : d.jobs; if (jobs) h += row('Workers', b.done && !b.workers ? `<span class="no">0 / ${jobs}</span>` : `${b.workers} / ${jobs}`);
      if (d.extract === 'wood') { const tn = treesNear(b, d.radius); h += row('Trees in reach', tn.n + (tn.sp ? ` (+${tn.sp} growing)` : '')); if (b.done) h += row('Status', !b.workers || !tn.n ? '<span class="no">Idle</span>' : 'Felling trees'); }
      else if (b.kind === 'quarry' || b.kind === 'claypit') { const R = S.QUARRY_REACH, res = d.extract[0], maxD = Math.min(d.maxDepth || 99, ERAS[state.era].maxDepth); let left = 0; for (let y = b.y - R; y <= b.y + R; y++) for (let x = b.x - R; x <= b.x + R; x++) { if (Math.hypot(x - b.x, y - b.y) > R) continue; const t = S.tile(state, x, y); if (!t || (t.occ && t.occ !== b.id)) continue; if (t.dep && t.dep.r === res && t.dep.depth <= maxD && (S.knownDeposit(t) || t.vis)) left += t.dep.amt; else if (res === 'stone' && t.t === S.T.HILL && t.vis) left += t.rock ?? 20; }
        h += row(res === 'stone' ? 'Stone in reach' : 'Clay in reach', Math.floor(left)) + (b.src ? row('Walk to source', `${Math.hypot(b.src[0] - b.x, b.src[1] - b.y).toFixed(1)} tiles`) : ''); }
      else if (d.extract) { const maxD = Math.min(d.maxDepth || 99, ERAS[state.era].maxDepth); let left = 0; for (let y = b.y - d.radius; y <= b.y + d.radius; y++) for (let x = b.x - d.radius; x <= b.x + d.radius; x++) { const t = S.tile(state, x, y); if (S.knownDeposit(t) && d.extract.includes(t.dep.r) && t.dep.depth <= maxD) left += t.dep.amt; } h += row('Extracts', d.extract.join(', ')) + row('Known in reach', Math.round(left)); }
      if (d.recipe) h += row('Recipe', Object.entries(d.recipe.in).map(([r, n]) => n + ' ' + r).join(' + ') + ' → ' + Object.entries(d.recipe.out).map(([r, n]) => n + ' ' + r).join(', '));
      if (d.food) h += row('Food', `${d.food}/day at full staff`);
      if (b.kind === 'rescue') { const cs = state.crews.filter(c => c.post === b.id); h += row('Crews', `${cs.length} (${cs.filter(c => c.state === 'idle').length} idle)`); }
      if (b.done && (d.extract || d.recipe) && d.extract !== 'wood') h += row('Status', b.workers && !b.info ? 'Working' : b.info === 'Depleted' ? '<span class="no">Depleted</span>' : '<span class="no">Idle</span>');
      if (d.extract && b.done && DEV) btns.push(`<button data-skip="mine" data-id="${b.id}">Run 1 day ⏭</button>`);
      btns.push(`<button data-act="dismantle">🪓 Dismantle</button>`);
      if (DEV) btns.push(`<button data-dev="collapse" data-id="${b.id}">Dev: collapse</button>`);
    }
  } else if (ui.selTile) {
    const { x, y } = ui.selTile, t = S.tile(state, x, y);
    h = head(t.vis ? (t.t === S.T.WATER ? ['River: shallow ford', 'River: shallow reach', 'River: deep channel'][t.wd ?? 2] : TERRAIN_NAMES[t.t] + (t.t === S.T.HILL ? ` (level ${t.h})` : '')) : 'Unexplored');
    if (t.vis && t.town && state.towns) { const tw = state.towns.find(w => w.id === t.town); if (tw) h += row('Land of', `${tw.name} (${S.TOWN_KINDS[tw.kind].name})`); }
    if (t.vis && t.t === S.T.WATER) h += row('On foot', t.bridge ? 'Bridge' : t.wd === 2 ? '<span class="no">Impassable</span>' : t.wd === 0 ? 'Wadeable, slow; small risk' : 'Wadeable, very slow; risky');
    if (t.vis) {
      if (t.lv) h += row('Ground', 'Terraced'); else if (S.isSteep(t)) h += row('Ground', 'Steep');
      if (t.lvJob) { const e = state.earthworks.find(e => e.id === t.lvJob); if (e) h += row('Earthworks', `${Math.round(100 * (1 - e.left / e.total))}%`); }
      if (t.berryMax) h += row('Berry bushes', `${Math.floor(t.berry || 0)} / ${t.berryMax} ripe`);
      if (t.trees) h += row('Trees', t.trees); if (t.sp && t.sp.length) h += row('Saplings', t.sp.map(a => ['sapling', 'young', 'almost grown'][S.saplingStage(a)]).join(', ')); if (t.stumps) h += row('Stumps', t.stumps);
      if (t.road) h += row('Road', t.rx ? 'Being taken up' : 'Dirt'); else if (t.rp) h += row('Road', 'Planned');
      if (S.knownDeposit(t)) h += row('Deposit', DEPOSITS[t.dep.r].name + (t.sv ? '' : ' (visible on the surface)')) + row('Amount · depth', `${t.dep.amt} · ${t.dep.depth} m`);
      else if (t.sv) h += row('Deposit', 'None found');
      else h += row('Underground', unlocked.survey() ? 'Not surveyed' : 'Unknown');
      if (t.work && ui.under) h += row('Mine workings', `${t.work.depth} m${t.work.abandoned ? ' (abandoned)' : ''}`);
    }
  } else return;
  if (btns.length) h += `<div class="btns">${btns.join('')}</div>`;
  el.classList.remove('hidden');
  if (!setHTML(el, h)) return;
  el.querySelector('[data-close]').onclick = () => { closeInfo(); setUnits([]); };
  el.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => { cmd({ type: 'skip', what: b.dataset.skip, id: +b.dataset.id }); renderInfo(); });
  el.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { cmd({ type: 'dev', action: b.dataset.dev, id: +b.dataset.id }); renderInfo(); });
  el.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => { setUnits([+b.dataset.unit]); renderInfo(); });
  el.querySelectorAll('[data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'hireShip') { const r = cmd({ type: 'hireUnit', kind: 'ship' }); if (r.ok) setUnits([r.id]); else toast(r.err); }
    if (a === 'hire') { const r = cmd({ type: 'hireUnit', kind: 'scout' }); if (r.ok) { setUnits([r.id]); toast('Scout hired: tap the map to send it'); } }
    else if (a === 'stop') for (const id of ui.units) cmd({ type: 'stopUnit', id });
    else if (a === 'train') { const r = cmd({ type: 'trainVillager' }); if (r.ok) toast('Villager trained'); }
    else if (a === 'sendbuild') { const bb = state.buildings[ui.sel], vil = (state.units || []).filter(u => u.kind === 'villager' && (ui.lastUnits || []).includes(u.id)).map(u => u.id), ids = vil.length ? vil : S.villagers(state).filter(u => u.vstate === 'idle').map(u => u.id); if (!ids.length) toast('No idle villagers', true); else if (bb) { const r = cmd({ type: 'villagerTask', ids, x: bb.x, y: bb.y }); if (r.ok) toast(`${ids.length} villager${ids.length > 1 ? 's' : ''} sent to build`); } }
    else if (a === 'dismantle') { const bb = state.buildings[ui.sel]; if (bb) cmd({ type: 'dismantle', x: bb.x, y: bb.y }); }
    renderInfo();
  });
}
function renderPanel() {
  const p = ui.panel; if (!p) return; if (p === 'dev' && !DEV) return closePanel();
  const body = $('panel-body');
  $('panel-title').textContent = { tech: 'Research & eras', stats: 'Town & resources', log: 'Event log', dev: 'Dev / test panel', newgame: 'New game' }[p];
  if (p === 'tech') {
    const r = state.research;
    let h = `<div>Era: <b>${ERAS[state.era].name}</b> · Mining tier: <b>${ERAS[state.era].tier} (≤${ERAS[state.era].maxDepth} m)</b></div>`;
    h += `<div>Eras: ${Object.entries(ERAS).map(([k, e]) => (+k === state.era ? `<b>${e.name}</b>` : e.name)).join(' → ')}</div>`;
    for (const [id, t] of Object.entries(TECHS)) {
      if (t.era > state.era) continue;
      const done = r.done.includes(id), cur = r.current === id, can = t.req.every(q => r.done.includes(q)), cost = techCost(id, state.culture);
      h += `<div class="tech"><b>${t.name}</b> <small>(${cost} pts)</small> ${done ? '<span class="ok">✓ done</span>' : cur ? `<div class="bar"><i style="width:${Math.min(100, r.progress / cost * 100)}%"></i></div>${DEV ? '<button data-skipres>Skip ⏭</button>' : ''}` : `<button data-res="${id}" ${can ? '' : 'disabled'}>Research</button>`}</div>`;
    }
    const er = S.eraReady(state);
    if (er.items.length) {
      h += `<h4>To enter the ${ERAS[state.era + 1].name} era</h4>` + er.items.map(i => `<div class="${i.ok ? 'ok' : 'no'}">${i.ok ? '✓' : '✗'} ${i.label}</div>`).join('');
      h += `<div class="devrow"><button id="adv-era" ${er.ready ? '' : 'disabled'}>Advance era</button>${DEV ? '<button id="skip-era">Skip to next era ⏭</button>' : ''}</div>`;
    } else h += `<p><i>This is the last era in this build.</i></p>`;
    if (!setHTML(body, h)) return;
    body.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { cmd({ type: 'research', tech: b.dataset.res }); renderPanel(); });
    body.querySelectorAll('[data-skipres]').forEach(b => b.onclick = () => { cmd({ type: 'skip', what: 'research' }); renderPanel(); });
    if ($('adv-era')) $('adv-era').onclick = () => { cmd({ type: 'advanceEra' }); renderPanel(); };
    if ($('skip-era')) $('skip-era').onclick = () => { cmd({ type: 'skip', what: 'era' }); renderPanel(); };
  } else if (p === 'stats') {
    const bs = Object.values(state.buildings).filter(b => b.done && !b.ruin);
    const pop = S.popTotal(state), cap = bs.reduce((a, b) => a + S.capOf(b), 0), jobs = bs.reduce((a, b) => a + (b.kind === 'custom' ? b.jobs || 0 : BUILDINGS[b.kind].jobs || 0), 0);
    const food = bs.reduce((a, b) => a + (BUILDINGS[b.kind].food || 0) * (BUILDINGS[b.kind].jobs ? b.workers / BUILDINGS[b.kind].jobs : 1), 0);
    const rows = [['Population', pop], ['Housing capacity', cap], ['Jobs', jobs], ['Workers employed', pop - (state.unemployed || 0)], ['Unemployed', state.unemployed || 0],
      ['Food stock', Math.floor(state.res.food)], ['Food produced / day', Math.round(food)], ['Food eaten / day', pop], ['Homes with water', Math.round((state.waterFrac ?? 1) * 100) + '%'],
      ['Shop capacity (people served)', Math.round(state.shopCap || 0)], ['Income / day', Math.round(state.lastIncome || 0)], ['Upkeep / day', Math.round(state.lastUpkeep || 0)], ['Happiness', state.happiness],
      ['Research points / hour', ((pop * 0.06 + 0.4) * (state.research.done.includes('writing') ? 1.5 : 1)).toFixed(1)],
      ['Arrivals (total)', state.stats.arrivals], ['Left town (total)', state.stats.left], ['Deaths (total)', state.stats.deaths], ['Collapses', state.stats.collapses], ['Bricks made', Math.floor(state.stats.bricksMade)], ['Bronze made', Math.floor(state.stats.bronzeMade)], ...(state.towns || []).filter(t => t.met).map(t => [`${t.name} (${S.TOWN_KINDS[t.kind].name}): trade`, Math.round(t.traded)])];
    const res = Object.entries(RES_ICONS).map(([k, i]) => [`${i} ${k[0].toUpperCase() + k.slice(1)}`, Math.floor(state.res[k])]);
    setHTML(body, `<table>${res.concat(rows).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`);
  } else if (p === 'log') {
    setHTML(body, `<div class="log">${state.log.slice().reverse().map(l => `<div><b>${S.dateStr(l.t)}</b>${l.msg}</div>`).join('')}</div>`);
  } else if (p === 'dev') {
    const f = state.flags;
    body.innerHTML = `<p><small>Test controls. Not part of normal play.</small></p>
      <div class="devrow"><button id="d-risk" class="${f.riskOverlay ? 'on' : ''}">Subsidence risk overlay</button><button id="d-col" class="${f.collapses ? 'on' : ''}">Collapses: ${f.collapses ? 'ON' : 'OFF'}</button><button id="d-trig">Trigger incident (click a building)</button></div>
      <div class="devrow"><button id="d-money">+1000 money</button><button id="d-mat">+100 materials</button><button id="d-reveal">Reveal all</button><button id="d-unl" class="${f.unlimitedMoney ? 'on' : ''}">Unlimited money</button></div>
      <div class="devrow"><button id="d-grow">Skip growth (fill homes)</button><button id="d-surv">Skip surveys</button><button id="d-level">Skip earthworks</button><button id="d-era">Skip to next era</button></div>
      <div class="devrow"><button id="d-sb1">Sandbox: Stone & Clay</button><button id="d-sb2">Sandbox: Bronze</button></div>
      <div><small>Hidden reputation (dev only): ${state.hidden.reputation.toFixed(1)}</small></div>`;
    const on = (id, fn) => $(id).onclick = () => { fn(); renderPanel(); renderInfo(); };
    on('d-risk', () => cmd({ type: 'dev', action: 'riskOverlay' }));
    on('d-col', () => cmd({ type: 'dev', action: 'toggleCollapses' }));
    on('d-trig', () => { setTool('devcollapse'); toast('Click a building to collapse it'); });
    on('d-money', () => cmd({ type: 'dev', action: 'money', value: 1000 }));
    on('d-mat', () => cmd({ type: 'dev', action: 'materials' }));
    on('d-reveal', () => cmd({ type: 'dev', action: 'revealAll' }));
    on('d-unl', () => { state.flags.unlimitedMoney = !state.flags.unlimitedMoney; });
    on('d-grow', () => cmd({ type: 'skip', what: 'growth' }));
    on('d-surv', () => cmd({ type: 'skip', what: 'survey' }));
    on('d-level', () => cmd({ type: 'skip', what: 'level' }));
    on('d-era', () => cmd({ type: 'skip', what: 'era' }));
    on('d-sb1', () => startGame({ sandbox: true, era: 1 }));
    on('d-sb2', () => startGame({ sandbox: true, era: 2 }));
  } else if (p === 'newgame') {
    body.innerHTML = `<div class="devrow">Seed <input id="ng-seed" type="number" value="${Math.floor(Math.random() * 1e6)}" style="width:110px"> Map <select id="ng-size"><option value="128">Large</option><option value="64">Small</option></select></div>
      <div class="devrow"><button id="ng-n">Normal game</button><button id="ng-s1">Sandbox: Stone & Clay</button><button id="ng-s2">Sandbox: Bronze</button></div>`;
    const seed = () => +$('ng-seed').value || undefined, size = () => +$('ng-size').value;
    $('ng-n').onclick = () => startGame({ seed: seed(), size: size() });
    $('ng-s1').onclick = () => startGame({ seed: seed(), size: size(), sandbox: true, era: 1 });
    $('ng-s2').onclick = () => startGame({ seed: seed(), size: size(), sandbox: true, era: 2 });
  }
}
function openPanel(p) { if (p === 'dev' && !DEV) return; closeSheets('panel'); ui.panel = p; $('panel').classList.remove('hidden'); $('panel-body')._h = null; renderPanel(); }
$('panel-close').onclick = closePanel;

// ---------- menu ----------
$('btn-menu').onclick = (e) => { e.stopPropagation(); $('menu').classList.toggle('hidden'); };
document.querySelectorAll('#menu [data-panel]').forEach(b => b.onclick = () => { $('menu').classList.add('hidden'); openPanel(b.dataset.panel); });
$('m-help').onclick = () => { $('menu').classList.add('hidden'); setLegend(true); };
// dev tools: ?dev=1, or tap the EARTH logo 5 times quickly
let brandTaps = [];
$('brand').onclick = () => { const now = performance.now(); brandTaps = brandTaps.filter(t => now - t < 2000); brandTaps.push(now); if (brandTaps.length >= 5) { brandTaps = []; DEV = !DEV; localStorage.setItem('earth.dev', DEV ? '1' : '0'); refreshUnlocks(); toast(DEV ? 'Dev tools enabled (menu)' : 'Dev tools hidden'); } };

// ---------- controls legend (reference only; remembers open/closed) ----------
const legendOpen = () => !$('legend').classList.contains('hidden');
function setLegend(on, remember = true) {
  if (on) { closeSheets('legend'); renderLegend(); }
  $('legend').classList.toggle('hidden', !on); $('btn-help').classList.toggle('on', on);
  if (remember) localStorage.setItem('earth.legend', on ? '1' : '0');
}
function renderLegend() {
  const K = (...k) => k.map(x => `<kbd>${x}</kbd>`).join(' '), r = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
  let h = '<h5>Touch</h5><table>' + r('Drag', 'Pan the map') + r('Pinch', 'Zoom') + r('Two-finger twist', 'Rotate view (snaps to 90°)') + r('Tap', 'Use tool / select') + r('Tap (units selected)', 'Order: gather, build or walk') + r('Hold, then drag', 'Box-select units') + r('Long-press a tool', 'Show its description') + '</table>';
  const kb = '<h5>Mouse</h5><table>' + r('Left click', 'Use tool / select (units always win)') + r('Left drag', 'Select tool: box-select units · Road / Plant / Dismantle: paint') + r('Right / middle drag', 'Pan') + r('Right click', 'Order selected units (gather / build / walk); otherwise cancel the active tool') + r('Wheel', 'Zoom') + '</table>'
    + '<h5>Keyboard</h5><table>' + r(K('W', 'A', 'S', 'D') + ' / ' + K('←', '↑', '→', '↓'), 'Pan') + r(K('Q') + ' ' + K('E'), 'Rotate view') + r(K('+') + ' ' + K('−'), 'Zoom')
    + r(K('R'), 'Rotate building before placing') + (unlocked.under() ? r(K('U'), 'Underground view') : '') + r(K('0') + '–' + K('6'), 'Speed: pause, 1x, 2x, 5x, 10x, 25x, 50x') + r(K('Space'), 'Pause / resume') + r(K('Esc'), 'Cancel tool, then close cards') + r(K('?'), 'This legend') + '</table>';
  h = TOUCH ? h + kb : kb + h;
  setHTML($('legend-body'), h);
}
$('btn-help').onclick = () => setLegend(!legendOpen());
$('lg-close').onclick = () => setLegend(false);

// ---------- new game / save / load ----------
function startGame(opts) { hideTitle(); setUnits([]); state = S.newGame(opts); renderer.setState(state); closeSheets(); setTool('select'); if (ui.under) toggleUnder(false); refreshUnlocks(); lastLogLen = state.log.length; exposeForTests(); }
const doSave = () => { try { localStorage.setItem(SAVE_KEY, S.serialize(state)); toast('Saved'); } catch (e) { toast('Save failed: ' + e.message, true); } };
$('btn-save').onclick = () => { $('menu').classList.add('hidden'); doSave(); };
$('btn-load').onclick = () => { $('menu').classList.add('hidden'); loadSave(); };
function adopt(s, msg) { state = s; setUnits([]); renderer.setState(state); closeSheets(); setTool('select'); if (ui.under) toggleUnder(false); refreshUnlocks(); lastLogLen = state.log.length; toast(msg); exposeForTests(); }
function loadSave() { const j = localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY); if (!j) return toast('No save found', true); try { adopt(S.deserialize(j), 'Loaded'); } catch (e) { toast('Load failed: ' + e.message, true); } }
$('btn-export').onclick = () => { $('menu').classList.add('hidden'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([S.serialize(state)], { type: 'application/json' })); a.download = `earth-day${Math.floor(state.tick / 24) + 1}.json`; a.click(); };
$('btn-import').onclick = () => { $('menu').classList.add('hidden'); $('file-import').click(); };
$('file-import').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { adopt(S.deserialize(await f.text()), 'Imported'); } catch (err) { toast('Import failed: ' + err.message, true); } e.target.value = ''; };

// ---------- HUD ----------
const RES_ICONS = { wood: '🪵', clay: '🟫', stone: '🪨', copper: '🟢', tin: '⚪', brick: '🧱', bronze: '🥉', food: '🌾', tools: '🔨', pots: '🏺', wool: '🐑', flax: '🌿', cloth: '🧵', iron: '⚙️', blocks: '🧊', coal: '⚫', steel: '🔩' };
const resHTML = (ks) => ks.map(k => `<span title="${k}">${RES_ICONS[k]} ${Math.floor(state.res[k])}</span>`).join('');
let hudT = 0, lastLogLen = state.log.length, lastEra = state.era, lastDone = 0;
function hud() {
  document.body.classList.toggle('bm-open', !$('buildmenu').classList.contains('hidden'));
  document.body.classList.toggle('sheet-open', [...document.querySelectorAll('.sheet')].some(e => !e.classList.contains('hidden')));
  $('s-money').textContent = state.flags.unlimitedMoney ? '∞' : Math.floor(state.res.money);
  $('s-pop').textContent = S.popTotal(state);
  $('s-happy').textContent = state.happiness;
  $('s-era').textContent = ERAS[state.era].name + (state.mode === 'sandbox' ? ' (sandbox)' : '');
  $('s-date').textContent = S.dateStr(state.tick);
  $('s-fps').textContent = Math.round(renderer.fps) + ' fps'; $('s-fps').classList.toggle('hidden', !DEV);
  if (state.log.length > lastLogLen) { for (const l of state.log.slice(Math.max(lastLogLen, state.log.length - 2))) toast(l.msg); }
  lastLogLen = state.log.length;
  if (state.era !== lastEra || state.research.done.length !== lastDone) { lastEra = state.era; lastDone = state.research.done.length; refreshUnlocks(); if (legendOpen()) renderLegend(); }
  if (ui.sel || ui.selTile || ui.unitCard || ui.popCard) renderInfo();
  statusHud();
  if (ui.panel && ui.panel !== 'newgame' && ui.panel !== 'dev') renderPanel();
  if (!$('buildmenu').classList.contains('hidden')) $('bm-res').innerHTML = resHTML(state.era >= 2 ? ['wood', 'clay', 'stone', 'brick', 'copper', 'bronze', 'tools'] : ['wood', 'clay', 'stone', 'brick', 'copper', 'bronze']);
}


// ---------- status: bars, population readout, era goal, 15 s report cycle, idle villagers, progress bars ----------
const condCol = (c) => c >= 75 ? '#7fc06a' : c >= 50 ? '#d8c25a' : c >= 25 ? '#e0913f' : '#d9534a';
function vStatus(u) {
  const j = u.job;
  if (u.vstate === 'working' && j) return GATHER[j.res].name;
  if (u.vstate === 'building') return 'Building';
  if (u.vstate === 'hauling') return `Carrying ${u.carry ? u.carry.res : 'materials'} to build site`;
  if (u.vstate === 'fetching') return 'Fetching materials';
  if (u.vstate === 'returning') return `Carrying ${u.carry ? u.carry.res : 'goods'} to store`;
  if (u.path && u.path.length) return j ? (j.type === 'build' ? 'Walking to build site' : `Walking to ${j.res === 'food' ? 'berries' : j.res}`) : 'Walking';
  return 'Idle';
}
function popInfo() {
  const pop = S.popTotal(state), cap = S.housingCap(state), vil = S.villagers(state), res = S.residentsTotal(state), free = state.unemployed || 0;
  return { pop, cap, vil: vil.length, idleV: vil.filter(u => u.vstate === 'idle' && !(u.path && u.path.length)).length, res, free, employed: res - free };
}
function popDetail() {
  const p = popInfo(), g = state.growth || { ok: true };
  let h = row('Total', p.pop) + row('Housing', `${p.res} housed / ${p.cap} places`) + row('Employed in buildings', p.employed) + row('Free', p.free) + row('Villagers', `${p.vil} (${p.idleV} idle)`);
  h += row('Arrivals (last 4 h)', state.growth && state.growth.arrived != null ? state.growth.arrived : 0);
  h += row('Food', `${Math.floor(state.res.food)} · ${(g.foodDays ?? 0).toFixed(1)} days`);
  const jobs = {}; for (const b of Object.values(state.buildings)) { if (!b.done || b.ruin) continue; const d = BUILDINGS[b.kind], j = b.kind === 'custom' ? b.jobs : d.jobs; if (!j) continue; const k = d.name; jobs[k] = jobs[k] || [0, 0, 0]; jobs[k][0] += b.workers || 0; jobs[k][1] += j; jobs[k][2]++; }
  const jl = Object.entries(jobs); if (jl.length) h += '<h5>Who works where</h5>' + jl.map(([k, [w, j, n]]) => row(k + (n > 1 ? ` ×${n}` : ''), `${w} / ${j}`)).join('');
  h += row('Happiness', state.happiness) + row('Health', state.health ?? 80);
  return h;
}
const STAT_DEFS = [
  ['food', '🌾', 'Food', () => { const d = state.growth ? state.growth.foodDays : 9; return { v: Math.floor(state.res.food), txt: `${Math.floor(state.res.food)} · ${d >= 99 ? '∞' : d.toFixed(1) + ' d'}`, f: Math.min(1, d / 10), low: d < 2 ? 2 : d < 4 ? 1 : 0 }; }],
  ['wood', '🪵', 'Wood', () => { const v = Math.floor(state.res.wood); return { v, txt: v, f: Math.min(1, v / 150), low: v < 8 ? 2 : v < 20 ? 1 : 0 }; }],
  ['stone', '🪨', 'Stone', () => { const v = Math.floor(state.res.stone); return { v, txt: v, f: Math.min(1, v / 100), low: v < 4 ? 2 : v < 10 ? 1 : 0 }; }],
  ['clay', '🟫', 'Clay', () => { const v = Math.floor(state.res.clay); return { v, txt: v, f: Math.min(1, v / 80), low: v < 3 ? 2 : v < 8 ? 1 : 0 }; }],
  ['house', '🛖', 'Housing', () => { const p = popInfo(); return { v: p.pop, txt: `${p.res}/${p.cap}`, f: p.cap ? p.res / p.cap : 1, low: p.res >= p.cap ? 1 : 0 }; }],
  ['happy', '🙂', 'Happiness', () => ({ v: state.happiness, txt: state.happiness, f: state.happiness / 100, low: state.happiness < 40 ? 2 : state.happiness < 55 ? 1 : 0 })],
  ['health', '❤️', 'Health', () => { const v = state.health ?? 80; return { v, txt: v, f: v / 100, low: v < 40 ? 2 : v < 60 ? 1 : 0 }; }],
  ['cond', '🏚️', 'Condition', () => { const v = Math.round(state.condAvg ?? 100); return { v, txt: v + '%', f: v / 100, low: v < 35 ? 2 : v < 60 ? 1 : 0 }; }],
];
const CYCLE = 15; // seconds (real time)
const rep = { t0: performance.now(), snap: null, delta: {} };
function snapStats() { const o = {}; for (const [k, , , fn] of STAT_DEFS) o[k] = fn().v; return o; }
let stCollapsed = localStorage.getItem('earth.status') ? localStorage.getItem('earth.status') === '0' : TOUCH;
$('st-tog').onclick = () => { stCollapsed = !stCollapsed; localStorage.setItem('earth.status', stCollapsed ? '0' : '1'); statusHud(true); };
$('st-goal').onclick = (e) => { if (e.target.closest('#st-res, .tech')) openPanel('tech'); };
$('st-pop').onclick = () => { closeSheets('info'); setUnits([]); ui.popCard = true; renderInfo(); };
$('btn-idle').onclick = () => { const idle = S.villagers(state).filter(u => u.vstate === 'idle' && !(u.path && u.path.length)); if (!idle.length) return; ui.idleI = ((ui.idleI || 0) + 1) % idle.length; const u = idle[ui.idleI]; disarm(); setUnits([u.id]); showUnits(); renderer.target.set(u.x + 0.5, renderer.target.y, u.y + 0.5); };
function statusHud(force) {
  const st = $('status'); st.classList.toggle('collapsed', stCollapsed); $('st-tog').textContent = stCollapsed ? '▸' : '▾';
  const p = popInfo(), g = state.growth || { ok: true };
  setHTML($('st-pop'), `👥 <b>${p.pop}</b> <small>pop</small> · 🛖 ${p.res}/${p.cap} · ⚒ ${p.employed} · <span class="${p.free ? '' : 'dim'}">free ${p.free}</span> · 🧑‍🌾 ${p.vil}`);
  const ib = $('btn-idle'); ib.classList.toggle('hidden', !p.idleV); ib.innerHTML = `🧑‍🌾 <b>${p.idleV}</b> idle`;
  const bars = $('st-bars');
  if (!bars._els) { bars.innerHTML = STAT_DEFS.map(([k, ic, name]) => `<div class="sb" title="${name}"><span class="ic">${ic}</span><span class="bt"><i></i></span><b></b><em></em></div>`).join(''); bars._els = [...bars.children].map(el => ({ el, i: el.querySelector('i'), b: el.querySelector('b'), em: el.querySelector('em') })); }
  STAT_DEFS.forEach(([k, , , fn], n) => { const v = fn(), d = rep.delta[k] || 0, E = bars._els[n];
    const cls = 'sb ' + (v.low === 2 ? 'low' : v.low === 1 ? 'warn' : ''); if (E.el.className !== cls) E.el.className = cls;
    const w = Math.round(Math.max(0, Math.min(1, v.f)) * 100) + '%'; if (E.i.style.width !== w) E.i.style.width = w;
    const t = String(v.txt); if (E.b.textContent !== t) E.b.textContent = t;
    if (E._d !== d || E._c !== rep.cycleN) { E._d = d; E._c = rep.cycleN; E.em.className = d > 0 ? 'up' : d < 0 ? 'dn' : ''; E.em.textContent = d ? (d > 0 ? '+' : '−') + Math.abs(d) : ''; } });
  // next-era checklist (status only) and the current research
  const er = S.eraReady(state), r = state.research;
  let gh = '';
  if (er.items.length) {
    gh += `<div class="gh">Next era: <b>${ERAS[state.era + 1] ? ERAS[state.era + 1].name : ''}</b></div><div class="chk">` + er.items.map(i => `<span class="${i.ok ? 'ok' : 'no'}${i.key ? '' : ' tech'}">${i.ok ? '✓' : '☐'} ${i.key === 'made' ? i.label : i.key ? `${{ pop: 'Population', buildings: 'Buildings', culture: 'Culture' }[i.key]} ${i.v} / ${i.need}` : i.label.replace(' researched', '') + (r.current && TECHS[r.current] && i.label.startsWith(TECHS[r.current].name) ? ` ${Math.floor(r.progress / techCost(r.current, state.culture) * 100)}%` : '')}</span>`).join('') + '</div>';
  } else gh += '<div class="gh">Last era in this build</div>';
  gh += `<button id="st-res" class="st-res">🔬 ${r.current ? `${TECHS[r.current].name} <i class="rb"><i style="width:${Math.min(100, Math.floor(r.progress / techCost(r.current, state.culture) * 100))}%"></i></i> ${Math.min(100, Math.floor(r.progress / techCost(r.current, state.culture) * 100))}%` : `Research · ${Math.floor(r.bank || 0)} pts`}</button>`;
  setHTML($('st-goal'), gh);
}
function cycleTick() {
  const el = (performance.now() - rep.t0) / 1000;
  if (!rep.snap) rep.snap = snapStats();
  if (el >= CYCLE) { rep.cycleN = (rep.cycleN || 0) + 1; const now = snapStats(); rep.delta = {}; for (const k in now) rep.delta[k] = Math.round(now[k] - rep.snap[k]); rep.snap = now; rep.t0 = performance.now(); statusHud(); $('status').classList.remove('pulse'); void $('status').offsetWidth; $('status').classList.add('pulse'); }
  const f = Math.min(1, ((performance.now() - rep.t0) / 1000) / CYCLE), C = 2 * Math.PI * 7;
  $('st-ring').style.strokeDashoffset = (C * f).toFixed(2); $('st-cd').textContent = Math.ceil(CYCLE * (1 - f));
}
// floating progress bars above buildings: construction, dismantling, production (pops the goods icon)
const POP_ICONS = { food: '🌾', wood: '🪵', stone: '🪨', clay: '🟫', brick: '🧱', copper: '🟢', tin: '⚪', bronze: '🥉', tools: '🔨', pots: '🏺', wool: '🐑', flax: '🌿', cloth: '🧵' };
const pbEls = new Map();
function progressBars() {
  const box = $('pbars'), seen = new Set(), hidden = renderer.underground || document.body.classList.contains('intitle');
  if (!hidden) for (const b of Object.values(state.buildings)) {
    if (b.ruin) continue; const d = BUILDINGS[b.kind]; if (!d) continue;
    const hv = ui.hover && S.tile(state, ui.hover.x, ui.hover.y); if (ui.sel !== b.id && !(hv && hv.occ === b.id)) continue; // bars only on hover / selection: the work itself is visible on the map
    let kind = null, f = 0;
    if (b.dis) { kind = 'dis'; f = 1 - b.progress; }
    else if (!b.done) { kind = 'build'; f = b.progress; }
    else if (b.workers > 0 && (d.food || d.extract || d.recipe)) { kind = 'prod'; f = b.prog || 0; }
    if (!kind) continue;
    const sp = renderer.buildingAnchor(b.id); if (!sp || sp.x < -40 || sp.y < -40 || sp.x > innerWidth + 40 || sp.y > innerHeight + 40) continue;
    seen.add(b.id); let e = pbEls.get(b.id);
    if (!e) { e = document.createElement('div'); e.className = 'pb'; e.innerHTML = '<i></i><span></span>'; box.appendChild(e); pbEls.set(b.id, e); }
    e.className = 'pb ' + kind; e.style.transform = `translate(${Math.round(sp.x - 20)}px, ${Math.round(sp.y - 4)}px)`; e.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
    if (kind === 'prod' && b.pop && b.pop !== e._pop) { if (e._pop !== undefined && state.tick - b.pop < 3) { const ic = document.createElement('b'); ic.className = 'pop'; ic.textContent = POP_ICONS[b.popRes] || '✓'; e.appendChild(ic); setTimeout(() => ic.remove(), 1200); } e._pop = b.pop; }
  }
  for (const [id, e] of pbEls) if (!seen.has(id)) { e.remove(); pbEls.delete(id); }
}

// ---------- loop ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (ui.speed > 0) {
    ui.acc += dt * ui.speed;
    let n = 0; while (ui.acc >= 1 && n < 60) { S.tick(state); ui.acc -= 1; n++; }
    if (n >= 60) ui.acc = 0;
  }
  // keyboard pan: accelerates, eases out on release, scaled by zoom, diagonals normalised (in the renderer)
  const ix = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  const iz = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  renderer.panInput(ix, iz, dt);
  renderer.frame(state, ui.speed > 0 ? ui.acc : 0, dt, ui.speed || 1);
  hudT += dt; if (hudT > 0.25) { hudT = 0; hud(); }
  cycleTick(); progressBars();
  requestAnimationFrame(loop);
}
function exposeForTests() { window.game = { BUILDINGS, ERAS, get state() { return state; }, cmd, S, renderer, ui, setSpeed, setTool, startGame, hideTitle, setUnits, toggleUnder, setLegend, openPanel }; }

// ---------- quality ----------
const qOpts = () => `<option value="auto" ${renderer.autoQ ? 'selected' : ''}>Auto (${QUALITY[renderer.qKey].name})</option>` + Object.entries(QUALITY).filter(([k, q]) => !q.hidden || k === renderer.qKey).map(([k, q]) => `<option value="${k}" ${!renderer.autoQ && k === renderer.qKey ? 'selected' : ''}>${q.name}</option>`).join('');
$('q-sel').innerHTML = qOpts();
$('q-sel').onchange = (e) => { const v = e.target.value; renderer.autoQ = v === 'auto'; renderer.wdT = 0; if (v !== 'auto') renderer.setQuality(v); localStorage.setItem('earth.quality', v); $('q-sel').innerHTML = $('t-q').innerHTML = qOpts(); if (renderer.thumbs) renderer.thumbs.clear(); };
renderer.onAutoQuality = () => { $('q-sel').innerHTML = $('t-q').innerHTML = qOpts(); };
// ---------- title screen ----------
$('t-q').innerHTML = $('q-sel').innerHTML;
$('t-q').onchange = (e) => { $('q-sel').value = e.target.value; $('q-sel').onchange(e); };
function hideTitle() { $('title').classList.add('hidden'); document.body.classList.remove('intitle'); renderer.autoOrbit = false; renderer.snapRotation(); if (localStorage.getItem('earth.legend') === '1') setLegend(true, false); }
if (params.get('notitle')) hideTitle(); else { document.body.classList.add('intitle'); renderer.autoOrbit = true; }
if (!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_SAVE_KEY))) $('t-cont').classList.add('hidden');
const mapSize = Number(params.get('size')) || 128; // large map by default; ?size=64 for the small one
$('t-play').onclick = () => startGame({ seed: Number(params.get('seed')) || undefined, size: mapSize });
$('t-sand').onclick = () => startGame({ sandbox: true, era: 1, size: mapSize });
$('t-cont').onclick = () => { hideTitle(); loadSave(); };
exposeForTests(); refreshUnlocks();
setTool('select');
requestAnimationFrame(loop);
// pre-render build thumbnails while idle so the build menu opens instantly
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
const thumbQ = [...Object.keys(BUILDINGS).filter(k => !BUILDINGS[k].hidden), 'road', 'plant', 'level', 'survey'];
(function pre() { idle(() => { const k = thumbQ.shift(); if (!k) return; thumb(k); pre(); }); })();
