// UI + game loop. Player actions become commands applied to the sim.
import { Renderer } from './render.js';
import * as S from './sim.js';
import { BUILDINGS, CATEGORIES, TECHS, ERAS, BLOCKS, CUSTOM_FUNCS, DEPOSITS, techCost } from './data.js';

const $ = (id) => document.getElementById(id);
const SPEEDS = [0, 1, 2, 5, 10, 25, 50];
const SAVE_KEY = 'minecity.save.v1';
const STAGE_NAMES = ['Foundation', 'Frame', 'Half-built', 'Finished'];
const TERRAIN_NAMES = ['Grassland', 'Forest', 'Hills', 'River'];

const renderer = new Renderer($('view'));
let state = S.newGame({ seed: Number(new URLSearchParams(location.search).get('seed')) || undefined });
renderer.setState(state);
const ui = { tool: 'select', kind: null, cat: 'Housing', rot: 0, sel: null, selTile: null, speed: 1, acc: 0, dragging: false, panning: null, hover: null, mat: 'mud', func: 'house', panel: null, under: false };

function cmd(c) {
  const r = S.applyCommand(state, c);
  if (!r.ok && r.err) toast(r.err);
  return r;
}
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800); }

// ---------- toolbar ----------
function setTool(t) {
  ui.tool = t; if (t !== 'build') ui.kind = null;
  document.querySelectorAll('#toolbar button[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('buildmenu').classList.toggle('hidden', t !== 'build');
  $('blockbar').classList.toggle('hidden', t !== 'block');
  if (t === 'build') renderBuildMenu();
  if (t === 'block') renderBlockBar();
  renderer.setGhost(null);
}
document.querySelectorAll('#toolbar button[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
$('btn-under').onclick = () => toggleUnder();
function toggleUnder() { ui.under = !ui.under; renderer.setUnderground(ui.under); $('btn-under').classList.toggle('on', ui.under); }

function renderBuildMenu() {
  $('bm-cats').innerHTML = CATEGORIES.map(c => `<button class="${c === ui.cat ? 'on' : ''}" data-cat="${c}">${c}</button>`).join('');
  $('bm-cats').querySelectorAll('button').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; renderBuildMenu(); });
  const items = Object.entries(BUILDINGS).filter(([k, d]) => d.cat === ui.cat && !d.hidden && d.era <= state.era);
  $('bm-items').innerHTML = items.map(([k, d]) => {
    const parts = [S.costStr(d.cost), `${d.time} h`];
    if (d.cap) parts.push(`houses ${d.cap}`); if (d.jobs) parts.push(`${d.jobs} jobs`);
    if (d.recipe) parts.push(Object.entries(d.recipe.in).map(([r, n]) => n + ' ' + r).join(' + ') + ' → ' + Object.entries(d.recipe.out).map(([r, n]) => n + ' ' + r).join(', '));
    if (d.extract) parts.push('extracts ' + (Array.isArray(d.extract) ? d.extract.join('/') : d.extract) + (d.maxDepth ? ` ≤${d.maxDepth} m` : ''));
    if (d.size > 1) parts.push(`${d.size}×${d.size}`);
    return `<button class="bitem ${ui.kind === k ? 'on' : ''}" data-k="${k}"><b>${d.name}</b><small>${parts.join(' · ')}</small></button>`;
  }).join('') || '<small>Nothing in this category yet.</small>';
  $('bm-items').querySelectorAll('button').forEach(b => b.onclick = () => { ui.kind = b.dataset.k; renderBuildMenu(); });
}
function renderBlockBar() {
  $('bb-mats').innerHTML = Object.entries(BLOCKS).filter(([k, m]) => m.era <= state.era).map(([k, m]) => `<button class="${ui.mat === k ? 'on' : ''}" data-m="${k}"><span class="sw" style="background:#${m.color.toString(16).padStart(6, '0')}"></span>${m.name}</button>`).join('');
  $('bb-mats').querySelectorAll('button').forEach(b => b.onclick = () => { ui.mat = b.dataset.m; renderBlockBar(); });
  $('bb-func').innerHTML = Object.entries(CUSTOM_FUNCS).map(([k, n]) => `<option value="${k}" ${ui.func === k ? 'selected' : ''}>${n}</option>`).join('');
  const cost = {}; for (const b of state.draft) { const r = BLOCKS[b.m].res; cost[r] = (cost[r] || 0) + 1; }
  $('bb-cost').textContent = `${state.draft.length} blocks · cost: ${state.flags.freeBlocks ? 'free (sandbox)' : S.costStr(cost)}`;
}
$('bb-func').onchange = (e) => ui.func = e.target.value;
$('bb-commit').onclick = () => { const r = cmd({ type: 'blockCommit', func: ui.func }); if (r.ok) { renderBlockBar(); select(r.id); } };
$('bb-clear').onclick = () => { cmd({ type: 'blockClear' }); renderBlockBar(); };

// speeds
$('speeds').innerHTML = SPEEDS.map((s, i) => `<button data-s="${s}" title="Key ${i}">${s ? s + 'x' : '⏸'}</button>`).join('');
$('speeds').querySelectorAll('button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
function setSpeed(s) { ui.speed = s; $('speeds').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.s === s)); }
setSpeed(1);

// ---------- mouse ----------
const cv = $('view');
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (e.button === 2 || e.button === 1) { ui.panning = { x: e.clientX, y: e.clientY }; return; }
  const p = renderer.pick(e.clientX, e.clientY); if (!p) return;
  if (ui.tool === 'road') { ui.dragging = true; cmd({ type: 'road', x: p.x, y: p.y }); }
  else if (ui.tool === 'bulldoze') { ui.dragging = true; const r = cmd({ type: 'bulldoze', x: p.x, y: p.y }); if (r.ok) closeInfo(); }
  else if (ui.tool === 'build' && ui.kind) { const r = cmd({ type: 'place', kind: ui.kind, x: p.x, y: p.y, rot: ui.rot }); if (r.ok) { select(r.id); } }
  else if (ui.tool === 'survey') cmd({ type: 'survey', x: p.x, y: p.y });
  else if (ui.tool === 'block') { if (e.shiftKey) cmd({ type: 'blockRemove', x: p.sx, y: p.sy }); else cmd({ type: 'blockPlace', x: p.sx, y: p.sy, m: ui.mat }); renderBlockBar(); }
  else if (ui.tool === 'devcollapse') { const t = S.tile(state, p.x, p.y); if (t.occ) { cmd({ type: 'dev', action: 'collapse', id: t.occ }); select(t.occ); } setTool('select'); }
  else { const t = S.tile(state, p.x, p.y); if (t.occ) select(t.occ); else selectTile(p.x, p.y); }
});
window.addEventListener('mouseup', () => { ui.dragging = false; ui.panning = null; });
cv.addEventListener('mousemove', e => {
  if (ui.panning) { const dx = e.clientX - ui.panning.x, dy = e.clientY - ui.panning.y; ui.panning = { x: e.clientX, y: e.clientY }; const k = 24 / renderer.zoom / cv.clientHeight; renderer.pan(-dx * k, -dy * k * 1.4); return; }
  const p = renderer.pick(e.clientX, e.clientY); ui.hover = p;
  if (!p) { renderer.setGhost(null); return; }
  if (ui.dragging && ui.tool === 'road') { const t = S.tile(state, p.x, p.y); if (t && !t.road) cmd({ type: 'road', x: p.x, y: p.y }); }
  if (ui.dragging && ui.tool === 'bulldoze') S.applyCommand(state, { type: 'bulldoze', x: p.x, y: p.y });
  updateGhost();
});
cv.addEventListener('wheel', e => { renderer.zoom = Math.max(0.45, Math.min(4, renderer.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); e.preventDefault(); }, { passive: false });
function updateGhost() {
  const p = ui.hover; if (!p) return renderer.setGhost(null);
  if (ui.tool === 'build' && ui.kind) renderer.setGhost({ x: p.x, y: p.y, size: BUILDINGS[ui.kind].size, ok: !S.checkPlacement(state, ui.kind, p.x, p.y) });
  else if (ui.tool === 'road') { const t = S.tile(state, p.x, p.y); renderer.setGhost({ x: p.x, y: p.y, h: 0.05, ok: t.vis && !t.occ && t.t !== S.T.WATER }); }
  else if (ui.tool === 'block') { const z = state.draft.filter(b => b.x === p.sx && b.y === p.sy).length; const t = S.tile(state, p.x, p.y); renderer.setGhost({ block: true, x: p.x, y: p.y, sx: p.sx, sy: p.sy, z, ok: t.vis && !t.occ && !t.road && t.t !== S.T.WATER }); }
  else if (ui.tool === 'survey') renderer.setGhost({ x: p.x, y: p.y, h: 0.05, ok: true });
  else renderer.setGhost(null);
}

// ---------- keyboard ----------
const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys.add(e.key.toLowerCase());
  if (/^[0-6]$/.test(e.key)) setSpeed(SPEEDS[+e.key]);
  else if (e.key === 'q' || e.key === 'Q') renderer.rotate(-1);
  else if (e.key === 'e' || e.key === 'E') renderer.rotate(1);
  else if (e.key === 'r' || e.key === 'R') { ui.rot = (ui.rot + 1) % 4; }
  else if (e.key === 'u' || e.key === 'U') toggleUnder();
  else if (e.key === 'b' || e.key === 'B') setTool(ui.tool === 'block' ? 'select' : 'block');
  else if (e.key === 'Escape') { setTool('select'); closeInfo(); closePanel(); }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// ---------- info card ----------
function select(id) { ui.sel = id; ui.selTile = null; renderInfo(); }
function selectTile(x, y) { ui.sel = null; ui.selTile = { x, y }; renderInfo(); }
function closeInfo() { ui.sel = null; ui.selTile = null; $('info').classList.add('hidden'); }
function setHTML(el, h) { if (el._h === h) return false; el._h = h; el.innerHTML = h; return true; }
const row = (k, v) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
function renderInfo() {
  const el = $('info');
  if (ui.sel) {
    const b = state.buildings[ui.sel]; if (!b) return closeInfo();
    const d = BUILDINGS[b.kind]; const name = b.kind === 'custom' ? `Custom ${CUSTOM_FUNCS[b.func]}` : d.name;
    let h = `<h3>${name}</h3>`; const btns = [];
    if (b.ruin) {
      const inc = state.incidents.find(i => i.bid === b.id);
      h += row('Status', 'Collapsed');
      if (inc) {
        const crew = state.crews.find(c => c.id === inc.crew);
        const step = inc.stage === 'rescue' ? (crew ? (crew.state === 'out' ? 'Rescue crew on the way' : 'Rescue in progress') : 'Waiting for rescue crew') : (crew ? (crew.state === 'out' ? 'Cleanup crew on the way' : 'Clearing rubble') : 'Waiting for cleanup crew');
        h += row('Step', step) + row('Dead', inc.dead) + row('Trapped', inc.trapped) + row('Saved', inc.saved);
        btns.push(`<button data-skip="incident" data-id="${inc.id}">Skip step ⏭</button>`);
      }
    } else {
      const st = S.stageOf(b);
      h += row('Stage', STAGE_NAMES[st]);
      if (!b.done) { h += `<div class="bar"><i style="width:${Math.round(b.progress * 100)}%"></i></div>`; btns.push(`<button data-skip="build" data-id="${b.id}">Skip construction ⏭</button>`); }
      h += row('Road access', S.roadAccess(state, b) ? 'Yes' : 'No');
      const cap = S.capOf(b); if (cap) h += row('Residents', `${b.residents} / ${cap}`);
      const jobs = b.kind === 'custom' ? b.jobs : d.jobs; if (jobs) h += row('Workers', `${b.workers} / ${jobs}`);
      if (d.extract) {
        const maxD = Math.min(d.maxDepth || 99, ERAS[state.era].maxDepth);
        let left = 0; if (d.extract !== 'wood') for (let y = b.y - d.radius; y <= b.y + d.radius; y++) for (let x = b.x - d.radius; x <= b.x + d.radius; x++) { const t = S.tile(state, x, y); if (t && t.dep && d.extract.includes(t.dep.r) && t.dep.depth <= maxD) left += t.dep.amt; }
        else for (let y = b.y - d.radius; y <= b.y + d.radius; y++) for (let x = b.x - d.radius; x <= b.x + d.radius; x++) { const t = S.tile(state, x, y); if (t) left += t.trees * 10; }
        h += row('Extracts', Array.isArray(d.extract) ? d.extract.join(', ') : 'wood') + row('Max depth', d.extract === 'wood' ? '–' : `${maxD} m`) + row('Reachable amount', Math.round(left)) + row('Rate', `${d.rate}/day at full staff`);
        if (b.done) btns.push(`<button data-skip="mine" data-id="${b.id}">Run 1 day ⏭</button>`);
      }
      if (d.recipe) h += row('Recipe', Object.entries(d.recipe.in).map(([r, n]) => n + ' ' + r).join(' + ') + ' → ' + Object.entries(d.recipe.out).map(([r, n]) => n + ' ' + r).join(', ')) + row('Batches', `${d.recipe.perDay}/day at full staff`);
      if (d.food) h += row('Food', `${d.food}/day at full staff`);
      if (b.kind === 'well') h += row('Water radius', d.radius + ' tiles');
      if (b.kind === 'rescue') { const cs = state.crews.filter(c => c.post === b.id); h += row('Crews', `${cs.length} (${cs.filter(c => c.state === 'idle').length} idle)`); }
      if (b.kind === 'custom') h += row('Blocks', b.blocks.length);
      if (b.info) h += row('Status', b.info);
      if (devOpen()) btns.push(`<button data-dev="collapse" data-id="${b.id}">Dev: collapse</button>`);
    }
    if (!setHTML(el, h + `<div class="btns">${btns.join('')}</div>`)) { el.classList.remove('hidden'); return; }
  } else if (ui.selTile) {
    const { x, y } = ui.selTile, t = S.tile(state, x, y);
    let h = `<h3>Tile (${x}, ${y})</h3>`;
    if (!t.vis) h += row('Terrain', 'Unexplored');
    else {
      h += row('Terrain', TERRAIN_NAMES[t.t] + (t.t === S.T.HILL ? ` (level ${t.h})` : '')) + (t.trees ? row('Trees', t.trees) : '') + (t.road ? row('Road', 'Dirt') : '');
      if (t.sv) h += t.dep && t.dep.amt > 0 ? row('Deposit', DEPOSITS[t.dep.r].name) + row('Amount', t.dep.amt) + row('Depth', `${t.dep.depth} m`) : row('Deposit', 'None found');
      else h += row('Deposit', 'Not surveyed');
      if (t.work && ui.under) h += row('Mine workings', `${t.work.depth} m${t.work.abandoned ? ' (abandoned)' : ''}`);
    }
    if (!setHTML(el, h)) { el.classList.remove('hidden'); return; }
  } else return;
  el.classList.remove('hidden');
  el.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => { cmd({ type: 'skip', what: b.dataset.skip, id: +b.dataset.id }); renderInfo(); });
  el.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => { cmd({ type: 'dev', action: b.dataset.dev, id: +b.dataset.id }); renderInfo(); });
}

// ---------- panels ----------
document.querySelectorAll('#topright [data-panel]').forEach(b => b.onclick = () => openPanel(b.dataset.panel));
$('panel-close').onclick = () => closePanel();
function openPanel(p) { ui.panel = ui.panel === p ? null : p; if (!ui.panel) return closePanel(); $('panel').classList.remove('hidden'); $('panel-body')._h = null; renderPanel(); }
function closePanel() { ui.panel = null; $('panel').classList.add('hidden'); }
function devOpen() { return ui.panel === 'dev'; }
function renderPanel() {
  const p = ui.panel; if (!p) return;
  const body = $('panel-body');
  $('panel-title').textContent = { tech: 'Tech & eras', stats: 'Town stats', log: 'Event log', dev: 'Dev / test panel', newgame: 'New game' }[p];
  if (p === 'tech') {
    const r = state.research;
    let h = `<div>Era: <b>${ERAS[state.era].name}</b> · Mining tier: <b>${ERAS[state.era].tier} (≤${ERAS[state.era].maxDepth} m)</b></div>`;
    h += `<div>Eras: ${Object.entries(ERAS).map(([k, e]) => (+k === state.era ? `<b>${e.name}</b>` : e.name)).join(' → ')}</div>`;
    for (const [id, t] of Object.entries(TECHS)) {
      if (t.era > state.era) continue;
      const done = r.done.includes(id), cur = r.current === id, can = t.req.every(q => r.done.includes(q)), cost = techCost(id, state.culture);
      h += `<div class="tech"><b>${t.name}</b> <small>(${cost} pts)</small> ${done ? '<span class="ok">✓ done</span>' : cur ? `<div class="bar"><i style="width:${Math.min(100, r.progress / cost * 100)}%"></i></div><button data-skipres>Skip research ⏭</button>` : `<button data-res="${id}" ${can ? '' : 'disabled'}>Research</button>`}</div>`;
    }
    const er = S.eraReady(state);
    if (er.items.length) {
      h += `<h4>To enter the ${ERAS[state.era + 1].name} era</h4>` + er.items.map(i => `<div class="${i.ok ? 'ok' : 'no'}">${i.ok ? '✓' : '✗'} ${i.label}</div>`).join('');
      h += `<div class="devrow"><button id="adv-era" ${er.ready ? '' : 'disabled'}>Advance era</button><button id="skip-era">Skip to next era ⏭</button></div>`;
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
      ['Arrivals (total)', state.stats.arrivals], ['Left town (total)', state.stats.left], ['Deaths (total)', state.stats.deaths], ['Collapses', state.stats.collapses], ['Bricks made', Math.floor(state.stats.bricksMade)], ['Bronze made', Math.floor(state.stats.bronzeMade)]];
    setHTML(body, `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`);
  } else if (p === 'log') {
    setHTML(body, `<div class="log">${state.log.slice().reverse().map(l => `<div><b>${S.dateStr(l.t)}</b>${l.msg}</div>`).join('')}</div>`);
  } else if (p === 'dev') {
    const f = state.flags;
    body.innerHTML = `<p><small>Test controls. Not part of normal play.</small></p>
      <div class="devrow"><button id="d-risk" class="${f.riskOverlay ? 'on' : ''}">Subsidence risk overlay</button><button id="d-col" class="${f.collapses ? 'on' : ''}">Collapses: ${f.collapses ? 'ON' : 'OFF'}</button><button id="d-trig">Trigger incident (click a building)</button></div>
      <div class="devrow"><button id="d-money">+1000 money</button><button id="d-mat">+100 materials</button><button id="d-reveal">Reveal all</button><button id="d-unl" class="${f.unlimitedMoney ? 'on' : ''}">Unlimited money</button><button id="d-free" class="${f.freeBlocks ? 'on' : ''}">Free blocks</button></div>
      <div class="devrow"><button id="d-grow">Skip growth (fill homes)</button><button id="d-surv">Skip surveys</button><button id="d-era">Skip to next era</button></div>
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
    on('d-free', () => { state.flags.freeBlocks = !state.flags.freeBlocks; });
    on('d-grow', () => cmd({ type: 'skip', what: 'growth' }));
    on('d-surv', () => cmd({ type: 'skip', what: 'survey' }));
    on('d-era', () => cmd({ type: 'skip', what: 'era' }));
    on('d-sb1', () => startGame({ sandbox: true, era: 1 }));
    on('d-sb2', () => startGame({ sandbox: true, era: 2 }));
  } else if (p === 'newgame') {
    body.innerHTML = `<div class="devrow">Seed <input id="ng-seed" type="number" value="${Math.floor(Math.random() * 1e6)}" style="width:110px"></div>
      <div class="devrow"><button id="ng-n">Normal game</button><button id="ng-s1">Sandbox: Stone & Clay</button><button id="ng-s2">Sandbox: Bronze</button></div>`;
    const seed = () => +$('ng-seed').value || undefined;
    $('ng-n').onclick = () => startGame({ seed: seed() });
    $('ng-s1').onclick = () => startGame({ seed: seed(), sandbox: true, era: 1 });
    $('ng-s2').onclick = () => startGame({ seed: seed(), sandbox: true, era: 2 });
  }
}
function startGame(opts) { state = S.newGame(opts); renderer.setState(state); closeInfo(); closePanel(); setTool('select'); exposeForTests(); }

// ---------- save / load ----------
$('btn-save').onclick = () => { try { localStorage.setItem(SAVE_KEY, S.serialize(state)); toast('Saved'); } catch (e) { toast('Save failed: ' + e.message); } };
$('btn-load').onclick = () => { const j = localStorage.getItem(SAVE_KEY); if (!j) return toast('No save found'); try { state = S.deserialize(j); renderer.setState(state); closeInfo(); toast('Loaded'); exposeForTests(); } catch (e) { toast('Load failed: ' + e.message); } };
$('btn-export').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([S.serialize(state)], { type: 'application/json' })); a.download = `minecity-day${Math.floor(state.tick / 24) + 1}.json`; a.click(); };
$('btn-import').onclick = () => $('file-import').click();
$('file-import').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { state = S.deserialize(await f.text()); renderer.setState(state); toast('Imported'); exposeForTests(); } catch (err) { toast('Import failed: ' + err.message); } };

// ---------- HUD ----------
const RES_ICONS = { wood: '🪵', clay: '🟫', stone: '🪨', copper: '🟢', tin: '⚪', brick: '🧱', bronze: '🥉', food: '🌾' };
let hudT = 0, lastLogLen = -1;
function hud() {
  $('s-money').textContent = state.flags.unlimitedMoney ? '∞' : Math.floor(state.res.money);
  $('s-pop').textContent = S.popTotal(state);
  $('s-happy').textContent = state.happiness;
  $('s-era').textContent = ERAS[state.era].name + (state.mode === 'sandbox' ? ' (sandbox)' : '');
  $('s-date').textContent = S.dateStr(state.tick);
  $('s-res').innerHTML = Object.entries(RES_ICONS).map(([k, i]) => `<span title="${k}">${i} ${Math.floor(state.res[k])}</span>`).join('');
  const last = state.log[state.log.length - 1];
  if (state.log.length !== lastLogLen && last) { lastLogLen = state.log.length; $('eventline').textContent = `${S.dateStr(last.t)} · ${last.msg}`; }
  if (ui.sel || ui.selTile) renderInfo();
  if (ui.panel && ui.panel !== 'newgame' && ui.panel !== 'dev') renderPanel();
  if (ui.tool === 'block') { const cost = {}; for (const b of state.draft) { const r = BLOCKS[b.m].res; cost[r] = (cost[r] || 0) + 1; } $('bb-cost').textContent = `${state.draft.length} blocks · cost: ${state.flags.freeBlocks ? 'free (sandbox)' : S.costStr(cost)}`; }
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
  const pan = 14 * dt / renderer.zoom;
  if (keys.has('w') || keys.has('arrowup')) renderer.pan(0, pan);
  if (keys.has('s') || keys.has('arrowdown')) renderer.pan(0, -pan);
  if (keys.has('a') || keys.has('arrowleft')) renderer.pan(-pan, 0);
  if (keys.has('d') || keys.has('arrowright')) renderer.pan(pan, 0);
  renderer.frame(state, ui.speed > 0 ? ui.acc : 0, dt, ui.speed || 1);
  hudT += dt; if (hudT > 0.25) { hudT = 0; hud(); }
  requestAnimationFrame(loop);
}
function exposeForTests() { window.game = { get state() { return state; }, cmd, S, renderer, ui, setSpeed, setTool, startGame }; }
exposeForTests();
setTool('select');
requestAnimationFrame(loop);
