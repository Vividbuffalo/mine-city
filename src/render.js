// Three.js renderer. Reads sim state, never mutates it.
import * as THREE from '../vendor/three.module.js';
import { tile, SIZE, T, stageOf, tileRisk, CREW_SPEED } from './sim.js';
import { BUILDINGS, DEPOSITS, BLOCKS, HOURS_PER_DAY } from './data.js';

const TOP = (t) => !t.vis ? 0.25 : t.t === T.WATER ? 0.08 : t.t === T.HILL ? 0.25 + 0.28 * t.h : 0.25;
export const tileTop = TOP;
function h01(x, y, s) { let h = (s ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h % 10000) / 10000; }

const C = { wood: 0x9c6b3e, darkwood: 0x6b4527, thatch: 0xd8b56a, mud: 0xc9a37a, brick: 0xa8453a, roof: 0x5b3a2e, stone: 0xa7a9ab, slab: 0x9b9488, cloth: 0xd9534f, soil: 0x7a5a3a, crop: 0xb7c95b, clay: 0xc98a5a, red: 0xc0392b, white: 0xf2efe6, copper: 0x3fae8c, metal: 0x55595e };

export class Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcd7e8);
    this.cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 400);
    this.target = new THREE.Vector3(32, 0, 32); this.angle = 0; this.angleTarget = 0; this.zoom = 1.3;
    this.hemi = new THREE.HemisphereLight(0xeaf4ff, 0x5a6b45, 1.4); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.groups = {};
    for (const k of ['terrain', 'trees', 'roads', 'buildings', 'under', 'overlay', 'vehicles', 'draft', 'ghost']) { this.groups[k] = new THREE.Group(); this.scene.add(this.groups[k]); }
    this.bvis = new Map(); this.vvis = new Map(); this.matCache = new Map();
    this.underground = false; this.clock = 0;
    this.raycaster = new THREE.Raycaster();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() { const c = this.r.domElement; this.r.setSize(c.clientWidth, c.clientHeight, false); this.aspect = c.clientWidth / Math.max(1, c.clientHeight); }
  mat(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts }); }

  // ---------- full rebuild ----------
  setState(state) {
    this.state = state;
    for (const v of this.bvis.values()) this.groups.buildings.remove(v.root);
    this.bvis.clear();
    for (const v of this.vvis.values()) this.groups.vehicles.remove(v.root);
    this.vvis.clear();
    state.dirty = { all: true };
    this.target.set(state.start.x + 0.5, 0, state.start.y + 0.5);
  }

  buildTerrain(state) {
    const g = this.groups.terrain; g.clear();
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    this.terrainMat = this.mat(0xffffff);
    const m = new THREE.InstancedMesh(geo, this.terrainMat, SIZE * SIZE);
    m.receiveShadow = true; const mx = new THREE.Matrix4(), col = new THREE.Color();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y), top = TOP(t), j = (h01(x, y, 3) - 0.5) * 0.06;
      mx.makeScale(1, top, 1).setPosition(x + 0.5, 0, y + 0.5); m.setMatrixAt(y * SIZE + x, mx);
      if (!t.vis) col.setHex(0x1c2026).offsetHSL(0, 0, j * 0.3);
      else if (t.t === T.WATER) col.setHex(0x4a90c2).offsetHSL(0, 0, j * 0.5);
      else if (t.t === T.HILL) col.setHex(t.h > 1 ? 0x8f8c72 : 0xa3a07f).offsetHSL(0, 0, j);
      else if (t.t === T.FOREST) col.setHex(0x6e9e55).offsetHSL(0, 0, j);
      else col.setHex(0x86b86a).offsetHSL(0, 0, j);
      if (t.vis && t.dep && t.dep.r === 'clay' && t.dep.depth <= 2 && t.t !== T.WATER) col.lerp(new THREE.Color(0xb08d62), 0.25); // visible surface sign
      if (t.vis && t.dep && t.dep.r === 'copper' && t.dep.depth <= 5 && t.t === T.HILL) col.lerp(new THREE.Color(0x5fa88a), 0.22); // green staining
      m.setColorAt(y * SIZE + x, col);
    }
    m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    this.terrainMesh = m; g.add(m);
    this.applyUnderground();
  }

  buildTrees(state) {
    const g = this.groups.trees; g.clear();
    const pos = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y); if (!t.vis || !t.trees) continue;
      for (let i = 0; i < t.trees; i++) pos.push([x + 0.2 + h01(x, y, 10 + i) * 0.6, TOP(t), y + 0.2 + h01(x, y, 20 + i) * 0.6, 0.8 + h01(x, y, 30 + i) * 0.5]);
    }
    if (!pos.length) return;
    const fol = new THREE.ConeGeometry(0.2, 0.55, 6); fol.translate(0, 0.45, 0);
    const tr = new THREE.CylinderGeometry(0.04, 0.05, 0.2, 5); tr.translate(0, 0.1, 0);
    const mf = new THREE.InstancedMesh(fol, this.mat(0x3f7a3a), pos.length), mt = new THREE.InstancedMesh(tr, this.mat(0x6b4527), pos.length);
    const mx = new THREE.Matrix4(), col = new THREE.Color();
    pos.forEach((p, i) => { mx.makeScale(p[3], p[3], p[3]).setPosition(p[0], p[1], p[2]); mf.setMatrixAt(i, mx); mt.setMatrixAt(i, mx); col.setHex(0x3f7a3a).offsetHSL((p[3] - 1) * 0.05, 0, (p[3] - 1) * 0.1); mf.setColorAt(i, col); });
    mf.castShadow = mt.castShadow = true;
    g.add(mf, mt);
  }

  buildRoads(state) {
    const g = this.groups.roads; g.clear();
    const parts = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y); if (!t.road) continue;
      const top = TOP(t) + 0.012;
      parts.push([x + 0.5, top, y + 0.5, 0.56, 0.56]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tile(state, x + dx, y + dy); if (!n || !n.road) continue;
        parts.push([x + 0.5 + dx * 0.36, top, y + 0.5 + dy * 0.36, dx ? 0.28 : 0.56, dy ? 0.28 : 0.56]);
      }
    }
    if (!parts.length) return;
    const geo = new THREE.BoxGeometry(1, 0.025, 1);
    const m = new THREE.InstancedMesh(geo, this.mat(0xa98b62), parts.length); m.receiveShadow = true;
    const mx = new THREE.Matrix4();
    parts.forEach((p, i) => { mx.makeScale(p[3], 1, p[4]).setPosition(p[0], p[1], p[2]); m.setMatrixAt(i, mx); });
    g.add(m);
  }

  buildUnder(state) {
    const g = this.groups.under; g.clear();
    const box = new THREE.BoxGeometry(1, 1, 1), mats = {};
    for (const k in DEPOSITS) mats[k] = this.mat(DEPOSITS[k].color, { emissive: DEPOSITS[k].color, emissiveIntensity: 0.25 });
    const workMat = this.mat(0x7a5530, { emissive: 0x4a2a10, emissiveIntensity: 0.7 }), oldMat = this.mat(0x6a5a4a, { emissive: 0x2a2018, emissiveIntensity: 0.5 });
    const shaftMat = this.mat(0x2d2014);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y); if (!t.vis) continue;
      if (t.sv && t.dep && t.dep.amt > 0) {
        const h = 0.12 + Math.min(0.5, t.dep.amt / 500), m = new THREE.Mesh(box, mats[t.dep.r]);
        m.scale.set(0.82, h, 0.82); m.position.set(x + 0.5, -0.2 - t.dep.depth * 0.08, y + 0.5); g.add(m);
      }
      if (t.work) {
        const m = new THREE.Mesh(box, t.work.abandoned ? oldMat : workMat);
        m.scale.set(0.96, 0.16, 0.96); m.position.set(x + 0.5, -0.2 - t.work.depth * 0.08 + 0.1, y + 0.5); g.add(m);
      }
    }
    for (const b of Object.values(state.buildings)) if (b.kind === 'shaft') {
      let maxD = 0; for (let y = b.y - 3; y <= b.y + 3; y++) for (let x = b.x - 3; x <= b.x + 3; x++) { const t = tile(state, x, y); if (t && t.work && t.work.mine === b.id) maxD = Math.max(maxD, t.work.depth); }
      if (!maxD) continue;
      const len = 0.25 + maxD * 0.08, m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), shaftMat);
      m.position.set(b.x + 0.5, 0.25 - len / 2, b.y + 0.5); g.add(m);
    }
    // depth guide lines (5 m and 30 m)
    for (const [d, c] of [[5, 0xffffff], [30, 0xffd27a]]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
      pl.rotation.x = -Math.PI / 2; pl.position.set(SIZE / 2, -0.2 - d * 0.08, SIZE / 2); g.add(pl);
    }
    g.visible = this.underground;
  }

  buildOverlay(state) {
    const g = this.groups.overlay; g.clear();
    if (!state.flags.riskOverlay) return;
    const geo = new THREE.PlaneGeometry(0.96, 0.96); geo.rotateX(-Math.PI / 2);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const r = tileRisk(state, x, y, 1); if (!r) continue;
      const k = Math.min(1, r / 0.02);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.15 * (1 - k), 1, 0.5), transparent: true, opacity: 0.55, depthWrite: false }));
      m.position.set(x + 0.5, TOP(tile(state, x, y)) + 0.05, y + 0.5); g.add(m);
    }
  }

  buildDraft(state) {
    const g = this.groups.draft; g.clear();
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    for (const b of state.draft) {
      const t = tile(state, b.x >> 1, b.y >> 1);
      const m = new THREE.Mesh(geo, this.mat(BLOCKS[b.m].color, { transparent: true, opacity: 0.6 }));
      m.position.set(b.x / 2 + 0.25, TOP(t) + b.z * 0.5 + 0.25, b.y / 2 + 0.25); g.add(m);
    }
  }

  // ---------- building models ----------
  part(g, geo, color, x, y, z, rx = 0, ry = 0) {
    const m = new THREE.Mesh(geo, this.mat(color)); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }
  box(g, w, h, d, color, x = 0, y = 0, z = 0, ry = 0) { return this.part(g, new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, 0, ry); }
  roofPrism(g, w, h, d, color, y) {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); geo.translate(0, 0, -d / 2);
    return this.part(g, geo, color, 0, y, 0);
  }

  stageModel(b, stage) {
    const g = new THREE.Group(), d = BUILDINGS[b.kind], s = b.kind === 'custom' ? 1 : d.size, w = s * 0.86;
    if (b.ruin) { this.rubble(g, b); return g; }
    if (b.kind === 'custom') { this.customStage(g, b, stage); return g; }
    const H = { hut: 0.42, brickhouse: 0.6, stall: 0.4, store: 0.55, field: 0.05, granary: 0.6, woodcutter: 0.4, claypit: 0.1, quarry: 0.15, orepit: 0.1, shaft: 0.8, kiln: 0.5, smelter: 0.6, carpentry: 0.45, well: 0.3, rescue: 0.55 }[b.kind] || 0.5;
    const wallC = { hut: C.mud, brickhouse: C.brick, store: C.brick, granary: C.mud, kiln: C.clay, smelter: C.brick, rescue: C.white }[b.kind] || C.wood;
    if (stage <= 2) {
      this.box(g, w, 0.05, w, C.slab, 0, 0, 0);
      if (stage === 0) { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(g, 0.03, 0.14, 0.03, C.wood, sx * w / 2, 0.05, sz * w / 2); return g; }
      const ph = Math.max(0.25, H), pw = w * 0.42;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(g, 0.05, ph, 0.05, C.wood, sx * pw, 0.05, sz * pw);
      if (stage === 1) { this.box(g, w * 0.88, 0.04, 0.04, C.wood, 0, 0.05 + ph, -pw); this.box(g, w * 0.88, 0.04, 0.04, C.wood, 0, 0.05 + ph, pw); this.box(g, 0.04, 0.04, w * 0.88, C.wood, -pw, 0.05 + ph, 0); this.box(g, 0.04, 0.04, w * 0.88, C.wood, pw, 0.05 + ph, 0); return g; }
      this.box(g, w * 0.8, ph * 0.5, w * 0.8, wallC, 0, 0.05, 0);
      this.box(g, 0.12, 0.08, 0.12, C.wood, w * 0.3, 0.05 + ph * 0.5, w * 0.3); // materials pile
      return g;
    }
    const k = b.kind;
    if (k === 'hut') { this.part(g, new THREE.CylinderGeometry(0.28, 0.3, 0.3, 8), C.mud, 0, 0.15, 0); this.part(g, new THREE.ConeGeometry(0.38, 0.32, 8), C.thatch, 0, 0.46, 0); this.box(g, 0.1, 0.16, 0.02, C.darkwood, 0, 0, 0.29); }
    else if (k === 'brickhouse') { this.box(g, 0.7, 0.42, 0.6, C.brick); this.roofPrism(g, 0.8, 0.3, 0.68, C.roof, 0.42); this.box(g, 0.1, 0.2, 0.02, C.darkwood, 0, 0, 0.31); this.box(g, 0.12, 0.1, 0.02, 0xf5e6b0, -0.2, 0.22, 0.31); this.box(g, 0.12, 0.1, 0.02, 0xf5e6b0, 0.2, 0.22, 0.31); }
    else if (k === 'stall') { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(g, 0.04, 0.38, 0.04, C.wood, sx * 0.3, 0, sz * 0.3); this.box(g, 0.74, 0.05, 0.74, C.cloth, 0, 0.38); this.box(g, 0.6, 0.15, 0.25, C.wood, 0, 0, 0.1); this.box(g, 0.12, 0.08, 0.12, 0xe8a33d, -0.15, 0.15, 0.1); this.box(g, 0.12, 0.08, 0.12, 0x7bb661, 0.12, 0.15, 0.1); }
    else if (k === 'store') { this.box(g, 0.76, 0.5, 0.66, C.brick); this.box(g, 0.82, 0.05, 0.72, C.roof, 0, 0.5); this.box(g, 0.7, 0.03, 0.2, 0x2f7d5b, 0, 0.3, 0.42); this.box(g, 0.5, 0.2, 0.02, 0xf5e6b0, 0, 0.05, 0.34); }
    else if (k === 'field') { this.box(g, 1.85, 0.05, 1.85, C.soil); for (let i = 0; i < 6; i++) this.box(g, 1.7, 0.08, 0.1, C.crop, 0, 0.05, -0.75 + i * 0.3); }
    else if (k === 'granary') { this.part(g, new THREE.CylinderGeometry(0.3, 0.32, 0.45, 10), C.mud, 0, 0.225, 0); this.part(g, new THREE.ConeGeometry(0.4, 0.3, 10), C.roof, 0, 0.6, 0); }
    else if (k === 'woodcutter') { this.box(g, 0.45, 0.3, 0.4, C.wood, -0.1, 0, -0.1); this.roofPrism(g, 0.55, 0.18, 0.5, C.darkwood, 0.3).position.set(-0.1, 0.3, -0.1); for (let i = 0; i < 3; i++) this.part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), C.darkwood, 0.25, 0.06 + i * 0.09, 0.15 + (i % 2) * 0.05, 0, 0).rotation.x = Math.PI / 2; }
    else if (k === 'claypit' || k === 'orepit' || k === 'quarry') {
      const pc = k === 'claypit' ? C.clay : k === 'quarry' ? C.stone : 0x6f6a5c;
      this.box(g, 0.86, 0.04, 0.86, 0x6b5a46); this.box(g, 0.6, 0.03, 0.6, 0x3e3226, 0, 0.04);
      for (let i = 0; i < 3; i++) this.part(g, new THREE.DodecahedronGeometry(0.1 + i * 0.02, 0), k === 'orepit' ? (i % 2 ? C.copper : 0x8a8f96) : pc, -0.3 + i * 0.3, 0.1, 0.32);
      if (k === 'quarry') { this.box(g, 0.25, 0.2, 0.25, C.stone, -0.25, 0, -0.25); this.box(g, 0.25, 0.12, 0.25, C.stone, 0.05, 0, -0.25); }
      this.box(g, 0.03, 0.3, 0.03, C.wood, 0.35, 0, -0.35); this.box(g, 0.2, 0.03, 0.03, C.wood, 0.27, 0.3, -0.35);
    }
    else if (k === 'shaft') { for (const sx of [-1, 1]) { this.part(g, new THREE.BoxGeometry(0.05, 0.85, 0.05), C.darkwood, sx * 0.2, 0.42, 0, 0, 0).rotation.z = -sx * 0.22; } this.part(g, new THREE.TorusGeometry(0.14, 0.025, 6, 12), C.metal, 0, 0.78, 0); this.box(g, 0.35, 0.22, 0.3, C.wood, 0.2, 0, 0.25); this.box(g, 0.25, 0.04, 0.25, 0x222222, 0, 0, 0); }
    else if (k === 'kiln') { this.part(g, new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.clay, 0, 0, 0); this.box(g, 0.1, 0.35, 0.1, C.brick, 0.15, 0.15, -0.15); const glow = this.box(g, 0.12, 0.1, 0.02, 0xff8a2a, 0, 0.02, 0.29); glow.material.emissive = new THREE.Color(0xff6a00); glow.material.emissiveIntensity = 1.5; }
    else if (k === 'smelter') { this.box(g, 0.6, 0.35, 0.55, C.brick); this.box(g, 0.14, 0.75, 0.14, 0x7a3a30, 0.2, 0, -0.15); const glow = this.box(g, 0.2, 0.12, 0.02, 0xffa040, -0.1, 0.05, 0.28); glow.material.emissive = new THREE.Color(0xff7a10); glow.material.emissiveIntensity = 2; }
    else if (k === 'carpentry') { for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(g, 0.05, 0.38, 0.05, C.wood, sx * 0.32, 0, sz * 0.28); this.roofPrism(g, 0.8, 0.2, 0.7, C.darkwood, 0.38); for (let i = 0; i < 3; i++) this.box(g, 0.55, 0.05, 0.08, 0xc79a62, 0, 0.05 * i, -0.1 + i * 0.1); }
    else if (k === 'well') { this.part(g, new THREE.CylinderGeometry(0.2, 0.22, 0.18, 10), C.stone, 0, 0.09, 0); this.part(g, new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10), 0x3a78a8, 0, 0.17, 0); for (const sx of [-1, 1]) this.box(g, 0.03, 0.38, 0.03, C.wood, sx * 0.18, 0, 0); this.roofPrism(g, 0.5, 0.14, 0.3, C.darkwood, 0.38); }
    else if (k === 'rescue') { this.box(g, 0.7, 0.36, 0.55, C.white, 0, 0, -0.1); this.roofPrism(g, 0.78, 0.22, 0.62, C.red, 0.36).position.z = -0.1; this.box(g, 0.025, 0.7, 0.025, C.metal, 0.35, 0, 0.28); this.box(g, 0.16, 0.1, 0.01, C.red, 0.43, 0.58, 0.28); this.box(g, 0.2, 0.16, 0.02, C.red, 0, 0.12, 0.19); }
    return g;
  }
  customStage(g, b, stage) {
    const st = this.state, geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const maxZ = Math.max(...b.blocks.map(k => k.z));
    const base = (bl) => TOP(tile(st, bl.x >> 1, bl.y >> 1)) - TOP(tile(st, b.tiles[0][0], b.tiles[0][1]));
    if (stage === 0) { for (const [tx, ty] of b.tiles) { const m = this.box(g, 0.9, 0.05, 0.9, C.slab); m.position.x = tx - b.tiles[0][0]; m.position.z = ty - b.tiles[0][1]; } return; }
    const cols = new Map(); for (const bl of b.blocks) { const k = bl.x + ',' + bl.y; cols.set(k, Math.max(cols.get(k) ?? -1, bl.z)); }
    const ox = b.tiles[0][0], oy = b.tiles[0][1];
    if (stage === 1) {
      for (const [k, top] of cols) { const [sx, sy] = k.split(',').map(Number); const m = this.box(g, 0.06, (top + 1) * 0.5, 0.06, C.wood); m.position.x = sx / 2 + 0.25 - ox - 0.5; m.position.z = sy / 2 + 0.25 - oy - 0.5; }
      return;
    }
    const lim = stage === 2 ? Math.ceil((maxZ + 1) / 2) : 99;
    for (const bl of b.blocks) if (bl.z < lim) {
      const m = this.part(g, geo, BLOCKS[bl.m].color, bl.x / 2 + 0.25 - ox - 0.5, base(bl) + bl.z * 0.5 + 0.25, bl.y / 2 + 0.25 - oy - 0.5);
    }
  }
  rubble(g, b) {
    const n = b.tiles.length * 7;
    for (let i = 0; i < n; i++) {
      const [tx, ty] = b.tiles[i % b.tiles.length];
      const m = this.part(g, new THREE.DodecahedronGeometry(0.06 + h01(b.id, i, 1) * 0.1, 0), [0x8a7f72, 0x6e655a, 0xa58f74, 0x5b4a3a][i % 4],
        tx - b.tiles[0][0] + (h01(b.id, i, 2) - 0.5) * 0.7, 0.04, ty - b.tiles[0][1] + (h01(b.id, i, 3) - 0.5) * 0.7);
      m.rotation.set(h01(b.id, i, 4) * 3, h01(b.id, i, 5) * 3, 0);
    }
    this.box(g, b.tiles.length > 1 ? 1.6 : 0.85, 0.03, b.tiles.length > 1 ? 1.6 : 0.85, 0x4b3d30, 0, -0.06, 0).position.y = -0.04; // sunken ground
  }

  setOpacity(group, op) {
    group.visible = op > 0.001;
    group.traverse(o => { if (o.material) { o.material.transparent = op < 0.999; o.material.opacity = op; o.material.depthWrite = op > 0.5; } });
  }

  syncBuildings(state, dt, speed) {
    const seen = new Set();
    for (const b of Object.values(state.buildings)) {
      seen.add(b.id);
      let v = this.bvis.get(b.id);
      const target = b.ruin ? 4 : stageOf(b);
      if (!v) {
        v = { root: new THREE.Group(), stages: {}, vis: target, fade: null };
        const t0 = tile(state, b.tiles[0][0], b.tiles[0][1]);
        const s = b.kind === 'custom' ? 1 : BUILDINGS[b.kind].size;
        v.root.position.set(b.tiles[0][0] + (b.kind === 'custom' ? 0.5 : s / 2), TOP(t0), b.tiles[0][1] + (b.kind === 'custom' ? 0.5 : s / 2));
        v.root.rotation.y = (b.rot || 0) * Math.PI / 2;
        v.root.userData.bid = b.id;
        this.groups.buildings.add(v.root); this.bvis.set(b.id, v);
        this.ensureStage(v, b, target); this.setOpacity(v.stages[target], 1);
      }
      if (!v.fade && v.vis !== target) {
        // chain through stages one at a time so nothing pops in; quick when skipping
        const next = target === 4 ? 4 : Math.min(target, v.vis + 1);
        const gap = target === 4 ? 1 : target - v.vis;
        const base = Math.max(0.35, Math.min(1.6, 1.6 / Math.sqrt(Math.max(1, speed / 2))));
        this.ensureStage(v, b, next);
        v.fade = { from: v.vis, to: next, t: 0, dur: gap > 1 ? 0.35 : (target === 4 ? 0.6 : base) };
      }
      if (v.fade) {
        v.fade.t += dt; const k = Math.min(1, v.fade.t / v.fade.dur), e = k * k * (3 - 2 * k);
        this.setOpacity(v.stages[v.fade.from], 1 - e); this.setOpacity(v.stages[v.fade.to], e);
        if (k >= 1) { this.setOpacity(v.stages[v.fade.from], 0); v.vis = v.fade.to; v.fade = null; }
      }
      v.root.visible = !this.underground || b.kind === 'shaft';
    }
    for (const [id, v] of this.bvis) if (!seen.has(id)) { this.groups.buildings.remove(v.root); this.bvis.delete(id); }
  }
  ensureStage(v, b, s) {
    if (v.stages[s]) return;
    const g = this.stageModel(b, s === 4 ? 3 : s); if (s === 4) { g.clear(); this.rubble(g, b); }
    this.setOpacity(g, 0); v.stages[s] = g; v.root.add(g);
  }

  // ---------- vehicles ----------
  vehicleModel(task) {
    const g = new THREE.Group();
    const bodyC = task === 'rescue' ? 0xf2efe6 : 0x9c6b3e, trimC = task === 'rescue' ? 0xc0392b : 0xe08a2a;
    this.box(g, 0.2, 0.1, 0.32, bodyC, 0, 0.08, -0.08);
    this.box(g, 0.21, 0.025, 0.33, trimC, 0, 0.18, -0.08);
    if (task === 'cleanup') this.part(g, new THREE.DodecahedronGeometry(0.07, 0), 0x7a6e60, 0, 0.22, -0.08);
    for (const [sx, sz] of [[-1, -0.18], [1, -0.18], [-1, 0.02], [1, 0.02]]) { const w = this.part(g, new THREE.CylinderGeometry(0.05, 0.05, 0.025, 10), 0x3a2a1c, sx * 0.11, 0.05, sz); w.rotation.z = Math.PI / 2; }
    // horse
    this.box(g, 0.08, 0.09, 0.2, 0x6b4a2e, 0, 0.1, 0.2); this.box(g, 0.06, 0.08, 0.08, 0x5a3d25, 0, 0.17, 0.32);
    for (const [sx, sz] of [[-1, 0.13], [1, 0.13], [-1, 0.27], [1, 0.27]]) this.box(g, 0.02, 0.1, 0.02, 0x4a3220, sx * 0.03, 0, sz);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc040, emissiveIntensity: 3 }));
    lamp.position.set(0.1, 0.24, 0.06); g.add(lamp); g.userData.lamp = lamp;
    g.scale.setScalar(1.6);
    return g;
  }
  syncVehicles(state, frac, dt) {
    const seen = new Set();
    for (const c of state.crews) {
      if (c.state === 'idle' || !c.path) continue;
      seen.add(c.id);
      let v = this.vvis.get(c.id);
      const key = c.state + c.path.join(';');
      if (!v || v.task !== c.task) { if (v) this.groups.vehicles.remove(v.root); v = { root: this.vehicleModel(c.task || 'rescue'), task: c.task, key: '' }; this.groups.vehicles.add(v.root); this.vvis.set(c.id, v); }
      if (v.key !== key) {
        v.key = key;
        const pts = c.path.map(([x, y]) => new THREE.Vector3(x + 0.5, TOP(tile(state, x, y)) + 0.03, y + 0.5));
        v.curve = pts.length > 1 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : null; v.p0 = pts[0]; v.len = pts.length;
      }
      const moving = c.state === 'out' || c.state === 'back';
      const pos = Math.min(v.len - 1, c.pos + (moving ? CREW_SPEED * frac : 0));
      if (v.curve) {
        const u = Math.max(0, Math.min(1, pos / (v.len - 1)));
        const p = v.curve.getPoint(u), tg = v.curve.getTangent(Math.min(0.999, Math.max(0.001, u)));
        v.root.position.copy(p);
        const yaw = Math.atan2(tg.x, tg.z);
        let dy = yaw - v.root.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        v.root.rotation.y += dy * Math.min(1, dt * 10);
        if (moving) v.root.position.y += Math.abs(Math.sin(this.clock * 14)) * 0.012;
      } else v.root.position.copy(v.p0);
      v.root.userData.lamp.material.emissiveIntensity = 2.5 + Math.sin(this.clock * (c.task === 'rescue' ? 12 : 3)) * 1.5;
      v.root.visible = !this.underground;
    }
    for (const [id, v] of this.vvis) if (!seen.has(id)) { this.groups.vehicles.remove(v.root); this.vvis.delete(id); }
  }

  // ---------- ghost / picking / camera ----------
  setGhost(g) {
    const grp = this.groups.ghost; grp.clear(); if (!g || !this.state) return;
    const t = tile(this.state, g.x, g.y); if (!t) return;
    const s = g.size || 1, h = g.h || 0.5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(g.block ? 0.5 : s * 0.95, h, g.block ? 0.5 : s * 0.95), new THREE.MeshBasicMaterial({ color: g.ok ? 0x4ade80 : 0xef4444, transparent: true, opacity: 0.45, depthWrite: false }));
    if (g.block) m.position.set(g.sx / 2 + 0.25, TOP(t) + g.z * 0.5 + 0.25, g.sy / 2 + 0.25);
    else m.position.set(g.x + s / 2, TOP(t) + h / 2, g.y + s / 2);
    grp.add(m);
  }
  pick(clientX, clientY) {
    if (!this.terrainMesh) return null;
    const rect = this.r.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.cam);
    const hit = this.raycaster.intersectObject(this.terrainMesh, false)[0];
    if (!hit) return null;
    const idx = hit.instanceId, x = idx % SIZE, y = Math.floor(idx / SIZE);
    const sx = Math.max(x * 2, Math.min(x * 2 + 1, Math.floor(hit.point.x * 2))), sy = Math.max(y * 2, Math.min(y * 2 + 1, Math.floor(hit.point.z * 2)));
    return { x, y, sx, sy };
  }
  setUnderground(on) { this.underground = on; this.applyUnderground(); }
  applyUnderground() {
    const on = this.underground;
    if (this.terrainMat) { this.terrainMat.transparent = on; this.terrainMat.opacity = on ? 0.16 : 1; this.terrainMat.depthWrite = !on; this.terrainMat.needsUpdate = true; }
    this.groups.trees.visible = !on; this.groups.roads.visible = !on; this.groups.under.visible = on;
    this.scene.background.setHex(on ? 0x1e1a17 : 0xbcd7e8);
  }
  rotate(dir) { this.angleTarget += dir * Math.PI / 2; }
  pan(dx, dz) {
    const a = this.angle + Math.PI / 4;
    const fx = -Math.cos(a), fz = -Math.sin(a), rx = -fz, rz = fx;
    this.target.x = Math.max(0, Math.min(SIZE, this.target.x + rx * dx + fx * dz));
    this.target.z = Math.max(0, Math.min(SIZE, this.target.z + rz * dx + fz * dz));
  }
  updateCamera(dt) {
    this.angle += (this.angleTarget - this.angle) * Math.min(1, dt * 8);
    const a = this.angle + Math.PI / 4, el = Math.atan(1 / Math.SQRT2), dist = 80;
    this.cam.position.set(this.target.x + Math.cos(a) * Math.cos(el) * dist, Math.sin(el) * dist, this.target.z + Math.sin(a) * Math.cos(el) * dist);
    this.cam.lookAt(this.target);
    const half = 12 / this.zoom;
    Object.assign(this.cam, { left: -half * this.aspect, right: half * this.aspect, top: half, bottom: -half });
    this.cam.updateProjectionMatrix();
    this.sun.position.set(this.target.x + 30, 50, this.target.z + 18); this.sun.target.position.copy(this.target);
  }

  // ---------- per frame ----------
  frame(state, frac, dt, speed) {
    this.clock += dt;
    const d = state.dirty || {};
    if (d.all) { this.buildTerrain(state); this.buildTrees(state); this.buildRoads(state); this.buildUnder(state); this.buildOverlay(state); this.buildDraft(state);
      for (const v of this.bvis.values()) this.groups.buildings.remove(v.root); this.bvis.clear(); }
    else {
      if (d.terrain) this.buildTerrain(state);
      if (d.trees) this.buildTrees(state);
      if (d.roads) this.buildRoads(state);
      if (d.under || d.buildings) this.buildUnder(state);
      if (d.overlay || (d.buildings && state.flags.riskOverlay)) this.buildOverlay(state);
      if (d.draft) this.buildDraft(state);
    }
    state.dirty = {};
    this.syncBuildings(state, dt, speed);
    this.syncVehicles(state, frac, dt);
    // soft day/night: gentle, keeps readability
    const hour = (state.tick % HOURS_PER_DAY) + frac, day = 0.5 - 0.5 * Math.cos((hour - 2) / 24 * Math.PI * 2);
    this.sun.intensity = this.underground ? 0.6 : 0.9 + 1.7 * day;
    this.hemi.intensity = this.underground ? 1.6 : 0.9 + 0.6 * day;
    this.updateCamera(dt);
    this.r.render(this.scene, this.cam);
  }
}
