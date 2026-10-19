const { chromium, devices } = require('playwright');
const OUT = '/workspace/mine-city/screenshots/';
const R = {};
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); }); page.on('pageerror', e => errors.push(e.message + ' ' + (e.stack || '').slice(0, 300)));
  await page.goto('http://localhost:8123/?seed=42&q=medium&notitle=1');
  await page.waitForFunction(() => window.game && window.game.renderer.terrainMesh, null, { timeout: 90000 });
  await page.evaluate(() => {
    game.setSpeed(0);
    window._scr = (x, y, h = 0.1) => { const Rr = game.renderer; const v = new (Rr.cam.position.constructor)(x + 0.5, Rr.topXY(x, y) + h, y + 0.5).project(Rr.cam); const r = Rr.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; };
    const s = game.state, S = game.S, { x, y } = s.start;
    let tree = null, berry = null; for (let r = 1; r < 14 && (!tree || !berry); r++) for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) { const t = S.tile(s, xx, yy); if (!t || !t.vis) continue; if (!tree && t.trees > 1) tree = [xx, yy]; if (!berry && t.berry > 0 && !t.trees) berry = [xx, yy]; }
    window._tree = tree; window._berry = berry;
    const v = s.units.filter(u => u.kind === 'villager')[0]; game.renderer.target.set((v.x + tree[0]) / 2 + 0.5, 0, (v.y + tree[1]) / 2 + 0.5); game.renderer.zoom = 2.0;
  });
  await page.waitForTimeout(1500);
  R.feat = await page.evaluate(() => ({ tree: _tree, berry: _berry }));
  // 1) select first villager by clicking it, then right-click a tree
  const vid = await page.evaluate(() => game.state.units.find(u => u.kind === 'villager').id);
  const vp = await page.evaluate((id) => { const p = game.renderer.unitScreen(id); return [p.x, p.y]; }, vid);
  await page.mouse.click(vp[0], vp[1]); await page.waitForTimeout(300);
  R.selected = await page.evaluate(() => game.ui.units.slice());
  R.unitCard = await page.evaluate(() => document.getElementById('info').innerText.replace(/\n+/g, ' | ').slice(0, 200));
  const tp = await page.evaluate(() => _scr(_tree[0], _tree[1]));
  await page.mouse.click(tp[0], tp[1], { button: 'right' }); await page.waitForTimeout(200);
  R.job1 = await page.evaluate((id) => { const u = game.state.units.find(u => u.id === id); return u.job; }, vid);
  // 2) box-select the other two and send them to berries (left click with units selected)
  const others = await page.evaluate((id) => game.state.units.filter(u => u.kind === 'villager' && u.id !== id).map(u => u.id), vid);
  await page.evaluate((ids) => game.setUnits(ids), others);
  await page.evaluate(() => { game.renderer.target.set(_berry[0] + 0.5, 0, _berry[1] + 0.5); }); await page.waitForTimeout(800);
  await page.evaluate(() => { document.getElementById('info').classList.add('hidden'); game.ui.unitCard = true; });
  const bp = await page.evaluate(() => _scr(_berry[0], _berry[1]));
  await page.mouse.click(bp[0], bp[1], { button: 'right' }); await page.waitForTimeout(200);
  R.job2 = await page.evaluate((ids) => ids.map(id => (game.state.units.find(u => u.id === id).job || {}).res), others);
  // run 30 game hours
  const w0 = await page.evaluate(() => ({ wood: game.state.res.wood, food: game.state.res.food }));
  await page.evaluate(() => { for (let i = 0; i < 14; i++) game.S.tick(game.state); game.renderer.target.set(_tree[0] + 0.5, 0, _tree[1] + 0.5); game.renderer.zoom = 3.2; });
  await page.waitForTimeout(1200);
  R.states14 = await page.evaluate(() => game.state.units.filter(u => u.kind === 'villager').map(u => u.vstate + ':' + (u.carry ? u.carry.n.toFixed(1) : 0)));
  await page.screenshot({ path: OUT + 'v22-villagers-working.png' });
  await page.evaluate(() => { for (let i = 0; i < 16; i++) game.S.tick(game.state); });
  R.gather = await page.evaluate((w0) => ({ dWood: +(game.state.res.wood - w0.wood).toFixed(1), dFood: +(game.state.res.food - w0.food).toFixed(1), gathered: game.state.stats.gathered, states: game.state.units.filter(u => u.kind === 'villager').map(u => u.vstate) }), w0);
  // 3) Isaac's case: tents/pole huts + woodcutter, no roads; housing fills, woodcutter staffed
  R.isaac = await page.evaluate(() => {
    const s = game.state, S = game.S, c = (x) => S.applyCommand(s, x), { x, y } = s.start; s.res.wood += 200; s.res.food += 30;
    const homes = []; for (const [dx, dy] of [[2, 1], [3, 1], [2, 2], [3, 2], [4, 2]]) { const r = c({ type: 'place', kind: dx % 2 ? 'tent' : 'polehut', x: x + dx, y: y + dy }); if (r.ok) { c({ type: 'skip', what: 'build', id: r.id }); homes.push(r.id); } }
    let wc = null; for (let r = 2; r < 9 && !wc; r++) for (let yy = y - r; yy <= y + r && !wc; yy++) for (let xx = x - r; xx <= x + r && !wc; xx++) { const t = S.tile(s, xx, yy); if (t && t.trees === 0 && !S.checkPlacement(s, 'woodcutter', xx, yy)) { let n = 0; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const q = S.tile(s, xx + a, yy + b); if (q) n += q.trees; } if (n > 10) { const rr = c({ type: 'place', kind: 'woodcutter', x: xx, y: yy }); if (rr.ok) { c({ type: 'skip', what: 'build', id: rr.id }); wc = rr.id; } } } }
    const g = c({ type: 'place', kind: 'berryhut', x: x - 2, y: y + 2 }); if (g.ok) c({ type: 'skip', what: 'build', id: g.id });
    for (let i = 0; i < 36; i++) S.tick(s);
    window._wcid = wc; const b = s.buildings[wc];
    return { homes: homes.length, wc: !!wc, pop: S.popTotal(s), cap: S.housingCap(s), workers: b && b.workers, free: s.unemployed, growth: s.growth, happy: s.happiness };
  });
  // woodcutter card text
  await page.evaluate(() => { const b = game.state.buildings[_wcid]; game.renderer.target.set(b.x + 0.5, 0, b.y + 0.5); game.renderer.zoom = 2.2; game.setUnits([]); });
  await page.waitForTimeout(900);
  const wp = await page.evaluate(() => { const b = game.state.buildings[_wcid]; return _scr(b.x, b.y, 0.15); });
  await page.mouse.click(wp[0], wp[1]); await page.waitForTimeout(400);
  R.wcCard = await page.evaluate(() => document.getElementById('info').innerText.replace(/\n+/g, ' | ').slice(0, 300));
  // 4) construction with villager builders + floating bars
  R.build = await page.evaluate(() => {
    const s = game.state, S = game.S, { x, y } = s.start; const r = S.applyCommand(s, { type: 'place', kind: 'hut', x: x - 1, y: y + 3 }); if (!r.ok) return r;
    const ids = s.units.filter(u => u.kind === 'villager').map(u => u.id); const t = S.applyCommand(s, { type: 'villagerTask', ids, x: x - 1, y: y + 3 });
    for (let i = 0; i < 4; i++) S.tick(s); window._hut = r.id; game.renderer.target.set(x + 0.5, 0, y + 2.5); game.renderer.zoom = 1.8;
    return { task: t.task, builders: s.buildings[r.id].builders, progress: +s.buildings[r.id].progress.toFixed(2) };
  });
  await page.evaluate(() => { document.getElementById('info').classList.add('hidden'); game.ui.sel = null; game.setSpeed(2); });
  await page.waitForTimeout(2500);
  R.pbars = await page.evaluate(() => [...document.querySelectorAll('#pbars .pb')].map(e => e.className));
  await page.screenshot({ path: OUT + 'v22-progress-bars.png' });
  // 5) report cycle: wait for a reset, deltas appear
  await page.waitForFunction(() => document.querySelectorAll('#st-bars em.up, #st-bars em.dn').length > 0, null, { timeout: 40000 }).catch(() => {});
  R.deltas = await page.evaluate(() => [...document.querySelectorAll('#st-bars .sb')].map(e => e.title + ' ' + e.querySelector('b').textContent + ' ' + e.querySelector('em').textContent));
  await page.evaluate(() => game.setSpeed(0));
  await page.screenshot({ path: OUT + 'v22-status-bars.png', clip: { x: 0, y: 0, width: 520, height: 230 } });
  // 6) population card
  await page.click('#st-pop'); await page.waitForTimeout(300);
  R.popCard = await page.evaluate(() => document.getElementById('info').innerText.replace(/\n+/g, ' | ').slice(0, 500));
  await page.screenshot({ path: OUT + 'v22-population-card.png' });
  // 7) camp: train villager button
  const camp = await page.evaluate(() => { const b = Object.values(game.state.buildings).find(b => b.kind === 'camp'); game.renderer.target.set(b.x + 0.5, 0, b.y + 0.5); return b.id; });
  await page.waitForTimeout(800);
  const cp = await page.evaluate((id) => { const b = game.state.buildings[id]; return _scr(b.x, b.y, 0.12); }, camp);
  await page.mouse.click(cp[0], cp[1]); await page.waitForTimeout(300);
  const nv0 = await page.evaluate(() => game.state.units.filter(u => u.kind === 'villager').length);
  const tb = await page.$('#info [data-act="train"]'); if (tb) { await tb.click(); await page.waitForTimeout(200); }
  R.train = { hadButton: !!tb, before: nv0, after: await page.evaluate(() => game.state.units.filter(u => u.kind === 'villager').length) };
  // 8) idle villager button
  await page.evaluate(() => { for (const u of game.state.units) if (u.kind === 'villager') game.cmd({ type: 'stopUnit', id: u.id }); }); await page.waitForTimeout(600);
  R.idleBtn = await page.evaluate(() => document.getElementById('btn-idle').innerText);
  await page.click('#btn-idle'); await page.waitForTimeout(200); R.idleSel = await page.evaluate(() => game.ui.units.slice());
  // 9) Great Timber Hall + aging stages
  R.hall = await page.evaluate(() => {
    const s = game.state, S = game.S, { x, y } = s.start; s.res.wood += 300; s.res.stone += 100; s.res.clay += 50;
    const out = []; let px = x + 5, py = y - 4;
    const r = S.applyCommand(s, { type: 'place', kind: 'greathall', x: px, y: py }); if (r.ok) { S.applyCommand(s, { type: 'skip', what: 'build', id: r.id }); out.push(r.id); }
    const ks = ['polehut', 'polehut', 'polehut', 'polehut']; const conds = [100, 60, 35, 12]; const ids = [];
    ks.forEach((k, i) => { const q = S.applyCommand(s, { type: 'place', kind: k, x: px - 2 + i, y: py + 3 }); if (q.ok) { S.applyCommand(s, { type: 'skip', what: 'build', id: q.id }); s.buildings[q.id].cond = conds[i]; ids.push(q.id); } });
    game.renderer.target.set(px + 0.5, 0, py + 2); game.renderer.zoom = 2.6; return { hall: r.ok ? r.id : r.err, aged: ids.length, q: r.ok ? +s.buildings[r.id].q.toFixed(2) : null };
  });
  await page.evaluate(() => { document.getElementById('info').classList.add('hidden'); game.ui.sel = null; game.ui.unitCard = false; game.setUnits([]); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + 'v22-great-hall-and-aging.png' });
  // 10) build menu (Housing + Culture)
  await page.evaluate(() => { game.setTool('build'); }); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'v22-build-menu-housing.png' });
  await page.click('#bm-cats [data-cat="Culture"]'); await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + 'v22-build-menu-culture.png' });
  R.menuCounts = await page.evaluate(async () => { const { BUILDINGS } = await import('./src/data.js'); const c = {}; for (const [k, d] of Object.entries(BUILDINGS)) if (!d.hidden && d.era === 1) c[d.cat] = (c[d.cat] || 0) + 1; return c; });
  R.era1Locked = await page.evaluate(() => ['orepit', 'shaft', 'smelter', 'brickhouse'].map(k => k + ':' + game.S.buildingAvailable(game.state, k)));
  R.errors = errors;
  console.log(JSON.stringify(R, null, 1));
  await browser.close();
})();
