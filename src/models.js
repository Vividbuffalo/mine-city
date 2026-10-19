// Building model library. Each kind has dims (used for construction stages) and a finished() builder.
// Models are built from detailed procedural low-poly geometry, then merged per material (few draw calls).
// Landmark / high-detail support: an entry may set `gltf: 'models/x.glb'` (+ scale, offsetY); the glTF is loaded
// once, cached, and used for the finished stage (procedural fallback is shown until it loads).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { BLOCKS } from './data.js';

// ---------- palette ----------
const P = {
  mud: 0xc7a27a, plaster: 0xf1e7d2, thatch: 0xd9b36a, thatch2: 0xc49a52, brick: 0xa9493b, brickDark: 0x86372c, quoin: 0xd8c7a8,
  roof: 0xa9472f, roof2: 0x86382a, // terracotta tiles
   shingle: 0x6d5a48, wood: 0x9c6b3e, woodDark: 0x5e3d22, woodLight: 0xc79a62, stone: 0xa9aaa6,
  stoneDark: 0x7d7e7a, metal: 0x4c5157, iron: 0x3a3d42, cloth: 0xd94b3d, white: 0xf3efe6, soil: 0x6e5034, soilDark: 0x4c3624,
  crop: 0xb9c95a, crop2: 0x8fae45, clay: 0xc4865a, copper: 0x3fae8c, bronze: 0xc8913a, charcoal: 0x2a2725, water: 0x3d7fb2,
  green: 0x2f7d5b, gold: 0xe0b04a, black: 0x26221f,
};
const matCache = new Map();
export function mat(key, opts = {}) {
  const k = key + JSON.stringify(opts);
  if (!matCache.has(k)) {
    const color = typeof key === 'number' ? key : P[key];
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, flatShading: true, ...opts });
    if (opts.emissive) m.userData.glow = true;
    matCache.set(k, m);
  }
  return matCache.get(k);
}
const WINDOW = () => { const m = mat(0x2c3a46, { emissive: 0xffc46b, emissiveIntensity: 0.05, roughness: 0.25, metalness: 0.2 }); m.userData.window = true; return m; };
const GLOW = (c = 0xff7a1a, i = 2.2) => mat(c, { emissive: c, emissiveIntensity: i });

// ---------- kit ----------
class Kit {
  constructor() { this.g = new THREE.Group(); this.emitters = []; this.ox = 0; this.oz = 0; }
  add(geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const o = new THREE.Mesh(geo, typeof m === 'string' || typeof m === 'number' ? mat(m) : m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); this.g.add(o); return o; }
  box(w, h, d, m, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z, rx, ry, rz); }
  cyl(rt, rb, h, seg, m, x = 0, y = 0, z = 0, rx = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z, rx, 0, rz); }
  cone(r, h, seg, m, x = 0, y = 0, z = 0, ry = 0) { return this.add(new THREE.ConeGeometry(r, h, seg), m, x, y + h / 2, z, 0, ry); }
  log(len, r, m, x, y, z, ry = 0) { return this.add(new THREE.CylinderGeometry(r, r, len, 7), m, x, y, z, 0, ry, Math.PI / 2); }
  // gable roof: ridge along x, width w (x), depth d (z), height h, at base y
  gable(w, d, h, m, x = 0, y = 0, z = 0, ry = 0) {
    const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); geo.translate(0, 0, -w / 2); geo.rotateY(Math.PI / 2);
    return this.add(geo, m, x, y, z, 0, ry);
  }
  // roof with overhang slabs (two sloped planes) + gable fill + ridge
  roof(w, d, h, m, y, wallM, x = 0, z = 0, ry = 0, over = 0.05) {
    const half = d / 2 + over, len = Math.hypot(half, h), ang = Math.atan2(h, half), t = 0.035;
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry; this.g.add(grp);
    for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2, t, len), mat(m)); o.position.set(0, h / 2 + t / 2, s * half / 2); o.rotation.x = s * ang; grp.add(o); }
    const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, h * (d / 2) / half); sh.closePath();
    const gg = new THREE.ExtrudeGeometry(sh, { depth: w * 0.98, bevelEnabled: false }); gg.translate(0, 0, -w * 0.49); gg.rotateY(Math.PI / 2);
    const fill = new THREE.Mesh(gg, mat(wallM)); grp.add(fill);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2 + 0.02, 0.03, 0.04), mat(P.woodDark)); ridge.position.y = h + 0.02; grp.add(ridge);
    return grp;
  }
  // windows on a wall face. face: 'front'(+z) 'back' 'left'(-x) 'right'
  windows(face, W, D, y, n, ww = 0.09, wh = 0.11, x0 = 0, frame = 'woodDark') {
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * (face === 'front' || face === 'back' ? W * 0.62 : D * 0.6);
      const [px, pz, ry] = face === 'front' ? [x0 + off, D / 2, 0] : face === 'back' ? [x0 + off, -D / 2, Math.PI] : face === 'left' ? [x0 - W / 2, off, -Math.PI / 2] : [x0 + W / 2, off, Math.PI / 2];
      const grp = new THREE.Group(); grp.position.set(px + this.ox, y, pz + this.oz); grp.rotation.y = ry; this.g.add(grp);
      const f = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.03, wh + 0.03, 0.02), mat(frame)); f.position.z = 0.006; grp.add(f);
      const gl = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, 0.02), WINDOW()); gl.position.z = 0.012; grp.add(gl);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, wh, 0.022), mat(frame)); bar.position.z = 0.014; grp.add(bar);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.05, 0.014, 0.035), mat('stone')); sill.position.set(0, -wh / 2 - 0.016, 0.02); grp.add(sill);
    }
  }
  door(face, W, D, w = 0.1, h = 0.17, x0 = 0, m = 'woodDark') {
    const [px, pz, ry] = face === 'front' ? [x0, D / 2, 0] : face === 'left' ? [-W / 2, x0, -Math.PI / 2] : face === 'right' ? [W / 2, x0, Math.PI / 2] : [x0, -D / 2, Math.PI];
    const grp = new THREE.Group(); grp.position.set(px + this.ox, 0, pz + this.oz); grp.rotation.y = ry; this.g.add(grp);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.02, 0.02), mat('woodDark')); fr.position.set(0, (h + 0.02) / 2, 0.006); grp.add(fr);
    const dr = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), mat(m)); dr.position.set(0, h / 2, 0.012); grp.add(dr);
    const step = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.025, 0.05), mat('stone')); step.position.set(0, 0.012, 0.03); grp.add(step);
  }
  chimney(x, z, base, h, m = 'brick', smoke = true) {
    this.box(0.08, h, 0.08, m, x, base, z); this.box(0.1, 0.025, 0.1, 'stoneDark', x, base + h, z);
    if (smoke) this.emitters.push({ x, y: base + h + 0.04, z, type: 'chimney' });
  }
  pile(n, r, m, x, z, y = 0) { for (let i = 0; i < n; i++) { const a = i * 2.4, rr = r * Math.sqrt(i / n); this.add(new THREE.DodecahedronGeometry(0.035 + (i % 3) * 0.01, 0), m, x + Math.cos(a) * rr, y + 0.03 + (n - i) * 0.004, z + Math.sin(a) * rr, i, i * 2, 0); } }
  logPile(x, z, n = 3, len = 0.32, ry = 0) { let k = 0; for (let row = 0; row < n; row++) for (let i = 0; i < n - row; i++) { this.log(len, 0.035, k++ % 2 ? 'wood' : 'woodDark', x + (i - (n - row - 1) / 2) * 0.072 * Math.cos(ry), 0.035 + row * 0.062, z - (i - (n - row - 1) / 2) * 0.072 * Math.sin(ry), ry + Math.PI / 2); } }
  bricks(x, z, rows = 3) { for (let r = 0; r < rows; r++) for (let i = 0; i < 3; i++) this.box(0.06, 0.03, 0.12, r % 2 ? 'brickDark' : 'brick', x + (i - 1) * 0.065, r * 0.03, z); }
  fence(pts, h = 0.1) { for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az); this.box(0.02, h, 0.02, 'woodDark', ax, 0, az); this.add(new THREE.BoxGeometry(0.012, 0.012, len), mat('wood'), (ax + bx) / 2, h * 0.75, (az + bz) / 2, 0, ry); this.add(new THREE.BoxGeometry(0.012, 0.012, len), mat('wood'), (ax + bx) / 2, h * 0.35, (az + bz) / 2, 0, ry); } }
}

// ---------- model definitions ----------
// dims: w,d (footprint), h (wall height), roof type, wall material (for construction stages)
export const MODELS = {
  hut: { dims: { w: 0.56, d: 0.56, h: 0.26, roof: 'cone', wall: 'mud', round: true }, finished(k) {
    k.cyl(0.28, 0.29, 0.26, 12, 'mud');
    k.cyl(0.29, 0.3, 0.035, 12, 'stoneDark');
    k.cone(0.4, 0.2, 12, 'thatch', 0, 0.24); k.cone(0.3, 0.16, 12, 'thatch2', 0, 0.37); k.cone(0.14, 0.09, 10, 'thatch', 0, 0.5);
    k.cyl(0.012, 0.012, 0.1, 5, 'woodDark', 0.02, 0.55, 0); k.emitters.push({ x: 0, y: 0.6, z: 0, type: 'hut' });
    k.door('front', 0.56, 0.58, 0.1, 0.16);
    k.logPile(0.27, 0.22, 2, 0.16, 0.6); k.box(0.06, 0.05, 0.06, 'woodDark', -0.3, 0, 0.2); k.cyl(0.04, 0.045, 0.07, 8, 'clay', -0.22, 0, 0.3);
  } },
  brickhouse: { dims: { w: 0.66, d: 0.5, h: 0.4, roof: 'gable', wall: 'brick' }, finished(k) {
    const W = 0.66, D = 0.5, H = 0.4;
    k.box(W + 0.03, 0.05, D + 0.03, 'stoneDark'); k.box(W, H, D, 'brick');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.04, H, 0.04, 'quoin', sx * (W / 2 - 0.01), 0, sz * (D / 2 - 0.01));
    k.box(W + 0.01, 0.025, D + 0.01, 'brickDark', 0, H * 0.5, 0);
    k.windows('front', W, D, 0.13, 2, 0.1, 0.11, 0); k.windows('front', W, D, 0.3, 3, 0.08, 0.09, 0);
    k.windows('back', W, D, 0.2, 2); k.windows('left', W, D, 0.22, 1); k.windows('right', W, D, 0.22, 1);
    k.door('front', W, D, 0.1, 0.19, 0, 'green');
    k.roof(W, D, 0.26, 'roof', H, 'brick');
    k.chimney(0.22, -0.08, H + 0.08, 0.22);
  } },
  stall: { dims: { w: 0.66, d: 0.6, h: 0.36, roof: 'flat', wall: 'wood' }, finished(k) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.035, 0.38, 0.035, 'wood', sx * 0.3, 0, sz * 0.26);
    for (let i = 0; i < 6; i++) k.add(new THREE.BoxGeometry(0.11, 0.02, 0.66), mat(i % 2 ? 'white' : 'cloth'), -0.275 + i * 0.11, 0.42, 0, 0.18, 0, 0);
    k.box(0.62, 0.15, 0.2, 'woodLight', 0, 0, 0.12); k.box(0.64, 0.02, 0.22, 'woodDark', 0, 0.15, 0.12);
    for (let i = 0; i < 4; i++) k.cyl(0.03, 0.035, 0.06, 8, i % 2 ? 'clay' : 'bronze', -0.21 + i * 0.14, 0.17, 0.12);
    k.box(0.12, 0.1, 0.12, 'woodLight', -0.24, 0, -0.18); k.box(0.1, 0.08, 0.1, 'wood', -0.1, 0, -0.2); k.pile(5, 0.05, 0x7bb661, -0.24, -0.18, 0.1);
  } },
  store: { dims: { w: 0.72, d: 0.6, h: 0.56, roof: 'gable', wall: 'brick' }, finished(k) {
    const W = 0.72, D = 0.6, H = 0.56;
    k.box(W + 0.03, 0.04, D + 0.03, 'stoneDark'); k.box(W, H, D, 'brick');
    k.box(W + 0.02, 0.03, D + 0.02, 'quoin', 0, 0.29, 0); k.box(W + 0.04, 0.04, D + 0.04, 'quoin', 0, H, 0);
    k.box(0.44, 0.17, 0.02, WINDOW(), -0.08, 0.06, D / 2 + 0.006); k.box(0.47, 0.02, 0.03, 'woodDark', -0.08, 0.23, D / 2 + 0.01);
    k.door('front', W, D, 0.1, 0.2, 0.25, 'green');
    k.add(new THREE.BoxGeometry(0.7, 0.02, 0.16), mat('green'), 0, 0.27, D / 2 + 0.07, 0.35, 0, 0);
    k.box(0.36, 0.06, 0.015, 'woodLight', 0, 0.335, D / 2 + 0.01); k.box(0.3, 0.025, 0.017, 'gold', 0, 0.353, D / 2 + 0.012);
    k.windows('front', W, D, 0.44, 3, 0.08, 0.1); k.windows('left', W, D, 0.44, 2); k.windows('right', W, D, 0.44, 2); k.windows('back', W, D, 0.44, 3);
    k.roof(W, D, 0.22, 'roof2', H + 0.04, 'brick');
    k.chimney(-0.24, 0.05, H + 0.1, 0.18);
  } },
  field: { dims: { w: 1.84, d: 1.84, h: 0.05, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(1.86, 0.035, 1.86, 'soil');
    for (let r = 0; r < 7; r++) { const z = -0.78 + r * 0.26; k.box(1.72, 0.03, 0.09, 'soilDark', 0, 0.035, z); for (let i = 0; i < 9; i++) k.cone(0.045, 0.1 + ((r + i) % 3) * 0.02, 5, (r + i) % 2 ? 'crop' : 'crop2', -0.78 + i * 0.195, 0.05, z); }
    k.fence([[-0.92, -0.92], [0.92, -0.92], [0.92, 0.92], [-0.92, 0.92]], 0.09);
    k.box(0.02, 0.2, 0.02, 'woodDark', 0.6, 0, 0.6); k.box(0.16, 0.02, 0.02, 'woodDark', 0.6, 0.15, 0.6); k.cyl(0.035, 0.035, 0.05, 6, 'thatch', 0.6, 0.18, 0.6);
  } },
  granary: { dims: { w: 0.56, d: 0.56, h: 0.42, roof: 'cone', wall: 'mud', round: true }, finished(k) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.07, 0.08, 0.07, 'stone', sx * 0.17, 0, sz * 0.17);
    k.cyl(0.29, 0.29, 0.04, 12, 'woodDark', 0, 0.08); k.cyl(0.26, 0.28, 0.34, 12, 'mud', 0, 0.12);
    k.cyl(0.27, 0.27, 0.025, 12, 'woodDark', 0, 0.3);
    k.cone(0.36, 0.26, 12, 'thatch', 0, 0.46); k.cone(0.12, 0.08, 10, 'thatch2', 0, 0.68);
    k.box(0.09, 0.14, 0.02, 'woodDark', 0, 0.2, 0.27);
    for (const sx of [-1, 1]) k.add(new THREE.BoxGeometry(0.015, 0.34, 0.015), mat('wood'), sx * 0.05, 0.16, 0.36, -0.35, 0, 0);
    for (let i = 0; i < 4; i++) k.box(0.1, 0.012, 0.012, 'wood', 0, 0.04 + i * 0.075, 0.41 - i * 0.026);
  } },
  woodcutter: { dims: { w: 0.48, d: 0.4, h: 0.26, roof: 'gable', wall: 'wood' }, finished(k) {
    const W = 0.48, D = 0.4, x0 = -0.12, z0 = -0.12;
    for (let i = 0; i < 6; i++) { k.log(W, 0.024, i % 2 ? 'wood' : 'woodDark', x0, 0.024 + i * 0.044, z0 + D / 2); k.log(W, 0.024, i % 2 ? 'wood' : 'woodDark', x0, 0.024 + i * 0.044, z0 - D / 2); k.log(D, 0.024, i % 2 ? 'woodDark' : 'wood', x0 - W / 2, 0.046 + i * 0.044, z0, Math.PI / 2); k.log(D, 0.024, i % 2 ? 'woodDark' : 'wood', x0 + W / 2, 0.046 + i * 0.044, z0, Math.PI / 2); }
    k.box(W - 0.02, 0.26, D - 0.02, 'woodDark', x0, 0, z0);
    k.ox = x0; k.oz = z0; k.door('front', W, D, 0.09, 0.15, 0, 'wood'); k.ox = k.oz = 0;
    k.roof(W, D, 0.2, 'shingle', 0.27, 'wood', x0, z0);
    k.logPile(0.24, 0.16, 3, 0.3, 0.2); k.cyl(0.06, 0.065, 0.07, 8, 'wood', 0.25, 0, -0.22); k.box(0.012, 0.1, 0.012, 'woodLight', 0.25, 0.07, -0.22, 0, 0.4);
    k.chimney(x0 - 0.12, z0 - 0.05, 0.27, 0.18, 'stone');
  } },
  claypit: { dims: { w: 0.84, d: 0.84, h: 0.05, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.9, 0.025, 0.9, 'soil'); k.box(0.66, 0.03, 0.66, 'clay', 0, 0.0); k.box(0.46, 0.035, 0.46, 0xa86f48, 0, 0.0);
    k.box(0.22, 0.012, 0.18, 'water', 0.08, 0.03, 0.06);
    k.pile(9, 0.12, 'clay', -0.3, 0.3); k.pile(6, 0.08, 'clay', 0.32, 0.3);
    k.add(new THREE.BoxGeometry(0.1, 0.015, 0.36), mat('wood'), -0.28, 0.05, -0.08, 0.25, 0, 0);
    k.cyl(0.05, 0.04, 0.05, 8, 'thatch2', 0.3, 0, -0.3); k.cyl(0.05, 0.04, 0.05, 8, 'thatch2', 0.2, 0, -0.34);
    k.box(0.02, 0.2, 0.02, 'woodDark', 0.38, 0, -0.38); k.box(0.12, 0.02, 0.02, 'woodDark', 0.33, 0.2, -0.38);
  } },
  quarry: { dims: { w: 0.84, d: 0.84, h: 0.2, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.9, 0.025, 0.9, 'stoneDark');
    k.box(0.36, 0.26, 0.3, 'stone', -0.22, 0, -0.26); k.box(0.3, 0.17, 0.3, 'stone', 0.12, 0, -0.26); k.box(0.3, 0.09, 0.3, 'stoneDark', 0.12, 0, 0.05); k.box(0.22, 0.13, 0.28, 'stone', -0.26, 0, 0.06);
    for (let i = 0; i < 4; i++) k.box(0.1, 0.07, 0.07, 'stone', 0.22 + (i % 2) * 0.11, Math.floor(i / 2) * 0.07, 0.32);
    k.box(0.025, 0.42, 0.025, 'woodDark', -0.02, 0, 0.3); k.add(new THREE.BoxGeometry(0.02, 0.02, 0.4), mat('woodDark'), -0.02, 0.4, 0.15, -0.35, 0, 0);
    k.box(0.006, 0.18, 0.006, 'black', -0.02, 0.27, 0.0); k.pile(7, 0.1, 'stoneDark', 0.3, -0.05);
  } },
  orepit: { dims: { w: 0.84, d: 0.84, h: 0.05, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.9, 0.025, 0.9, 0x6b5a46); k.box(0.62, 0.03, 0.62, 0x4b4036); k.box(0.42, 0.035, 0.42, 0x3a3029);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.03, 0.12, 0.03, 'wood', sx * 0.3, 0, sz * 0.3);
    k.box(0.64, 0.025, 0.025, 'wood', 0, 0.12, 0.3); k.box(0.64, 0.025, 0.025, 'wood', 0, 0.12, -0.3);
    k.pile(8, 0.1, 'copper', -0.3, 0.33); k.pile(6, 0.08, 0x8a8f96, 0.3, 0.33);
    k.box(0.24, 0.08, 0.12, 'woodLight', 0.25, 0, -0.32); k.pile(4, 0.05, 'copper', 0.25, -0.32, 0.08);
  } },
  shaft: { dims: { w: 0.6, d: 0.6, h: 0.6, roof: 'none', wall: 'wood' }, finished(k) {
    k.box(0.3, 0.03, 0.3, 'stoneDark', 0, 0, 0); k.box(0.2, 0.035, 0.2, 'black', 0, 0.002, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(new THREE.BoxGeometry(0.035, 0.82, 0.035), mat('woodDark'), sx * 0.12, 0.4, sz * 0.12, sz * 0.12, 0, -sx * 0.12);
    for (const y of [0.25, 0.5]) { const s = 0.24 - y * 0.12; k.box(s * 2, 0.02, 0.02, 'wood', 0, y, s); k.box(s * 2, 0.02, 0.02, 'wood', 0, y, -s); k.box(0.02, 0.02, s * 2, 'wood', s, y, 0); k.box(0.02, 0.02, s * 2, 'wood', -s, y, 0); }
    const wheel = k.add(new THREE.TorusGeometry(0.11, 0.016, 6, 16), mat('iron'), 0, 0.8, 0); 
    for (let i = 0; i < 4; i++) k.add(new THREE.BoxGeometry(0.21, 0.012, 0.012), mat('iron'), 0, 0.8, 0, 0, 0, i * Math.PI / 4);
    k.box(0.32, 0.22, 0.24, 'wood', 0.12, 0, 0.27); k.roof(0.32, 0.24, 0.1, 'shingle', 0.22, 'wood', 0.12, 0.27);
    k.box(0.05, 0.005, 0.4, 'iron', -0.24, 0.01, 0.05); k.box(0.1, 0.07, 0.12, 'iron', -0.24, 0.015, 0.15);
    k.cone(0.15, 0.13, 7, 0x6e655a, -0.25, 0, -0.25);
  } },
  kiln: { dims: { w: 0.6, d: 0.6, h: 0.3, roof: 'cone', wall: 'clay', round: true }, finished(k) {
    k.cyl(0.3, 0.31, 0.08, 12, 'brickDark');
    k.add(new THREE.SphereGeometry(0.29, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat('clay'), 0, 0.08, 0);
    k.box(0.12, 0.09, 0.06, GLOW(), 0, 0.02, 0.27); k.box(0.16, 0.025, 0.07, 'brickDark', 0, 0.11, 0.27);
    k.cyl(0.05, 0.06, 0.16, 8, 'brickDark', 0, 0.33); k.emitters.push({ x: 0, y: 0.52, z: 0, type: 'kiln' });
    k.bricks(-0.27, 0.27, 3); k.bricks(0.27, 0.28, 2); k.pile(6, 0.07, 'clay', 0.3, -0.25); k.logPile(-0.3, -0.24, 2, 0.2, 0.3);
  } },
  smelter: { dims: { w: 0.6, d: 0.55, h: 0.36, roof: 'gable', wall: 'brick' }, finished(k) {
    k.box(0.62, 0.04, 0.56, 'stoneDark');
    k.box(0.32, 0.38, 0.32, 'brick', -0.1, 0.04, -0.06); k.box(0.26, 0.12, 0.26, 'brickDark', -0.1, 0.42, -0.06);
    k.cyl(0.055, 0.07, 0.48, 8, 'brickDark', 0.16, 0.04, -0.17); k.cyl(0.075, 0.075, 0.03, 8, 'stoneDark', 0.16, 0.5, -0.17); k.emitters.push({ x: 0.16, y: 0.56, z: -0.17, type: 'smelter' });
    k.emitters.push({ x: -0.1, y: 0.56, z: -0.06, type: 'smelter' });
    k.box(0.1, 0.07, 0.03, GLOW(0xff8a20, 2.6), -0.1, 0.07, 0.11); k.box(0.04, 0.012, 0.18, GLOW(0xffa040, 2), -0.1, 0.045, 0.2);
    k.box(0.22, 0.2, 0.2, 'wood', 0.18, 0.04, 0.14); k.roof(0.22, 0.2, 0.08, 'shingle', 0.24, 'wood', 0.18, 0.14);
    for (let i = 0; i < 3; i++) k.box(0.09, 0.025, 0.04, 'bronze', -0.24 + i * 0.1, 0.04, 0.22, 0, 0, 0);
    k.pile(7, 0.07, 'charcoal', -0.25, -0.24);
  } },
  carpentry: { dims: { w: 0.7, d: 0.6, h: 0.34, roof: 'gable', wall: 'wood' }, finished(k) {
    k.box(0.72, 0.025, 0.62, 'woodDark');
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) k.box(0.035, 0.34, 0.035, 'wood', sx * 0.32, 0, sz * 0.27);
    k.box(0.68, 0.025, 0.025, 'woodDark', 0, 0.34, 0.27); k.box(0.68, 0.025, 0.025, 'woodDark', 0, 0.34, -0.27);
    k.roof(0.7, 0.58, 0.18, 'shingle', 0.355, 'woodDark');
    k.box(0.3, 0.1, 0.12, 'woodLight', -0.12, 0, 0.02); k.box(0.32, 0.015, 0.14, 'wood', -0.12, 0.1, 0.02);
    for (let i = 0; i < 4; i++) k.box(0.5, 0.022, 0.07, i % 2 ? 'woodLight' : 0xd9b07a, 0.05, 0.025 + i * 0.022, -0.17);
    k.logPile(0.24, 0.14, 2, 0.24, 0); k.box(0.12, 0.06, 0.03, 'wood', 0.22, 0.04, -0.02);
  } },
  well: { dims: { w: 0.44, d: 0.44, h: 0.16, roof: 'gable', wall: 'stone', round: true }, finished(k) {
    k.cyl(0.24, 0.26, 0.03, 12, 'stoneDark');
    k.cyl(0.19, 0.21, 0.16, 12, 'stone', 0, 0.02); k.cyl(0.21, 0.21, 0.025, 12, 'stoneDark', 0, 0.18); k.cyl(0.14, 0.14, 0.01, 12, 'water', 0, 0.165);
    for (const sx of [-1, 1]) k.box(0.03, 0.36, 0.03, 'woodDark', sx * 0.19, 0.02, 0);
    k.log(0.42, 0.018, 'wood', 0, 0.3, 0); k.box(0.012, 0.08, 0.012, 'black', 0, 0.21, 0); k.cyl(0.03, 0.025, 0.04, 8, 'wood', 0, 0.18, 0);
    k.roof(0.48, 0.3, 0.12, 'shingle', 0.38, 'woodDark');
  } },
  rescue: { dims: { w: 0.7, d: 0.5, h: 0.36, roof: 'gable', wall: 'white' }, finished(k) {
    const W = 0.7, D = 0.5, H = 0.36, z0 = -0.08;
    k.box(W + 0.03, 0.04, D + 0.03, 'stoneDark', 0, 0, z0); k.box(W, H, D, 'plaster', 0, 0, z0);
    for (const sx of [-0.5, -0.17, 0.17, 0.5]) k.box(0.03, H, 0.015, 'woodDark', sx * W, 0, z0 + D / 2);
    k.box(W, 0.03, 0.015, 'woodDark', 0, H * 0.55, z0 + D / 2); k.box(W, 0.03, 0.015, 'woodDark', 0, H - 0.03, z0 + D / 2);
    k.box(0.22, 0.2, 0.02, 0x8b2c22, 0, 0, z0 + D / 2 + 0.006); k.box(0.012, 0.2, 0.024, 'woodDark', 0, 0, z0 + D / 2 + 0.008);
    k.oz = z0; k.windows('front', W, D, 0.27, 2, 0.08, 0.08); k.windows('left', W, D, 0.22, 1); k.oz = 0;
    k.roof(W, D, 0.22, 0xb33a2c, H, 'plaster', 0, z0);
    k.box(0.12, 0.14, 0.12, 'plaster', -0.22, H + 0.05, z0); k.cone(0.11, 0.12, 4, 0xb33a2c, -0.22, H + 0.19, z0, Math.PI / 4); k.cyl(0.03, 0.04, 0.05, 8, 'gold', -0.22, H + 0.12, z0);
    k.box(0.02, 0.62, 0.02, 'metal', 0.38, 0, 0.26); k.box(0.16, 0.09, 0.008, 0xd33b2c, 0.46, 0.5, 0.26);
    k.box(0.03, 0.05, 0.03, GLOW(0xffd37a, 2.5), 0.15, 0.2, z0 + D / 2 + 0.02);
  } },
};

// ---------- construction stages (generic from dims) ----------
function stageModel(kind, stage) {
  const def = MODELS[kind], d = def.dims, k = new Kit(), W = d.w, D = d.d;
  if (d.roof === 'none') {
    k.box(W + 0.04, 0.012, D + 0.04, 'soilDark');
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.02, 0.12, 0.02, 'woodLight', sx * W / 2, 0, sz * D / 2);
    k.fence([[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [-W / 2, -D / 2]], 0.06);
    if (stage >= 1) { k.pile(8, 0.1, 'soil', W * 0.3, -D * 0.3); k.box(W * 0.6, 0.02, D * 0.5, 'soil', 0, 0.0, 0); }
    if (stage >= 2) { const f = new Kit(); def.finished(f); f.g.scale.set(0.98, 0.5, 0.98); k.g.add(f.g); }
    return k;
  }
  // foundation: dug footprint + stone footing + stakes/string
  k.box(W + 0.08, 0.01, D + 0.08, 'soilDark');
  if (d.round) k.cyl(W / 2, W / 2 + 0.01, 0.05, 12, 'stoneDark');
  else { k.box(W, 0.05, 0.04, 'stoneDark', 0, 0, D / 2 - 0.02); k.box(W, 0.05, 0.04, 'stoneDark', 0, 0, -D / 2 + 0.02); k.box(0.04, 0.05, D, 'stoneDark', W / 2 - 0.02, 0, 0); k.box(0.04, 0.05, D, 'stoneDark', -W / 2 + 0.02, 0, 0); }
  if (stage === 0) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.018, 0.16, 0.018, 'woodLight', sx * (W / 2 + 0.05), 0, sz * (D / 2 + 0.05));
    k.box(W + 0.1, 0.004, 0.004, 'white', 0, 0.14, D / 2 + 0.05); k.box(W + 0.1, 0.004, 0.004, 'white', 0, 0.14, -D / 2 - 0.05);
    k.pile(6, 0.06, 'stone', W / 2 + 0.1, D / 2 - 0.05);
    return k;
  }
  const H = d.h, posts = d.round ? 8 : 4;
  for (let i = 0; i < posts; i++) {
    const [px, pz] = d.round ? [Math.cos(i / posts * Math.PI * 2) * W / 2 * 0.95, Math.sin(i / posts * Math.PI * 2) * W / 2 * 0.95] : [[-1, -1], [1, -1], [-1, 1], [1, 1]][i].map((s, j) => s * (j ? D : W) / 2 * 0.94);
    k.box(0.03, H, 0.03, 'wood', px, 0.05, pz);
  }
  if (!d.round) { k.box(W, 0.025, 0.025, 'wood', 0, H + 0.04, D / 2 * 0.94); k.box(W, 0.025, 0.025, 'wood', 0, H + 0.04, -D / 2 * 0.94); k.box(0.025, 0.025, D, 'wood', W / 2 * 0.94, H + 0.04, 0); k.box(0.025, 0.025, D, 'wood', -W / 2 * 0.94, H + 0.04, 0); }
  if (stage === 1) {
    if (d.roof === 'gable') for (const sx of [-1, 1]) { k.add(new THREE.BoxGeometry(0.02, 0.02, D * 0.62), mat('woodLight'), sx * W / 2 * 0.94, H + 0.12, D * 0.22, 0.5, 0, 0); k.add(new THREE.BoxGeometry(0.02, 0.02, D * 0.62), mat('woodLight'), sx * W / 2 * 0.94, H + 0.12, -D * 0.22, -0.5, 0, 0); }
    if (d.roof === 'cone') for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(new THREE.BoxGeometry(0.015, 0.3, 0.015), mat('woodLight'), Math.cos(a) * W * 0.22, H + 0.14, Math.sin(a) * W * 0.22, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
    k.logPile(W / 2 + 0.12, 0, 2, 0.22, Math.PI / 2);
    return k;
  }
  // half-built: lower walls + scaffold + material pile
  if (d.round) k.cyl(W / 2 * 0.98, W / 2, H * 0.5, 12, d.wall, 0, 0.05); else k.box(W * 0.97, H * 0.5, D * 0.97, d.wall, 0, 0.05, 0);
  k.box(0.02, H + 0.1, 0.02, 'woodLight', -W / 2 - 0.06, 0, D / 2 + 0.06); k.box(0.02, H + 0.1, 0.02, 'woodLight', W / 2 + 0.06, 0, D / 2 + 0.06);
  k.box(W + 0.14, 0.015, 0.08, 'woodLight', 0, H * 0.55, D / 2 + 0.06);
  if (d.wall === 'brick' || d.wall === 'clay') k.bricks(W / 2 + 0.1, -D / 2 + 0.05, 3); else k.logPile(W / 2 + 0.12, -D / 4, 2, 0.2, Math.PI / 2);
  return k;
}

// ---------- custom (block) builds ----------
function customModel(b, stage, baseOf) {
  const k = new Kit(), ox = b.tiles[0][0], oy = b.tiles[0][1];
  if (stage === 0) { for (const [tx, ty] of b.tiles) k.box(0.92, 0.04, 0.92, 'stoneDark', tx - ox, 0, ty - oy); return k; }
  const maxZ = Math.max(...b.blocks.map(q => q.z));
  if (stage === 1) {
    const cols = new Map(); for (const q of b.blocks) { const key = q.x + ',' + q.y; cols.set(key, Math.max(cols.get(key) ?? -1, q.z)); }
    for (const [key, top] of cols) { const [sx, sy] = key.split(',').map(Number); k.box(0.05, (top + 1) * 0.5, 0.05, 'wood', sx / 2 + 0.25 - ox - 0.5, 0, sy / 2 + 0.25 - oy - 0.5); }
    return k;
  }
  const lim = stage === 2 ? Math.ceil((maxZ + 1) / 2) : 99, geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  for (const q of b.blocks) if (q.z < lim) k.add(geo, mat(BLOCKS[q.m].color), q.x / 2 + 0.25 - ox - 0.5, baseOf(q) + q.z * 0.5 + 0.25, q.y / 2 + 0.25 - oy - 0.5);
  return k;
}

// ---------- rubble ----------
function h01(a, b, c) { let h = (a * 73856093 ^ b * 19349663 ^ c * 83492791) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h % 10000) / 10000; }
function rubbleModel(b) {
  const k = new Kit(), wall = MODELS[b.kind] ? MODELS[b.kind].dims.wall : 'stone';
  for (const [tx, ty] of b.tiles) {
    const cx = tx - b.tiles[0][0], cz = ty - b.tiles[0][1];
    k.cyl(0.42, 0.36, 0.02, 9, 0x3b3027, cx, -0.03, cz);
    for (let i = 0; i < 12; i++) { const r = h01(b.id, i, 1); k.add(new THREE.DodecahedronGeometry(0.04 + r * 0.07, 0), mat(i % 3 ? wall : 'stoneDark'), cx + (h01(b.id, i, 2) - 0.5) * 0.65, 0.02 + r * 0.05, cz + (h01(b.id, i, 3) - 0.5) * 0.65, r * 3, i, 0); }
    for (let i = 0; i < 3; i++) k.add(new THREE.BoxGeometry(0.025, 0.025, 0.36), mat('woodDark'), cx + (h01(b.id, i, 5) - 0.5) * 0.4, 0.06, cz + (h01(b.id, i, 6) - 0.5) * 0.4, 0.3 * i - 0.2, i * 1.3, 0.4);
  }
  return k;
}

// ---------- public API ----------
function mergeByMaterial(g) {
  g.updateMatrixWorld(true);
  const groups = new Map();
  g.traverse(o => { if (!o.isMesh) return; const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); geo.applyMatrix4(o.matrixWorld); if (!groups.has(o.material)) groups.set(o.material, []); groups.get(o.material).push(geo); });
  const out = new THREE.Group();
  for (const [m, geos] of groups) { const merged = mergeGeometries(geos, false); const mesh = new THREE.Mesh(merged, m); mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh); geos.forEach(x => x.dispose()); }
  return out;
}

const gltfCache = new Map(); let loader = null;
export function loadGLTF(url) {
  if (!gltfCache.has(url)) { loader = loader || new GLTFLoader(); gltfCache.set(url, { scene: null, p: loader.loadAsync(url).then(r => { gltfCache.get(url).scene = r.scene; }).catch(e => console.warn('glTF failed', url, e)) }); }
  return gltfCache.get(url);
}

// Returns { group, emitters } in building-local coords (origin = footprint center at ground level).
export function buildModel(b, stage, baseOf) {
  let kit;
  if (b.ruin) kit = rubbleModel(b);
  else if (b.kind === 'custom') kit = customModel(b, stage, baseOf);
  else if (stage < 3) kit = stageModel(b.kind, stage);
  else {
    const def = MODELS[b.kind];
    if (def.gltf) { const c = loadGLTF(def.gltf); if (c.scene) { const s = c.scene.clone(true); s.scale.setScalar(def.scale || 1); s.position.y = def.offsetY || 0; s.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return { group: s, emitters: [] }; } }
    kit = new Kit(); def.finished(kit);
  }
  return { group: mergeByMaterial(kit.g), emitters: kit.emitters };
}
