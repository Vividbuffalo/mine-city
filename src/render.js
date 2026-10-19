// EARTH renderer (Three.js). Reads sim state, never mutates it.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from '../vendor/addons/postprocessing/GTAOPass.js';
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from '../vendor/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { tile, SIZE, T, stageOf, tileRisk, CREW_SPEED, saplingStage, knownDeposit } from './sim.js';
import { DEPOSITS, BLOCKS, HOURS_PER_DAY, SAPLING, BUILDINGS } from './data.js';
import { buildModel } from './models.js';
import { ANIMALS } from './animals.js';
import { TOWN_KINDS } from './towns.js';

const TOP = (t) => t.t === T.WATER ? 0.08 : t.t === T.HILL ? 0.25 + 0.28 * t.h : 0.25;
export const tileTop = TOP;
const WATER_Y = 0.13;
const AUTUMN = [0xd9a520, 0xe0862a, 0xc9b23a, 0xb8642a].map(c => new THREE.Color(c));
const CH = 16; let NCH = SIZE / CH; // LOD chunks (match sim chunks); NCH follows the world size
const chunkOf = (x, z) => Math.max(0, Math.min(NCH - 1, Math.floor(z / CH))) * NCH + Math.max(0, Math.min(NCH - 1, Math.floor(x / CH)));
function h01(x, y, s) { let h = (s ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h % 10000) / 10000; }
function vnoise(x, y, s) { const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = h01(x0, y0, s), b = h01(x0 + 1, y0, s), c = h01(x0, y0 + 1, s), d = h01(x0 + 1, y0 + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const QUALITY = {
  // LOD knobs: bPx/treePx/grassPx/terrPx = on-screen pixels per world unit needed for full detail;
  // near = full-detail radius around the camera focus, as a multiple of the visible half-height; shadowDist = shadow range (world units)
  // v3 tiers: the old High look is the new Low; Medium/High add the painterly grade, terrain colour variation, shore water and fall forests.
  // grade = colour-grade strength (0 = off), art = painterly terrain/forest colouring, water2 = depth-tinted water with shore foam, tilt = tilt-shift blur
  potato: { name: 'Potato', hidden: true, pr: 0.75, shadows: 0, post: false, ao: false, grass: 0, rocks: 0, smoke: 0.25, msaa: false, bPx: 48, treePx: 56, grassPx: 999, terrPx: 40, near: 0.9, grassNear: 0, shadowDist: 0, haze: 0.3, warm: 0, grade: 0, art: false, water2: false, tilt: 0 },
  low:    { name: 'Low', pr: 1.5, shadows: 2048, post: true, ao: false, grass: 4, rocks: 3, smoke: 1, msaa: true, bPx: 18, treePx: 22, grassPx: 26, terrPx: 14, near: 1.7, grassNear: 1.3, shadowDist: 40, haze: 0.55, warm: 1, grade: 0, art: false, water2: false, tilt: 0 },
  medium: { name: 'Medium', pr: 1.75, shadows: 4096, post: true, ao: true, grass: 5, rocks: 3, smoke: 1.5, msaa: true, bPx: 16, treePx: 18, grassPx: 24, terrPx: 12, near: 2.0, grassNear: 1.6, shadowDist: 48, haze: 0.6, warm: 1, grade: 1, art: true, water2: true, tilt: 0 },
  high:   { name: 'High', pr: 2, shadows: 4096, post: true, ao: true, grass: 7, rocks: 4, smoke: 1.5, msaa: true, bPx: 14, treePx: 16, grassPx: 20, terrPx: 10, near: 2.4, grassNear: 2.0, shadowDist: 60, haze: 0.65, warm: 1, grade: 1.25, art: true, water2: true, tilt: 1 },
};
export const QUALITY_ORDER = ['potato', 'low', 'medium', 'high'];
// painterly colour grade: saturation, warm highlights / cool shadows, soft vignette, optional tilt-shift; NaN-safe
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.15 }, uWarm: { value: 1 }, uVig: { value: 0.35 }, uTilt: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uWarm, uVig, uTilt; uniform vec2 uRes; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (uTilt > 0.0) { float b = smoothstep(0.45, 1.0, abs(vUv.y - 0.5) * 2.0) * uTilt;
        if (b > 0.01) { vec2 p = b * 2.2 / uRes; vec4 a = c;
          a += texture2D(tDiffuse, vUv + vec2(p.x, 0.0)); a += texture2D(tDiffuse, vUv - vec2(p.x, 0.0)); a += texture2D(tDiffuse, vUv + vec2(0.0, p.y)); a += texture2D(tDiffuse, vUv - vec2(0.0, p.y));
          a += texture2D(tDiffuse, vUv + p); a += texture2D(tDiffuse, vUv - p); a += texture2D(tDiffuse, vUv + vec2(p.x, -p.y)); a += texture2D(tDiffuse, vUv + vec2(-p.x, p.y)); c = a / 9.0; } }
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, uSat), 0.0);
      float t = smoothstep(0.03, 0.8, l);
      c.rgb *= mix(vec3(1.0), mix(vec3(0.93, 0.98, 1.07), vec3(1.07, 1.01, 0.9), t), uWarm);
      vec2 q = vUv - 0.5; c.rgb *= 1.0 - uVig * dot(q, q) * 1.5;
      if (any(isnan(c.rgb)) || any(isinf(c.rgb))) c.rgb = vec3(0.0);
      gl_FragColor = c;
    }`,
};
// flat-shaded normals from screen derivatives are NaN on zero-area fragments (bloom then spreads black squares): guard them
THREE.ShaderChunk.normal_fragment_begin = THREE.ShaderChunk.normal_fragment_begin.replace('vec3 normal = normalize( cross( fdx, fdy ) );', 'vec3 nC = cross( fdx, fdy ); vec3 normal = dot( nC, nC ) > 1e-24 ? normalize( nC ) : vec3( 0.0, 0.0, 1.0 );');


export class Renderer {
  constructor(canvas, quality = 'medium') {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.0;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.skyTex = this.makeSky(false); this.skyUnder = this.makeSky(true);
    this.scene.background = this.skyTex;
    this.scene.fog = new THREE.Fog(0xc6d8e6, 95, 170);
    const pm = new THREE.PMREMGenerator(this.r); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; this.scene.environmentIntensity = 0.28;
    this.cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 300);
    this.target = new THREE.Vector3(32, 0, 32); this.angle = 0; this.angleTarget = 0; this.zoom = 1.3; this.autoOrbit = false;
    this.hemi = new THREE.HemisphereLight(0xdcecff, 0x6b7a4a, 1.1); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    Object.assign(this.sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03; this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.groups = {};
    for (const k of ['terrain', 'earth', 'water', 'trees', 'grass', 'berries', 'roads', 'buildings', 'proxies', 'units', 'under', 'overlay', 'vehicles', 'trains', 'draft', 'ghost', 'fx', 'workers', 'animals', 'towns']) { this.groups[k] = new THREE.Group(); this.scene.add(this.groups[k]); }
    this.bvis = new Map(); this.vvis = new Map(); this.uvis = new Map(); this.selUnit = null; this.windowMats = new Set();
    this.underground = false; this.clock = 0; this.night = 0;
    this.uTime = { value: 0 }; this.initFog();
    this.raycaster = new THREE.Raycaster();
    this.initWater(); this.initParticles();
    this.proxyDirty = new Set(); this.proxyMeshes = new Map(); this.proxyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    this.lodStats = {}; this.treeChunks = []; this.grassChunks = []; this.terrChunks = [];
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.setQuality(quality);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ---------- setup ----------
  makeSky(under) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    if (under) { gr.addColorStop(0, '#2a241f'); gr.addColorStop(1, '#141110'); }
    else { gr.addColorStop(0, '#7fb2dc'); gr.addColorStop(0.55, '#b9d6ea'); gr.addColorStop(1, '#e8eee9'); }
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  setQuality(q) {
    const prevArt = this.q ? this.q.art : null;
    this.qKey = QUALITY[q] ? q : 'medium'; this.q = QUALITY[this.qKey];
    if (this.uWater2) this.uWater2.value = this.q.water2 ? 1 : 0;
    this.r.setPixelRatio(Math.min(this.q.pr, window.devicePixelRatio || 1));
    this.r.shadowMap.enabled = this.q.shadows > 0; this.sun.castShadow = this.q.shadows > 0;
    if (this.q.shadows) { this.sun.shadow.mapSize.set(this.q.shadows, this.q.shadows); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
    this.composer = null;
    if (this.q.post) {
      const size = this.r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.q.msaa ? 4 : 0 });
      this.composer = new EffectComposer(this.r, rt);
      this.composer.addPass(new RenderPass(this.scene, this.cam));
      if (this.q.ao) { this.ao = new GTAOPass(this.scene, this.cam, size.x, size.y); this.ao.blendIntensity = 0.75; this.ao.normalMaterial = this.fogify(this.ao.normalMaterial, 'cut'); /* no AO from things hidden in the fog */ this.ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 }); this.composer.addPass(this.ao); }
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.45, 0.88); this.composer.addPass(this.bloom);
      this.grade = null; if (this.q.grade) { this.grade = new ShaderPass(GradeShader); const u = this.grade.uniforms; u.uSat.value = 1 + 0.06 * this.q.grade; u.uWarm.value = 1.0 * this.q.grade; u.uVig.value = 0.3 * this.q.grade; u.uTilt.value = this.q.tilt; u.uRes.value.set(size.x, size.y); this.composer.addPass(this.grade); }
      this.composer.addPass(new OutputPass());
    }
    if (this.state) { this.state.dirty = this.state.dirty || {}; this.state.dirty.grass = true; if (prevArt !== null && prevArt !== this.q.art) this.state.dirty.terrain = true; }
    if (this.impostors) for (const k in this.impostors) this.impostors[k].mat.color.setScalar(this.q.art ? 1.35 : 1);
    this.lodForce = true; for (const v of this.bvis.values()) v.lod = -1;
    this.resize();
  }
  resize() {
    const c = this.canvas; this.r.setSize(c.clientWidth, c.clientHeight, false); this.aspect = c.clientWidth / Math.max(1, c.clientHeight);
    if (this.composer) { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(c.clientWidth, c.clientHeight); }
    if (this.grade) this.grade.uniforms.uRes.value.copy(this.r.getDrawingBufferSize(new THREE.Vector2()));
  }
  setState(state) {
    this.state = state;
    if (this.worldSize !== SIZE) this.resizeWorld();
    for (const v of this.bvis.values()) this.groups.buildings.remove(v.root);
    this.bvis.clear(); this.windowMats.clear(); this.clearProxies();
    for (const v of this.vvis.values()) this.groups.vehicles.remove(v.root);
    this.vvis.clear(); this.particles.length = 0;
    for (const v of this.uvis.values()) this.groups.units.remove(v.root); this.uvis.clear();
    state.dirty = { all: true };
    this.target.set(state.start.x + 0.5, 0, state.start.y + 0.5);
  }

  // world size changed (new game / loaded save): fog texture, water plane and chunk count follow it
  resizeWorld() {
    NCH = SIZE / CH; this.worldSize = SIZE; this.seenKey = null;
    const old = this.fogTex; this.fogData = new Uint8Array(SIZE * SIZE * 4); this.fogCur = new Float32Array(SIZE * SIZE); this.fogTgt = new Uint8Array(SIZE * SIZE);
    this.fogTex = new THREE.DataTexture(this.fogData, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType); this.fogTex.magFilter = this.fogTex.minFilter = THREE.LinearFilter; this.fogTex.generateMipmaps = false; this.fogTex.needsUpdate = true;
    this.uFog.value = this.fogTex; this.uFogSize.value = SIZE; if (old) old.dispose();
    for (const w of this.groups.water.children) { w.geometry.dispose(); w.geometry = new THREE.PlaneGeometry(SIZE, SIZE); w.position.set(SIZE / 2, WATER_Y, SIZE / 2); if (w.material.normalMap) w.material.normalMap.repeat.set(SIZE / 4, SIZE / 4); }
  }
  // streaming: only explored chunks (and their neighbours) get full terrain, trees and grass; the rest is a coarse fogged slab
  computeSeen(state) {
    const seen = new Uint8Array(NCH * NCH);
    const M = 3; // a chunk streams in when an explored tile is inside it or within M tiles of its edge
    for (let cy = 0; cy < NCH; cy++) for (let cx = 0; cx < NCH; cx++) { let any = false;
      for (let y = Math.max(0, cy * CH - M); y < Math.min(SIZE, (cy + 1) * CH + M) && !any; y++) for (let x = Math.max(0, cx * CH - M); x < Math.min(SIZE, (cx + 1) * CH + M); x++) if (tile(state, x, y).vis) { any = true; break; }
      if (any) seen[cy * NCH + cx] = 1; }
    return seen;
  }
  seenAt(x, y) { return !this.seen || this.seen[chunkOf(x, y)] === 1; }
  // ---------- terrain ----------
  computeTops(state) {
    const tops = new Float32Array(SIZE * SIZE), vis = new Uint8Array(SIZE * SIZE), typ = new Uint8Array(SIZE * SIZE), lvA = new Uint8Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const t = tile(state, x, y), i = y * SIZE + x; vis[i] = t.vis; typ[i] = t.t; lvA[i] = t.lv ? 1 : 0; tops[i] = t.t === T.WATER ? (t.wd === 0 ? 0.045 : t.wd === 1 ? 0.025 : -0.03) : TOP(t); }
    // visual relief: interior of high ground rises into peaks (snow-capped at the top); edges stay at sim height
    const rel = new Float32Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const i = y * SIZE + x; if (typ[i] !== T.HILL || lvA[i]) continue; // terraced tiles stay flat
      let n = 0, tot = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= SIZE || yy >= SIZE) continue; tot++; if (typ[yy * SIZE + xx] === T.HILL) n++; }
      const f = Math.max(0, (n / tot - 0.55) / 0.45); const pk = vnoise(x * 0.55, y * 0.55, 11); rel[i] = f * f * (0.15 + 1.1 * pk * pk) * (tops[i] > 0.6 ? 1.3 : 0.6); tops[i] += rel[i]; }
    this.relief = rel;
    this.tops = tops; this.tvis = vis; this.ttyp = typ;
  }
  // smooth plateau terrain: flat near tile centers, slopes in the middle third between centers
  topXY(x, y) { x = Math.max(0, Math.min(SIZE - 1, x)); y = Math.max(0, Math.min(SIZE - 1, y)); if (!this.tops) return TOP(tile(this.state, x, y)); const i = y * SIZE + x; return this.ttyp[i] === T.WATER ? 0.08 : this.tops[i]; }
  heightAt(u, v) {
    const fx = u - 0.5, fy = v - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy);
    const sx = sstep(0.3, 0.7, fx - x0), sy = sstep(0.3, 0.7, fy - y0);
    const g = (x, y) => this.tops[Math.max(0, Math.min(SIZE - 1, y)) * SIZE + Math.max(0, Math.min(SIZE - 1, x))];
    const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  buildTerrain(state) {
    this.computeTops(state); this.seen = this.computeSeen(state); this.seenKey = this.seen.join('');
    const g = this.groups.terrain;
    const R = 4, N = SIZE * R + 1, pos = new Float32Array(N * N * 3), col = new Float32Array(N * N * 3);
    const C = { snow: new THREE.Color(0xf2f4f6), rockHi: new THREE.Color(0x626166), dry: new THREE.Color(0xb3b866), terr: new THREE.Color(0x8f9a55), lush: new THREE.Color(0x5f9a45), grass: new THREE.Color(0x7fb35e), grass2: new THREE.Color(0x9bc46a), forest: new THREE.Color(0x5d8f48), hill: new THREE.Color(0x8d8a6c), rock: new THREE.Color(0x76736b), sand: new THREE.Color(0xd8c99a), bed: new THREE.Color(0x6f6a52), gold: new THREE.Color(0xc4ad55), olive: new THREE.Color(0x76883c), bank: new THREE.Color(0x4f8a3a), dark: new THREE.Color(0x3a4550), clay: new THREE.Color(0xb48a5e), cu: new THREE.Color(0x5fa88a) };
    const tmp = new THREE.Color(), acc = new THREE.Color();
    const tileCol = (x, y, out) => {
      x = Math.max(0, Math.min(SIZE - 1, x)); y = Math.max(0, Math.min(SIZE - 1, y));
      const t = tile(state, x, y);
      if (t.t === T.WATER) return t.wd === 0 ? out.copy(C.sand).lerp(C.bed, 0.25) : t.wd === 1 ? out.copy(C.bed).lerp(C.sand, 0.45) : out.copy(C.bed);
      if (t.t === T.HILL && t.lv) { out.copy(C.terr); return out; }
      if (t.t === T.HILL) out.copy(C.hill).lerp(C.rock, t.h > 1 ? 0.45 : 0.1); else if (t.t === T.FOREST) out.copy(C.forest); else out.copy(C.grass);
      if (t.dep && t.dep.r === 'clay' && t.dep.depth <= 2) out.lerp(C.clay, 0.22);
      if (t.dep && t.dep.r === 'copper' && t.dep.depth <= 5 && t.t === T.HILL) out.lerp(C.cu, 0.2);
      return out;
    };
    const CR = CH * R, need = (i, j) => { if (i % 4 === 0 && j % 4 === 0) return true; const a0 = Math.min(NCH - 1, Math.floor(i / CR)), a1 = Math.max(0, Math.floor((i - 1) / CR)), b0 = Math.min(NCH - 1, Math.floor(j / CR)), b1 = Math.max(0, Math.floor((j - 1) / CR)); return this.seen[b0 * NCH + a0] || this.seen[b0 * NCH + a1] || this.seen[b1 * NCH + a0] || this.seen[b1 * NCH + a1]; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!need(i, j)) continue;
      const u = i / R, v = j / R, k = (j * N + i) * 3;
      let h = this.heightAt(u, v);
      const n = vnoise(u * 1.3, v * 1.3, 7) - 0.5, n2 = vnoise(u * 4, v * 4, 9) - 0.5;
      // colour: blend 4 nearest tiles (bilinear), with noise and slope/shore tints
      const fx = u - 0.5, fy = v - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      acc.setRGB(0, 0, 0);
      for (const [dx, dy, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) { tileCol(x0 + dx, y0 + dy, tmp); acc.r += tmp.r * w; acc.g += tmp.g * w; acc.b += tmp.b * w; }
      const tIdx = Math.max(0, Math.min(SIZE - 1, Math.floor(v))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(u)));
      const visHere = 1; // fog of war is applied on the GPU (fog texture), geometry never depends on it
      if (visHere) {
        if (this.ttyp[tIdx] === 0 || this.ttyp[tIdx] === 1) { acc.lerp(C.grass2, Math.max(0, n * 0.9)); const m = vnoise(u * 0.11, v * 0.11, 23); acc.lerp(m > 0.5 ? C.dry : C.lush, Math.min(0.55, Math.abs(m - 0.5) * 1.6)); }
        if (h > 0.6) acc.lerp(C.rockHi, Math.min(0.85, (h - 0.6) * 2.6));
        if (h > 1.38 + n * 0.15) acc.lerp(C.snow, Math.min(1, (h - 1.38 - n * 0.15) * 6));
        if (h < WATER_Y + 0.07 && h > WATER_Y - 0.03) acc.lerp(C.sand, 0.55);
        if (h < 0.0) acc.lerp(C.bed, 0.6);
        h += n2 * (this.ttyp[tIdx] === 2 ? 0.03 : 0.012);
      }
      if (visHere && this.q.art) { // painterly: broad meadow/gold/olive patches, banded rock, greener banks
        const ty = this.ttyp[tIdx], m2 = vnoise(u * 0.05, v * 0.05, 41), m3 = vnoise(u * 0.18, v * 0.18, 43);
        if (ty === 0 || ty === 1) { acc.lerp(m2 > 0.5 ? C.gold : C.olive, Math.min(0.6, Math.abs(m2 - 0.5) * 1.9)); acc.offsetHSL(-0.012 + (m3 - 0.5) * 0.02, -0.04, (m3 - 0.5) * 0.06); }
        else if (ty === 2) { acc.offsetHSL(0, -0.02, (vnoise(u * 0.4, h * 9, 47) - 0.5) * 0.1); }
        if (h < WATER_Y + 0.16 && h > WATER_Y + 0.05) acc.lerp(C.bank, 0.35);
      }
      if (visHere) acc.offsetHSL(0, 0, n2 * 0.05);
      pos[k] = u; pos[k + 1] = h; pos[k + 2] = v; col[k] = acc.r; col[k + 1] = acc.g; col[k + 2] = acc.b;
    }
    // chunked terrain: each 16x16 chunk has a full-res mesh (R=4 per tile) and a half-res LOD mesh (R=2),
    // both sampled from the same grid so shared edges line up; a short skirt hides any LOD seam.
    if (!this.terrainMat) this.terrainMat = this.fogify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), 'ground');
    const old = [...g.children]; this.terrChunks = []; // double-buffered: new chunks are built before the old ones are dropped
    const chunkGeo = (cx, cy, step) => {
      const i0 = cx * CH * R, j0 = cy * CH * R, n = CH * R / step + 1, P = [], Cc = [], I = [];
      const vid = (a, b) => ((j0 + b * step) * N + (i0 + a * step));
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) { const k = vid(a, b) * 3; P.push(pos[k], pos[k + 1], pos[k + 2]); Cc.push(col[k], col[k + 1], col[k + 2]); }
      for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) { const q0 = b * n + a, q1 = q0 + 1, q2 = q0 + n, q3 = q2 + 1; if ((a + b) % 2) I.push(q0, q2, q1, q1, q2, q3); else I.push(q0, q2, q3, q0, q3, q1); }
      const edge = []; for (let a = 0; a < n; a++) edge.push(a); for (let b = 1; b < n; b++) edge.push(b * n + n - 1); for (let a = n - 2; a >= 0; a--) edge.push((n - 1) * n + a); for (let b = n - 2; b > 0; b--) edge.push(b * n); edge.push(0);
      const top0 = P.length / 3; edge.forEach(e => { P.push(P[e * 3], P[e * 3 + 1] - 0.01, P[e * 3 + 2]); Cc.push(Cc[e * 3], Cc[e * 3 + 1], Cc[e * 3 + 2]); });
      const base = P.length / 3; edge.forEach(e => { P.push(P[e * 3], P[e * 3 + 1] - 0.18, P[e * 3 + 2]); Cc.push(Cc[e * 3], Cc[e * 3 + 1], Cc[e * 3 + 2]); });
      for (let k = 0; k < edge.length - 1; k++) { const a = top0 + k, b = top0 + k + 1, a2 = base + k, b2 = base + k + 1; I.push(a, b, a2, b, b2, a2, a, a2, b, b, a2, b2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3)); geo.setIndex(I); geo.computeVertexNormals(); geo.computeBoundingSphere();
      return geo;
    };
    for (let cy = 0; cy < NCH; cy++) for (let cx = 0; cx < NCH; cx++) {
      if (!this.seen[cy * NCH + cx]) { const lo = new THREE.Mesh(chunkGeo(cx, cy, 4), this.terrainMat); lo.receiveShadow = true; g.add(lo); this.terrChunks.push({ cx, cy, hi: new THREE.Object3D(), lo, lod: 1, coarse: true }); continue; }
      const hi = new THREE.Mesh(chunkGeo(cx, cy, 1), this.terrainMat), lo = new THREE.Mesh(chunkGeo(cx, cy, 2), this.terrainMat);
      hi.receiveShadow = lo.receiveShadow = true; lo.visible = false; g.add(hi, lo);
      this.terrChunks.push({ cx, cy, hi, lo, lod: 0 });
    }
    // skirt so the map edge reads as a slab of earth
    if (!this.skirtMat) this.skirtMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }), 'ground');
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 1.2, SIZE), this.skirtMat); skirt.position.set(SIZE / 2, -0.62, SIZE / 2); g.add(skirt); this.skirt = skirt;
    { // shore distance for the v3 water (1 next to land, fading over ~3 tiles)
      const D = new Uint8Array(SIZE * SIZE * 4);
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const t = tile(state, x, y); let v = 0; if (t.t === T.WATER) { let dm = 9; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const n = tile(state, x + dx, y + dy); if (n && n.t !== T.WATER) dm = Math.min(dm, Math.hypot(dx, dy)); } v = Math.max(0, 1 - (dm - 0.5) / 3); } else v = 1; const i = (y * SIZE + x) * 4; D[i] = D[i + 1] = D[i + 2] = Math.round(v * 255); D[i + 3] = 255; }
      if (this.shoreTex) this.shoreTex.dispose(); this.shoreTex = new THREE.DataTexture(D, SIZE, SIZE, THREE.RGBAFormat); this.shoreTex.magFilter = this.shoreTex.minFilter = THREE.LinearFilter; this.shoreTex.needsUpdate = true; this.uShore.value = this.shoreTex;
    }
    // invisible pick mesh (one instance per tile)
    const pg = new THREE.BoxGeometry(1, 1, 1); pg.translate(0, 0.5, 0);
    const pick = new THREE.InstancedMesh(pg, this.pickMat || (this.pickMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })), SIZE * SIZE);
    const mx = new THREE.Matrix4();
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { mx.makeScale(1, Math.max(0.1, this.topXY(x, y)), 1).setPosition(x + 0.5, 0, y + 0.5); pick.setMatrixAt(y * SIZE + x, mx); }
    pick.computeBoundingSphere(); pick.visible = false; this.terrainMesh = pick; g.add(pick); // raycast-only (never drawn)
    for (const o of old) { g.remove(o); o.geometry?.dispose(); }
    this.applyUnderground();
  }
  initWater() {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S);
    const hgt = (x, y) => { let v = 0; for (const [fx, fy, a] of [[1, 2, 1], [3, 1, 0.6], [2, 5, 0.35], [7, 3, 0.2], [5, 9, 0.12]]) v += a * Math.sin((x * fx + y * fy) / S * Math.PI * 2 + fx * 1.7) * Math.cos((x * fy - y * fx) / S * Math.PI * 2); return v; };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1), n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize(), i = (y * S + x) * 4; img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(16, 16);
    this.waterMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0x3f86b8, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.86, normalMap: tex, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.4 }), 'ground');
    this.uWater2 = { value: 0 }; this.uShore = { value: null }; const self = this, fogBC = this.waterMat.onBeforeCompile;
    this.waterMat.onBeforeCompile = function (sh, r) { fogBC.call(this, sh, r);
      sh.uniforms.uWater2 = self.uWater2; sh.uniforms.uShore = self.uShore; sh.uniforms.uTime = self.uTime;
      sh.fragmentShader = 'uniform float uWater2; uniform sampler2D uShore; uniform float uTime;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uWater2 > 0.5) { float sd = texture2D(uShore, vFogUV).r; // 1 at the bank, 0 a few tiles out
          gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.55, 0.78, 1.0), gl_FragColor.rgb * vec3(0.9, 1.25, 1.1) + vec3(0.0, 0.04, 0.03), sd);
          float w = 0.5 + 0.5 * sin(uTime * 1.3 + (vFogUV.x * 0.7 + vFogUV.y) * 420.0 + sd * 8.0);
          gl_FragColor.rgb += vec3(0.75) * smoothstep(0.82, 1.0, sd) * (0.35 + 0.65 * w) * 0.6;
          gl_FragColor.a = mix(0.93, 0.78, sd); }`);
    };
    this.waterMat.customProgramCacheKey = () => 'water-v3';
    const w = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), this.waterMat); w.rotation.x = -Math.PI / 2; w.position.set(SIZE / 2, WATER_Y, SIZE / 2); w.receiveShadow = true;
    this.groups.water.add(w);
  }

  // ---------- foliage ----------
  // Render a tree geometry once from the side into a texture; distant trees use two crossed quads with it.
  bakeImpostor(geo) {
    geo.computeBoundingBox(); const bb = geo.boundingBox, w = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 1.04, y0 = bb.min.y, y1 = bb.max.y * 1.02;
    const W = 128, H = Math.round(128 * (y1 - y0) / (2 * w));
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.15)); const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(-1, 1.4, 1.6); sc.add(dl);
    sc.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    const cam = new THREE.OrthographicCamera(-w, w, y1, y0, 0.01, 10); cam.position.set(0, 0, 3); cam.lookAt(0, 0, 0); cam.position.y = 0; cam.updateProjectionMatrix();
    const prev = this.r.getRenderTarget(), pc = new THREE.Color(); this.r.getClearColor(pc); const pa = this.r.getClearAlpha();
    this.r.setRenderTarget(rt); this.r.setClearColor(new THREE.Color().setScalar(0.42), 0); this.r.clear(); this.r.render(sc, cam); this.r.setRenderTarget(prev); this.r.setClearColor(pc, pa);
    const quads = []; /* front+back faces so normals never flip */ for (const ry of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { const q = new THREE.PlaneGeometry(2 * w, y1 - y0); q.translate(0, (y0 + y1) / 2, 0); q.rotateY(ry); const n = q.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); quads.push(q); }
    const mat = this.fogify(this.sway(new THREE.MeshLambertMaterial({ map: rt.texture, alphaTest: 0.45, color: 0xffffff, emissive: 0x1c1c1c, emissiveMap: rt.texture }), 0.035), 'object');
    return { geo: mergeGeometries(quads), mat, rt };
  }
  // ---------- fog of war on the GPU: a SIZE x SIZE visibility texture sampled by terrain/vegetation shaders ----------
  initFog() {
    this.fogData = new Uint8Array(SIZE * SIZE * 4); this.fogCur = new Float32Array(SIZE * SIZE); this.fogTgt = new Uint8Array(SIZE * SIZE);
    this.fogTex = new THREE.DataTexture(this.fogData, SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.fogTex.magFilter = this.fogTex.minFilter = THREE.LinearFilter; this.fogTex.generateMipmaps = false; this.fogTex.needsUpdate = true;
    this.worldSize = SIZE; this.uFogSize = { value: SIZE };
    this.uFog = { value: this.fogTex }; this.uFogCol = { value: new THREE.Color(0x4a5866) }; this.uFogOn = { value: 1 };
  }
  // read tile visibility into the target buffer (cheap, no GPU work)
  syncFogTarget(state, snap) {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const i = y * SIZE + x; this.fogTgt[i] = tile(state, x, y).vis ? 1 : 0; if (snap) this.fogCur[i] = this.fogTgt[i]; }
    this.fogMoving = true;
  }
  // ease newly revealed tiles in (about 0.7 s), then upload 16 KB; no geometry or shader changes
  stepFog(dt) {
    if (!this.fogMoving) return; let moving = false; const k = Math.min(1, dt / 0.7), D = this.fogData;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const t = this.fogTgt[i]; let c = this.fogCur[i];
      if (c !== t) { c = t > c ? Math.min(t, c + k) : Math.max(t, c - k); this.fogCur[i] = c; if (c !== t) moving = true; }
      const v = Math.round(c * c * (3 - 2 * c) * 255); D[i * 4] = v; D[i * 4 + 1] = v; D[i * 4 + 2] = v; D[i * 4 + 3] = 255;
    }
    this.fogTex.needsUpdate = true; this.fogMoving = moving;
  }
  // mode 'ground': unrevealed areas shade to a flat fog colour; 'object': dithered dissolve (whole instance at once)
  fogify(mat, mode) {
    const prev = mat.onBeforeCompile, self = this;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      sh.uniforms.uFog = self.uFog; sh.uniforms.uFogCol = self.uFogCol; sh.uniforms.uFogOn = self.uFogOn;
      sh.uniforms.uFogSize = self.uFogSize;
      sh.vertexShader = 'uniform float uFogSize; varying vec2 vFogUV;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fwp = vec4(${mode === 'object' ? 'vec3(0.0)' : 'transformed'}, 1.0);
        #ifdef USE_INSTANCING
        fwp = instanceMatrix * fwp;
        #endif
        fwp = modelMatrix * fwp; vFogUV = fwp.xz / uFogSize;`);
      sh.fragmentShader = 'uniform sampler2D uFog; uniform vec3 uFogCol; uniform float uFogOn; varying vec2 vFogUV;\n' + (mode === 'cut'
        ? sh.fragmentShader.replace('void main() {', `void main() {
          if (mix(1.0, texture2D(uFog, vFogUV).r, uFogOn) < 0.5) discard;`)
        : mode === 'object'
        ? sh.fragmentShader.replace('void main() {', `void main() {
          float fogV = mix(1.0, texture2D(uFog, vFogUV).r, uFogOn);
          if (fogV < 0.999 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) >= fogV) discard;`)
        : sh.fragmentShader.replace('#include <tonemapping_fragment>', `float fogV = mix(1.0, texture2D(uFog, vFogUV).r, uFogOn);
          gl_FragColor.rgb = mix(uFogCol, gl_FragColor.rgb, fogV); // linear space, before tone mapping (same look with or without post-processing)
          #include <tonemapping_fragment>`));
    };
    mat.customProgramCacheKey = () => 'fog-' + mode + '-' + (mat.userData.swayAmp ?? 'x');
    return mat;
  }
  // shadow-pass material that dissolves with the fog too, so trees hidden in unexplored land cast no shadows
  fogDepth() { return this.fogDepthMat || (this.fogDepthMat = this.fogify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'object')); }
  sway(mat, amp) {
    mat.userData.swayAmp = amp;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec4 ip = instanceMatrix[3];
        float ph = ip.x * 0.7 + ip.z * 0.9;
        transformed.x += sin(uTime * 1.6 + ph) * ${amp.toFixed(3)} * max(0.0, position.y);
        transformed.z += cos(uTime * 1.3 + ph) * ${(amp * 0.6).toFixed(3)} * max(0.0, position.y);
        #endif`);
    };
    return mat;
  }
  treeSlot(x, y, i) { return { x: x + 0.18 + h01(x, y, 10 + i) * 0.64, z: y + 0.18 + h01(x, y, 20 + i) * 0.64, s: 0.75 + h01(x, y, 30 + i) * 0.6, con: h01(x, y, 40 + i) < 0.62, v: h01(x, y, 50 + i) }; }
  buildTrees(state) {
    const g = this.groups.trees; g.clear();
    const con = [], brd = [], stumps = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (!this.seenAt(x, y)) continue;
      const t = tile(state, x, y);
      for (let i = 0; i < t.trees; i++) { const q = this.treeSlot(x, y, i); (q.con ? con : brd).push([q.x, this.heightAt(q.x, q.z), q.z, q.s, q.v]); }
      // stumps where trees were felled; saplings grow through stages (scale) into full trees
      for (let k = 0; k < (t.stumps || 0); k++) { const q = this.treeSlot(x, y, Math.min(3, t.trees + k)); stumps.push([q.x + 0.04, this.heightAt(q.x, q.z), q.z - 0.03, q.s]); }
      if (t.sp) t.sp.forEach((age, j) => { const q = this.treeSlot(x, y, 4 + j), st = saplingStage(age), k = [0.22, 0.45, 0.72][st] * (0.85 + 0.3 * Math.min(1, age / SAPLING.grownAt)); (q.con ? con : brd).push([q.x, this.heightAt(q.x, q.z), q.z, q.s * k, q.v]); });
    }
    const mk = (parts) => mergeGeometries(parts.map(p => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; }));
    const trunk = () => { const t = new THREE.CylinderGeometry(0.03, 0.045, 0.2, 5); t.translate(0, 0.1, 0); return t; };
    const conGeo = mk([trunk(), (() => { const c = new THREE.ConeGeometry(0.2, 0.36, 7); c.translate(0, 0.32, 0); return c; })(), (() => { const c = new THREE.ConeGeometry(0.15, 0.3, 7); c.translate(0, 0.5, 0); return c; })(), (() => { const c = new THREE.ConeGeometry(0.09, 0.22, 6); c.translate(0, 0.67, 0); return c; })()]);
    const brdGeo = mk([trunk(), (() => { const c = new THREE.IcosahedronGeometry(0.2, 0); c.translate(0, 0.38, 0); return c; })(), (() => { const c = new THREE.IcosahedronGeometry(0.13, 0); c.translate(0.09, 0.47, 0.05); return c; })()]);
    // trunk coloured via vertex colours (y < 0.2 brown)
    for (const geo of [conGeo, brdGeo]) { const p = geo.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const tr = p.getY(i) < 0.19 && Math.abs(p.getX(i)) < 0.05; c[i * 3] = tr ? 0.42 : 1; c[i * 3 + 1] = tr ? 0.28 : 1; c[i * 3 + 2] = tr ? 0.17 : 1; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    if (!this.treeMat) this.treeMat = this.fogify(this.sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 0.035), 'object');
    if (!this.impostors) this.impostors = { con: this.bakeImpostor(conGeo), brd: this.bakeImpostor(brdGeo) }; for (const k in this.impostors) this.impostors[k].mat.color.setScalar(this.q.art ? 1.35 : 1);
    // LOD: each chunk gets a full-geometry InstancedMesh and a cheap crossed-quad impostor InstancedMesh (no shadows)
    this.treeChunks = [];
    const byChunk = new Map();
    for (const [list, kind] of [[con, 'con'], [brd, 'brd']]) for (const p of list) { const c = chunkOf(p[0], p[2]); if (!byChunk.has(c)) byChunk.set(c, { con: [], brd: [] }); byChunk.get(c)[kind].push(p); }
    for (const [ci, lists] of byChunk) {
      const ch = { cx: ci % NCH, cy: Math.floor(ci / NCH), full: [], imp: [], lod: 0, n: 0 };
      for (const [kind, geo, base] of [['con', conGeo, 0x3d7a3e], ['brd', brdGeo, 0x5f9a3f]]) {
        const list = lists[kind]; if (!list.length) continue; ch.n += list.length;
        const imp = this.impostors[kind];
        const m = new THREE.InstancedMesh(geo, this.treeMat, list.length), mi = new THREE.InstancedMesh(imp.geo, imp.mat, list.length);
        list.forEach((p, i) => { q.setFromAxisAngle(up, p[4] * 6.28); sc.set(p[3], p[3] * (0.9 + p[4] * 0.3), p[3]); ps.set(p[0], p[1] - 0.01, p[2]); mx.compose(ps, q, sc); m.setMatrixAt(i, mx); mi.setMatrixAt(i, mx); col.setHex(base).offsetHSL((p[4] - 0.5) * 0.06, (p[4] - 0.5) * 0.2, (p[3] - 1) * 0.12 + (p[4] - 0.5) * 0.06);
          if (kind === 'brd') { const au = vnoise(p[0] * 0.09, p[2] * 0.09, 31), th = this.q.art ? 0.56 : 0.66; if (au > th) col.lerp(AUTUMN[Math.floor(p[4] * AUTUMN.length) % AUTUMN.length], Math.min(0.9, (au - th) * 4)); }
          m.setColorAt(i, col); mi.setColorAt(i, col); });
        m.castShadow = true; m.receiveShadow = true; m.customDepthMaterial = this.fogDepth(); mi.visible = false; m.computeBoundingSphere(); mi.computeBoundingSphere();
        g.add(m, mi); ch.full.push(m); ch.imp.push(mi);
      }
      this.treeChunks.push(ch);
    }
    this.treeGeos = { con: conGeo, brd: brdGeo };
    this.stumpMesh = null;
    if (stumps.length) {
      const sg = new THREE.CylinderGeometry(0.035, 0.045, 0.05, 6); sg.translate(0, 0.025, 0);
      const m = new THREE.InstancedMesh(sg, this.stumpMat || (this.stumpMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9, flatShading: true }), 'object')), stumps.length);
      stumps.forEach((p, i) => { mx.makeScale(p[3], p[3], p[3]).setPosition(p[0], p[1], p[2]); m.setMatrixAt(i, mx); });
      m.castShadow = true; m.receiveShadow = true; g.add(m); this.stumpMesh = m;
    }
    this.lodForce = true;
  }
  buildGrass(state) {
    const g = this.groups.grass; g.clear();
    const per = this.q.grass, rocksPer = this.q.rocks, tufts = [], rocks = [], pits = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (!this.seenAt(x, y)) continue;
      const t = tile(state, x, y);
      if (t.t === T.WATER) { if (t.wd === 0) for (let i = 0; i < 7; i++) { const px = x + 0.1 + h01(x, y, 140 + i) * 0.8, pz = y + 0.1 + h01(x, y, 150 + i) * 0.8; rocks.push([px, WATER_Y - 0.012, pz, 0.9 + h01(x, y, 160 + i) * 0.8, h01(x, y, 170 + i)]); } continue; } // ford: stepping stones
      if (t.road || t.occ) continue;
      if (t.t !== T.HILL) for (let i = 0; i < per; i++) { const px = x + h01(x, y, 60 + i), pz = y + h01(x, y, 70 + i); tufts.push([px, this.heightAt(px, pz), pz, 0.6 + h01(x, y, 80 + i) * 0.7, h01(x, y, 90 + i)]); }
      const rk = t.t === T.HILL ? Math.max(0, Math.min(1, (t.rock ?? 20) / 20)) : 1; // quarried hills lose their loose rock
      if ((t.t === T.HILL && rk > 0) || h01(x, y, 5) < 0.06) for (let i = 0; i < rocksPer + (t.t === T.HILL ? 2 : 0); i++) if (h01(x, y, 100 + i) < (t.t === T.HILL ? 0.75 : 0.5) * (i < rocksPer ? 1 : rk)) { const px = x + 0.1 + h01(x, y, 110 + i) * 0.8, pz = y + 0.1 + h01(x, y, 120 + i) * 0.8; rocks.push([px, this.heightAt(px, pz), pz, (0.5 + h01(x, y, 130 + i) * 1.4) * (t.t === T.HILL ? 0.35 + 0.9 * rk : 1), h01(x, y, 140 + i)]); }
      if (t.pit) { const n = Math.min(8, 2 + Math.floor(t.pit / 6)); for (let i = 0; i < n; i++) { const px = x + 0.15 + h01(x, y, 500 + i) * 0.7, pz = y + 0.15 + h01(x, y, 510 + i) * 0.7; pits.push([px, this.heightAt(px, pz), pz, 0.6 + Math.min(1, t.pit / 30) * 1.4, h01(x, y, 520 + i)]); } }
    }
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    // chunked so distant chunks can drop grass (and, further out, rocks)
    this.grassChunks = [];
    let bladeGeo = null;
    if (tufts.length) {
      const blades = []; for (let i = 0; i < 4; i++) { const b = new THREE.ConeGeometry(0.018, 0.13, 3); b.translate(0, 0.065, 0); b.rotateZ((i - 1.5) * 0.25); b.rotateY(i * 1.6); b.translate(Math.cos(i * 1.6) * 0.03, 0, Math.sin(i * 1.6) * 0.03); blades.push(b.toNonIndexed()); }
      blades.forEach(b => { for (const k of Object.keys(b.attributes)) if (k !== 'position' && k !== 'normal') b.deleteAttribute(k); });
      bladeGeo = mergeGeometries(blades);
      if (!this.grassMat) this.grassMat = this.fogify(this.sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), 0.25), 'object');
    }
    if (!this.rockMat) { this.rockMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 'object'); this.rockGeo = new THREE.DodecahedronGeometry(0.05, 0); }
    const split = (list) => { const m = new Map(); for (const p of list) { const c = chunkOf(p[0], p[2]); if (!m.has(c)) m.set(c, []); m.get(c).push(p); } return m; };
    const tc = split(tufts), rc = split(rocks), chunks = new Map();
    const get = (ci) => { if (!chunks.has(ci)) chunks.set(ci, { cx: ci % NCH, cy: Math.floor(ci / NCH), grass: null, rocks: null }); return chunks.get(ci); };
    for (const [ci, list] of tc) {
      const m = new THREE.InstancedMesh(bladeGeo, this.grassMat, list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(up, p[4] * 6.28); sc.setScalar(p[3]); ps.set(p[0], p[1] - 0.005, p[2]); mx.compose(ps, q, sc); m.setMatrixAt(i, mx); col.setHex(0x86b85c).offsetHSL((p[4] - 0.5) * 0.08, 0, (p[4] - 0.5) * 0.12); m.setColorAt(i, col); });
      m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); get(ci).grass = m;
    }
    for (const [ci, list] of rc) {
      const m = new THREE.InstancedMesh(this.rockGeo, this.rockMat, list.length);
      list.forEach((p, i) => { q.setFromEuler(new THREE.Euler(p[4] * 3, p[4] * 7, 0)); sc.set(p[3], p[3] * 0.6, p[3] * 0.9); ps.set(p[0], p[1], p[2]); mx.compose(ps, q, sc); m.setMatrixAt(i, mx); col.setHex(0x9a978c).offsetHSL(0, 0, (p[4] - 0.5) * 0.2); m.setColorAt(i, col); });
      m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); get(ci).rocks = m;
    }
    if (pits.length) { // dug ground: flattened dark spoil heaps and broken stone
      if (!this.pitMat) this.pitMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), 'object');
      const m = new THREE.InstancedMesh(this.rockGeo, this.pitMat, pits.length);
      pits.forEach((p, i) => { q.setFromEuler(new THREE.Euler(0, p[4] * 6, 0)); sc.set(p[3] * 2.2, p[3] * 0.35, p[3] * 2); ps.set(p[0], p[1] - 0.012, p[2]); mx.compose(ps, q, sc); m.setMatrixAt(i, mx); col.setHex(p[4] < 0.5 ? 0x6e604c : 0x8d8578); m.setColorAt(i, col); });
      m.receiveShadow = true; m.computeBoundingSphere(); g.add(m);
    }
    this.grassChunks = [...chunks.values()];
    this.lodForce = true;
  }

  // ---------- berry bushes (instanced; berries thin out as they are picked, regrow daily) ----------
  buildBerries(state) {
    const g = this.groups.berries;
    g.children.forEach(m => m.dispose && m.dispose()); g.clear();
    const bushes = [], dots = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (!this.seenAt(x, y)) continue;
      const t = tile(state, x, y); if (!t.berryMax || t.occ || t.road) continue;
      const nb = 2 + (h01(x, y, 300) < 0.5 ? 1 : 0), ripe = (t.berry || 0) / t.berryMax;
      for (let i = 0; i < nb; i++) {
        const px = x + 0.2 + h01(x, y, 310 + i) * 0.6, pz = y + 0.2 + h01(x, y, 320 + i) * 0.6, s = 0.8 + h01(x, y, 330 + i) * 0.5, py = this.heightAt(px, pz);
        bushes.push([px, py, pz, s, h01(x, y, 340 + i)]);
        const nd = Math.round(ripe * 7); for (let k = 0; k < nd; k++) { const a = k * 2.4 + i, r = 0.07 * s; dots.push([px + Math.cos(a) * r, py + 0.05 * s + (k % 3) * 0.025 * s, pz + Math.sin(a) * r]); }
      }
    }
    if (!this.bushMat) { this.bushMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 'object'); this.bushGeo = new THREE.IcosahedronGeometry(0.08, 0); this.bushGeo.translate(0, 0.06, 0); this.dotMat = this.fogify(new THREE.MeshStandardMaterial({ color: 0xb3243b, roughness: 0.5, emissive: 0x3a0610 }), 'object'); this.dotGeo = new THREE.SphereGeometry(0.016, 5, 4); }
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
    if (bushes.length) { const m = new THREE.InstancedMesh(this.bushGeo, this.bushMat, bushes.length); bushes.forEach((p, i) => { q.setFromEuler(new THREE.Euler(0, p[4] * 6, 0)); sc.set(p[3], p[3] * 0.8, p[3]); ps.set(p[0], p[1], p[2]); mx.compose(ps, q, sc); m.setMatrixAt(i, mx); col.setHex(0x3f6e34).offsetHSL((p[4] - 0.5) * 0.05, 0, (p[4] - 0.5) * 0.1); m.setColorAt(i, col); }); m.castShadow = m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); }
    if (dots.length) { const m = new THREE.InstancedMesh(this.dotGeo, this.dotMat, dots.length); q.identity(); sc.setScalar(1); dots.forEach((p, i) => { ps.set(p[0], p[1], p[2]); mx.compose(ps, q, sc); m.setMatrixAt(i, mx); }); m.computeBoundingSphere(); g.add(m); }
  }
  // screen position of a world point (for HTML overlays such as progress bars)
  worldScreen(x, y, z) { const p = new THREE.Vector3(x, y, z).project(this.cam); if (p.z > 1 || p.z < -1) return null; const r = this.canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; }
  buildingAnchor(id) { const v = this.bvis.get(id); if (!v || !v.root.visible) return null; const st = v.stages[v.vis]; let h = 0.5; if (st) { if (!st.userData.h) { const bb = new THREE.Box3().setFromObject(st); st.userData.h = Math.max(0.15, bb.max.y - v.root.position.y); } h = st.userData.h; } return this.worldScreen(v.root.position.x, v.root.position.y + h + 0.08, v.root.position.z); }
  // ---------- units (scouts etc.): small animated figures, interpolated between sim ticks ----------
  makeUnitModel(kind) {
    if (kind === 'villager') return this.makeVillagerModel();
    if (kind === 'ship') return this.makeShipModel();
    const g = new THREE.Group(), M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    const body = new THREE.Group(); g.add(body); g.userData.body = body;
    const legs = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.04), M(0x5a4632)); l.geometry.translate(0, -0.055, 0); l.position.set(s * 0.028, 0.11, 0); body.add(l); return l; });
    g.userData.legs = legs;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.13, 6), M(0x7b8f3a)); torso.position.y = 0.175; body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M(0xd9a77c)); head.position.y = 0.275; body.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.05, 7), M(0x6b4a2a)); hat.position.y = 0.315; body.add(hat);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.04), M(0x8a6a3e)); pack.position.set(0, 0.18, -0.055); body.add(pack);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 4), M(0x9c6b3e)); staff.position.set(0.07, 0.17, 0.02); body.add(staff);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.15, 24), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.visible = false; g.add(ring); g.userData.ring = ring;
    g.scale.setScalar(1.6); return g;
  }
  // ship: a small square-rigged trading vessel
  makeShipModel() {
    const g = new THREE.Group(), M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true });
    const body = new THREE.Group(); g.add(body); g.userData.body = body; g.userData.legs = [new THREE.Object3D(), new THREE.Object3D()];
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 0.42, 6, 1, false, 0, Math.PI), M(0x6b4a2a)); hull.rotation.set(Math.PI / 2, 0, Math.PI / 2); hull.position.y = 0.06; body.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.015, 0.4), M(0xa77a48)); deck.position.y = 0.065; body.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.42, 5), M(0x5e3d22)); mast.position.y = 0.27; body.add(mast);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.01), M(0xf1e7d2)); sail.position.set(0, 0.3, 0.012); body.add(sail);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.012), M(0xa9472f)); stripe.position.set(0, 0.3, 0.013); body.add(stripe);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.005), M(0xa9472f)); flag.position.set(0.03, 0.49, 0); body.add(flag);
    for (const z of [-0.17, 0.17]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.06), M(0x7a5434)); c.position.set(0, 0.09, z); body.add(c); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 24), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.visible = false; g.add(ring); g.userData.ring = ring;
    g.scale.setScalar(1.6); return g;
  }
  // villager: hide tunic, bare head with hair, a hafted stone tool that swings while working, a load bundle on the back
  makeVillagerModel() {
    const g = new THREE.Group(), M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true });
    const body = new THREE.Group(); g.add(body); g.userData.body = body;
    g.userData.legs = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.04), M(0x6b4f35)); l.geometry.translate(0, -0.055, 0); l.position.set(s * 0.028, 0.11, 0); body.add(l); return l; });
    const tunic = [0xa8804f, 0x8f6a44, 0xb59366, 0x7d6448][Math.floor(Math.random() * 4)];
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.066, 0.14, 6), M(tunic)); torso.position.y = 0.175; body.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.06, 0.015, 6), M(0x4a3524)); belt.position.y = 0.14; body.add(belt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M(0xc99468)); head.position.y = 0.275; body.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.043, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), M([0x3b2a1e, 0x5a3e28, 0x2a211b][Math.floor(Math.random() * 3)])); hair.position.y = 0.282; body.add(hair);
    const arm = new THREE.Group(); arm.position.set(0.06, 0.22, 0); body.add(arm); g.userData.tool = arm;
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.025), M(0xc99468)); a.position.y = -0.04; arm.add(a);
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), M(0x8a6038)); haft.position.set(0, -0.08, 0.06); haft.rotation.x = Math.PI / 2; arm.add(haft);
    const headT = new THREE.Mesh(new THREE.DodecahedronGeometry(0.02, 0), M(0x5d5d63)); headT.position.set(0, -0.08, 0.14); arm.add(headT);
    const load = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.06), M(0x9c6b3e)); load.position.set(0, 0.22, -0.065); load.visible = false; body.add(load); g.userData.load = load;
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.15, 24), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; ring.visible = false; g.add(ring); g.userData.ring = ring;
    g.scale.setScalar(1.6); return g;
  }
  syncUnits(state, frac, dt) {
    const seen = new Set(), units = state.units || [];
    for (const u of units) {
      seen.add(u.id); let v = this.uvis.get(u.id);
      if (!v) { v = { root: this.makeUnitModel(u.kind), phase: Math.random() * 6 }; this.groups.units.add(v.root); this.uvis.set(u.id, v); }
      const x = u.px + (u.x - u.px) * frac, y = u.py + (u.y - u.py) * frac, moving = u.path.length > 0 && (u.x !== u.px || u.y !== u.py);
      const hx = this.heightAt(x + 0.5, y + 0.5);
      v.root.position.set(x + 0.5, Math.max(hx, WATER_Y), y + 0.5);
      if (moving) { v.root.rotation.y = Math.atan2(u.x - u.px, u.y - u.py); v.phase += dt * 9; } else v.phase *= 0.9;
      const sw = Math.sin(v.phase) * (moving ? 0.6 : 0); v.root.userData.legs[0].rotation.x = sw; v.root.userData.legs[1].rotation.x = -sw; v.root.userData.body.position.y = moving ? Math.abs(Math.sin(v.phase)) * 0.012 : 0;
      const ud = v.root.userData;
      if (ud.tool) { // villager work animation + carried load
        const work = !moving && (u.vstate === 'working' || u.vstate === 'building');
        if (work) { v.wph = (v.wph || 0) + dt * 7; const j = u.job; if (j) { const tx = j.type === 'build' ? (state.buildings[j.id] || u).x : j.x, ty = j.type === 'build' ? (state.buildings[j.id] || u).y : j.y; if (tx !== u.x || ty !== u.y) v.root.rotation.y = Math.atan2(tx - u.x, ty - u.y); } }
        ud.tool.rotation.x = work ? -0.6 - Math.max(0, Math.sin(v.wph)) * 1.5 : (moving ? Math.sin(v.phase) * 0.4 : 0);
        ud.body.rotation.x = work ? Math.max(0, Math.sin(v.wph)) * 0.18 : 0;
        const c = u.carry && u.carry.n > 0.5 ? u.carry : null; ud.load.visible = !!c;
        if (c) { ud.load.material.color.setHex({ wood: 0x9c6b3e, stone: 0x9a9a96, clay: 0xc4865a, food: 0xb3243b }[c.res] || 0x9c6b3e); const k = 0.5 + 0.5 * Math.min(1, c.n / 10); ud.load.scale.set(k, k, k); }
      }
      v.root.userData.ring.visible = this.selUnit === u.id || !!(this.selUnits && this.selUnits.has(u.id));
      v.root.visible = !this.underground;
    }
    for (const [id, v] of this.uvis) if (!seen.has(id)) { this.groups.units.remove(v.root); this.uvis.delete(id); }
  }
  pickUnit(state, tx, ty) { let best = null, bd = 0.9; for (const u of state.units || []) { const d = Math.hypot(u.x - tx, u.y - ty); if (d < bd) { bd = d; best = u; } } return best; }

  // ---------- tree felling: the removed tree tips over, dust, then fades ----------
  syncFelling(state, dt) {
    const F = state.felled || []; this.falling = this.falling || [];
    if (this.fellSeen === undefined) this.fellSeen = F.length ? F[F.length - 1][3] : 0; // don't replay old events after load
    for (const [x, y, slot, id] of F) {
      if (id <= this.fellSeen) continue; this.fellSeen = id;
      if (!this.treeGeos || this.underground || this.falling.length > 12) continue;
      const q = this.treeSlot(x, y, Math.min(slot, 3)), geo = this.treeGeos[q.con ? 'con' : 'brd'];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: q.con ? 0x3d7a3e : 0x5f9a3f, roughness: 0.9, flatShading: true, transparent: true });
      const m = new THREE.Mesh(geo, mat), pivot = new THREE.Group(); pivot.add(m); m.scale.setScalar(q.s);
      pivot.position.set(q.x, this.heightAt(q.x, q.z), q.z); const ax = new THREE.Vector3(Math.cos(q.v * 6.28), 0, Math.sin(q.v * 6.28));
      m.castShadow = true; this.groups.fx.add(pivot); this.falling.push({ pivot, mat, ax, t: 0, dust: false });
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]; f.t += dt; const k = Math.min(1, f.t / 1.1);
      f.pivot.quaternion.setFromAxisAngle(f.ax, k * k * Math.PI * 0.48);
      if (k >= 1 && !f.dust) { f.dust = true; this.dustBurst(f.pivot.position, 0.25); }
      if (f.t > 1.4) f.mat.opacity = Math.max(0, 1 - (f.t - 1.4) / 1.4);
      if (f.t > 2.8) { this.groups.fx.remove(f.pivot); f.mat.dispose(); this.falling.splice(i, 1); }
    }
  }

  // ---------- picture thumbnails of buildable things, rendered from the real models ----------
  thumb(item) {
    this.thumbs = this.thumbs || new Map(); if (this.thumbs.has(item)) return this.thumbs.get(item);
    const g = new THREE.Group(), M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
    if (BUILDINGS[item]) { const d = BUILDINGS[item], n = d.size || 1, tiles = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) tiles.push([i, j]); g.add(buildModel({ id: 0, kind: item, x: 0, y: 0, tiles, rot: 0, done: true, progress: 1, residents: 1 }, 3, () => 0).group); }
    else if (item === 'road') { const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.03, 0.62), M(0x9c8a6c)); g.add(b); const s2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.035, 0.5), M(0xcdb994)); g.add(s2); }
    else if (item === 'level') { g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 1), M(0x8f9a55)), { position: new THREE.Vector3(0, 0.17, 0) })); g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.36, 0.08), M(0xb5ad99)), { position: new THREE.Vector3(0, 0.18, 0.5) })); g.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.5), M(0x77736a)), { position: new THREE.Vector3(0, 0.35, -0.75) })); }
    else if (item === 'plant') { const geo = (this.treeGeos || {}).con; if (geo) for (const [x, z, s] of [[0, 0, 0.9], [0.35, 0.25, 0.5], [-0.3, 0.3, 0.3]]) { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x4f9a4a, flatShading: true })); m.scale.setScalar(s); m.position.set(x, 0, z); g.add(m); } g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 16), M(0x6e5034)), {})); }
    else if (item === 'scout') { const u = this.makeUnitModel('scout'); u.userData.ring.visible = false; g.add(u); }
    else if (item === 'survey') { for (const [x, z] of [[-0.3, 0], [0.3, 0.1]]) g.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), M(0xc9a46a)), { position: new THREE.Vector3(x, 0.25, z) })); g.add(Object.assign(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.2, 6), M(0x3fae8c)), { position: new THREE.Vector3(0, 0.1, 0.3) })); }
    const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), R = Math.max(sz.x, sz.y * 1.2, sz.z) * 0.78 + 0.05;
    const sc = new THREE.Scene(); sc.add(g, new THREE.HemisphereLight(0xeaf4ff, 0x7a7055, 1.5)); const dl = new THREE.DirectionalLight(0xfff0d8, 2.6); dl.position.set(-3, 6, 4); sc.add(dl);
    sc.environment = this.scene.environment; sc.environmentIntensity = 0.3;
    const cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.1, 100), el = Math.atan(1 / Math.SQRT2), a = Math.PI / 4;
    cam.position.set(c.x + Math.cos(a) * Math.cos(el) * 20, c.y + Math.sin(el) * 20, c.z + Math.sin(a) * Math.cos(el) * 20); cam.lookAt(c); cam.updateProjectionMatrix();
    const W = 96, rt = this.thumbRT || (this.thumbRT = new THREE.WebGLRenderTarget(W, W, { samples: 4 }));
    const prev = this.r.getRenderTarget(), pc = new THREE.Color(); this.r.getClearColor(pc); const pa = this.r.getClearAlpha(), sh = this.r.shadowMap.enabled;
    this.r.shadowMap.enabled = false; this.r.setRenderTarget(rt); this.r.setClearColor(0x000000, 0); this.r.clear(); this.r.render(sc, cam);
    const px = new Uint8Array(W * W * 4); this.r.readRenderTargetPixels(rt, 0, 0, W, W, px);
    this.r.setRenderTarget(prev); this.r.setClearColor(pc, pa); this.r.shadowMap.enabled = sh;
    const cv = document.createElement('canvas'); cv.width = cv.height = W; const ctx = cv.getContext('2d'), img = ctx.createImageData(W, W);
    const enc = (v) => { v = v / 255; v = v * 1.15 / (1 + v * 0.35); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); }; // linear -> soft tonemap -> sRGB
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = ((W - 1 - y) * W + x) * 4, o = (y * W + x) * 4, a2 = px[i + 3] / 255 || 1; img.data[o] = enc(px[i] / a2); img.data[o + 1] = enc(px[i + 1] / a2); img.data[o + 2] = enc(px[i + 2] / a2); img.data[o + 3] = px[i + 3]; }
    ctx.putImageData(img, 0, 0); const url = cv.toDataURL('image/png'); this.thumbs.set(item, url);
    g.traverse(o => { if (o.isMesh && o.geometry !== (this.treeGeos || {}).con) o.geometry.dispose(); });
    return url;
  }

  // ---------- terraces & earthworks ----------
  buildEarth(state) {
    const g = this.groups.earth; g.clear();
    const parts = new Map(), put = (color, geo) => { if (!parts.has(color)) parts.set(color, []); parts.get(color).push(geo); };
    const box = (color, w, h, d, x, y, z) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); put(color, b); };
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // retaining walls along terrace edges (dry stone on the drop side, cut rock face on the uphill side)
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y); if (!t.vis || !t.lv) continue;
      const top = this.topXY(x, y);
      for (const [dx, dy] of N4) {
        const nt = tile(state, x + dx, y + dy); if (!nt) continue; const nTop = this.topXY(x + dx, y + dy), diff = nTop - top;
        if (Math.abs(diff) < 0.06 || nt.t === T.WATER) continue;
        const lo = Math.min(top, nTop), hgt = Math.min(0.7, Math.abs(diff)) + 0.03, ex = x + 0.5 + dx * 0.47, ez = y + 0.5 + dy * 0.47;
        const color = diff < 0 ? 0xb5ad99 : 0x8a857c;
        box(color, dx ? 0.07 : 1, hgt, dx ? 1 : 0.07, ex, lo + hgt / 2 - 0.02, ez);
        if (diff < 0) box(0xa39b88, dx ? 0.09 : 1.02, 0.03, dx ? 1.02 : 0.09, ex, lo + hgt, ez); // capstones
      }
    }
    // works in progress: stakes + ropes -> soil cut + spoil heaps -> walls going up
    for (const e of state.earthworks || []) {
      const p = 1 - e.left / e.total, top = this.topXY(e.x, e.y), cx = e.x + 0.5, cz = e.y + 0.5;
      for (const [sx, sz] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) box(0xc9a46a, 0.03, 0.16, 0.03, cx + sx, top + 0.08, cz + sz);
      for (const [w, d, ox, oz] of [[0.84, 0.01, 0, -0.42], [0.84, 0.01, 0, 0.42], [0.01, 0.84, -0.42, 0], [0.01, 0.84, 0.42, 0]]) box(0xeee0c0, w, 0.01, d, cx + ox, top + 0.14, cz + oz);
      if (p > 0.33) { box(0x6e5034, 0.8, 0.03, 0.8, cx, top + 0.015, cz); for (let i = 0; i < 3; i++) { const c = new THREE.ConeGeometry(0.1 + i * 0.02, 0.12, 6); c.translate(cx - 0.3 + i * 0.28, top + 0.06, cz + 0.55); put(0x7a5a3a, c); } }
      if (p > 0.66) { box(0xb5ad99, 0.8, 0.12, 0.07, cx, top + 0.06, cz + 0.4); box(0xb5ad99, 0.07, 0.12, 0.8, cx + 0.4, top + 0.06, cz); }
    }
    for (const [color, list] of parts) { const geo = mergeGeometries(list.map(b => { const q = b.index ? b.toNonIndexed() : b; for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k); return q; })); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true })); m.castShadow = m.receiveShadow = true; g.add(m); }
    this.earthKey = this.earthStageKey(state);
  }
  earthStageKey(state) { return (state.earthworks || []).map(e => e.id + ':' + Math.floor(3 * (1 - e.left / e.total))).join(','); }

  // ---------- roads ----------
  buildRoads(state) {
    const g = this.groups.roads; g.clear();
    const edge = [], surf = [], rut = [], plan = [], rem = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y);
      if (t.rp) { const top = this.topXY(x, y) + 0.006; plan.push([x + 0.5, top, y + 0.5, 0.42, 0.42]); continue; } // planned, not built yet
      if (t.rx) { const top = this.topXY(x, y) + 0.03; rem.push([x + 0.5, top, y + 0.5, 0.5, 0.5]); }
      if (!t.road) continue;
      const top = this.topXY(x, y) + 0.004;
      edge.push([x + 0.5, top, y + 0.5, 0.62, 0.62]); surf.push([x + 0.5, top + 0.006, y + 0.5, 0.5, 0.5]);
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nb = tile(state, x + dx, y + dy); if (!nb || !nb.road) continue; n++;
        edge.push([x + 0.5 + dx * 0.34, top, y + 0.5 + dy * 0.34, dx ? 0.32 : 0.62, dy ? 0.32 : 0.62]);
        surf.push([x + 0.5 + dx * 0.36, top + 0.006, y + 0.5 + dy * 0.36, dx ? 0.3 : 0.5, dy ? 0.3 : 0.5]);
        for (const o of [-0.12, 0.12]) rut.push([x + 0.5 + dx * 0.3 + (dy ? o : 0), top + 0.009, y + 0.5 + dy * 0.3 + (dx ? o : 0), dx ? 0.5 : 0.035, dy ? 0.5 : 0.035]);
      }
    }
    const mx = new THREE.Matrix4(), geo = new THREE.BoxGeometry(1, 0.012, 1);
    if (plan.length) { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xf3e2b0, transparent: true, opacity: 0.55, depthWrite: false }), plan.length); plan.forEach((p, i) => { mx.makeScale(p[3], 1, p[4]).setPosition(p[0], p[1], p[2]); m.setMatrixAt(i, mx); }); g.add(m); }
    if (rem.length) { const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xd9614a, transparent: true, opacity: 0.45, depthWrite: false }), rem.length); rem.forEach((p, i) => { mx.makeScale(p[3], 1, p[4]).setPosition(p[0], p[1], p[2]); m.setMatrixAt(i, mx); }); g.add(m); }
    if (!edge.length) return;
    // roads drape over the ground (graded tracks follow the slope instead of floating as flat slabs)
    for (const [list, color, off] of [[edge, 0x9c8a6c, 0.012], [surf, 0xcdb994, 0.018], [rut, 0xa8936f, 0.021]]) {
      const parts = [];
      for (const p of list) { const sx = Math.max(1, Math.ceil(p[3] * 4)), sz = Math.max(1, Math.ceil(p[4] * 4)), pg = new THREE.PlaneGeometry(p[3], p[4], sx, sz); pg.rotateX(-Math.PI / 2); pg.translate(p[0], 0, p[2]); const pa = pg.attributes.position; for (let i = 0; i < pa.count; i++) pa.setY(i, this.heightAt(pa.getX(i), pa.getZ(i)) + off); pg.deleteAttribute('uv'); pg.computeVertexNormals(); parts.push(pg); }
      const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.receiveShadow = true; g.add(m);
    }
  }

  // ---------- underground / overlays / draft ----------
  buildUnder(state) {
    const g = this.groups.under; g.clear();
    const mats = {}; for (const k in DEPOSITS) mats[k] = new THREE.MeshStandardMaterial({ color: DEPOSITS[k].color, emissive: DEPOSITS[k].color, emissiveIntensity: 0.3, roughness: 0.7, flatShading: true });
    const workMat = new THREE.MeshStandardMaterial({ color: 0x8a6034, emissive: 0x5a3412, emissiveIntensity: 0.8 }), oldMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, emissive: 0x2a2018, emissiveIntensity: 0.6 });
    const box = new THREE.BoxGeometry(1, 1, 1), per = {}, works = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(state, x, y); if (!t.vis) continue;
      if (knownDeposit(t)) (per[t.dep.r] = per[t.dep.r] || []).push([x + 0.5, -0.2 - t.dep.depth * 0.08, y + 0.5, 0.12 + Math.min(0.5, t.dep.amt / 500)]);
      if (t.work) works.push([x + 0.5, -0.2 - t.work.depth * 0.08 + 0.1, y + 0.5, t.work.abandoned]);
    }
    const mx = new THREE.Matrix4();
    for (const r in per) { const m = new THREE.InstancedMesh(box, mats[r], per[r].length); per[r].forEach((p, i) => { mx.makeScale(0.82, p[3], 0.82).setPosition(p[0], p[1], p[2]); m.setMatrixAt(i, mx); }); g.add(m); }
    for (const ab of [false, true]) { const l = works.filter(w => w[3] === ab); if (!l.length) continue; const m = new THREE.InstancedMesh(box, ab ? oldMat : workMat, l.length); l.forEach((p, i) => { mx.makeScale(0.96, 0.16, 0.96).setPosition(p[0], p[1], p[2]); m.setMatrixAt(i, mx); }); g.add(m); }
    for (const b of Object.values(state.buildings)) if (b.kind === 'shaft') {
      let maxD = 0; for (let y = b.y - 3; y <= b.y + 3; y++) for (let x = b.x - 3; x <= b.x + 3; x++) { const t = tile(state, x, y); if (t && t.work && t.work.mine === b.id) maxD = Math.max(maxD, t.work.depth); }
      if (!maxD) continue;
      const len = 0.25 + maxD * 0.08, m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 10), new THREE.MeshStandardMaterial({ color: 0x3d2c1c, emissive: 0x2a1a0c, emissiveIntensity: 0.5 }));
      m.position.set(b.x + 0.5, 0.25 - len / 2, b.y + 0.5); g.add(m);
    }
    for (const [d, c] of [[5, 0xffffff], [30, 0xffd27a]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false })); pl.rotation.x = -Math.PI / 2; pl.position.set(SIZE / 2, -0.2 - d * 0.08, SIZE / 2); g.add(pl); }
    g.visible = this.underground;
  }
  buildOverlay(state) {
    const g = this.groups.overlay; g.clear(); if (!state.flags.riskOverlay) return;
    const geo = new THREE.PlaneGeometry(0.96, 0.96); geo.rotateX(-Math.PI / 2);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const r = tileRisk(state, x, y, 1); if (!r) continue; const k = Math.min(1, r / 0.02); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.15 * (1 - k), 1, 0.5), transparent: true, opacity: 0.55, depthWrite: false })); m.position.set(x + 0.5, this.topXY(x, y) + 0.06, y + 0.5); g.add(m); }
  }
  buildDraft(state) {
    const g = this.groups.draft; g.clear(); const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    for (const b of state.draft) { const t = tile(state, b.x >> 1, b.y >> 1); const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: BLOCKS[b.m].color, transparent: true, opacity: 0.65, flatShading: true })); m.position.set(b.x / 2 + 0.25, this.topXY(b.x >> 1, b.y >> 1) + b.z * 0.5 + 0.25, b.y / 2 + 0.25); g.add(m); }
  }

  // ---------- buildings ----------
  setOpacity(group, op) {
    group.visible = op > 0.001;
    group.traverse(o => { if (o.material && !o.material.userData.shared) { o.material.transparent = op < 0.999; o.material.opacity = op; o.material.depthWrite = op > 0.5; } });
  }
  ensureStage(v, b, s) {
    if (v.stages[s]) return;
    const baseOf = (q) => this.topXY(q.x >> 1, q.y >> 1) - this.topXY(b.tiles[0][0], b.tiles[0][1]);
    const { group, emitters } = buildModel(s === 4 ? { ...b, ruin: true } : { ...b, ruin: false }, Math.min(s, 3), baseOf);
    // per-building material clones so each building can crossfade independently
    const clones = new Map();
    group.traverse(o => { if (o.isMesh) { if (!clones.has(o.material)) { const c = o.material.clone(); clones.set(o.material, c); if (c.userData.window) this.windowMats.add(c); } o.material = clones.get(o.material); } });
    this.setOpacity(group, 0); v.stages[s] = group; v.root.add(group); v.emit[s] = emitters;
  }
  disposeVis(v) { if (v.proxyGeo) v.proxyGeo.dispose(); v.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); this.windowMats.delete(o.material); o.material.dispose(); } }); }
  syncBuildings(state, dt, speed) {
    const seen = new Set(); let nFull = 0, nProxy = 0, nBox = 0;
    for (const b of Object.values(state.buildings)) {
      seen.add(b.id);
      let v = this.bvis.get(b.id);
      const target = b.ruin ? 4 : stageOf(b);
      if (!v) {
        v = { root: new THREE.Group(), stages: {}, emit: {}, vis: target, fade: null, lod: 0, proxyGeo: null, proxyKey: -1 };
        const t0 = tile(state, b.tiles[0][0], b.tiles[0][1]), s = b.kind === 'custom' ? 1 : Math.round(Math.sqrt(b.tiles.length));
        v.root.position.set(b.tiles[0][0] + s / 2, this.topXY(b.tiles[0][0], b.tiles[0][1]), b.tiles[0][1] + s / 2);
        v.root.rotation.y = (b.rot || 0) * Math.PI / 2; v.root.userData.bid = b.id;
        this.groups.buildings.add(v.root); this.bvis.set(b.id, v);
        this.ensureStage(v, b, target); this.setOpacity(v.stages[target], 1);
      }
      // aging: weather the finished model as condition drops (per-building material clones are tinted, worn ones lean)
      const wear = b.done && !b.ruin && b.cond !== undefined ? (b.cond >= 75 ? 0 : b.cond >= 50 ? 1 : b.cond >= 25 ? 2 : 3) : 0;
      if (v.stages[3] && v.wear !== wear) { v.wear = wear; const k = [0, 0.3, 0.55, 0.75][wear], grey = new THREE.Color(0x4f4b40); v.stages[3].traverse(o => { if (o.isMesh && o.material.color) { const m = o.material; if (!m.userData.c0) m.userData.c0 = m.color.clone(); m.color.copy(m.userData.c0).lerp(grey, k); } }); v.stages[3].rotation.z = [0, 0.015, 0.07, 0.16][wear]; v.stages[3].rotation.x = [0, 0, -0.03, 0.07][wear]; v.stages[3].scale.y = [1, 1, 0.92, 0.78][wear]; }
      if (!v.fade && v.vis !== target) {
        const next = target === 4 ? 4 : target < v.vis ? v.vis - 1 : Math.min(target, v.vis + 1), gap = target === 4 ? 1 : Math.abs(target - v.vis);
        const base = Math.max(0.35, Math.min(1.6, 1.6 / Math.sqrt(Math.max(1, speed / 2))));
        this.ensureStage(v, b, next);
        v.fade = { from: v.vis, to: next, t: 0, dur: gap > 1 ? 0.35 : (target === 4 ? 0.5 : base) };
        if (target === 4) this.dustBurst(v.root.position, b.tiles.length);
      }
      if (v.fade) {
        v.fade.t += dt; const k = Math.min(1, v.fade.t / v.fade.dur), e = k * k * (3 - 2 * k);
        this.setOpacity(v.stages[v.fade.from], 1 - e); this.setOpacity(v.stages[v.fade.to], e);
        if (k >= 1) { this.setOpacity(v.stages[v.fade.from], 0); v.vis = v.fade.to; v.fade = null; }
      }
      // distance/screen-size LOD: far buildings are drawn as batched per-chunk proxies (one draw call per chunk)
      const lvl = (v.fade || (this.underground && b.kind === 'shaft')) ? 0 : this.lodLevel(v.root.position, b.tiles.length === 4 ? 2 : 1, v.lod);
      if (lvl !== v.lod || (lvl > 0 && v.proxyKey !== v.vis * 10 + lvl)) { this.proxyDirty.add(chunkOf(v.root.position.x, v.root.position.z)); v.lod = lvl; }
      if (v.lod === 2) nBox++; else if (v.lod === 1) nProxy++; else nFull++;
      v.root.visible = (!this.underground || b.kind === 'shaft') && v.lod === 0;
      // smoke from active kilns / smelters / homes
      const em = v.emit[v.vis];
      if (em && em.length && !b.ruin && b.done && !this.underground && v.lod === 0) for (const e of em) {
        if (e.type === 'chips' || e.type === 'fish') { if (b.workers > 0) this.workFx(v, e, dt); continue; }
        const rate = e.type === 'fire' ? 1.4 : (e.type === 'chimney' || e.type === 'hut') ? (b.residents > 0 ? 0.8 : 0) : (b.workers > 0 ? 3 : 0.4);
        e.acc = (e.acc || 0) + dt * rate * this.q.smoke * Math.min(3, Math.sqrt(speed));
        while (e.acc >= 1) { e.acc -= 1; const p = v.root.localToWorld(new THREE.Vector3(e.x, e.y, e.z)); this.spawn(p, e.type === 'smelter' ? 0x6b6560 : e.type === 'kiln' ? 0x8f8984 : 0xc9c4bc, 0.16, 0.5, 3.2); }
      }
    }
    for (const [id, v] of this.bvis) if (!seen.has(id)) { if (v.lod === 0 && !this.underground) this.dustBurst(v.root.position, 0.4); if (v.lod > 0) this.proxyDirty.add(chunkOf(v.root.position.x, v.root.position.z)); this.groups.buildings.remove(v.root); this.disposeVis(v); this.bvis.delete(id); }
    if (this.proxyDirty.size) { for (const ci of this.proxyDirty) this.rebuildProxyChunk(ci); this.proxyDirty.clear(); }
    this.groups.proxies.visible = !this.underground;
    this.lodStats.buildingsFull = nFull; this.lodStats.buildingsSimplified = nProxy; this.lodStats.buildingsBox = nBox;
  }
  // ---------- LOD ----------
  pxPerUnit(p) { // on-screen pixels per world unit at p (orthographic: uniform; perspective: falls off with distance)
    const H = this.canvas.clientHeight || 1;
    if (this.cam.isOrthographicCamera) return H / (this.cam.top - this.cam.bottom);
    return H / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2) * Math.max(0.1, this.cam.position.distanceTo(p)));
  }
  lodLevel(pos, size, cur) {
    const k = cur === 1 ? 1.12 : 1; // hysteresis so objects near the threshold don't flicker
    const d = Math.hypot(pos.x - this.target.x, pos.z - this.target.z);
    const px = this.pxPerUnit(pos) * size;
    if (px >= this.q.bPx * k && d <= this.nearR / k) return 0;
    return (px >= this.q.bPx * 0.5 * (cur === 2 ? 1.12 : 1) && d <= this.nearR * 2.2) ? 1 : 2;
  }
  clearProxies() { for (const m of this.proxyMeshes.values()) { this.groups.proxies.remove(m); m.geometry.dispose(); } this.proxyMeshes.clear(); this.proxyDirty.clear(); }
  rebuildProxyChunk(ci) {
    const old = this.proxyMeshes.get(ci); if (old) { this.groups.proxies.remove(old); old.geometry.dispose(); this.proxyMeshes.delete(ci); }
    const geos = [];
    for (const v of this.bvis.values()) {
      if (v.lod < 1 || chunkOf(v.root.position.x, v.root.position.z) !== ci) continue;
      const pk = v.vis * 10 + v.lod;
      if (!v.proxyGeo || v.proxyKey !== pk) { if (v.proxyGeo) v.proxyGeo.dispose(); v.proxyGeo = v.lod === 1 ? this.makeSimplified(v) : this.makeProxy(v); v.proxyKey = pk; }
      if (v.proxyGeo) geos.push(v.proxyGeo);
    }
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), this.proxyMat); m.receiveShadow = true; this.groups.proxies.add(m); this.proxyMeshes.set(ci, m);
  }
  // LOD1: the real model with small details (windows, doors, props) dropped, baked to vertex colours so a whole chunk is one draw call
  makeSimplified(v) {
    const g = v.stages[v.vis]; if (!g) return null;
    const wasVis = g.visible; g.visible = true; v.root.updateMatrixWorld(true);
    const items = []; let total = 0;
    g.traverse(o => { if (!o.isMesh) return; const bb = new THREE.Box3().setFromObject(o), s = bb.getSize(new THREE.Vector3()), vol = s.x * s.y * s.z + s.x * s.z * 0.02; total += vol; items.push({ o, vol }); });
    g.visible = wasVis;
    const parts = [];
    for (const { o, vol } of items) {
      const md = o.material.userData; if (md.window) continue; if (vol < total * 0.012) continue;
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
      geo.applyMatrix4(o.matrixWorld);
      const c = o.material.color, n = geo.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n * 3; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(geo);
    }
    return parts.length ? mergeGeometries(parts) : this.makeProxy(v);
  }
  // LOD2 (very far): main body box + pyramid roof in the model's own colours (world space, vertex-coloured)
  makeProxy(v) {
    const g = v.stages[v.vis]; if (!g) return null;
    const wasVis = g.visible; g.visible = true; v.root.updateMatrixWorld(true);
    const meshes = []; g.traverse(o => { if (o.isMesh) meshes.push({ o, bb: new THREE.Box3().setFromObject(o) }); });
    g.visible = wasVis;
    if (!meshes.length) return null;
    const all = new THREE.Box3(); meshes.forEach(m => all.union(m.bb));
    const sz = (bb) => bb.getSize(new THREE.Vector3()), vol = (bb) => { const s = sz(bb); return s.x * s.y * s.z + 1e-6; };
    const pool = meshes.filter(m => !m.o.material.userData.window && !m.o.material.userData.glow);
    const P = pool.length ? pool : meshes, body = P.reduce((a, m) => vol(m.bb) > vol(a.bb) ? m : a);
    const parts = [];
    const add = (geo, color) => { geo = geo.index ? geo.toNonIndexed() : geo; for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); const n = geo.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n * 3; i += 3) { c[i] = color.r; c[i + 1] = color.g; c[i + 2] = color.b; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(geo); };
    const box = (bb, color) => { const s = sz(bb), c = bb.getCenter(new THREE.Vector3()), geo = new THREE.BoxGeometry(Math.max(0.02, s.x), Math.max(0.02, s.y), Math.max(0.02, s.z)); geo.translate(c.x, c.y, c.z); add(geo, color); };
    const y0 = v.root.position.y;
    if (v.vis === 3) {
      const bb = body.bb.clone(); bb.min.y = Math.min(bb.min.y, y0); box(bb, body.o.material.color);
      const roofs = P.filter(m => m !== body && m.bb.max.y > bb.max.y + 0.04);
      if (roofs.length) {
        const roof = roofs.reduce((a, m) => { const s = sz(m.bb), sa = sz(a.bb); return s.x * s.z > sa.x * sa.z ? m : a; });
        const rb = roof.bb, s = sz(rb), c = rb.getCenter(new THREE.Vector3()), h = rb.max.y - bb.max.y;
        const geo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); geo.rotateY(Math.PI / 4); geo.scale(Math.max(s.x, 0.05), h, Math.max(s.z, 0.05)); geo.translate(c.x, bb.max.y + h / 2, c.z); add(geo, roof.o.material.color);
      }
    } else { const bb = all.clone(); bb.min.y = y0; bb.max.y = y0 + Math.max(0.03, Math.min(all.max.y - y0, 0.06 + 0.1 * Math.min(v.vis, 3))); box(bb, body.o.material.color); }
    return mergeGeometries(parts);
  }
  // per-chunk LOD for terrain, trees and grass; cheap (one pass over chunks) and only when the view changes
  updateLOD() {
    const Q = this.q; this.nearR = Q.near * this.cam.top * Math.max(1.75, this.aspect || 1); // full-detail radius ~ visible ground x quality
    const cp = this.cam.position, key = [cp.x.toFixed(1), cp.y.toFixed(1), cp.z.toFixed(1), this.zoom.toFixed(3), this.qKey, this.underground, this.canvas.clientHeight].join();
    if (key === this.lodKey && !this.lodForce) return; this.lodKey = key; this.lodForce = false;
    const tx = this.target.x, tz = this.target.z, pv = new THREE.Vector3();
    const info = (cx, cy) => { const x = Math.max(cx * CH, Math.min((cx + 1) * CH, tx)), z = Math.max(cy * CH, Math.min((cy + 1) * CH, tz)); pv.set(x, 0, z); return [Math.hypot(x - tx, z - tz), this.pxPerUnit(pv)]; };
    const st = { terrainHi: 0, terrainLo: 0, treeChunksFull: 0, treeChunksImpostor: 0, grassChunks: 0, rockChunks: 0 };
    for (const c of this.terrChunks) { if (c.coarse) { c.lo.visible = true; st.terrainLo++; continue; } const [d, p] = info(c.cx, c.cy), hi = p >= Q.terrPx && d <= this.nearR * 1.2; c.hi.visible = hi; c.lo.visible = !hi; st[hi ? 'terrainHi' : 'terrainLo']++; }
    for (const c of this.treeChunks) { const [d, p] = info(c.cx, c.cy), k = c.lod === 1 ? 1.1 : 1, full = p >= Q.treePx * k && d <= this.nearR / k; c.lod = full ? 0 : 1; c.full.forEach(m => m.visible = full); c.imp.forEach(m => m.visible = !full); st[full ? 'treeChunksFull' : 'treeChunksImpostor']++; }
    for (const c of this.grassChunks) { const [d, p] = info(c.cx, c.cy);
      if (c.grass) { c.grass.visible = Q.grassNear > 0 && p >= Q.grassPx && d <= Q.grassNear * this.nearR / Q.near; if (c.grass.visible) st.grassChunks++; }
      if (c.rocks) { c.rocks.visible = p >= Q.treePx * 0.6 && d <= this.nearR; if (c.rocks.visible) st.rockChunks++; } }
    if (this.stumpMesh) this.stumpMesh.visible = this.pxPerUnit(this.target) >= Q.treePx * 0.8;
    Object.assign(this.lodStats, st, { pxPerUnit: +this.pxPerUnit(this.target).toFixed(1), nearRadius: +this.nearR.toFixed(1) });
  }

  // ---------- particles (smoke, dust) ----------
  initParticles() {
    this.MAXP = 1500; this.particles = [];
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.MAXP * 3); this.pSize = new Float32Array(this.MAXP); this.pAlpha = new Float32Array(this.MAXP); this.pCol = new Float32Array(this.MAXP * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3)); geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1)); geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    this.pMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: 30 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uScale; void main(){ vA = alpha; vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r) * vA; gl_FragColor = vec4(vC, a);
#include <colorspace_fragment>
}` });
    this.points = new THREE.Points(geo, this.pMat); this.points.frustumCulled = false; this.groups.fx.add(this.points);
  }
  spawn(p, color, size, alpha, life, vel) {
    if (this.particles.length >= this.MAXP) return;
    const c = new THREE.Color(color);
    this.particles.push({ x: p.x + (Math.random() - 0.5) * 0.04, y: p.y, z: p.z + (Math.random() - 0.5) * 0.04, vx: vel ? vel[0] : 0.05 + Math.random() * 0.04, vy: vel ? vel[1] : 0.18 + Math.random() * 0.08, vz: vel ? vel[2] : 0.02 + (Math.random() - 0.5) * 0.04, s: size, a: alpha, life, t: 0, r: c.r, g: c.g, b: c.b, grow: vel ? 0.25 : 0.6 });
  }
  // small work effects tied to a building: flying stone chips, a fish leaping by the trap
  workFx(v, e, dt) {
    e.t = (e.t || Math.random() * 2) + dt;
    if (e.type === 'chips') { if (e.t > 0.45) { e.t = 0; const p = v.root.localToWorld(new THREE.Vector3(e.x, e.y, e.z)); for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28; this.spawn(p, i % 2 ? 0xb9b4aa : 0x6f6a63, 0.035, 0.95, 0.5, [Math.cos(a) * 0.5, 0.35 + Math.random() * 0.3, Math.sin(a) * 0.5]); } } return; }
    if (!e.fish) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 5), new THREE.MeshStandardMaterial({ color: 0xaab8c4, metalness: 0.4, roughness: 0.35 })); f.rotation.z = Math.PI / 2; f.visible = false; v.root.add(f); e.fish = f; }
    const T0 = 3.2, k = (e.t % T0) / 0.7, f = e.fish; f.visible = k < 1;
    if (k < 1) { const a = (Math.floor(e.t / T0) * 2.1) % 6.28, r = 0.22; f.position.set(e.x + Math.cos(a) * r * (0.6 + k * 0.6), e.y + Math.sin(k * Math.PI) * 0.16, e.z + Math.sin(a) * r * (0.6 + k * 0.6)); f.rotation.set(0, -a, Math.PI / 2 + (k - 0.5) * 2.2); if (k < 0.05 || (k > 0.93 && !e.splash)) { e.splash = k > 0.5; const p = v.root.localToWorld(f.position.clone()); for (let i = 0; i < 6; i++) { const ang = Math.random() * 6.28; this.spawn(p, 0xe6f2f7, 0.04, 0.8, 0.45, [Math.cos(ang) * 0.25, 0.25, Math.sin(ang) * 0.25]); } } } else e.splash = false;
  }
  // ---------- visible workers: walking to sources and back, building, tending fields, laying roads ----------
  syncWorkers(state, dt) {
    const want = new Map(), near = this.nearR || 20, tx = this.target.x, tz = this.target.z;
    const ok = (x, y) => Math.hypot(x + 0.5 - tx, y + 0.5 - tz) < near * 1.1 && this.pxPerUnit(this.target) > 18;
    if (!this.underground) {
      for (const b of Object.values(state.buildings)) {
        if (b.ruin || !ok(b.x, b.y)) continue; const d = BUILDINGS[b.kind]; if (!d) continue;
        const cx = b.tiles.reduce((a, t) => a + t[0], 0) / b.tiles.length, cy = b.tiles.reduce((a, t) => a + t[1], 0) / b.tiles.length;
        if (!b.done && !b.dis) { const n = 1 + (b.tiles.length > 1 ? 1 : 0); for (let i = 0; i < n; i++) want.set(b.id + ':b' + i, { mode: 'build', cx, cy, r: 0.35 + 0.35 * Math.sqrt(b.tiles.length), i, lvl: b.levelLeft > 0 }); continue; }
        if (!b.done || !(b.workers > 0)) continue;
        if (b.src && d.extract) { const n = Math.min(b.workers, 2); for (let i = 0; i < n; i++) want.set(b.id + ':h' + i, { mode: 'haul', cx, cy, sx: b.src[0], sy: b.src[1], i, res: b.kind === 'woodcutter' ? 'wood' : b.kind === 'claypit' ? 'clay' : 'stone' }); }
        else if (b.kind === 'field') want.set(b.id + ':f', { mode: 'field', cx, cy, i: 0 });
      }
      for (const [x, y, w] of state.roadWork || []) if (ok(x, y)) want.set('r' + x + ',' + y, { mode: 'road', cx: x, cy: y, i: 0, fell: w === 'fell' });
    }
    this.wvis = this.wvis || new Map(); let n = 0;
    for (const [k, j] of want) {
      if (++n > 48) break;
      let v = this.wvis.get(k); if (!v) { const m = this.makeVillagerModel(); m.userData.ring.visible = false; m.scale.setScalar(1.45); this.groups.workers.add(m); v = { root: m, t: Math.random() * 10 }; this.wvis.set(k, v); }
      v.seen = true; v.t += dt; const ud = v.root.userData; let x = j.cx, z = j.cy, walk = false, work = false, face = null, load = null;
      if (j.mode === 'haul') {
        const d = Math.max(0.6, Math.hypot(j.sx - j.cx, j.sy - j.cy)), wt = d / 0.7, T0 = wt * 2 + 2.6, ph = (v.t + j.i * T0 * 0.5) % T0;
        if (ph < wt) { const f = ph / wt; x = j.cx + (j.sx - j.cx) * f; z = j.cy + (j.sy - j.cy) * f; walk = true; face = [j.sx - j.cx, j.sy - j.cy]; }
        else if (ph < wt + 2.6) { x = j.sx + (j.i ? 0.2 : -0.15); z = j.sy + 0.1; work = true; face = [j.sx - x, j.sy - z + 0.2];
          v.fx = (v.fx || 0) + dt; if (v.fx > 0.55) { v.fx = 0; const p = new THREE.Vector3(j.sx + 0.5, this.heightAt(j.sx + 0.5, j.sy + 0.5) + 0.08, j.sy + 0.6); for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; this.spawn(p, j.res === 'wood' ? 0xc9a36a : j.res === 'clay' ? 0xa0704a : 0xb0aaa0, 0.035, 0.9, 0.55, [Math.cos(a) * 0.35, 0.3 + Math.random() * 0.3, Math.sin(a) * 0.35]); } } }
        else { const f = (ph - wt - 2.6) / wt; x = j.sx + (j.cx - j.sx) * f; z = j.sy + (j.cy - j.sy) * f; walk = true; face = [j.cx - j.sx, j.cy - j.sy]; load = j.res; }
      } else if (j.mode === 'build' || j.mode === 'field' || j.mode === 'road') {
        const pts = j.mode === 'build' ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [j.cx + a * j.r, j.cy + c * j.r]) : j.mode === 'field' ? [[-0.6, -0.5], [0.8, -0.5], [0.8, 0.2], [-0.6, 0.2], [-0.6, 0.9], [0.8, 0.9]].map(([a, c]) => [j.cx + 0.5 + a, j.cy + c]) : [[j.cx - 0.15, j.cy + 0.1], [j.cx + 0.2, j.cy - 0.1]];
        const seg = 3.0, T0 = pts.length * seg, ph = (v.t + j.i * T0 * 0.5) % T0, si = Math.floor(ph / seg), f = ph / seg - si, a = pts[si], b2 = pts[(si + 1) % pts.length];
        if (f < 0.4) { const g = f / 0.4; x = a[0] + (b2[0] - a[0]) * g; z = a[1] + (b2[1] - a[1]) * g; walk = true; face = [b2[0] - a[0], b2[1] - a[1]]; }
        else { x = b2[0]; z = b2[1]; work = true; face = [j.cx - x, j.cy - z];
          v.fx = (v.fx || 0) + dt; if (v.fx > 0.6) { v.fx = 0; const p = new THREE.Vector3(x + 0.5, this.heightAt(x + 0.5, z + 0.5) + 0.05, z + 0.5); for (let i = 0; i < 4; i++) { const an = Math.random() * 6.28; this.spawn(p, j.fell ? 0xc9a36a : j.mode === 'field' ? 0x8a7350 : 0xb5a58a, j.mode === 'build' && !j.lvl ? 0.05 : 0.09, 0.6, 0.7, [Math.cos(an) * 0.2, 0.18, Math.sin(an) * 0.2]); } } }
        if (j.mode === 'field' && work) { ud.body.rotation.x = 0.5; }
      }
      v.root.position.set(x + 0.5, Math.max(WATER_Y, this.heightAt(x + 0.5, z + 0.5)), z + 0.5);
      if (face && (face[0] || face[1])) v.root.rotation.y = Math.atan2(face[0], face[1]);
      v.ph = (v.ph || 0) + dt * (walk ? 9 : 0); const sw = walk ? Math.sin(v.ph) * 0.6 : 0; ud.legs[0].rotation.x = sw; ud.legs[1].rotation.x = -sw; ud.body.position.y = walk ? Math.abs(Math.sin(v.ph)) * 0.012 : 0;
      if (work) v.wph = (v.wph || 0) + dt * 7; ud.tool.rotation.x = work ? -0.6 - Math.max(0, Math.sin(v.wph)) * 1.5 : walk ? Math.sin(v.ph) * 0.4 : 0; if (j.mode !== 'field' || !work) ud.body.rotation.x = work ? Math.max(0, Math.sin(v.wph)) * 0.18 : 0;
      ud.load.visible = !!load; if (load) ud.load.material.color.setHex({ wood: 0x9c6b3e, stone: 0x9a9a96, clay: 0xc4865a }[load]);
      v.root.visible = true;
    }
    for (const [k, v] of this.wvis) { if (!v.seen) { this.groups.workers.remove(v.root); v.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); this.wvis.delete(k); } else v.seen = false; }
  }
  // ---------- wildlife ----------
  makeAnimalModel(kind) {
    const g = new THREE.Group(), M = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }), body = new THREE.Group(); g.add(body);
    const C = { deer: [0x9a6a3e, 0xe8dcc6], boar: [0x4a3a2e, 0x2e241c], wolf: [0x8a8a86, 0xd0ccc4], bear: [0x5a3e28, 0x3e2a1a] }[kind];
    const S = { deer: [0.2, 0.09, 0.07, 0.13], boar: [0.17, 0.09, 0.09, 0.06], wolf: [0.18, 0.07, 0.065, 0.09], bear: [0.26, 0.14, 0.13, 0.09] }[kind]; // body length, height, width, leg length
    const [L, H, W, LL] = S, add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; body.add(o); return o; };
    add(new THREE.BoxGeometry(W, H, L), M(C[0]), 0, LL + H / 2, 0);
    const head = add(new THREE.BoxGeometry(W * 0.8, H * 0.75, H * 0.9), M(C[0]), 0, LL + H * (kind === 'deer' ? 1.35 : 0.75), L / 2 + H * 0.35);
    add(new THREE.BoxGeometry(W * 0.5, H * 0.4, H * 0.5), M(C[1]), 0, LL + H * (kind === 'deer' ? 1.2 : 0.55), L / 2 + H * 0.85);
    if (kind === 'deer') { add(new THREE.BoxGeometry(0.035, 0.12, 0.04), M(C[0]), 0, LL + H * 1.0, L / 2 + 0.01, 0.5); for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.004, 0.006, 0.09, 4), M(0xd9c7a0), sx * 0.025, LL + H * 1.9, L / 2 + H * 0.3, 0, 0, sx * 0.4); add(new THREE.CylinderGeometry(0.003, 0.004, 0.04, 4), M(0xd9c7a0), sx * 0.04, LL + H * 2.2, L / 2 + H * 0.45, 0.6, 0, sx * 0.4); } add(new THREE.BoxGeometry(0.03, 0.03, 0.02), M(0xf4efe6), 0, LL + H * 0.85, -L / 2); }
    if (kind === 'boar') { for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.006, 0.03, 4), M(0xf1ead8), sx * 0.025, LL + H * 0.5, L / 2 + H * 1.05, -1.2); add(new THREE.BoxGeometry(0.02, 0.03, L * 0.6), M(0x2a2018), 0, LL + H * 1.05, 0); }
    if (kind === 'wolf') { add(new THREE.ConeGeometry(0.012, 0.03, 4), M(C[0]), -0.02, LL + H * 1.25, L / 2 + H * 0.3); add(new THREE.ConeGeometry(0.012, 0.03, 4), M(C[0]), 0.02, LL + H * 1.25, L / 2 + H * 0.3); add(new THREE.CylinderGeometry(0.012, 0.018, 0.1, 5), M(C[0]), 0, LL + H * 0.8, -L / 2 - 0.04, -0.9); }
    if (kind === 'bear') { for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.018, 5, 4), M(C[0]), sx * 0.035, LL + H * 1.15, L / 2 + H * 0.25); add(new THREE.BoxGeometry(W * 0.9, H * 0.3, L * 0.3), M(C[0]), 0, LL + H * 1.05, L * 0.2); }
    g.userData.legs = []; for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, LL, W * 0.22), M(C[0])); l.geometry.translate(0, -LL / 2, 0); l.position.set(sx * W * 0.32, LL, sz * L * 0.36); l.castShadow = true; body.add(l); g.userData.legs.push(l); }
    g.userData.body = body; g.userData.head = head; g.scale.setScalar(1.5); return g;
  }
  // neighbouring towns: their houses in their own style, a banner in the town colour; only where explored
  syncTowns(state) {
    if (!state.towns) return;
    this.townVis = this.townVis || new Map(); const seen = new Set();
    for (const town of state.towns) {
      const K = TOWN_KINDS[town.kind];
      town.houses.forEach((p, i) => {
        const t = tile(state, p.x, p.y); if (!t || !t.vis) return;
        const key = town.id + ':' + i + ':' + p.kind; seen.add(key); if (this.townVis.has(key)) return;
        const { group } = buildModel({ id: 0, kind: p.kind, tiles: [[p.x, p.y]], rot: p.rot }, 3, () => 0);
        group.position.set(p.x + 0.5, this.topXY(p.x, p.y), p.y + 0.5); group.rotation.y = p.rot * Math.PI / 2;
        if (i === 0) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x5e3d22 })); pole.position.set(0.38, 0.35, 0.38); const flag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.01), new THREE.MeshStandardMaterial({ color: K.color, roughness: 0.9 })); flag.position.set(0.48, 0.62, 0.38); group.add(pole, flag); }
        group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        this.groups.towns.add(group); this.townVis.set(key, group);
      });
    }
    for (const [k, g] of this.townVis) if (!seen.has(k)) { this.groups.towns.remove(g); g.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); this.townVis.delete(k); }
    // borders: a line in the culture's colour along the edge of each neighbour's land (only where explored)
    const pos = [], col = [], c = new THREE.Color();
    const edge = (x0, z0, x1, z1, y) => { pos.push(x0, y, z0, x1, y, z1); col.push(c.r, c.g, c.b, c.r, c.g, c.b); };
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const t = tile(this.state, x, y); if (!t || !t.town || !t.vis) continue;
      const town = state.towns.find(o => o.id === t.town); if (!town) continue; c.setHex(TOWN_KINDS[town.kind].color);
      const yy = this.topXY(x, y) + 0.05, other = (nx, ny) => { const n = tile(state, nx, ny); return !n || n.town !== t.town; };
      if (other(x + 1, y)) edge(x + 1, y, x + 1, y + 1, Math.max(yy, this.topXY(Math.min(SIZE - 1, x + 1), y) + 0.05));
      if (other(x - 1, y)) edge(x, y, x, y + 1, Math.max(yy, this.topXY(Math.max(0, x - 1), y) + 0.05));
      if (other(x, y + 1)) edge(x, y + 1, x + 1, y + 1, Math.max(yy, this.topXY(x, Math.min(SIZE - 1, y + 1)) + 0.05));
      if (other(x, y - 1)) edge(x, y, x + 1, y, Math.max(yy, this.topXY(x, Math.max(0, y - 1)) + 0.05));
    }
    if (this.borderLines) { this.groups.towns.remove(this.borderLines); this.borderLines.geometry.dispose(); this.borderLines = null; }
    if (pos.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      this.borderLines = new THREE.LineSegments(g, this.borderMat || (this.borderMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }))); this.groups.towns.add(this.borderLines); }
  }
  syncAnimals(state, frac, dt) {
    this.avis = this.avis || new Map(); const seen = new Set();
    for (const a of state.animals || []) {
      seen.add(a.id); let v = this.avis.get(a.id); if (!v) { v = { root: this.makeAnimalModel(a.kind), ph: Math.random() * 6 }; this.groups.animals.add(v.root); this.avis.set(a.id, v); }
      const x = a.px + (a.x - a.px) * frac, z = a.py + (a.y - a.py) * frac, mv = Math.hypot(a.x - a.px, a.y - a.py) > 0.02;
      const fi = Math.max(0, Math.min(SIZE - 1, Math.floor(z + 0.5))) * SIZE + Math.max(0, Math.min(SIZE - 1, Math.floor(x + 0.5)));
      v.root.visible = !this.underground && (this.fogCur ? this.fogCur[fi] > 0.5 : true);
      if (!v.root.visible) continue;
      v.root.position.set(x + 0.5, Math.max(WATER_Y, this.heightAt(x + 0.5, z + 0.5)), z + 0.5);
      if (mv) { const ty = Math.atan2(a.x - a.px, a.y - a.py); let d = ty - v.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); v.root.rotation.y += d * Math.min(1, dt * 8); }
      const sp = a.st === 'run' || a.st === 'attack' ? 16 : 9; v.ph += dt * (mv ? sp : 0); const sw = mv ? Math.sin(v.ph) * 0.7 : 0, L = v.root.userData.legs;
      L[0].rotation.x = sw; L[3].rotation.x = sw; L[1].rotation.x = -sw; L[2].rotation.x = -sw;
      v.root.userData.head.rotation.x = !mv && a.st === 'graze' ? 0.5 + Math.sin(this.clock * 1.3 + a.id) * 0.2 : 0; // grazing
      v.root.userData.body.position.y = mv ? Math.abs(Math.sin(v.ph)) * 0.01 : 0;
    }
    for (const [id, v] of this.avis) if (!seen.has(id)) { this.groups.animals.remove(v.root); this.avis.delete(id); }
  }
  dustBurst(pos, n) {
    for (let i = 0; i < 70 * n; i++) { const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.5; this.spawn({ x: pos.x + Math.cos(a) * 0.2, y: pos.y + 0.05 + Math.random() * 0.1, z: pos.z + Math.sin(a) * 0.2 }, Math.random() < 0.5 ? 0xa8957c : 0x8c7a64, 0.22 + Math.random() * 0.2, 0.7, 2.5 + Math.random() * 2, [Math.cos(a) * sp, 0.12 + Math.random() * 0.25, Math.sin(a) * sp]); }
  }
  updateParticles(dt) {
    const P = this.particles; let n = 0;
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.t += dt; if (p.t >= p.life) { P[i] = P[P.length - 1]; P.pop(); } }
    for (const p of P) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.995; p.vz *= 0.995; if (p.grow < 0.5) { p.vx *= 0.97; p.vz *= 0.97; p.vy *= 0.97; }
      const k = p.t / p.life;
      this.pPos[n * 3] = p.x; this.pPos[n * 3 + 1] = p.y; this.pPos[n * 3 + 2] = p.z; this.pSize[n] = p.s * (1 + k * p.grow * 3); this.pAlpha[n] = p.a * Math.min(1, p.t * 4) * (1 - k);
      this.pCol[n * 3] = p.r; this.pCol[n * 3 + 1] = p.g; this.pCol[n * 3 + 2] = p.b; n++;
    }
    const geo = this.points.geometry; geo.setDrawRange(0, n); for (const k of ['position', 'size', 'alpha', 'color']) geo.attributes[k].needsUpdate = true;
    this.pMat.uniforms.uScale.value = this.r.domElement.height / (this.cam.top - this.cam.bottom);
    this.points.visible = !this.underground;
  }

  // ---------- vehicles ----------
  vehicleModel(task) {
    const g = new THREE.Group(), M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; g.add(o); return o; };
    const body = task === 'rescue' ? 0xf2efe6 : 0x9c6b3e, trim = task === 'rescue' ? 0xc0392b : 0xe08a2a;
    add(new THREE.BoxGeometry(0.2, 0.06, 0.32), M(0x6b4527), 0, 0.09, -0.08);
    add(new THREE.BoxGeometry(0.2, 0.08, 0.3), M(body), 0, 0.16, -0.08);
    add(new THREE.BoxGeometry(0.21, 0.02, 0.31), M(trim), 0, 0.2, -0.08);
    if (task === 'rescue') add(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 10, 1, false, 0, Math.PI), M(0xf7f4ec), 0, 0.2, -0.08, Math.PI / 2, 0, Math.PI / 2);
    else for (let i = 0; i < 3; i++) add(new THREE.DodecahedronGeometry(0.045, 0), M(0x7a6e60), (i - 1) * 0.05, 0.23, -0.08 + (i % 2) * 0.04);
    for (const [sx, sz] of [[-1, -0.18], [1, -0.18], [-1, 0.02], [1, 0.02]]) { add(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12), M(0x3a2a1c), sx * 0.11, 0.055, sz, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.015, 0.015, 0.024, 6), M(0x9a8a6a), sx * 0.11, 0.055, sz, 0, 0, Math.PI / 2); }
    add(new THREE.BoxGeometry(0.015, 0.015, 0.2), M(0x6b4527), -0.04, 0.1, 0.14); add(new THREE.BoxGeometry(0.015, 0.015, 0.2), M(0x6b4527), 0.04, 0.1, 0.14);
    const horse = new THREE.Group(); horse.position.set(0, 0, 0.24); g.add(horse); g.userData.horse = horse;
    const hm = M(0x6b4a2e), hd = M(0x4a3220);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.2), hm); hb.position.y = 0.14; horse.add(hb);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.05), hm); neck.position.set(0, 0.2, 0.09); neck.rotation.x = 0.5; horse.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), hm); head.position.set(0, 0.25, 0.14); horse.add(head);
    g.userData.legs = [];
    for (const [sx, sz] of [[-1, -0.07], [1, -0.07], [-1, 0.07], [1, 0.07]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), hd); l.position.set(sx * 0.03, 0.05, sz); horse.add(l); g.userData.legs.push(l); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc040, emissiveIntensity: 3 }));
    lamp.position.set(0.11, 0.27, 0.07); g.add(lamp); g.userData.lamp = lamp;
    g.scale.setScalar(1.5); return g;
  }
  syncVehicles(state, frac, dt) {
    const seen = new Set();
    for (const c of state.crews) {
      if (c.state === 'idle' || !c.path) continue; seen.add(c.id);
      let v = this.vvis.get(c.id); const key = c.state + c.path.join(';');
      if (!v || v.task !== c.task) { if (v) this.groups.vehicles.remove(v.root); v = { root: this.vehicleModel(c.task || 'rescue'), task: c.task, key: '' }; this.groups.vehicles.add(v.root); this.vvis.set(c.id, v); }
      if (v.key !== key) { v.key = key; const pts = c.path.map(([x, y]) => new THREE.Vector3(x + 0.5, this.topXY(x, y) + 0.012, y + 0.5)); v.curve = pts.length > 1 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal') : null; v.p0 = pts[0]; v.len = pts.length; }
      const moving = c.state === 'out' || c.state === 'back', pos = Math.min(v.len - 1, c.pos + (moving ? CREW_SPEED * frac : 0));
      if (v.curve) {
        const u = Math.max(0, Math.min(1, pos / (v.len - 1))), p = v.curve.getPoint(u), tg = v.curve.getTangent(Math.min(0.999, Math.max(0.001, u)));
        v.root.position.copy(p); const yaw = Math.atan2(tg.x, tg.z); let dy = yaw - v.root.rotation.y; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; v.root.rotation.y += dy * Math.min(1, dt * 10);
      } else v.root.position.copy(v.p0);
      const gait = moving ? this.clock * 16 : 0;
      v.root.userData.legs.forEach((l, i) => l.rotation.x = Math.sin(gait + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5);
      v.root.userData.horse.position.y = moving ? Math.abs(Math.sin(gait)) * 0.008 : 0;
      v.root.userData.lamp.material.emissiveIntensity = 2 + this.night * 3 + Math.sin(this.clock * (c.task === 'rescue' ? 12 : 3)) * 1.2;
      if (moving && Math.random() < dt * 6 * this.q.smoke) this.spawn(v.root.position, 0xb8a582, 0.1, 0.35, 1.2, [(Math.random() - 0.5) * 0.1, 0.05, (Math.random() - 0.5) * 0.1]);
      v.root.visible = !this.underground;
    }
    for (const [id, v] of this.vvis) if (!seen.has(id)) { this.groups.vehicles.remove(v.root); this.vvis.delete(id); }
  }

  // ---------- trains: an engine and two wagons running along the track ----------
  makeTrainCar(engine) {
    const g = new THREE.Group(), M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, flatShading: true, ...o }), B = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    const black = M(0x1e1f22), red = M(0x8b1e1e), wood = M(0x6a4a2e);
    B(0.28, 0.03, 0.72, black, 0, 0.05, 0);
    for (const z of [-0.24, 0, 0.24]) for (const x of [-0.13, 0.13]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), black); w.rotation.z = Math.PI / 2; w.position.set(x, 0.05, z); g.add(w); }
    if (engine) { const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 12), black); boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 0.17, 0.1); boiler.castShadow = true; g.add(boiler);
      B(0.26, 0.24, 0.22, red, 0, 0.18, -0.22); B(0.3, 0.03, 0.26, black, 0, 0.31, -0.22); const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.14, 8), black); ch.position.set(0, 0.32, 0.26); g.add(ch);
      B(0.24, 0.03, 0.04, M(0xc9a640, { metalness: 0.7 }), 0, 0.2, 0.33); g.userData.chimney = new THREE.Vector3(0, 0.42, 0.26); }
    else { B(0.27, 0.16, 0.66, wood, 0, 0.14, 0); const load = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), M(0x26262a)); load.scale.set(1, 0.5, 2.3); load.position.set(0, 0.24, 0); g.add(load); }
    return g;
  }
  syncTrains(state, frac, dt) {
    this.trvis = this.trvis || new Map(); const seen = new Set();
    for (const tr of state.trains || []) {
      seen.add(tr.id); let v = this.trvis.get(tr.id);
      if (!v) { v = { cars: [this.makeTrainCar(true), this.makeTrainCar(false), this.makeTrainCar(false)] }; v.cars.forEach(c => this.groups.trains.add(c)); this.trvis.set(tr.id, v); }
      const path = tr.path, moving = !!path && tr.wait <= 0, pos = path ? Math.min(path.length - 1, tr.pos + (moving ? 4 * frac : 0)) : 0;
      const at = (q) => { if (!path) return null; q = Math.max(0, Math.min(path.length - 1, q)); const i = Math.floor(q), f = q - i, a = path[i], b = path[Math.min(path.length - 1, i + 1)]; return [a[0] + (b[0] - a[0]) * f + 0.5, a[1] + (b[1] - a[1]) * f + 0.5]; };
      v.cars.forEach((car, k) => { const p = at(pos - k * 0.85), p2 = at(pos - k * 0.85 + 0.2); if (!p) { car.visible = false; return; }
        const fi = Math.max(0, Math.min(SIZE * SIZE - 1, Math.floor(p[1]) * SIZE + Math.floor(p[0])));
        car.visible = !this.underground && (!this.fogCur || this.fogCur[fi] > 0.5);
        car.position.set(p[0], this.topXY(Math.floor(p[0]), Math.floor(p[1])) + 0.04, p[1]);
        if (p2 && (p2[0] !== p[0] || p2[1] !== p[1])) car.rotation.y = Math.atan2(p2[0] - p[0], p2[1] - p[1]); });
      const eng = v.cars[0]; if (moving && eng.visible && Math.random() < dt * 10 * this.q.smoke) { const c = eng.userData.chimney.clone().applyEuler(eng.rotation).add(eng.position); this.spawn(c, 0xd9d9d9, 0.12, 0.6, 2.2, [(Math.random() - 0.5) * 0.08, 0.25, (Math.random() - 0.5) * 0.08]); }
    }
    for (const [id, v] of this.trvis) if (!seen.has(id)) { v.cars.forEach(c => this.groups.trains.remove(c)); this.trvis.delete(id); }
  }

  // ---------- ghost / picking / camera ----------
  // drawn road line before it is dropped: green = ok, amber = trees to fell first, red = can't build there
  setRoadPreview(list) {
    if (this.roadPrev) { this.groups.ghost.remove(this.roadPrev); this.roadPrev.geometry.dispose(); this.roadPrev = null; }
    if (!list || !list.length) return;
    const geo = new THREE.BoxGeometry(0.9, 0.04, 0.9), m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }), list.length), mx = new THREE.Matrix4(), c = new THREE.Color();
    list.forEach(([x, y, k], i) => { mx.makeTranslation(x + 0.5, this.heightAt(x + 0.5, y + 0.5) + 0.03, y + 0.5); m.setMatrixAt(i, mx); m.setColorAt(i, c.setHex(k === 1 ? 0x4ade80 : k === 2 ? 0xf5b041 : 0xef4444)); });
    this.groups.ghost.add(m); this.roadPrev = m;
  }
  setGhost(g) {
    const grp = this.groups.ghost; for (const o of [...grp.children]) if (o !== this.roadPrev) grp.remove(o); if (!g || !this.state) return;
    const t = tile(this.state, g.x, g.y); if (!t) return;
    const s = g.size || 1, h = g.h || 0.5;
    const m = new THREE.Mesh(new THREE.BoxGeometry(g.block ? 0.5 : s * 0.95, h, g.block ? 0.5 : s * 0.95), new THREE.MeshBasicMaterial({ color: g.ok ? (g.level ? 0xf5b041 : 0x4ade80) : 0xef4444, transparent: true, opacity: 0.4, depthWrite: false }));
    if (g.block) m.position.set(g.sx / 2 + 0.25, this.topXY(g.x, g.y) + g.z * 0.5 + 0.25, g.sy / 2 + 0.25); else m.position.set(g.x + s / 2, this.topXY(g.x, g.y) + h / 2, g.y + s / 2);
    grp.add(m);
    const ring = new THREE.Mesh(new THREE.RingGeometry(s * 0.5, s * 0.56, 4, 1, Math.PI / 4), new THREE.MeshBasicMaterial({ color: g.ok ? 0x4ade80 : 0xef4444, transparent: true, opacity: 0.9, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(Math.SQRT2);
    if (!g.block) { ring.position.set(g.x + s / 2, this.topXY(g.x, g.y) + 0.02, g.y + s / 2); grp.add(ring); }
  }
  pick(clientX, clientY) {
    if (!this.terrainMesh) return null;
    const rect = this.r.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1), this.cam);
    const hit = this.raycaster.intersectObject(this.terrainMesh, false)[0]; if (!hit) return null;
    const idx = hit.instanceId, x = idx % SIZE, y = Math.floor(idx / SIZE);
    return { x, y, sx: Math.max(x * 2, Math.min(x * 2 + 1, Math.floor(hit.point.x * 2))), sy: Math.max(y * 2, Math.min(y * 2 + 1, Math.floor(hit.point.z * 2))) };
  }
  setUnderground(on) { this.underground = on; this.applyUnderground(); }
  applyUnderground() {
    const on = this.underground;
    if (this.terrainMat) { this.terrainMat.transparent = on; this.terrainMat.opacity = on ? 0.09 : 1; this.terrainMat.depthWrite = !on; this.terrainMat.needsUpdate = true; }
    if (this.skirt) this.skirt.visible = !on;
    if (on && this.underStale && this.state) { this.underStale = false; this.buildUnder(this.state); }
    for (const k of ['trees', 'roads', 'grass', 'berries', 'water', 'earth']) this.groups[k].visible = !on;
    this.groups.under.visible = on; this.scene.background = on ? this.skyUnder : this.skyTex; this.scene.fog.color.setHex(on ? 0x1a1613 : 0xc6d8e6);
  }
  // screen-space unit picking (units are small; pick within a finger-sized radius) and box selection
  unitScreen(id) { const v = this.uvis.get(id); if (!v) return null; const p = v.root.position.clone(); p.y += 0.15; p.project(this.cam); const r = this.canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; }
  unitAtScreen(cx, cy, rad = 24) { let best = null, bd = rad; for (const id of this.uvis.keys()) { const p = this.unitScreen(id); if (!p) continue; const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = id; } } return best; }
  unitsInRect(x0, y0, x1, y1) { const out = []; for (const id of this.uvis.keys()) { const p = this.unitScreen(id); if (p && p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && p.y >= Math.min(y0, y1) && p.y <= Math.max(y0, y1)) out.push(id); } return out; }
  rotate(dir) { this.angleTarget = Math.round(this.angleTarget / (Math.PI / 2)) * Math.PI / 2 + dir * Math.PI / 2; }
  // free rotation (touch twist); snapRotation() eases to the nearest quarter turn afterwards
  twist(rad) { this.angleTarget += rad; this.angle += rad; }
  snapRotation() { this.angleTarget = Math.round(this.angleTarget / (Math.PI / 2)) * Math.PI / 2; }
  // smooth zoom: input changes zoomTarget, the camera eases toward it (log-space, frame-rate independent)
  zoomBy(f) { this.zoomTarget = Math.max(0.3, Math.min(4, (this.zoomTarget ?? this.zoom) * f)); }
  // keyboard pan: ix/iz in -1..1 (screen right / up); accelerates, then glides to a stop on release
  panInput(ix, iz, dt) {
    const v = this.panVel || (this.panVel = { x: 0, z: 0 }), len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; } // diagonal normalisation
    const sp = 15 / this.zoom, k = 1 - Math.exp(-dt * (len ? 9 : 5));
    v.x += (ix * sp - v.x) * k; v.z += (iz * sp - v.z) * k;
    if (!len && this.dragVel) { v.x = this.dragVel.x; v.z = this.dragVel.z; this.dragVel = null; } // release inertia from a drag
    if (Math.abs(v.x) + Math.abs(v.z) > 0.01) this.pan(v.x * dt, v.z * dt); else v.x = v.z = 0;
  }
  // drag pan: follow the pointer exactly; remember velocity (world units/s) for a gentle glide on release
  dragPan(dxPx, dyPx, dt) {
    const k = 24 / this.zoom / this.canvas.clientHeight, dx = -dxPx * k, dz = dyPx * k * Math.SQRT2;
    this.pan(dx, dz); const v = this.dragTrack || (this.dragTrack = { x: 0, z: 0 }), a = Math.min(1, dt * 18);
    if (dt > 0) { v.x += (dx / dt - v.x) * a; v.z += (dz / dt - v.z) * a; }
    if (this.panVel) this.panVel.x = this.panVel.z = 0;
  }
  dragEnd(fling = true) {
    const v = this.dragTrack; this.dragTrack = null; if (!v || !fling) return;
    const sp = Math.hypot(v.x, v.z), max = 30 / this.zoom; if (sp < 0.5) return;
    const f = Math.min(1, max / sp) * 0.6; this.dragVel = { x: v.x * f, z: v.z * f };
  }
  pan(dx, dz) {
    const a = this.angle + Math.PI / 4, fx = -Math.cos(a), fz = -Math.sin(a), rx = -fz, rz = fx;
    this.target.x = Math.max(0, Math.min(SIZE, this.target.x + rx * dx + fx * dz)); this.target.z = Math.max(0, Math.min(SIZE, this.target.z + rz * dx + fz * dz));
  }
  updateCamera(dt) {
    if (this.autoOrbit) this.angleTarget += dt * 0.06;
    this.angle += (this.angleTarget - this.angle) * (1 - Math.exp(-dt * 9));
    if (this.zoom !== this.zoomSet) this.zoomTarget = this.zoom; // zoom set directly (tests / code)
    if (this.zoomTarget !== undefined && this.zoomTarget !== this.zoom) { const r = Math.log(this.zoomTarget / this.zoom); this.zoom = Math.abs(r) < 0.002 ? this.zoomTarget : this.zoom * Math.exp(r * (1 - Math.exp(-dt * 11))); }
    this.zoomSet = this.zoom;
    const a = this.angle + Math.PI / 4, el = Math.atan(1 / Math.SQRT2), dist = 110;
    this.cam.position.set(this.target.x + Math.cos(a) * Math.cos(el) * dist, Math.sin(el) * dist, this.target.z + Math.sin(a) * Math.cos(el) * dist);
    this.cam.lookAt(this.target);
    const half = 12 / this.zoom; Object.assign(this.cam, { left: -half * this.aspect, right: half * this.aspect, top: half, bottom: -half }); this.cam.updateProjectionMatrix();
    const sh = Math.min(this.q.shadowDist || 32, half * Math.max(1, this.aspect) * 1.25); /* shadow distance limit */ Object.assign(this.sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh }); this.sun.shadow.camera.updateProjectionMatrix();
    const sa = a + 2.1; this.sun.position.set(this.target.x + Math.cos(sa) * 38, 34, this.target.z + Math.sin(sa) * 38); this.sun.target.position.copy(this.target);
    const hz = this.q.haze * Math.min(1, Math.max(0.15, 1.4 - this.zoom)); this.scene.fog.near = (this.underground ? 400 : 0) + dist - half * 0.6; this.scene.fog.far = (this.underground ? 400 : 0) + dist + half * (1.6 / Math.max(0.05, hz));
  }

  // auto quality: after a warm-up, 5 slow seconds in a row (under 24 fps, tab visible) step down one tier; never steps up on its own
  watchdog() {
    if (!this.autoQ || document.hidden) { this.slow = 0; return; }
    this.wdT = (this.wdT || 0) + 1; if (this.wdT < 8) return;
    this.slow = this.fps < 24 ? (this.slow || 0) + 1 : 0;
    if (this.slow >= 5) { const i = QUALITY_ORDER.indexOf(this.qKey); if (i > 0) { this.setQuality(QUALITY_ORDER[i - 1]); this.wdT = 0; if (this.onAutoQuality) this.onAutoQuality(this.qKey); } this.slow = 0; }
  }
  // ---------- per frame ----------
  frame(state, frac, dt, speed) {
    this.clock += dt; this.uTime.value = this.clock;
    if (this.grade) this.grade.uniforms.uTilt.value = this.q.tilt * Math.max(0, Math.min(1, (this.zoom - 1.2) / 1.2)); // tilt-shift only when close in
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; this.watchdog(); }
    const d = state.dirty || {};
    if (d.fog || d.all) this.syncFogTarget(state, d.all);
    if (d.fog && !d.all && this.seen) { const k = this.computeSeen(state).join(''); if (k !== this.seenKey) d.terrain = true; }
    this.stepFog(dt);
    if (d.under && !d.all && !this.underground) { this.underStale = true; d.under = false; }
    if (!d.all && (d.terrain || d.trees || d.grass || d.under)) { const now = performance.now(); if (now - (this.lastHeavy || 0) < 330) { this.pend = Object.assign(this.pend || {}, { terrain: d.terrain, trees: d.trees, grass: d.grass, under: d.under }); d.terrain = d.trees = d.grass = d.under = false; } else this.lastHeavy = now; }
    if (this.pend && performance.now() - (this.lastHeavy || 0) >= 330) { for (const k in this.pend) if (this.pend[k]) d[k] = true; this.pend = null; this.lastHeavy = performance.now(); }
    if (d.all) { this.buildTerrain(state); this.buildTrees(state); this.buildGrass(state); this.buildRoads(state); this.buildEarth(state); this.buildUnder(state); this.buildOverlay(state); this.buildDraft(state); for (const v of this.bvis.values()) { this.groups.buildings.remove(v.root); this.disposeVis(v); } this.bvis.clear(); this.clearProxies(); }
    else {
      if (d.terrain) this.buildTerrain(state);
      if (d.trees || d.terrain) this.buildTrees(state);
      if (d.grass || d.terrain || d.roads || d.buildings) this.buildGrass(state);
      if (d.roads) this.buildRoads(state);
      if (d.earth || d.terrain) this.buildEarth(state);
      if (d.under || d.buildings) this.buildUnder(state);
      if (d.overlay || (d.buildings && state.flags.riskOverlay)) this.buildOverlay(state);
      if (d.draft) this.buildDraft(state);
    }
    if (d.all || d.berries || d.terrain || d.buildings || d.roads) this.buildBerries(state);
    if (this.earthKey !== undefined && this.earthKey !== this.earthStageKey(state)) this.buildEarth(state);
    if (d.all && this.townVis) { for (const g of this.townVis.values()) this.groups.towns.remove(g); this.townVis.clear(); }
    if (d.all || d.towns || d.fog) this.syncTowns(state);
    state.dirty = {};
    this.syncFelling(state, dt);
    this.syncBuildings(state, dt, speed); this.syncVehicles(state, frac, dt); this.syncTrains(state, frac, dt); this.syncUnits(state, frac, dt); this.syncAnimals(state, frac, dt); this.syncWorkers(state, dt); this.updateParticles(dt);
    this.waterMat.normalMap.offset.x = this.clock * 0.012; this.waterMat.normalMap.offset.y = this.clock * 0.007;
    // gentle day/night (stays readable); windows and lamps glow at dusk/night
    const hour = (state.tick % HOURS_PER_DAY) + frac, day = 0.5 - 0.5 * Math.cos((hour - 2) / 24 * Math.PI * 2);
    this.night = Math.max(0, 1 - day * 1.6);
    this.sun.intensity = this.underground ? 0.6 : 0.7 + 2.2 * day; this.hemi.intensity = this.underground ? 1.6 : 0.5 + 0.42 * day;
    this.sun.color.setHSL(0.085, 0.45 + 0.3 * (1 - day) + 0.15 * this.q.warm, 0.86 + 0.08 * day);
    for (const m of this.windowMats) m.emissiveIntensity = 0.05 + this.night * 1.6;
    if (this.bloom) this.bloom.strength = this.underground ? 0.06 : 0.22 + 0.25 * this.night;
    this.updateCamera(dt); this.updateLOD();
    if (this.composer) this.composer.render(dt); else this.r.render(this.scene, this.cam);
  }
}
