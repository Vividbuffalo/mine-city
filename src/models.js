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
  // ---------- Stone & Clay era (poles, hides, bark, wattle, daub, bone, stone; no planks, no metal) ----------
  leanto: { dims: { w: 0.5, d: 0.4, h: 0.2, roof: 'none', wall: 'wood' }, finished(k) {
    for (let i = 0; i < 6; i++) k.add(new THREE.CylinderGeometry(0.012, 0.014, 0.42, 5), mat(i % 2 ? 'wood' : 'woodDark'), -0.2 + i * 0.08, 0.15, -0.02, -0.75, 0, 0);
    k.add(new THREE.BoxGeometry(0.5, 0.012, 0.36), mat('thatch2'), 0, 0.16, -0.02, -0.75, 0, 0);
    k.log(0.52, 0.016, 'woodDark', 0, 0.29, -0.13); for (const sx of [-1, 1]) k.box(0.02, 0.3, 0.02, 'woodDark', sx * 0.24, 0, -0.14);
    k.cyl(0.07, 0.08, 0.02, 8, 'stoneDark', 0.02, 0, 0.17); k.cone(0.04, 0.06, 6, GLOW(0xff8a2a, 1.6), 0.02, 0.02, 0.17); k.emitters.push({ x: 0.02, y: 0.1, z: 0.17, type: 'hut' });
    k.box(0.16, 0.015, 0.1, 0x9a7a55, -0.12, 0, 0.05);
  } },
  tent: { dims: { w: 0.5, d: 0.5, h: 0.1, roof: 'cone', wall: 'wood', round: true }, finished(k) {
    k.cone(0.26, 0.56, 9, 0xb38a5c, 0, 0); k.cone(0.27, 0.12, 9, 0x8d6a45, 0, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 4), mat('woodDark'), Math.cos(a) * 0.035, 0.6, Math.sin(a) * 0.035, Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3); }
    k.add(new THREE.PlaneGeometry(0.1, 0.16), mat('soilDark', { side: THREE.DoubleSide }), 0, 0.08, 0.2, -0.43, 0, 0);
    k.box(0.12, 0.012, 0.09, 0x9a7a55, 0.22, 0, 0.18); k.cyl(0.02, 0.02, 0.18, 5, 'wood', -0.22, 0, 0.16);
  } },
  polehut: { dims: { w: 0.54, d: 0.54, h: 0.12, roof: 'cone', wall: 'wood', round: true }, finished(k) {
    k.cyl(0.27, 0.28, 0.06, 10, 'stoneDark');
    k.cone(0.29, 0.44, 10, 0x7a5a3c, 0, 0.04); k.cone(0.2, 0.3, 10, 0x8f6b47, 0, 0.2); // bark shingles in two courses
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.add(new THREE.BoxGeometry(0.06, 0.2, 0.008), mat(i % 2 ? 0x6a4c30 : 0x93704a), Math.cos(a) * 0.21, 0.17, Math.sin(a) * 0.21, 0, -a + Math.PI / 2, 0.55); }
    k.cyl(0.01, 0.01, 0.12, 4, 'woodDark', 0, 0.44, 0); k.emitters.push({ x: 0, y: 0.52, z: 0, type: 'hut' });
    k.door('front', 0.4, 0.42, 0.09, 0.12, 0, 'soilDark'); k.logPile(-0.25, 0.22, 2, 0.14, 0.4);
  } },
  bonehut: { dims: { w: 0.56, d: 0.56, h: 0.2, roof: 'cone', wall: 'stone', round: true }, finished(k) {
    k.cyl(0.29, 0.31, 0.06, 12, 'stoneDark');
    k.add(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8a6e4e), 0, 0.05, 0); // hide-covered dome
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.add(new THREE.TorusGeometry(0.05, 0.012, 4, 8, Math.PI), mat(0xeee4cc), Math.cos(a) * 0.27, 0.06, Math.sin(a) * 0.27, 0, -a, 0); } // mammoth jaw bones round the base
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; k.add(new THREE.TorusGeometry(0.2, 0.014, 5, 10, Math.PI * 0.55), mat(0xf2ead6), Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12, Math.PI / 2, 0, a); } // tusks over the dome
    k.door('front', 0.4, 0.5, 0.1, 0.12, 0, 'soilDark'); k.emitters.push({ x: 0, y: 0.34, z: 0, type: 'hut' });
  } },
  longhouse: { dims: { w: 1.7, d: 0.62, h: 0.24, roof: 'gable', wall: 'mud' }, finished(k) {
    const W = 1.7, D = 0.62;
    k.box(W + 0.04, 0.04, D + 0.04, 'stoneDark'); k.box(W, 0.24, D, 'mud', 0, 0.04, 0);
    for (let i = 0; i < 9; i++) k.box(0.025, 0.24, D + 0.02, 'woodDark', -W / 2 + 0.05 + i * (W - 0.1) / 8, 0.04, 0);
    k.roof(W, D, 0.34, 'thatch', 0.28, 'mud', 0, 0, 0, 0.08);
    k.door('front', W, D, 0.12, 0.16, -0.3, 'soilDark'); k.door('back', W, D, 0.12, 0.16, 0.3, 'soilDark');
    k.emitters.push({ x: -0.3, y: 0.66, z: 0, type: 'chimney' }); k.emitters.push({ x: 0.4, y: 0.66, z: 0, type: 'hut' });
    k.logPile(0.7, 0.48, 3, 0.26); k.fence([[-0.95, 0.6], [-0.4, 0.75], [0.2, 0.8]], 0.08);
  } },
  berryhut: { dims: { w: 0.44, d: 0.44, h: 0.16, roof: 'cone', wall: 'wood', round: true }, finished(k) {
    k.cyl(0.18, 0.2, 0.16, 9, 0x9c7a50, -0.08, 0, -0.08); k.cone(0.27, 0.22, 9, 'thatch2', -0.08, 0.15, -0.08);
    for (const [x, z] of [[0.24, 0.12], [0.1, 0.28], [0.3, -0.12]]) { k.add(new THREE.IcosahedronGeometry(0.075, 0), mat(0x3f7a3a), x, 0.07, z); for (let i = 0; i < 4; i++) k.add(new THREE.SphereGeometry(0.014, 5, 4), mat(0xb3243b), x + Math.cos(i * 1.7) * 0.06, 0.08 + (i % 2) * 0.03, z + Math.sin(i * 1.7) * 0.06); }
    for (const [x, z] of [[-0.24, 0.22], [-0.12, 0.27]]) { k.cyl(0.055, 0.04, 0.07, 8, 0xa88350, x, 0, z); for (let i = 0; i < 9; i++) k.add(new THREE.SphereGeometry(0.016, 5, 4), mat(i % 3 ? 0xc22a40 : 0x5a2a6a), x + Math.cos(i * 2.4) * 0.03 * Math.sqrt(i / 9), 0.075 + (i % 2) * 0.01, z + Math.sin(i * 2.4) * 0.03 * Math.sqrt(i / 9)); }
  } },
  hunter: { dims: { w: 0.58, d: 0.58, h: 0.1, roof: 'cone', wall: 'wood', round: true }, finished(k) {
    // a wide, low hide lodge on a pole frame with a smoke hole, a skin on a stretching frame, antlers and spears
    k.cyl(0.28, 0.3, 0.03, 12, 'soilDark', -0.05, 0, -0.05);
    k.cone(0.27, 0.36, 12, 0x9a7650, -0.05, 0.02, -0.05); k.cone(0.2, 0.08, 12, 0x7d5d3c, -0.05, 0.02, -0.05);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), mat('woodDark'), -0.05 + Math.cos(a) * 0.03, 0.41, -0.05 + Math.sin(a) * 0.03, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); }
    k.emitters.push({ x: -0.05, y: 0.42, z: -0.05, type: 'hut' }); k.add(new THREE.PlaneGeometry(0.11, 0.14), mat('soilDark', { side: THREE.DoubleSide }), -0.05, 0.07, 0.17, -0.55, 0, 0);
    for (const sx of [-1, 1]) k.cyl(0.012, 0.014, 0.3, 5, 'woodDark', 0.26 + sx * 0.0, 0, 0.1 + sx * 0.1);
    k.add(new THREE.CircleGeometry(0.09, 8), mat(0xc09a6a, { side: THREE.DoubleSide }), 0.26, 0.16, 0.1, 0, Math.PI / 2, 0); // stretched hide
    k.add(new THREE.TorusGeometry(0.095, 0.006, 4, 10), mat('woodDark'), 0.26, 0.16, 0.1, 0, Math.PI / 2, 0);
    for (const s of [-1, 1]) k.add(new THREE.TorusGeometry(0.045, 0.007, 4, 6, Math.PI * 0.8), mat(0xe8dcc0), -0.05 + s * 0.04, 0.2, 0.23, -0.4, 0, s * 0.6);
    for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.005, 0.005, 0.38, 4), mat('wood'), -0.3 + i * 0.025, 0.17, 0.12, 0.2, 0, 0.25);
    k.pile(4, 0.04, 0x8a3b28, 0.2, -0.24);
  } },
  weir: { dims: { w: 0.6, d: 0.6, h: 0.05, roof: 'none', wall: 'wood' }, finished(k) {
    k.box(0.62, 0.02, 0.62, 'soil');
    for (let i = 0; i < 11; i++) { const a = -1.1 + i * 0.22; k.cyl(0.012, 0.012, 0.16, 4, 'woodDark', Math.sin(a) * 0.32, -0.04, 0.25 - Math.cos(a) * 0.1 + 0.08); } // stake fence of the weir
    k.add(new THREE.ConeGeometry(0.06, 0.2, 8, 1, true), mat(0xb59460, { side: THREE.DoubleSide }), 0.0, 0.03, 0.33, Math.PI / 2, 0, 0); // wicker fish trap
    k.emitters.push({ x: 0, y: 0.0, z: 0.38, type: 'fish' }); for (let i = 0; i < 3; i++) k.add(new THREE.ConeGeometry(0.016, 0.07, 5), mat(0xaab8c4), -0.2 + i * 0.05, 0.02, -0.15, 0, i, Math.PI / 2); // a catch on the bank
    k.box(0.06, 0.18, 0.06, 'woodDark', -0.2, 0, -0.2); k.box(0.24, 0.012, 0.012, 'wood', -0.12, 0.17, -0.2);
    for (let i = 0; i < 3; i++) k.add(new THREE.ConeGeometry(0.018, 0.07, 4), mat(0x9fb3c2), -0.12 + i * 0.05, 0.12, -0.2, Math.PI, 0, 0); // drying fish
  } },
  pen: { dims: { w: 0.84, d: 0.84, h: 0.05, roof: 'none', wall: 'wood' }, finished(k) {
    k.box(0.86, 0.015, 0.86, 0x8b8a52);
    k.fence([[-0.42, -0.42], [0.42, -0.42], [0.42, 0.42], [0.1, 0.42]], 0.1); k.fence([[-0.1, 0.42], [-0.42, 0.42], [-0.42, -0.42]], 0.1);
    for (const [x, z, r] of [[-0.15, -0.1, 0.4], [0.18, 0.05, 2], [0.0, 0.22, 4]]) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; k.g.add(g);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), mat(0xe9e2d4)); b.position.y = 0.1; g.add(b); const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), mat(0x3b322b)); h.position.set(0.1, 0.13, 0); g.add(h);
      for (const [lx, lz] of [[-0.05, -0.03], [-0.05, 0.03], [0.05, -0.03], [0.05, 0.03]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.015), mat(0x3b322b)); l.position.set(lx, 0.03, lz); g.add(l); } }
    k.cyl(0.07, 0.07, 0.03, 8, 'woodDark', 0.28, 0, -0.28); k.cyl(0.06, 0.06, 0.031, 8, 'water', 0.28, 0, -0.28);
  } },
  rack: { dims: { w: 0.6, d: 0.4, h: 0.3, roof: 'none', wall: 'wood' }, finished(k) {
    for (const x of [-0.26, 0.26]) for (const z of [-0.12, 0.12]) k.box(0.02, 0.34, 0.02, 'woodDark', x, 0, z);
    for (const y of [0.2, 0.32]) for (const z of [-0.12, 0.12]) k.box(0.56, 0.015, 0.015, 'wood', 0, y, z);
    for (let i = 0; i < 6; i++) { const f = k.add(new THREE.ConeGeometry(0.03, 0.13, 5), mat(0xb9c7d2, { metalness: 0.3, roughness: 0.4 }), -0.2 + i * 0.08, 0.24, -0.12, Math.PI, 0, 0); f.scale.z = 0.4; k.add(new THREE.ConeGeometry(0.022, 0.03, 3), mat(0x8fa0ad), -0.2 + i * 0.08, 0.165, -0.12, 0, 0, 0); k.box(0.065, 0.13, 0.014, i % 2 ? 0xa33a2a : 0xb8503a, -0.2 + i * 0.08, 0.17, 0.12); k.box(0.066, 0.02, 0.016, 0xeee0c8, -0.2 + i * 0.08, 0.27, 0.12); }
    k.cyl(0.06, 0.07, 0.02, 7, 'stoneDark', 0, 0, 0); k.emitters.push({ x: 0, y: 0.06, z: 0, type: 'hut' });
  } },
  platform: { dims: { w: 0.5, d: 0.5, h: 0.24, roof: 'gable', wall: 'wood' }, finished(k) {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.02, 0.022, 0.24, 6, 'woodDark', x * 0.2, 0, z * 0.2);
    for (let i = 0; i < 7; i++) k.log(0.5, 0.018, i % 2 ? 'wood' : 'woodDark', 0, 0.25, -0.21 + i * 0.07);
    k.box(0.36, 0.14, 0.36, 0x9c7a50, 0, 0.27, 0); k.roof(0.42, 0.42, 0.16, 'thatch', 0.41, 0x9c7a50);
    k.add(new THREE.BoxGeometry(0.06, 0.012, 0.36), mat('woodDark'), 0.18, 0.12, 0.3, 0.75, 0, 0); // notched-log ladder
    for (const [x, z] of [[-0.12, 0.3], [0.0, 0.33]]) k.cyl(0.04, 0.035, 0.07, 7, 0xa88350, x, 0, z);
  } },
  camp: { dims: { w: 0.7, d: 0.6, h: 0.1, roof: 'none', wall: 'wood' }, finished(k) {
    k.cone(0.2, 0.42, 8, 0xb38a5c, -0.18, 0, -0.14); k.cone(0.15, 0.32, 8, 0xa07a50, 0.22, 0, -0.18);
    k.cyl(0.08, 0.09, 0.025, 8, 'stoneDark', 0.02, 0, 0.12); k.cone(0.05, 0.08, 6, GLOW(0xff8a2a, 1.8), 0.02, 0.02, 0.12); k.emitters.push({ x: 0.02, y: 0.12, z: 0.12, type: 'hut' });
    k.logPile(-0.24, 0.24, 2, 0.18, 0.3); k.pile(6, 0.06, 'stone', 0.28, 0.22); k.box(0.14, 0.06, 0.1, 0xa88350, 0.3, 0, 0.02);
    for (const [x, z] of [[-0.06, 0.26], [0.14, 0.3]]) k.box(0.08, 0.02, 0.04, 'woodDark', x, 0, z);
  } },
  knapper: { dims: { w: 0.6, d: 0.5, h: 0.05, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.6, 0.015, 0.5, 0x8a8778); k.cyl(0.08, 0.1, 0.1, 7, 'stone', -0.12, 0, 0); k.cyl(0.06, 0.07, 0.08, 7, 'stoneDark', 0.16, 0, -0.1);
    for (let i = 0; i < 16; i++) k.add(new THREE.TetrahedronGeometry(0.012 + (i % 3) * 0.004, 0), mat(i % 2 ? 0x3a3a3f : 0x5c5a60), -0.2 + (i * 37 % 40) / 100, 0.02, -0.18 + (i * 53 % 36) / 100, i, i * 2, 0); // flint flakes
    k.pile(7, 0.07, 0x4a4a52, 0.2, 0.15); k.add(new THREE.BoxGeometry(0.2, 0.012, 0.1), mat(0xc09a6a), -0.15, 0.015, 0.18); k.emitters.push({ x: -0.12, y: 0.12, z: 0, type: 'chips' });
    for (let i = 0; i < 4; i++) k.add(new THREE.ConeGeometry(0.016, 0.06, 4), mat(0x2e2e34), -0.05 + i * 0.05, 0.025, 0.2, Math.PI / 2, 0, 0); // finished blades laid out
    k.box(0.02, 0.22, 0.02, 'woodDark', 0.26, 0, 0.2); k.box(0.02, 0.22, 0.02, 'woodDark', -0.26, 0, -0.2); k.add(new THREE.BoxGeometry(0.62, 0.012, 0.5), mat(0xb08b5a), 0, 0.22, 0, 0.12, 0, 0);
  } },
  canoe: { dims: { w: 0.7, d: 0.5, h: 0.05, roof: 'none', wall: 'wood' }, finished(k) {
    k.box(0.72, 0.015, 0.5, 'soil');
    const hull = k.add(new THREE.CylinderGeometry(0.06, 0.06, 0.62, 10, 1, false, 0, Math.PI), mat(0x7a5232), 0, 0.07, 0.08, 0, 0, Math.PI / 2); hull.rotation.set(Math.PI, 0, Math.PI / 2);
    k.log(0.6, 0.06, 'wood', 0, 0.06, -0.14); k.cyl(0.05, 0.06, 0.02, 7, 'stoneDark', 0.3, 0, -0.18); k.cone(0.03, 0.05, 6, GLOW(0xff8a2a, 1.4), 0.3, 0.02, -0.18);
    k.emitters.push({ x: 0.3, y: 0.08, z: -0.18, type: 'hut' }); for (let i = 0; i < 5; i++) k.box(0.03, 0.01, 0.02, 0xd2b07a, -0.2 + i * 0.09, 0.0, -0.02 + (i % 2) * 0.05);
    k.add(new THREE.BoxGeometry(0.03, 0.012, 0.3), mat('wood'), -0.28, 0.04, 0.2, 0, 0.6, 0);
  } },
  firepit: { dims: { w: 0.4, d: 0.4, h: 0.04, roof: 'none', wall: 'stone' }, finished(k) {
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; k.add(new THREE.DodecahedronGeometry(0.04, 0), mat(i % 2 ? 'stone' : 'stoneDark'), Math.cos(a) * 0.14, 0.03, Math.sin(a) * 0.14); }
    k.cyl(0.11, 0.11, 0.01, 10, 'charcoal'); for (let i = 0; i < 4; i++) k.log(0.18, 0.016, 'woodDark', 0, 0.03, 0, i * 0.8);
    k.cone(0.06, 0.12, 6, GLOW(0xff7a1a, 2.4), 0, 0.03, 0); k.cone(0.035, 0.09, 5, GLOW(0xffc04a, 3), 0.03, 0.03, 0.02); k.emitters.push({ x: 0, y: 0.14, z: 0, type: 'fire' });
    for (const [x, z, r] of [[-0.3, 0.1, 0.4], [0.28, -0.12, -0.6], [0.05, 0.3, 1.6]]) k.log(0.18, 0.025, 'wood', x, 0.025, z, r);
  } },
  flowers: { dims: { w: 0.6, d: 0.6, h: 0.03, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.62, 0.012, 0.62, 0x6f8f45);
    const C = [0xe8c33a, 0xd94a5a, 0xf1f0ea, 0x8a5ad0, 0xf08a3a];
    for (let i = 0; i < 26; i++) { const a = i * 2.39, r = 0.27 * Math.sqrt(i / 26), x = Math.cos(a) * r, z = Math.sin(a) * r; k.cyl(0.004, 0.004, 0.06, 3, 0x4f7a32, x, 0.01, z); k.add(new THREE.IcosahedronGeometry(0.022, 0), mat(C[i % C.length]), x, 0.075, z); }
  } },
  shrubs: { dims: { w: 0.6, d: 0.6, h: 0.1, roof: 'none', wall: 'soil' }, finished(k) {
    for (const [x, z, r] of [[-0.15, -0.12, 0.13], [0.15, -0.05, 0.11], [0.0, 0.17, 0.12], [0.2, 0.2, 0.08], [-0.22, 0.15, 0.08]]) { k.add(new THREE.IcosahedronGeometry(r, 0), mat(0x4a7a36), x, r * 0.75, z); k.add(new THREE.IcosahedronGeometry(r * 0.6, 0), mat(0x5f9440), x + r * 0.3, r * 1.25, z - r * 0.2); }
  } },
  garden: { dims: { w: 0.7, d: 0.7, h: 0.05, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.72, 0.015, 0.72, 'soil');
    for (let r = 0; r < 3; r++) { k.box(0.6, 0.03, 0.14, 0x5b3f28, 0, 0.015, -0.22 + r * 0.22); for (let i = 0; i < 6; i++) k.add(new THREE.IcosahedronGeometry(0.03, 0), mat([0x5f9a3f, 0x7aa84e, 0x8a9a3a][r]), -0.25 + i * 0.1, 0.07, -0.22 + r * 0.22); }
    k.fence([[-0.34, -0.34], [0.34, -0.34], [0.34, 0.34], [-0.34, 0.34], [-0.34, -0.1]], 0.08);
  } },
  shrine: { dims: { w: 0.5, d: 0.5, h: 0.2, roof: 'none', wall: 'stone' }, finished(k) {
    k.cyl(0.25, 0.27, 0.04, 10, 'stoneDark'); k.box(0.12, 0.3, 0.07, 'stone', 0, 0.04, -0.08); k.box(0.2, 0.05, 0.14, 'stoneDark', 0, 0.04, 0.1);
    k.box(0.05, 0.38, 0.05, 'woodDark', -0.18, 0.04, -0.14); k.add(new THREE.ConeGeometry(0.06, 0.1, 5), mat(0xeee4cc), -0.18, 0.47, -0.14);
    for (let i = 0; i < 5; i++) k.add(new THREE.SphereGeometry(0.018, 6, 4), mat(['gold', 'cloth', 0x3f7a3a, 'clay', 'white'][i]), -0.07 + i * 0.035, 0.11, 0.1);
    k.cyl(0.02, 0.025, 0.05, 6, 'clay', 0.12, 0.09, 0.1); k.cone(0.015, 0.04, 5, GLOW(0xffb04a, 2), 0.12, 0.14, 0.1);
  } },
  stones: { dims: { w: 0.84, d: 0.84, h: 0.05, roof: 'none', wall: 'stone' }, finished(k) {
    k.cyl(0.42, 0.42, 0.01, 16, 0x8f9a5a);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, h = 0.26 + ((i * 7) % 4) * 0.05; k.add(new THREE.BoxGeometry(0.07, h, 0.05), mat(i % 3 ? 'stone' : 'stoneDark'), Math.cos(a) * 0.33, h / 2, Math.sin(a) * 0.33, 0.04 * (i % 3 - 1), -a, 0.05 * (i % 2 ? 1 : -1)); }
    k.box(0.12, 0.42, 0.08, 'stoneDark', 0, 0, 0); k.box(0.28, 0.06, 0.1, 'stone', 0, 0.42, 0);
  } },
  timbercircle: { dims: { w: 1.7, d: 1.7, h: 0.05, roof: 'none', wall: 'wood' }, finished(k) {
    k.cyl(0.9, 0.92, 0.012, 24, 0x8f9a5a); k.cyl(0.88, 0.88, 0.014, 24, 0x7c6a4c); k.cyl(0.8, 0.8, 0.016, 24, 0x8f9a5a);
    for (const [r, n, h] of [[0.72, 16, 0.5], [0.48, 10, 0.62], [0.24, 6, 0.74]]) for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + r; k.cyl(0.035, 0.04, h, 7, i % 2 ? 'wood' : 'woodDark', Math.cos(a) * r, 0, Math.sin(a) * r); }
    k.cyl(0.05, 0.05, 0.9, 8, 'woodDark', 0, 0, 0); k.box(0.12, 0.04, 0.04, 'woodDark', 0, 0.8, 0);
  } },
  greathall: { dims: { w: 1.8, d: 1.1, h: 0.5, roof: 'gable', wall: 'mud' }, finished(k) {
    const W = 1.7, D = 1.0, H = 0.46;
    k.box(W + 0.1, 0.06, D + 0.1, 'stoneDark'); k.box(W, H, D, 'mud', 0, 0.06, 0);
    for (let i = 0; i < 11; i++) for (const s of [-1, 1]) k.cyl(0.03, 0.035, H + 0.06, 7, 'woodDark', -W / 2 + i * W / 10, 0.02, s * (D / 2 + 0.02));
    k.roof(W, D, 0.8, 'thatch', H + 0.06, 'mud', 0, 0, 0, 0.12); k.roof(W * 0.6, D * 0.55, 0.42, 'thatch2', H + 0.62, 'mud', 0, 0, 0, 0.06); // tall over-ambitious double roof
    for (const s of [-1, 1]) { k.cyl(0.05, 0.06, 1.6, 8, 'woodDark', s * (W / 2 + 0.08), 0, 0.0); k.add(new THREE.ConeGeometry(0.06, 0.14, 6), mat(0xeee4cc), s * (W / 2 + 0.08), 1.66, 0); } // carved gable posts
    k.door('front', W, D, 0.18, 0.26, 0, 'soilDark'); k.emitters.push({ x: -0.4, y: 1.5, z: 0, type: 'chimney' });
    k.fence([[-0.95, 0.75], [-0.3, 0.8]], 0.12); k.fence([[0.3, 0.8], [0.95, 0.75]], 0.12);
  } },
  palisade: { dims: { w: 0.9, d: 0.2, h: 0.05, roof: 'none', wall: 'wood' }, finished(k) {
    for (let i = 0; i < 11; i++) { const h = 0.34 + (i % 3) * 0.03; k.cyl(0.035, 0.04, h, 6, i % 2 ? 'wood' : 'woodDark', -0.45 + i * 0.09, 0, 0); k.cone(0.04, 0.06, 6, i % 2 ? 'wood' : 'woodDark', -0.45 + i * 0.09, h, 0); }
    k.log(0.92, 0.015, 'woodDark', 0, 0.22, 0.04);
  } },
  trackway: { dims: { w: 0.9, d: 0.9, h: 0.02, roof: 'none', wall: 'wood' }, finished(k) {
    for (let i = 0; i < 9; i++) k.log(0.7, 0.026 + (i % 2) * 0.004, i % 3 ? 'wood' : 'woodDark', 0, 0.03, -0.43 + i * 0.107, i % 2 ? 0.06 : -0.05); // split logs laid crosswise
    for (const x of [-0.25, 0.25]) k.log(0.95, 0.015, 'woodDark', x, 0.012, 0, Math.PI / 2);
  } },
  cairn: { dims: { w: 0.4, d: 0.4, h: 0.05, roof: 'none', wall: 'stone' }, finished(k) {
    for (let r = 0; r < 5; r++) for (let i = 0; i < 6 - r; i++) { const a = i / (6 - r) * Math.PI * 2 + r; k.add(new THREE.DodecahedronGeometry(0.05 - r * 0.006, 0), mat((i + r) % 2 ? 'stone' : 'stoneDark'), Math.cos(a) * (0.14 - r * 0.028), 0.04 + r * 0.06, Math.sin(a) * (0.14 - r * 0.028), i, r, 0); }
  } },
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
  stall: { dims: { w: 0.66, d: 0.6, h: 0.3, roof: 'none', wall: 'wood' }, finished(k) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.018, 0.02, sz < 0 ? 0.4 : 0.3, 5, 'woodDark', sx * 0.28, 0, sz * 0.24);
    k.add(new THREE.BoxGeometry(0.62, 0.012, 0.56), mat(0xb08b5a), 0, 0.36, 0, -0.18, 0, 0); // hide awning
    k.box(0.5, 0.01, 0.26, 0x8a6a48, 0, 0, 0.1); // furs laid out
    for (let i = 0; i < 4; i++) k.cyl(0.03, 0.035, 0.06, 8, i % 2 ? 'clay' : 0xa88350, -0.18 + i * 0.12, 0.01, 0.12);
    k.pile(5, 0.05, 0x3a3a3f, 0.2, -0.12); k.pile(5, 0.05, 0xb3243b, -0.2, -0.12); k.box(0.1, 0.06, 0.08, 0xa88350, 0, 0, -0.14);
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
  woodcutter: { dims: { w: 0.5, d: 0.44, h: 0.12, roof: 'gable', wall: 'wood' }, finished(k) {
    // A-frame of poles covered in bark and brush, a chopping stump with a hafted stone axe, split-log stacks and chips
    const x0 = -0.1, z0 = -0.1;
    for (let i = 0; i < 7; i++) { const z = z0 - 0.18 + i * 0.06; for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.011, 0.013, 0.36, 5), mat(i % 2 ? 'woodDark' : 'wood'), x0 + s * 0.09, 0.15, z, 0, 0, s * 0.62); }
    for (const s of [-1, 1]) k.add(new THREE.BoxGeometry(0.21, 0.016, 0.44), mat(s < 0 ? 0x6e5236 : 0x7d5e3c), x0 + s * 0.095, 0.15, z0, 0, 0, s * 0.95); // bark sheets
    k.log(0.5, 0.014, 'woodDark', x0, 0.29, z0, Math.PI / 2);
    for (let i = 0; i < 5; i++) k.add(new THREE.IcosahedronGeometry(0.04, 0), mat(0x58733a), x0 - 0.12 + i * 0.06, 0.25, z0 - 0.2 + (i % 2) * 0.03); // brush on the ridge
    k.cyl(0.065, 0.075, 0.08, 9, 'wood', 0.2, 0, 0.16); k.cyl(0.062, 0.062, 0.004, 9, 0xd9b98a, 0.2, 0.08, 0.16); // chopping stump
    k.add(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 4), mat('woodDark'), 0.22, 0.13, 0.16, 0.3, 0, 0.5); k.add(new THREE.DodecahedronGeometry(0.018, 0), mat(0x5d5d63), 0.25, 0.19, 0.18);
    k.logPile(0.26, -0.14, 3, 0.26, 0.3); k.logPile(-0.04, 0.25, 2, 0.2, Math.PI / 2 + 0.2);
    for (let i = 0; i < 9; i++) k.add(new THREE.BoxGeometry(0.03, 0.006, 0.014), mat(0xd9b98a), 0.12 + (i * 37 % 20) / 100, 0.004, 0.08 + (i * 53 % 22) / 100, 0, i, 0);
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
  well: { dims: { w: 0.44, d: 0.44, h: 0.16, roof: 'none', wall: 'stone', round: true }, finished(k) {
    k.cyl(0.24, 0.26, 0.03, 12, 'stoneDark');
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.add(new THREE.DodecahedronGeometry(0.045, 0), mat(i % 2 ? 'stone' : 'stoneDark'), Math.cos(a) * 0.17, 0.07, Math.sin(a) * 0.17, i, i, 0); }
    k.cyl(0.13, 0.13, 0.01, 12, 'water', 0, 0.05);
    k.cyl(0.02, 0.025, 0.36, 5, 'woodDark', -0.26, 0, 0.1); // well sweep: post, beam, counterweight stone, skin bucket
    k.add(new THREE.CylinderGeometry(0.01, 0.012, 0.62, 5), mat('wood'), -0.1, 0.36, 0.05, 0, 0, 1.25);
    k.add(new THREE.DodecahedronGeometry(0.04, 0), mat('stone'), -0.38, 0.27, 0.1); k.box(0.005, 0.14, 0.005, 'woodDark', 0.17, 0.32, 0.02); k.cyl(0.025, 0.02, 0.04, 6, 0x8a6a48, 0.17, 0.28, 0.02);
  } },
  rescue: { dims: { w: 0.6, d: 0.6, h: 0.2, roof: 'cone', wall: 'mud', round: true }, finished(k) {
    k.cyl(0.29, 0.31, 0.05, 12, 'stoneDark', -0.04, 0, -0.04); k.cyl(0.24, 0.25, 0.2, 12, 'mud', -0.04, 0.04, -0.04);
    k.cone(0.32, 0.3, 12, 'thatch2', -0.04, 0.23, -0.04); k.door('front', 0.5, 0.42, 0.1, 0.14, -0.04, 'soilDark');
    k.emitters.push({ x: -0.04, y: 0.55, z: -0.04, type: 'hut' });
    // herb drying frame, a stretcher of poles and hide, a mortar stone
    k.box(0.02, 0.26, 0.02, 'woodDark', 0.24, 0, 0.18); k.box(0.02, 0.26, 0.02, 'woodDark', 0.24, 0, -0.14); k.box(0.012, 0.012, 0.34, 'wood', 0.24, 0.24, 0.02);
    for (let i = 0; i < 5; i++) k.add(new THREE.ConeGeometry(0.02, 0.07, 4), mat(i % 2 ? 0x6f8f3a : 0x9aa64a), 0.24, 0.2, -0.1 + i * 0.06, Math.PI, 0, 0);
    k.box(0.1, 0.012, 0.32, 0xb08b5a, -0.22, 0.03, 0.26, Math.PI / 2); for (const s of [-1, 1]) k.box(0.36, 0.014, 0.014, 'woodDark', -0.22, 0.035, 0.26 + s * 0.05);
    k.cyl(0.05, 0.06, 0.05, 7, 'stone', 0.28, 0, 0.3);
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

// ---------- Bronze era ----------
Object.assign(MODELS, {
  mudhouse: { dims: { w: 0.6, d: 0.5, h: 0.32, roof: 'flat', wall: 'clay' }, finished(k) {
    const W = 0.6, D = 0.5, H = 0.32;
    k.box(W + 0.04, 0.04, D + 0.04, 'stoneDark'); k.box(W, H, D, 'clay'); k.box(W + 0.04, 0.04, D + 0.04, 'mud', 0, H);
    k.box(W * 0.5, 0.06, D * 0.04, 'mud', 0, H + 0.04, D / 2 - 0.01); // parapet
    for (const x of [-0.24, -0.08, 0.08, 0.24]) k.log(0.08, 0.012, 'woodDark', x, H - 0.03, D / 2 + 0.03, Math.PI / 2); // roof beam ends
    k.windows('front', W, D, 0.14, 2, 0.07, 0.08, 0.1); k.door('front', W, D, 0.09, 0.17, -0.15, 'woodDark'); k.windows('right', W, D, 0.15, 1, 0.07, 0.08);
    k.box(0.16, 0.12, 0.12, 'clay', 0.18, H + 0.04, -0.1); k.box(0.12, 0.02, 0.1, 'thatch', 0.18, H + 0.16, -0.1); // rooftop shelter
    k.pile(3, 0.04, 'clay', -0.33, 0.3); k.cyl(0.04, 0.03, 0.08, 7, 'clay', 0.33, 0, 0.3);
  } },
  irrfield: { dims: { w: 1.84, d: 1.84, h: 0.05, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(1.86, 0.035, 1.86, 'soil');
    for (let r = 0; r < 4; r++) { const z = -0.66 + r * 0.44; k.box(1.72, 0.012, 0.05, 'water', 0, 0.035, z + 0.2); for (let i = 0; i < 10; i++) for (let j = 0; j < 2; j++) k.cone(0.04, 0.15 + ((r + i + j) % 3) * 0.02, 5, (i + j) % 3 ? 'gold' : 'crop', -0.8 + i * 0.178, 0.04, z - 0.06 + j * 0.12); }
    k.box(0.06, 0.02, 1.8, 'water', -0.9, 0.035, 0); k.box(0.03, 0.06, 0.12, 'woodDark', -0.9, 0.03, -0.5);
    k.fence([[-0.92, -0.92], [0.92, -0.92], [0.92, 0.92]], 0.08);
    for (let i = 0; i < 3; i++) k.cyl(0.05, 0.06, 0.1, 7, 'gold', 0.55 + i * 0.12, 0.035, 0.78);
  } },
  ditch: { dims: { w: 0.9, d: 0.9, h: 0.03, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.96, 0.02, 0.96, 'soil'); k.box(0.3, 0.025, 0.98, 'soilDark', 0, 0.01); k.box(0.98, 0.025, 0.3, 'soilDark', 0, 0.01);
    k.box(0.2, 0.03, 0.98, 'water', 0, 0.012); k.box(0.98, 0.03, 0.2, 'water', 0, 0.012);
    for (const [x, z] of [[-0.3, -0.3], [0.3, 0.3], [0.32, -0.28], [-0.28, 0.32]]) k.cone(0.03, 0.09, 5, 'crop2', x, 0.02, z);
  } },
  sheep: { dims: { w: 1.84, d: 1.84, h: 0.08, roof: 'none', wall: 'wood' }, finished(k) {
    k.fence([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9], [-0.9, -0.9]], 0.11);
    k.box(0.36, 0.2, 0.26, 'wood', 0.58, 0, -0.6); k.roof(0.36, 0.26, 0.1, 'thatch', 0.2, 'wood', 0.58, -0.6);
    const spots = [[-0.5, -0.3], [-0.2, 0.1], [0.1, -0.2], [0.3, 0.4], [-0.45, 0.5], [0.55, 0.15], [-0.05, 0.55], [0.2, -0.55]];
    spots.forEach(([x, z], i) => { const ry = i * 1.3; k.box(0.12, 0.07, 0.08, 'white', x, 0.05, z, ry); k.box(0.04, 0.045, 0.04, 'black', x + Math.cos(ry) * 0.075, 0.08, z - Math.sin(ry) * 0.075, ry); for (const s of [-1, 1]) k.box(0.015, 0.05, 0.015, 'black', x + s * 0.03, 0, z); });
    k.cyl(0.08, 0.06, 0.05, 8, 'woodDark', -0.6, 0, -0.62); k.cyl(0.065, 0.065, 0.01, 8, 'water', -0.6, 0.045, -0.62);
    k.pile(4, 0.05, 'white', 0.62, -0.3);
  } },
  flax: { dims: { w: 0.9, d: 0.9, h: 0.05, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.92, 0.03, 0.92, 'soil');
    for (let r = 0; r < 5; r++) for (let i = 0; i < 6; i++) { const x = -0.36 + i * 0.145, z = -0.36 + r * 0.18; k.box(0.012, 0.16, 0.012, 'crop2', x, 0.03, z); k.cone(0.025, 0.03, 5, 0x6f8fd8, x, 0.19, z); }
    k.box(0.24, 0.12, 0.05, 'woodDark', 0.3, 0.03, 0.44); for (let i = 0; i < 4; i++) k.box(0.02, 0.1, 0.02, 'thatch', 0.22 + i * 0.05, 0.08, 0.44);
  } },
  oven: { dims: { w: 0.5, d: 0.5, h: 0.26, roof: 'cone', wall: 'clay', round: true }, finished(k) {
    k.box(0.6, 0.04, 0.6, 'stoneDark');
    k.cyl(0.18, 0.24, 0.18, 12, 'clay', -0.05, 0.04, -0.04); k.cone(0.19, 0.13, 12, 'clay', -0.05, 0.22, -0.04);
    k.box(0.12, 0.09, 0.04, GLOW(0xff8a2a, 1.8), -0.05, 0.06, 0.17); k.emitters.push({ x: -0.05, y: 0.38, z: -0.04, type: 'hut' });
    k.box(0.22, 0.03, 0.14, 'woodLight', 0.2, 0.14, 0.18); for (let i = 0; i < 3; i++) k.cyl(0.035, 0.035, 0.03, 8, 'thatch2', 0.14 + i * 0.06, 0.17, 0.18);
    for (const x of [0.12, 0.28]) k.box(0.02, 0.14, 0.02, 'woodDark', x, 0, 0.18);
    k.logPile(0.22, -0.18, 2, 0.2, Math.PI / 2);
  } },
  bronzesmith: { dims: { w: 0.62, d: 0.52, h: 0.32, roof: 'gable', wall: 'brick' }, finished(k) {
    k.box(0.66, 0.04, 0.56, 'stoneDark');
    k.box(0.36, 0.3, 0.4, 'brick', -0.13, 0.04, -0.04); k.roof(0.36, 0.4, 0.16, 'roof', 0.34, 'brick', -0.13, -0.04);
    k.chimney(-0.22, -0.12, 0.42, 0.16);
    k.box(0.26, 0.02, 0.3, 'shingle', 0.17, 0.26, 0.05); for (const [x, z] of [[0.06, -0.08], [0.28, -0.08], [0.06, 0.18], [0.28, 0.18]]) k.box(0.025, 0.24, 0.025, 'woodDark', x, 0.04, z);
    k.box(0.08, 0.08, 0.08, 'brickDark', 0.1, 0.04, 0.02); k.box(0.05, 0.02, 0.05, GLOW(0xff9a30, 2.4), 0.1, 0.12, 0.02); k.emitters.push({ x: 0.1, y: 0.16, z: 0.02, type: 'chips' });
    k.box(0.07, 0.07, 0.05, 'iron', 0.24, 0.04, 0.08); k.box(0.11, 0.02, 0.05, 'iron', 0.24, 0.11, 0.08);
    for (let i = 0; i < 4; i++) { k.box(0.015, 0.11, 0.015, 'woodDark', 0.04 + i * 0.07, 0.04, 0.25); k.box(0.05, 0.03, 0.02, 'bronze', 0.04 + i * 0.07, 0.15, 0.25); } // tools in a rack
  } },
  potter: { dims: { w: 0.56, d: 0.5, h: 0.28, roof: 'gable', wall: 'mud' }, finished(k) {
    k.box(0.32, 0.24, 0.3, 'mud', -0.12, 0, -0.08); k.roof(0.32, 0.3, 0.14, 'thatch', 0.24, 'mud', -0.12, -0.08);
    k.cyl(0.07, 0.1, 0.12, 10, 'clay', 0.18, 0, -0.12); k.cone(0.07, 0.06, 10, 'clay', 0.18, 0.12, -0.12); k.box(0.04, 0.05, 0.03, GLOW(0xff8a2a, 1.5), 0.18, 0.02, -0.03); k.emitters.push({ x: 0.18, y: 0.2, z: -0.12, type: 'hut' });
    k.cyl(0.05, 0.05, 0.04, 10, 'woodDark', 0.1, 0, 0.16); k.cyl(0.03, 0.02, 0.04, 8, 'clay', 0.1, 0.04, 0.16);
    const pots = [[-0.25, 0.2], [-0.16, 0.24], [-0.07, 0.2], [0.24, 0.22], [-0.3, 0.1]];
    pots.forEach(([x, z], i) => { k.cyl(0.025, 0.035, 0.05, 8, i % 2 ? 'clay' : 'brick', x, 0, z); k.cyl(0.035, 0.025, 0.04, 8, i % 2 ? 'clay' : 'brick', x, 0.05, z); k.cyl(0.018, 0.022, 0.02, 8, i % 2 ? 'clay' : 'brick', x, 0.09, z); });
  } },
  weaver: { dims: { w: 0.56, d: 0.5, h: 0.28, roof: 'gable', wall: 'mud' }, finished(k) {
    k.box(0.34, 0.24, 0.3, 'mud', 0.1, 0, -0.08); k.roof(0.34, 0.3, 0.14, 'thatch', 0.24, 'mud', 0.1, -0.08);
    // upright loom with a red cloth in progress
    for (const x of [-0.3, -0.06]) k.box(0.025, 0.28, 0.025, 'woodDark', x, 0, 0.14);
    k.box(0.28, 0.025, 0.025, 'woodDark', -0.18, 0.27, 0.14); k.box(0.22, 0.15, 0.008, 'cloth', -0.18, 0.11, 0.14);
    for (let i = 0; i < 6; i++) k.box(0.006, 0.1, 0.006, 'white', -0.27 + i * 0.036, 0.01, 0.14);
    for (let i = 0; i < 6; i++) k.cyl(0.012, 0.012, 0.03, 5, 'stone', -0.27 + i * 0.036, 0.0, 0.14);
    k.box(0.26, 0.012, 0.012, 'woodDark', 0.1, 0.22, 0.12); k.box(0.07, 0.12, 0.004, 'cloth', 0.03, 0.1, 0.12); k.box(0.07, 0.12, 0.004, 0x3d6fb2, 0.14, 0.1, 0.12); // drying cloth
    k.pile(3, 0.04, 'white', 0.22, 0.24);
  } },
  cartmaker: { dims: { w: 0.62, d: 0.52, h: 0.28, roof: 'gable', wall: 'wood' }, finished(k) {
    k.box(0.38, 0.24, 0.3, 'wood', -0.1, 0, -0.1); k.roof(0.38, 0.3, 0.14, 'shingle', 0.24, 'wood', -0.1, -0.1);
    // a finished cart and a spare wheel
    k.box(0.22, 0.03, 0.14, 'woodLight', 0.14, 0.07, 0.16); for (const s of [-1, 1]) k.box(0.22, 0.04, 0.012, 'woodLight', 0.14, 0.1, 0.16 + s * 0.07);
    for (const s of [-1, 1]) { k.cyl(0.055, 0.055, 0.02, 10, 'woodDark', 0.14, 0.015, 0.16 + s * 0.085, Math.PI / 2); k.cyl(0.015, 0.015, 0.024, 6, 'bronze', 0.14, 0.015, 0.16 + s * 0.085, Math.PI / 2); }
    k.box(0.2, 0.012, 0.012, 'woodDark', 0.34, 0.07, 0.16);
    k.cyl(0.06, 0.06, 0.02, 10, 'woodDark', -0.28, 0.07, 0.15, 0, 0.3); k.logPile(-0.08, 0.22, 2, 0.24);
  } },
  raftmaker: { dims: { w: 0.6, d: 0.5, h: 0.2, roof: 'none', wall: 'wood' }, finished(k) {
    for (let i = 0; i < 6; i++) k.log(0.4, 0.024, i % 2 ? 'wood' : 'woodLight', -0.06 + (i - 2.5) * 0.05, 0.03, 0.06, 0);
    for (const z of [-0.08, 0.2]) k.box(0.32, 0.012, 0.02, 'woodDark', -0.06, 0.055, z);
    k.box(0.02, 0.2, 0.02, 'woodDark', 0.22, 0, -0.18); k.box(0.02, 0.2, 0.02, 'woodDark', 0.22, 0, 0.18); k.box(0.02, 0.02, 0.38, 'woodDark', 0.22, 0.2, 0);
    k.box(0.01, 0.12, 0.06, 'thatch', 0.22, 0.08, -0.08); k.logPile(-0.18, -0.2, 3, 0.3); k.box(0.28, 0.01, 0.03, 'woodLight', 0.1, 0.02, 0.24, 0.6);
  } },
  bridge: { dims: { w: 0.98, d: 0.4, h: 0.12, roof: 'none', wall: 'wood' }, finished(k) {
    for (const x of [-0.42, 0, 0.42]) for (const s of [-1, 1]) k.cyl(0.025, 0.025, 0.24, 6, 'woodDark', x, -0.12, s * 0.17);
    for (const s of [-1, 1]) k.box(1.0, 0.03, 0.04, 'woodDark', 0, 0.08, s * 0.17);
    for (let i = 0; i < 12; i++) k.box(0.075, 0.018, 0.4, i % 3 ? 'wood' : 'woodLight', -0.46 + i * 0.084, 0.11, 0);
    for (const x of [-0.42, 0, 0.42]) for (const s of [-1, 1]) k.box(0.025, 0.12, 0.025, 'woodDark', x, 0.12, s * 0.19);
    for (const s of [-1, 1]) k.box(0.98, 0.02, 0.02, 'wood', 0, 0.22, s * 0.19);
  } },
  market: { dims: { w: 1.6, d: 1.6, h: 0.25, roof: 'none', wall: 'wood' }, finished(k) {
    k.box(1.7, 0.02, 1.7, 'soil');
    const cols = ['cloth', 0x3d6fb2, 'thatch', 0x5b8f3a];
    [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]].forEach(([x, z], i) => {
      for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.02, 0.26, 0.02, 'woodDark', x + a * 0.22, 0, z + c * 0.16);
      k.gable(0.5, 0.38, 0.1, cols[i], x, 0.26, z);
      k.box(0.44, 0.08, 0.14, 'woodLight', x, 0, z + 0.1);
      const goods = [['clay', 'brick'], ['cloth', 0x3d6fb2], ['crop', 'gold'], ['bronze', 'iron']][i];
      for (let j = 0; j < 4; j++) k.cyl(0.03, 0.035, 0.04, 7, goods[j % 2], x - 0.15 + j * 0.1, 0.08, z + 0.1);
    });
    for (const [x, z] of [[0, 0], [0.1, 0.12], [-0.12, 0.05], [0.05, -0.15]]) { k.cyl(0.025, 0.03, 0.1, 6, 'cloth', x, 0, z); k.cyl(0.02, 0.02, 0.03, 6, 'mud', x, 0.1, z); }
  } },
  tower: { dims: { w: 0.4, d: 0.4, h: 0.8, roof: 'cone', wall: 'wood' }, finished(k) {
    k.box(0.44, 0.05, 0.44, 'stone');
    for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.035, 0.82, 0.035, 'woodDark', a * 0.15, 0.05, c * 0.15);
    for (const y of [0.25, 0.55]) { k.box(0.32, 0.02, 0.02, 'wood', 0, y, 0.15, 0, 0, 0.6); k.box(0.32, 0.02, 0.02, 'wood', 0, y, -0.15, 0, 0, -0.6); }
    k.box(0.4, 0.03, 0.4, 'wood', 0, 0.84); for (const s of [-1, 1]) { k.box(0.4, 0.08, 0.02, 'wood', 0, 0.87, s * 0.19); k.box(0.02, 0.08, 0.4, 'wood', s * 0.19, 0.87, 0); }
    k.cone(0.3, 0.2, 4, 'thatch', 0, 1.07, 0, Math.PI / 4); for (const s of [-1, 1]) k.box(0.02, 0.14, 0.02, 'woodDark', s * 0.17, 0.92, 0.17);
    k.box(0.025, 0.12, 0.004, 'cloth', 0.02, 1.27, 0); k.box(0.012, 0.16, 0.012, 'woodDark', 0, 1.2, 0);
  } },
  temple: { dims: { w: 1.4, d: 1.2, h: 0.6, roof: 'flat', wall: 'brick' }, finished(k) {
    k.box(1.6, 0.08, 1.4, 'stone'); k.box(1.3, 0.08, 1.1, 'stone', 0, 0.08); k.box(1.0, 0.08, 0.8, 'stoneDark', 0, 0.16);
    k.box(0.7, 0.36, 0.5, 'brick', 0, 0.24, -0.04); k.box(0.76, 0.04, 0.56, 'quoin', 0, 0.6, -0.04); k.roof(0.7, 0.5, 0.18, 'roof', 0.64, 'brick', 0, -0.04);
    for (const x of [-0.27, -0.09, 0.09, 0.27]) k.cyl(0.035, 0.04, 0.36, 8, 'quoin', x, 0.24, 0.25);
    k.box(0.12, 0.2, 0.02, 'black', 0, 0.24, 0.215);
    for (let i = 0; i < 4; i++) k.box(0.4, 0.04, 0.06, 'stone', 0, i * 0.04, 0.72 - i * 0.07);
    for (const s of [-1, 1]) { k.cyl(0.04, 0.05, 0.12, 8, 'bronze', s * 0.62, 0.08, 0.5); k.cone(0.035, 0.06, 6, GLOW(0xff8a2a, 1.6), s * 0.62, 0.2, 0.5); k.emitters.push({ x: s * 0.62, y: 0.28, z: 0.5, type: 'fire' }); }
  } },
  mound: { dims: { w: 1.5, d: 1.5, h: 0.3, roof: 'none', wall: 'stone' }, finished(k) {
    k.cyl(0.62, 0.78, 0.26, 16, 'crop2', 0, 0, 0); k.cyl(0.3, 0.62, 0.12, 16, 'green', 0, 0.26, 0);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; k.box(0.08, 0.1, 0.06, 'stone', Math.cos(a) * 0.82, 0, Math.sin(a) * 0.82, -a); }
    k.box(0.16, 0.12, 0.04, 'stoneDark', 0, 0.02, 0.76); k.box(0.24, 0.04, 0.06, 'stone', 0, 0.14, 0.76); k.box(0.1, 0.1, 0.02, 'black', 0, 0.02, 0.79);
    k.box(0.06, 0.3, 0.06, 'stone', 0.0, 0.38, 0);
  } },
  statue: { dims: { w: 0.4, d: 0.4, h: 0.6, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.42, 0.06, 0.42, 'stone'); k.box(0.26, 0.2, 0.26, 'stoneDark', 0, 0.06);
    const B = mat('bronze', { metalness: 0.6, roughness: 0.4 });
    k.cyl(0.05, 0.06, 0.18, 8, B, 0, 0.26); k.box(0.12, 0.05, 0.08, B, 0, 0.38); k.cyl(0.035, 0.035, 0.06, 8, B, 0, 0.43);
    k.box(0.02, 0.2, 0.02, B, 0.08, 0.36, 0, 0, 0, -0.3); k.box(0.04, 0.12, 0.012, B, -0.08, 0.3, 0.03);
    for (const [x, z] of [[-0.18, 0.18], [0.18, 0.18]]) k.cone(0.03, 0.08, 5, 'crop2', x, 0.06, z);
  } },
});

// ---------- Iron and Classical eras ----------
const MARBLE = 0xe9e4d8, MARBLE2 = 0xd6cfbf;
Object.assign(MODELS, {
  charcoal: { dims: { w: 0.6, d: 0.6, h: 0.25, roof: 'none', wall: 'soil' }, finished(k) {
    k.cyl(0.24, 0.3, 0.2, 10, 'soilDark', -0.05, 0, -0.03); k.cone(0.24, 0.12, 10, 'soilDark', -0.05, 0.2, -0.03);
    for (let i = 0; i < 5; i++) { const a = i * 1.25; k.box(0.05, 0.03, 0.02, 'charcoal', -0.05 + Math.cos(a) * 0.27, 0.06, -0.03 + Math.sin(a) * 0.27, -a); }
    k.emitters.push({ x: -0.05, y: 0.34, z: -0.03, type: 'chimney' }); k.emitters.push({ x: 0.1, y: 0.22, z: 0.1, type: 'chimney' });
    k.logPile(0.26, 0.24, 3, 0.26, 0.3); k.pile(6, 0.06, 'charcoal', -0.28, 0.26);
  } },
  ironpit: { dims: { w: 0.8, d: 0.8, h: 0.2, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(0.8, 0.02, 0.8, 'soilDark'); k.cyl(0.2, 0.16, 0.04, 10, 'black', -0.05, 0.005, -0.05);
    for (const [x, z] of [[-0.2, -0.2], [0.1, -0.2], [-0.2, 0.1], [0.1, 0.1]]) k.box(0.025, 0.24, 0.025, 'woodDark', x, 0, z);
    k.box(0.36, 0.025, 0.025, 'woodDark', -0.05, 0.24, -0.2); k.box(0.36, 0.025, 0.025, 'woodDark', -0.05, 0.24, 0.1); k.cyl(0.03, 0.03, 0.3, 8, 'wood', -0.05, 0.25, -0.05, 0, Math.PI / 2);
    k.pile(9, 0.06, 0xa4512f, 0.25, 0.25); k.pile(5, 0.05, 0x7a3a22, 0.28, -0.2);
    k.box(0.14, 0.06, 0.1, 'wood', -0.28, 0.0, 0.28); k.pile(3, 0.035, 0xa4512f, -0.28, 0.28, 0.06);
  } },
  bloomery: { dims: { w: 0.6, d: 0.55, h: 0.36, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(0.64, 0.04, 0.58, 'stoneDark');
    k.cyl(0.11, 0.15, 0.4, 10, 'clay', -0.1, 0.04, -0.06); k.cyl(0.08, 0.1, 0.06, 10, 'brickDark', -0.1, 0.44, -0.06); k.emitters.push({ x: -0.1, y: 0.52, z: -0.06, type: 'smelter' });
    k.box(0.06, 0.06, 0.03, GLOW(0xff7020, 2.8), -0.1, 0.07, 0.08); k.cyl(0.02, 0.02, 0.18, 6, 'woodDark', 0.04, 0.12, -0.02, 0, Math.PI / 2.4);
    k.box(0.16, 0.08, 0.1, 0x8a6a48, 0.12, 0.04, -0.02); // bellows
    k.box(0.24, 0.02, 0.22, 'thatch', 0.18, 0.26, 0.12); for (const [x, z] of [[0.08, 0.03], [0.28, 0.03], [0.08, 0.22], [0.28, 0.22]]) k.box(0.02, 0.22, 0.02, 'woodDark', x, 0.04, z);
    for (let i = 0; i < 3; i++) k.cyl(0.035, 0.04, 0.03, 7, 'iron', 0.12 + i * 0.08, 0.04, 0.2);
    k.pile(6, 0.05, 'charcoal', -0.26, 0.2); k.pile(5, 0.05, 0xa4512f, -0.27, -0.24);
  } },
  blacksmith: { dims: { w: 0.62, d: 0.52, h: 0.32, roof: 'gable', wall: 'stone' }, finished(k) {
    const W = 0.4, D = 0.4; k.box(0.66, 0.04, 0.56, 'stoneDark'); k.box(W, 0.3, D, 'stone', -0.1, 0.04, -0.04); k.roof(W, D, 0.16, 'shingle', 0.34, 'stone', -0.1, -0.04);
    k.chimney(-0.24, -0.14, 0.42, 0.18, 'stoneDark');
    k.box(0.24, 0.02, 0.32, 'shingle', 0.2, 0.26, 0.06); for (const [x, z] of [[0.09, -0.08], [0.31, -0.08], [0.09, 0.2], [0.31, 0.2]]) k.box(0.025, 0.24, 0.025, 'woodDark', x, 0.04, z);
    k.box(0.1, 0.08, 0.1, 'stoneDark', 0.14, 0.04, -0.02); k.box(0.07, 0.02, 0.07, GLOW(0xff8a2a, 2.6), 0.14, 0.12, -0.02); k.emitters.push({ x: 0.14, y: 0.16, z: -0.02, type: 'chips' });
    k.cyl(0.03, 0.04, 0.06, 7, 'woodDark', 0.26, 0.04, 0.1); k.box(0.12, 0.04, 0.05, 'iron', 0.26, 0.1, 0.1); k.box(0.04, 0.02, 0.05, 'iron', 0.33, 0.11, 0.1);
    k.cyl(0.05, 0.05, 0.08, 8, 'woodDark', 0.04, 0.04, 0.2); k.cyl(0.045, 0.045, 0.005, 8, 'water', 0.04, 0.12, 0.2);
    for (let i = 0; i < 4; i++) { k.box(0.012, 0.13, 0.012, 'woodDark', -0.26 + i * 0.05, 0.04, 0.25); k.box(0.035, 0.025, 0.015, 'iron', -0.26 + i * 0.05, 0.17, 0.25); }
  } },
  mason: { dims: { w: 0.62, d: 0.55, h: 0.2, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.66, 0.02, 0.58, 'stoneDark');
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2 - (i === 2 ? 1 : 0); j++) k.box(0.12, 0.07, 0.08, 'stone', -0.18 + j * 0.13, i * 0.07, -0.18);
    k.box(0.12, 0.07, 0.08, 'stone', -0.12, 0.14, -0.18);
    k.box(0.22, 0.14, 0.18, 'stoneDark', 0.14, 0.02, 0.02, 0.4); k.emitters.push({ x: 0.14, y: 0.2, z: 0.02, type: 'chips' });
    k.box(0.02, 0.24, 0.02, 'woodDark', 0.24, 0, -0.2); k.box(0.02, 0.24, 0.02, 'woodDark', 0.04, 0, -0.2); k.box(0.24, 0.02, 0.02, 'woodDark', 0.14, 0.24, -0.2); // lifting frame
    k.pile(10, 0.03, 'stone', -0.2, 0.18); for (let i = 0; i < 4; i++) k.box(0.1, 0.06, 0.06, 'quoin', 0.1 + (i % 2) * 0.11, Math.floor(i / 2) * 0.06, 0.22);
  } },
  stonehouse: { dims: { w: 0.6, d: 0.5, h: 0.36, roof: 'gable', wall: 'stone' }, finished(k) {
    const W = 0.6, D = 0.5, H = 0.36;
    k.box(W + 0.04, 0.05, D + 0.04, 'stoneDark'); k.box(W, H, D, 'stone');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < 4; i++) k.box(0.05, 0.045, 0.05, i % 2 ? 'stoneDark' : 'quoin', sx * (W / 2 - 0.012), 0.05 + i * 0.08, sz * (D / 2 - 0.012));
    k.windows('front', W, D, 0.15, 2, 0.08, 0.1, 0.08); k.door('front', W, D, 0.1, 0.18, -0.17, 'woodDark'); k.windows('back', W, D, 0.18, 2); k.windows('left', W, D, 0.18, 1);
    k.roof(W, D, 0.24, 'shingle', H, 'stone'); k.chimney(-0.2, -0.08, H + 0.06, 0.2, 'stoneDark');
  } },
  stonewell: { dims: { w: 0.4, d: 0.4, h: 0.3, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.5, 0.03, 0.5, 'stone'); k.cyl(0.16, 0.17, 0.14, 12, 'stone', 0, 0.03); k.cyl(0.12, 0.12, 0.01, 12, 'water', 0, 0.16);
    for (const s of [-1, 1]) k.box(0.04, 0.3, 0.04, 'stoneDark', s * 0.15, 0.03, 0); k.box(0.38, 0.04, 0.05, 'woodDark', 0, 0.33, 0); k.gable(0.42, 0.24, 0.1, 'roof', 0, 0.37, 0);
    k.cyl(0.03, 0.03, 0.04, 6, 'wood', 0.04, 0.2, 0);
  } },
  horsefarm: { dims: { w: 1.84, d: 1.84, h: 0.2, roof: 'none', wall: 'wood' }, finished(k) {
    k.fence([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9], [-0.9, -0.9]], 0.12);
    k.box(0.7, 0.26, 0.34, 'wood', -0.4, 0, -0.6); k.roof(0.7, 0.34, 0.14, 'thatch', 0.26, 'wood', -0.4, -0.6); for (let i = 0; i < 3; i++) k.box(0.12, 0.16, 0.01, 'woodDark', -0.62 + i * 0.22, 0, -0.42);
    const horse = (x, z, ry, c) => { const cs = Math.cos(ry), sn = Math.sin(ry); const P = (a, y, b) => [x + a * cs + b * sn, y, z - a * sn + b * cs];
      k.box(0.2, 0.09, 0.08, c, ...P(0, 0.11, 0), ry); for (const [a, b] of [[-0.07, -0.03], [-0.07, 0.03], [0.07, -0.03], [0.07, 0.03]]) k.box(0.02, 0.11, 0.02, c, ...P(a, 0, b), ry);
      k.box(0.06, 0.1, 0.05, c, ...P(0.11, 0.16, 0), ry, 0, 0); k.box(0.08, 0.04, 0.04, c, ...P(0.16, 0.22, 0), ry); k.box(0.02, 0.08, 0.02, 'black', ...P(-0.11, 0.1, 0), ry); };
    horse(0.2, 0.1, 0.4, 0x7a4a2a); horse(-0.3, 0.4, 2.2, 0x3a2a20); horse(0.5, 0.55, -0.8, 0xd8c8a8); horse(0.1, -0.3, 3.4, 0x8a5a32);
    k.cyl(0.08, 0.06, 0.06, 8, 'woodDark', 0.6, 0, -0.6); k.pile(5, 0.06, 'thatch', 0.3, -0.65);
  } },
  vineyard: { dims: { w: 1.84, d: 1.84, h: 0.12, roof: 'none', wall: 'soil' }, finished(k) {
    k.box(1.86, 0.03, 1.86, 'soil');
    for (let r = 0; r < 6; r++) { const z = -0.75 + r * 0.3; k.box(1.7, 0.008, 0.008, 'woodDark', 0, 0.2, z); for (let i = 0; i < 9; i++) { const x = -0.8 + i * 0.2; k.box(0.015, 0.21, 0.015, 'woodDark', x, 0.03, z); k.box(0.16, 0.1, 0.07, (i + r) % 3 ? 'green' : 'crop2', x + 0.1, 0.12, z); if ((i + r) % 2) k.box(0.03, 0.05, 0.03, 0x5a2a5e, x + 0.08, 0.09, z + 0.04); } }
    k.cyl(0.06, 0.07, 0.1, 8, 'woodDark', 0.75, 0.03, 0.85); k.cyl(0.05, 0.05, 0.02, 8, 0x5a2a5e, 0.75, 0.12, 0.85);
  } },
  winepress: { dims: { w: 0.6, d: 0.52, h: 0.3, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(0.36, 0.26, 0.32, 'stone', -0.1, 0, -0.08); k.roof(0.36, 0.32, 0.14, 'roof', 0.26, 'stone', -0.1, -0.08);
    k.cyl(0.1, 0.11, 0.08, 10, 'woodDark', 0.18, 0, 0.0); k.cyl(0.09, 0.09, 0.01, 10, 0x5a2a5e, 0.18, 0.08, 0.0); k.cyl(0.02, 0.02, 0.26, 6, 'wood', 0.18, 0.08, 0.0); k.box(0.24, 0.025, 0.025, 'wood', 0.18, 0.32, 0.0);
    for (let i = 0; i < 4; i++) { k.cyl(0.03, 0.04, 0.06, 8, 'clay', -0.25 + i * 0.08, 0, 0.2); k.cyl(0.02, 0.03, 0.05, 8, 'clay', -0.25 + i * 0.08, 0.06, 0.2); }
    k.cyl(0.06, 0.06, 0.12, 10, 'wood', 0.2, 0.06, 0.2, Math.PI / 2); for (const x of [0.15, 0.25]) k.cyl(0.062, 0.062, 0.01, 10, 'iron', x, 0.06, 0.2, Math.PI / 2);
  } },
  tradepost: { dims: { w: 0.62, d: 0.55, h: 0.3, roof: 'gable', wall: 'wood' }, finished(k) {
    k.box(0.4, 0.26, 0.34, 'wood', -0.08, 0, -0.08); k.roof(0.4, 0.34, 0.16, 'shingle', 0.26, 'wood', -0.08, -0.08); k.door('front', 0.4, 0.34, 0.1, 0.17, -0.08, 'woodDark');
    k.box(0.02, 0.4, 0.02, 'woodDark', 0.25, 0, 0.22); k.box(0.16, 0.1, 0.01, 'cloth', 0.33, 0.3, 0.22);
    for (const [x, z, m] of [[0.2, -0.15, 'wood'], [0.25, -0.02, 'woodLight'], [0.22, 0.1, 'wood']]) { k.box(0.1, 0.08, 0.08, m, x, 0, z); }
    k.cyl(0.04, 0.045, 0.1, 8, 'clay', -0.25, 0, 0.22); k.cyl(0.04, 0.045, 0.1, 8, 'clay', -0.16, 0, 0.24); k.box(0.12, 0.06, 0.08, 'cloth', 0.06, 0, 0.22);
    // a small cart ready to leave
    k.box(0.18, 0.025, 0.1, 'woodLight', 0.06, 0.06, 0.34); for (const s of [-1, 1]) k.cyl(0.045, 0.045, 0.015, 10, 'woodDark', 0.06, 0.045, 0.34 + s * 0.06, Math.PI / 2);
  } },
  stonewall: { dims: { w: 0.9, d: 0.2, h: 0.2, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.98, 0.16, 0.16, 'stone'); k.box(0.98, 0.04, 0.2, 'stoneDark', 0, 0.16);
    for (let i = 0; i < 5; i++) k.box(0.12, 0.06, 0.2, 'stone', -0.4 + i * 0.2, 0.2, 0);
  } },
  hillfort: { dims: { w: 1.7, d: 1.7, h: 0.4, roof: 'none', wall: 'stone' }, finished(k) {
    const R = 0.82; for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; if (i === 5) continue; k.box(0.28, 0.22, 0.12, i % 2 ? 'stone' : 'stoneDark', Math.cos(a) * R, 0, Math.sin(a) * R, -a + Math.PI / 2); k.box(0.1, 0.06, 0.12, 'stone', Math.cos(a) * R, 0.22, Math.sin(a) * R, -a + Math.PI / 2); }
    k.box(0.3, 0.6, 0.3, 'stone', -0.25, 0, -0.2); k.box(0.36, 0.04, 0.36, 'stoneDark', -0.25, 0.6, -0.2); for (const [x, z] of [[-0.1, -0.05], [-0.4, -0.05], [-0.1, -0.35], [-0.4, -0.35]]) k.box(0.07, 0.07, 0.07, 'stone', x, 0.64, z);
    k.box(0.5, 0.24, 0.3, 'wood', 0.25, 0, 0.2); k.roof(0.5, 0.3, 0.14, 'thatch', 0.24, 'wood', 0.25, 0.2);
    k.box(0.015, 0.3, 0.015, 'woodDark', -0.25, 0.64, -0.2); k.box(0.14, 0.09, 0.01, 'cloth', -0.18, 0.86, -0.2);
  } },
  aqueduct: { dims: { w: 0.98, d: 0.3, h: 0.5, roof: 'none', wall: 'stone' }, finished(k) {
    for (const s of [-1, 1]) k.box(0.12, 0.42, 0.26, MARBLE2, s * 0.43, 0, 0);
    k.box(0.98, 0.1, 0.26, MARBLE2, 0, 0.42); k.box(0.98, 0.02, 0.14, 'water', 0, 0.52); for (const s of [-1, 1]) k.box(0.98, 0.05, 0.05, MARBLE, 0, 0.52, s * 0.1);
    // arch: stepped voussoirs
    for (let i = 0; i < 7; i++) { const a = Math.PI * (i + 0.5) / 7, x = Math.cos(a) * 0.32, y = 0.1 + Math.sin(a) * 0.3; k.box(0.08, 0.06, 0.26, MARBLE, x, y, 0, 0, 0, a - Math.PI / 2); }
  } },
  fountain: { dims: { w: 0.6, d: 0.6, h: 0.3, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(0.7, 0.03, 0.7, MARBLE2); k.cyl(0.3, 0.32, 0.1, 16, MARBLE, 0, 0.03); k.cyl(0.27, 0.27, 0.01, 16, 'water', 0, 0.12);
    k.cyl(0.05, 0.07, 0.22, 8, MARBLE, 0, 0.1); k.cyl(0.12, 0.08, 0.04, 12, MARBLE, 0, 0.32); k.cyl(0.1, 0.1, 0.01, 12, 'water', 0, 0.355);
  } },
  insula: { dims: { w: 0.66, d: 0.6, h: 0.8, roof: 'gable', wall: 'brick' }, finished(k) {
    const W = 0.66, D = 0.6, H = 0.78;
    k.box(W, 0.24, D, MARBLE2); k.box(W, H - 0.24, D, 'brick', 0, 0.24);
    for (let f = 0; f < 3; f++) { k.box(W + 0.02, 0.02, D + 0.02, 'brickDark', 0, 0.24 + f * 0.18); k.windows('front', W, D, 0.3 + f * 0.18, 3, 0.07, 0.08); k.windows('left', W, D, 0.3 + f * 0.18, 2, 0.07, 0.08); k.windows('back', W, D, 0.3 + f * 0.18, 3, 0.07, 0.08); }
    for (let i = 0; i < 3; i++) k.box(0.16, 0.16, 0.02, i === 1 ? 'black' : 'woodDark', -0.2 + i * 0.2, 0.02, D / 2 + 0.005); // shops at street level
    k.box(0.5, 0.02, 0.1, 'roof2', 0, 0.22, D / 2 + 0.05); k.roof(W, D, 0.18, 'roof', H, 'brick');
  } },
  villa: { dims: { w: 1.6, d: 1.4, h: 0.36, roof: 'gable', wall: 'plaster' }, finished(k) {
    k.box(1.7, 0.04, 1.5, MARBLE2);
    const wing = (x, z, w, d) => { k.box(w, 0.3, d, 'plaster', x, 0.04, z); k.roof(w, d, 0.14, 'roof', 0.34, 'plaster', x, z); };
    wing(0, -0.48, 1.4, 0.34); wing(-0.55, 0.12, 0.3, 0.86); wing(0.55, 0.12, 0.3, 0.86);
    k.box(0.72, 0.01, 0.6, 0x5b8f3a, 0, 0.04, 0.2); k.box(0.28, 0.02, 0.14, 'water', 0, 0.045, 0.2);
    for (let i = 0; i < 5; i++) k.cyl(0.025, 0.025, 0.26, 8, MARBLE, -0.32 + i * 0.16, 0.04, -0.27);
    for (const [x, z] of [[-0.25, 0.4], [0.25, 0.4]]) { k.cyl(0.02, 0.02, 0.08, 6, 'woodDark', x, 0.05, z); k.cone(0.06, 0.16, 7, 'green', x, 0.12, z); }
    k.windows('front', 1.4, 0.34, 0.16, 4, 0.07, 0.08, 0);
  } },
  forum: { dims: { w: 1.7, d: 1.7, h: 0.4, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(1.8, 0.04, 1.8, MARBLE2); k.box(1.2, 0.012, 1.2, MARBLE, 0, 0.04);
    for (let i = 0; i < 7; i++) { k.cyl(0.03, 0.035, 0.36, 8, MARBLE, -0.72 + i * 0.24, 0.04, -0.75); k.cyl(0.03, 0.035, 0.36, 8, MARBLE, -0.75, 0.04, -0.72 + i * 0.24); }
    k.box(1.6, 0.05, 0.14, MARBLE2, 0, 0.4, -0.75); k.box(0.14, 0.05, 1.6, MARBLE2, -0.75, 0.4, 0); k.box(1.62, 0.02, 0.2, 'roof', 0, 0.45, -0.78); k.box(0.2, 0.02, 1.62, 'roof', -0.78, 0.45, 0);
    k.box(0.5, 0.4, 0.4, MARBLE, 0.5, 0.04, 0.5); k.gable(0.56, 0.46, 0.14, 'roof', 0.5, 0.44, 0.5); for (let i = 0; i < 4; i++) k.cyl(0.022, 0.025, 0.4, 8, MARBLE, 0.32 + i * 0.12, 0.04, 0.27);
    k.box(0.1, 0.24, 0.1, MARBLE2, 0, 0.04, 0); k.cyl(0.04, 0.04, 0.1, 8, 'bronze', 0, 0.28, 0);
    for (const [x, z, c] of [[-0.3, 0.45, 'cloth'], [0.0, 0.6, 0x3d6fb2], [-0.5, 0.15, 'thatch']]) { for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.015, 0.18, 0.015, 'woodDark', x + a * 0.1, 0.04, z + b * 0.07); k.box(0.24, 0.015, 0.18, c, x, 0.22, z); }
  } },
  library: { dims: { w: 0.7, d: 0.6, h: 0.42, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(0.8, 0.06, 0.7, MARBLE2); k.box(0.6, 0.38, 0.44, MARBLE, 0, 0.06, -0.06); k.roof(0.6, 0.44, 0.16, 'roof', 0.44, 'stone', 0, -0.06);
    for (let i = 0; i < 4; i++) k.cyl(0.025, 0.03, 0.38, 8, MARBLE, -0.22 + i * 0.147, 0.06, 0.2); k.gable(0.62, 0.12, 0.1, MARBLE2, 0, 0.44, 0.2); k.box(0.62, 0.03, 0.12, MARBLE2, 0, 0.42, 0.2);
    k.box(0.12, 0.2, 0.01, 'woodDark', 0, 0.06, 0.165); for (let i = 0; i < 3; i++) k.box(0.3, 0.02, 0.05, MARBLE2, 0, i * 0.02, 0.32 - i * 0.03);
    for (let i = 0; i < 4; i++) k.cyl(0.02, 0.02, 0.1, 6, i % 2 ? 'thatch' : 'woodLight', 0.3, 0.06 + i * 0.022, 0.28, Math.PI / 2); // scrolls
  } },
  baths: { dims: { w: 1.6, d: 1.4, h: 0.4, roof: 'flat', wall: 'brick' }, finished(k) {
    k.box(1.7, 0.04, 1.5, MARBLE2);
    k.box(0.9, 0.36, 0.6, 'brick', -0.3, 0.04, -0.35); k.cyl(0.28, 0.28, 0.06, 16, MARBLE2, -0.3, 0.4, -0.35); k.cyl(0.26, 0.04, 0.16, 16, MARBLE, -0.3, 0.46, -0.35); // dome
    k.box(0.9, 0.04, 0.6, 'roof', 0.4, 0.3, 0.38); k.box(0.76, 0.012, 0.46, 'water', 0.4, 0.05, 0.38); for (let i = 0; i < 5; i++) k.cyl(0.025, 0.025, 0.26, 8, MARBLE, 0.0 + i * 0.2, 0.04, 0.66);
    k.box(0.1, 0.36, 0.1, 'brick', 0.6, 0.04, -0.5); k.emitters.push({ x: 0.6, y: 0.44, z: -0.5, type: 'chimney' });
    k.windows('front', 0.9, 0.6, 0.2, 3, 0.08, 0.12, -0.3);
  } },
  theatre: { dims: { w: 1.7, d: 1.7, h: 0.4, roof: 'none', wall: 'stone' }, finished(k) {
    for (let r = 0; r < 6; r++) { const R = 0.36 + r * 0.1; for (let i = 0; i < 14; i++) { const a = Math.PI * (0.05 + 0.9 * i / 13); k.box(0.12, 0.07, 0.11, r % 2 ? MARBLE : MARBLE2, Math.cos(a) * R, r * 0.065, -Math.sin(a) * R + 0.3, Math.PI / 2 - a); } }
    k.box(0.8, 0.06, 0.26, MARBLE2, 0, 0, 0.55); k.box(0.86, 0.36, 0.08, MARBLE, 0, 0.06, 0.7); for (let i = 0; i < 5; i++) k.box(0.06, 0.2, 0.012, 'black', -0.3 + i * 0.15, 0.1, 0.656);
    k.cyl(0.02, 0.02, 0.06, 6, 'cloth', 0.1, 0.06, 0.52); k.cyl(0.02, 0.02, 0.06, 6, 0x3d6fb2, -0.1, 0.06, 0.55);
  } },
  mint: { dims: { w: 0.62, d: 0.56, h: 0.36, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(0.66, 0.05, 0.6, MARBLE2); k.box(0.52, 0.34, 0.44, 'stone', 0, 0.05, -0.04); k.roof(0.52, 0.44, 0.16, 'roof', 0.39, 'stone', 0, -0.04);
    for (const s of [-1, 1]) k.cyl(0.03, 0.03, 0.34, 8, MARBLE, s * 0.12, 0.05, 0.22); k.box(0.12, 0.2, 0.01, 'iron', 0, 0.05, 0.181);
    k.chimney(0.18, -0.12, 0.45, 0.14, 'stoneDark');
    for (let i = 0; i < 3; i++) k.cyl(0.03, 0.03, 0.012 * (3 - i), 10, 'gold', -0.22 + i * 0.04, 0.05, 0.27);
  } },
  monument: { dims: { w: 2.6, d: 2.6, h: 1.2, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(2.8, 0.06, 2.8, MARBLE2);
    for (let i = 0; i < 6; i++) { const w = 2.3 - i * 0.36; k.box(w, 0.16, w, i % 2 ? 'stone' : MARBLE2, 0, 0.06 + i * 0.16, 0); }
    k.box(0.36, 0.3, 0.36, MARBLE, 0, 1.02, 0); k.cone(0.2, 0.2, 4, 'gold', 0, 1.32, 0, Math.PI / 4);
    for (let i = 0; i < 6; i++) k.box(0.5, 0.04, 0.12, MARBLE2, 0, 0.06 + i * 0.16 + 0.12, 1.15 - i * 0.18); // grand stair
    for (const s of [-1, 1]) { k.box(0.14, 0.7, 0.14, MARBLE, s * 1.2, 0.06, 1.2); k.cone(0.07, 0.12, 4, 'gold', s * 1.2, 0.76, 1.2, Math.PI / 4); k.cyl(0.05, 0.06, 0.12, 8, 'bronze', s * 0.5, 0.06, 1.3); k.cone(0.04, 0.06, 6, GLOW(0xff8a2a, 1.6), s * 0.5, 0.18, 1.3); k.emitters.push({ x: s * 0.5, y: 0.26, z: 1.3, type: 'fire' }); }
  } },
});

// ---------- Medieval and Renaissance eras ----------
const LIME = 0xd9d2c0, SLATE = 0x56606a, OCHRE = 0xd8a85a, TERRA = 0xc0603c;
const tower = (k, x, z, r, h, m = 'stone', cap = SLATE) => { k.cyl(r, r * 1.08, h, 10, m, x, 0, z); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.box(r * 0.45, r * 0.45, r * 0.45, m, x + Math.cos(a) * r * 0.85, h, z + Math.sin(a) * r * 0.85, -a); } if (cap) k.cone(r * 1.15, r * 1.6, 10, cap, x, h, z); };
Object.assign(MODELS, {
  castle: { dims: { w: 1.8, d: 1.8, h: 0.9, roof: 'none', wall: 'stone' }, finished(k) {
    // terraced hill base
    k.box(1.9, 0.12, 1.9, 'stoneDark'); k.box(1.6, 0.12, 1.6, 'crop2', 0, 0.12); k.box(1.62, 0.04, 1.62, 'stoneDark', 0, 0.12);
    const W = 0.7, H = 0.42, y0 = 0.24;
    for (const s of [-1, 1]) { k.box(W * 2, H, 0.1, 'stone', 0, y0, s * W); k.box(0.1, H, W * 2, 'stone', s * W, y0, 0); for (let i = 0; i < 7; i++) { k.box(0.08, 0.06, 0.1, 'stone', -0.6 + i * 0.2, y0 + H, s * W); k.box(0.1, 0.06, 0.08, 'stone', s * W, y0 + H, -0.6 + i * 0.2); } }
    for (const [x, z] of [[-W, -W], [W, -W], [-W, W], [W, W]]) tower(k, x, z, 0.13, y0 + 0.62);
    k.box(0.5, 0.86, 0.5, 'stone', -0.12, y0, -0.12); for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { k.box(0.08, 0.07, 0.08, 'stone', -0.33 + i * 0.14, y0 + 0.86, -0.12 + s * 0.22); }
    k.windows('front', 0.5, 0.5, y0 + 0.5, 2, 0.05, 0.09, -0.12); k.box(0.18, 0.26, 0.04, 'black', 0, y0, W + 0.04); k.box(0.26, 0.5, 0.16, 'stone', 0, y0, W + 0.02);
    k.box(0.015, 0.36, 0.015, 'woodDark', -0.12, y0 + 0.92, -0.12); k.box(0.2, 0.12, 0.01, 'cloth', -0.02, y0 + 1.16, -0.12);
    k.box(0.3, 0.2, 0.25, 'wood', 0.35, y0, 0.3); k.roof(0.3, 0.25, 0.12, 'roof', y0 + 0.2, 'wood', 0.35, 0.3);
  } },
  stonebridge: { dims: { w: 0.98, d: 0.4, h: 0.2, roof: 'none', wall: 'stone' }, finished(k) {
    for (const s of [-1, 1]) k.box(0.18, 0.34, 0.38, 'stone', s * 0.42, -0.16, 0);
    k.box(1.0, 0.07, 0.4, 'stone', 0, 0.1, 0); k.box(1.0, 0.012, 0.32, 'stoneDark', 0, 0.17, 0);
    for (let i = 0; i < 7; i++) { const a = Math.PI * (i + 0.5) / 7; k.box(0.08, 0.06, 0.38, 'stoneDark', Math.cos(a) * 0.3, -0.16 + Math.sin(a) * 0.26, 0, 0, 0, a - Math.PI / 2); }
    for (const s of [-1, 1]) { k.box(1.0, 0.08, 0.04, 'stone', 0, 0.17, s * 0.18); for (let i = 0; i < 5; i++) k.box(0.06, 0.05, 0.05, 'stone', -0.4 + i * 0.2, 0.25, s * 0.18); }
  } },
  watermill: { dims: { w: 0.6, d: 0.5, h: 0.36, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(0.5, 0.2, 0.42, 'stone', -0.05, 0, 0); k.box(0.5, 0.18, 0.42, LIME, -0.05, 0.2, 0); for (const x of [-0.25, -0.05, 0.15]) k.box(0.03, 0.18, 0.43, 'woodDark', x, 0.2, 0);
    k.roof(0.5, 0.42, 0.2, 'roof', 0.38, LIME, -0.05, 0); k.windows('front', 0.5, 0.42, 0.24, 2, 0.06, 0.07, -0.05);
    // the wheel on the river side
    k.cyl(0.2, 0.2, 0.06, 14, 'woodDark', 0.26, 0.16, 0, 0, Math.PI / 2); k.cyl(0.04, 0.04, 0.1, 8, 'iron', 0.26, 0.16, 0, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI; k.box(0.08, 0.4, 0.02, 'wood', 0.26, 0.16, 0, 0, a, 0); }
    k.box(0.04, 0.03, 0.4, 'wood', 0.26, 0.38, -0.12); k.pile(4, 0.04, 'white', -0.28, 0.28);
  } },
  windmill: { dims: { w: 0.44, d: 0.44, h: 0.7, roof: 'cone', wall: 'wood', round: true }, finished(k) {
    k.box(0.5, 0.04, 0.5, 'stone'); k.cyl(0.13, 0.19, 0.5, 8, LIME, 0, 0.04); k.cone(0.16, 0.18, 8, 'thatch', 0, 0.54);
    k.box(0.05, 0.05, 0.12, 'woodDark', 0, 0.48, 0.16);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4, cx = Math.sin(a) * 0.17, cy = 0.5 + Math.cos(a) * 0.17; k.box(0.02, 0.36, 0.01, 'woodDark', cx, cy - 0.18, 0.23, 0, 0, -a); k.box(0.07, 0.26, 0.006, 'white', cx + Math.cos(a) * 0.04, cy - 0.13 - Math.sin(a) * 0.04 * 0, 0.236, 0, 0, -a); }
    k.door('front', 0.3, 0.3, 0.07, 0.13, 0, 'woodDark'); k.pile(3, 0.04, 'white', 0.2, 0.2);
  } },
  guildhall: { dims: { w: 0.66, d: 0.56, h: 0.5, roof: 'gable', wall: 'stone' }, finished(k) {
    const W = 0.62, D = 0.5; k.box(W + 0.04, 0.05, D + 0.04, 'stoneDark'); k.box(W, 0.22, D, 'stone', 0, 0.05); for (let i = 0; i < 4; i++) k.box(0.1, 0.16, 0.02, 'black', -0.21 + i * 0.14, 0.05, D / 2 + 0.002);
    k.box(W + 0.04, 0.26, D + 0.04, LIME, 0, 0.27); for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) k.box(0.03, 0.26, D + 0.05, 'woodDark', x, 0.27, 0); k.box(W + 0.05, 0.03, D + 0.05, 'woodDark', 0, 0.4, 0);
    k.windows('front', W + 0.04, D + 0.04, 0.33, 4, 0.06, 0.08); k.roof(W + 0.04, D + 0.04, 0.3, SLATE, 0.53, LIME);
    k.box(0.015, 0.2, 0.015, 'woodDark', 0.36, 0.3, D / 2 + 0.04); k.box(0.1, 0.1, 0.01, 'gold', 0.41, 0.42, D / 2 + 0.04);
  } },
  timberhouse: { dims: { w: 0.56, d: 0.5, h: 0.44, roof: 'gable', wall: 'plaster' }, finished(k) {
    const W = 0.56, D = 0.48; k.box(W, 0.2, D, 'stone'); k.box(W + 0.06, 0.24, D + 0.06, LIME, 0, 0.2); // jettied upper floor
    for (const x of [-0.29, -0.15, 0, 0.15, 0.29]) k.box(0.025, 0.24, D + 0.07, 'woodDark', x, 0.2, 0);
    for (const s of [-1, 1]) k.box(0.36, 0.022, 0.01, 'woodDark', s * 0.13, 0.32, D / 2 + 0.035, 0, 0, s * 0.6);
    k.box(W + 0.08, 0.025, D + 0.08, 'woodDark', 0, 0.2); k.windows('front', W, D, 0.08, 2, 0.07, 0.08, 0.1); k.door('front', W, D, 0.08, 0.15, -0.16, 'woodDark'); k.windows('front', W + 0.06, D + 0.06, 0.28, 3, 0.06, 0.07);
    k.roof(W + 0.06, D + 0.06, 0.3, 'roof2', 0.44, LIME); k.chimney(0.18, -0.1, 0.5, 0.18, 'brick');
  } },
  church: { dims: { w: 1.4, d: 1.0, h: 0.6, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(1.7, 0.04, 1.7, 'stoneDark'); k.box(0.5, 0.42, 1.2, 'stone', 0.1, 0.04, 0.05); k.roof(0.5, 1.2, 0.3, SLATE, 0.46, 'stone', 0.1, 0.05, Math.PI / 2 * 0);
    k.box(0.9, 0.34, 0.34, 'stone', 0.1, 0.04, -0.25); k.roof(0.9, 0.34, 0.24, SLATE, 0.38, 'stone', 0.1, -0.25); // transept
    k.box(0.34, 0.95, 0.34, 'stone', 0.1, 0.04, 0.72); k.cone(0.26, 0.6, 4, SLATE, 0.1, 0.99, 0.72, Math.PI / 4); k.box(0.012, 0.12, 0.012, 'gold', 0.1, 1.58, 0.72); k.box(0.07, 0.012, 0.012, 'gold', 0.1, 1.65, 0.72);
    for (let i = 0; i < 4; i++) k.box(0.02, 0.18, 0.06, 0x3a5a8a, 0.36, 0.16, -0.25 + i * 0.25 + 0.2);
    k.cyl(0.07, 0.07, 0.01, 12, 0x3a5a8a, 0.1, 0.65, 0.893, Math.PI / 2); k.box(0.12, 0.22, 0.02, 'woodDark', 0.1, 0.04, 0.893);
    for (const [x, z] of [[-0.55, 0.5], [-0.55, 0.2], [-0.45, -0.1]]) { k.box(0.06, 0.08, 0.02, 'stone', x, 0.04, z); }
  } },
  monastery: { dims: { w: 1.6, d: 1.6, h: 0.5, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(1.8, 0.03, 1.8, 'stoneDark');
    const range = (x, z, w, d) => { k.box(w, 0.3, d, LIME, x, 0.03, z); k.roof(w, d, 0.16, 'roof', 0.33, LIME, x, z); };
    range(0, -0.6, 1.5, 0.3); range(-0.6, 0.15, 0.3, 1.2); range(0.6, 0.15, 0.3, 1.2);
    k.box(0.9, 0.012, 0.9, 0x5b8f3a, 0, 0.03, 0.15); k.cyl(0.08, 0.09, 0.08, 10, 'stone', 0, 0.03, 0.15);
    for (let i = 0; i < 5; i++) k.box(0.03, 0.2, 0.03, 'stone', -0.4 + i * 0.2, 0.03, -0.42);
    k.box(0.22, 0.75, 0.22, 'stone', 0.6, 0.03, -0.6); k.cone(0.18, 0.3, 4, 'roof', 0.6, 0.78, -0.6, Math.PI / 4);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) k.cone(0.03, 0.06, 5, r % 2 ? 'crop' : 'crop2', -0.25 + i * 0.16, 0.04, 0.45 + r * 0.1);
  } },
  inn: { dims: { w: 0.62, d: 0.52, h: 0.44, roof: 'gable', wall: 'plaster' }, finished(k) {
    const W = 0.6, D = 0.5; k.box(W, 0.22, D, 'stone'); k.box(W + 0.04, 0.22, D + 0.04, LIME, 0, 0.22); for (const x of [-0.3, -0.1, 0.1, 0.3]) k.box(0.025, 0.22, D + 0.05, 'woodDark', x, 0.22, 0);
    k.windows('front', W, D, 0.08, 3, 0.07, 0.08); k.windows('front', W + 0.04, D + 0.04, 0.3, 3, 0.06, 0.07); k.roof(W + 0.04, D + 0.04, 0.26, 'roof2', 0.44, LIME); k.chimney(-0.2, -0.1, 0.5, 0.2, 'brick');
    k.box(0.015, 0.02, 0.16, 'iron', 0.2, 0.3, D / 2 + 0.08); k.box(0.1, 0.1, 0.01, 'gold', 0.2, 0.22, D / 2 + 0.15);
    for (const x of [-0.15, 0.1]) { k.box(0.14, 0.04, 0.08, 'woodLight', x, 0.06, D / 2 + 0.12); k.cyl(0.03, 0.03, 0.06, 8, 'wood', x + 0.08, 0, D / 2 + 0.2); }
  } },
  townwall: { dims: { w: 0.98, d: 0.24, h: 0.36, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(1.0, 0.32, 0.2, 'stone'); k.box(1.0, 0.02, 0.24, 'stoneDark', 0, 0.32); for (let i = 0; i < 5; i++) for (const s of [-1, 1]) k.box(0.1, 0.07, 0.04, 'stone', -0.4 + i * 0.2, 0.34, s * 0.1);
  } },
  gatehouse: { dims: { w: 0.98, d: 0.5, h: 0.6, roof: 'none', wall: 'stone' }, finished(k) {
    for (const s of [-1, 1]) tower(k, s * 0.34, 0, 0.15, 0.62, 'stone', SLATE);
    k.box(0.5, 0.5, 0.36, 'stone', 0, 0, 0); k.box(0.2, 0.28, 0.38, 'black', 0, 0, 0); for (let i = 0; i < 4; i++) k.box(0.01, 0.24, 0.01, 'iron', -0.075 + i * 0.05, 0.04, 0.19);
    for (let i = 0; i < 4; i++) k.box(0.08, 0.07, 0.36, 'stone', -0.18 + i * 0.12, 0.5, 0);
    k.box(0.015, 0.3, 0.015, 'woodDark', 0, 0.57, 0); k.box(0.16, 0.1, 0.01, 'cloth', 0.08, 0.78, 0);
  } },
  markethall: { dims: { w: 0.66, d: 0.6, h: 0.5, roof: 'gable', wall: 'stone' }, finished(k) {
    const W = 0.64, D = 0.56; k.box(W + 0.04, 0.03, D + 0.04, 'stoneDark');
    for (const [x, z] of [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]) k.box(0.06, 0.2, 0.06, 'stone', x * 0.27, 0.03, z * 0.24); // open arcade
    k.box(W, 0.04, D, 'woodDark', 0, 0.23); k.box(W, 0.2, D, LIME, 0, 0.27); for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) k.box(0.025, 0.2, D + 0.01, 'woodDark', x, 0.27, 0);
    k.windows('front', W, D, 0.32, 4, 0.05, 0.07); k.roof(W, D, 0.26, 'roof', 0.47, LIME);
    for (let i = 0; i < 5; i++) k.box(0.08, 0.06, 0.08, ['cloth', 'thatch', 'clay', 0x3d6fb2, 'crop'][i], -0.24 + i * 0.12, 0.03, 0);
    k.box(0.06, 0.12, 0.06, 'stone', 0, 0.74, 0); k.cone(0.06, 0.1, 4, SLATE, 0, 0.86, 0, Math.PI / 4);
  } },
  shipyard: { dims: { w: 1.6, d: 1.6, h: 0.4, roof: 'none', wall: 'wood' }, finished(k) {
    k.box(1.7, 0.03, 1.7, 'soil');
    // slipway with a hull on the stocks
    k.box(0.5, 0.02, 1.5, 'woodDark', 0.35, 0.03, 0.05); for (let i = 0; i < 6; i++) k.box(0.5, 0.03, 0.04, 'wood', 0.35, 0.05, -0.6 + i * 0.25);
    k.cyl(0.16, 0.08, 1.0, 8, 'wood', 0.35, 0.2, 0.05, Math.PI / 2, 0); for (let i = 0; i < 6; i++) k.box(0.36, 0.02, 0.02, 'woodDark', 0.35, 0.3, -0.38 + i * 0.16);
    k.box(0.015, 0.7, 0.015, 'woodDark', 0.35, 0.3, 0.05);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box(0.025, 0.36, 0.025, 'woodDark', 0.35 + s * 0.24, 0.03, -0.45 + i * 0.45);
    k.box(0.5, 0.26, 0.4, 'wood', -0.45, 0.03, -0.45); k.roof(0.5, 0.4, 0.14, 'shingle', 0.29, 'wood', -0.45, -0.45);
    k.logPile(-0.45, 0.2, 3, 0.4); k.logPile(-0.45, 0.55, 2, 0.4); k.pile(3, 0.05, 'white', -0.2, -0.05);
  } },
  townhouse: { dims: { w: 0.5, d: 0.56, h: 0.7, roof: 'gable', wall: 'brick' }, finished(k) {
    const W = 0.5, D = 0.56, H = 0.66, C = [OCHRE, TERRA, LIME, 0xc9b28a][(k.seed || 0) % 4];
    k.box(W, 0.2, D, 'stone'); k.box(W, H - 0.2, D, C, 0, 0.2); k.box(W + 0.02, 0.025, D + 0.02, LIME, 0, 0.2); k.box(W + 0.03, 0.03, D + 0.03, LIME, 0, H);
    for (let f = 0; f < 2; f++) k.windows('front', W, D, 0.28 + f * 0.2, 3, 0.06, 0.1); k.box(0.12, 0.15, 0.02, 'woodDark', 0, 0.02, D / 2 + 0.005); k.box(0.36, 0.08, 0.012, 'black', 0, 0.06, D / 2 + 0.006);
    k.roof(W, D, 0.16, 'roof', H + 0.02, C); k.chimney(0.14, -0.15, H + 0.06, 0.14, 'brick');
  } },
  palazzo: { dims: { w: 1.6, d: 1.4, h: 0.7, roof: 'flat', wall: 'stone' }, finished(k) {
    const W = 1.5, D = 1.2, H = 0.68; k.box(W + 0.06, 0.04, D + 0.06, 'stoneDark');
    k.box(W, 0.24, D, 'quoin', 0, 0.04); for (let i = 0; i < 9; i++) k.box(0.12, 0.012, D + 0.01, 'stone', -0.68 + i * 0.17, 0.12, 0); // rusticated base
    k.box(W, H - 0.28, D, OCHRE, 0, 0.28); k.box(W + 0.06, 0.05, D + 0.06, LIME, 0, H);
    for (let f = 0; f < 2; f++) { k.windows('front', W, D, 0.34 + f * 0.17, 7, 0.07, 0.1); k.windows('left', W, D, 0.34 + f * 0.17, 5, 0.07, 0.1); k.windows('right', W, D, 0.34 + f * 0.17, 5, 0.07, 0.1); }
    k.box(0.22, 0.2, 0.02, 'woodDark', 0, 0.04, D / 2 + 0.005); k.box(0.3, 0.02, 0.1, LIME, 0, 0.42, D / 2 + 0.05);
    k.roof(W + 0.06, D + 0.06, 0.18, 'roof', H + 0.05, OCHRE); k.box(0.5, 0.012, 0.4, 0x5b8f3a, 0, H + 0.06, 0);
  } },
  university: { dims: { w: 1.6, d: 1.4, h: 0.6, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(1.7, 0.04, 1.5, 'stoneDark'); const C = 0xcdb994;
    const wing = (x, z, w, d, ry = 0) => { k.box(w, 0.44, d, C, x, 0.04, z, ry); k.roof(w, d, 0.2, SLATE, 0.48, C, x, z, ry); };
    wing(0, -0.45, 1.5, 0.36); wing(-0.58, 0.2, 0.34, 0.9); wing(0.58, 0.2, 0.34, 0.9);
    k.windows('front', 1.5, 0.36, 0.16, 7, 0.06, 0.1, 0); k.windows('front', 1.5, 0.36, 0.32, 7, 0.06, 0.08, 0);
    k.box(0.3, 0.9, 0.3, C, 0, 0.04, -0.45); k.cyl(0.13, 0.14, 0.12, 10, LIME, 0, 0.94, -0.45); k.cone(0.14, 0.2, 10, 'bronze', 0, 1.06, -0.45);
    k.box(0.9, 0.012, 0.7, 0x5b8f3a, 0, 0.04, 0.25); k.cyl(0.05, 0.06, 0.18, 8, 'bronze', 0, 0.04, 0.3);
  } },
  // ---- Industrial ----
  rowhouse: { dims: { w: 0.9, d: 0.5, h: 0.5, roof: 'gable', wall: 'brick' }, finished(k) {
    const W = 0.94, D = 0.5; k.box(W, 0.46, D, 'brick', 0, 0, -0.05); k.roof(W, D, 0.18, SLATE, 0.46, 'brick', 0, -0.05);
    for (let i = 0; i < 4; i++) { const x = -0.35 + i * 0.235; k.box(0.012, 0.47, D + 0.01, 'brickDark', x - 0.117, 0, -0.05); k.door('front', W, D, 0.07, 0.15, x + 0.04, 'woodDark'); k.box(0.06, 0.08, 0.01, WINDOW(), x - 0.05, 0.06, D / 2 - 0.045); k.box(0.07, 0.08, 0.01, WINDOW(), x, 0.28, D / 2 - 0.045); k.box(0.05, 0.12, 0.05, 'brickDark', x, 0.6, -0.05); }
    k.box(W, 0.02, 0.14, 'stoneDark', 0, 0, 0.27);
  } },
  colliery: { dims: { w: 0.8, d: 0.8, h: 0.9, roof: 'none', wall: 'brick' }, finished(k) {
    k.box(0.86, 0.03, 0.86, 'soilDark'); k.pile(10, 0.07, 0x26262a, 0.26, 0.26); k.pile(6, 0.06, 0x2b2b30, -0.28, 0.3);
    // headframe over the shaft, winding wheel on top
    for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) k.box(0.03, 0.8, 0.03, 'iron', x * 0.7, 0.03, z * 0.7 - 0.08, x * 0.3, 0, z * 0.3);
    k.box(0.24, 0.03, 0.24, 'iron', 0, 0.82, -0.08); k.cyl(0.12, 0.12, 0.025, 14, 'black', 0, 0.86, -0.08, Math.PI / 2); k.box(0.004, 0.8, 0.004, 'black', 0.1, 0.06, -0.08);
    k.box(0.3, 0.3, 0.26, 'brick', -0.25, 0.03, -0.25); k.roof(0.3, 0.26, 0.1, SLATE, 0.33, 'brick', -0.25, -0.25); k.cyl(0.04, 0.05, 0.5, 8, 'brickDark', -0.34, 0.03, -0.34); k.emitters.push({ x: -0.34, y: 0.56, z: -0.34, type: 'chimney' });
    k.box(0.4, 0.02, 0.06, 'iron', 0.1, 0.035, 0.32); for (let i = 0; i < 2; i++) k.box(0.1, 0.07, 0.07, 'black', 0.02 + i * 0.13, 0.05, 0.32);
  } },
  steelworks: { dims: { w: 1.7, d: 1.7, h: 0.8, roof: 'gable', wall: 'brick' }, finished(k) {
    k.box(1.8, 0.04, 1.8, 'stoneDark'); k.box(1.2, 0.5, 0.8, 'brickDark', -0.2, 0.04, -0.35); k.roof(1.2, 0.8, 0.26, SLATE, 0.54, 'brickDark', -0.2, -0.35);
    for (let i = 0; i < 5; i++) k.box(0.1, 0.12, 0.01, GLOW(0xff8a30, 1.8), -0.7 + i * 0.25, 0.2, 0.06);
    for (const x of [0.25, 0.55]) { k.cyl(0.13, 0.17, 0.7, 12, 'iron', x, 0.04, 0.45); k.cyl(0.05, 0.05, 0.12, 8, 'black', x, 0.74, 0.45); k.emitters.push({ x, y: 0.88, z: 0.45, type: 'smelter' }); }
    for (const x of [-0.75, -0.45]) { k.cyl(0.05, 0.07, 1.1, 8, 'brick', x, 0.04, 0.5); k.emitters.push({ x, y: 1.18, z: 0.5, type: 'chimney' }); }
    k.pile(8, 0.07, 0x26262a, 0.6, -0.55); k.pile(6, 0.06, 0xa4512f, 0.3, -0.65); for (let i = 0; i < 4; i++) k.box(0.4, 0.03, 0.06, 0x6d7a86, -0.3, 0.05 + i * 0.03, 0.75);
  } },
  textilemill: { dims: { w: 1.7, d: 1.4, h: 0.9, roof: 'gable', wall: 'brick' }, finished(k) {
    k.box(1.8, 0.04, 1.5, 'stoneDark'); const W = 1.5, D = 0.8; k.box(W, 0.8, D, 'brick', 0, 0.04, -0.2); k.roof(W, D, 0.2, SLATE, 0.84, 'brick', 0, -0.2);
    for (const y of [0.14, 0.38, 0.62]) k.windows('front', W, 0.4, y, 8, 0.07, 0.12, 0);
    k.cyl(0.06, 0.09, 1.4, 10, 'brickDark', 0.62, 0.04, 0.4); k.emitters.push({ x: 0.62, y: 1.48, z: 0.4, type: 'chimney' });
    k.box(0.3, 0.4, 0.3, 'brickDark', -0.5, 0.04, 0.42); k.roof(0.3, 0.3, 0.1, SLATE, 0.44, 'brickDark', -0.5, 0.42); for (let i = 0; i < 3; i++) k.box(0.12, 0.1, 0.1, 'cloth', -0.05 + i * 0.15, 0.04, 0.45);
  } },
  rail: { dims: { w: 1, d: 0.5, h: 0.05, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(1.0, 0.03, 0.42, 0x7d7368); for (let i = 0; i < 6; i++) k.box(0.07, 0.025, 0.36, 'woodDark', -0.42 + i * 0.168, 0.03);
    for (const z of [-0.1, 0.1]) k.box(1.0, 0.025, 0.025, 0x8a96a2, 0, 0.055, z);
  } },
  station: { dims: { w: 1.6, d: 1.4, h: 0.6, roof: 'gable', wall: 'brick' }, finished(k) {
    k.box(1.8, 0.04, 1.6, 'stone'); k.box(1.2, 0.46, 0.5, 'brick', -0.1, 0.04, -0.4); k.roof(1.2, 0.5, 0.18, SLATE, 0.5, 'brick', -0.1, -0.4);
    k.windows('front', 1.2, -0.3, 0.22, 5, 0.07, 0.12, -0.1); k.door('front', 1.2, -0.3, 0.1, 0.2, -0.45, 'woodDark');
    k.box(0.14, 0.14, 0.14, LIME, -0.1, 0.62, -0.4); k.cyl(0.05, 0.05, 0.01, 12, 0xf3efe6, -0.1, 0.69, -0.33, Math.PI / 2);
    k.box(1.7, 0.08, 0.36, 'stoneDark', 0, 0.04, 0.12); for (const x of [-0.6, -0.2, 0.2, 0.6]) k.box(0.025, 0.36, 0.025, 'iron', x, 0.12, 0.2); k.box(1.6, 0.02, 0.44, SLATE, 0, 0.48, 0.14);
    k.box(1.8, 0.02, 0.4, 0x7d7368, 0, 0.04, 0.55); for (const z of [0.47, 0.63]) k.box(1.8, 0.025, 0.025, 0x8a96a2, 0, 0.065, z);
    // a small engine waiting at the platform
    k.cyl(0.08, 0.08, 0.36, 10, 'black', 0.3, 0.17, 0.55, 0, 0, Math.PI / 2); k.box(0.16, 0.2, 0.18, 'black', 0.05, 0.08, 0.55); k.cyl(0.025, 0.03, 0.1, 6, 'black', 0.42, 0.25, 0.55); k.box(0.36, 0.06, 0.2, 0x8b1e1e, 0.25, 0.07, 0.55);
    k.emitters.push({ x: 0.42, y: 0.37, z: 0.55, type: 'chimney' });
  } },
  printing: { dims: { w: 0.6, d: 0.5, h: 0.42, roof: 'gable', wall: 'plaster' }, finished(k) {
    const W = 0.56, D = 0.46; k.box(W, 0.36, D, LIME, 0, 0, -0.04); for (const x of [-0.28, -0.1, 0.1, 0.28]) k.box(0.025, 0.36, D + 0.01, 'woodDark', x, 0, -0.04); k.roof(W, D, 0.22, 'roof2', 0.36, LIME, 0, -0.04);
    k.windows('front', W, D, 0.12, 2, 0.1, 0.12, 0); k.door('front', W, D, 0.08, 0.16, 0.16, 'woodDark');
    // the press itself under a lean-to
    k.box(0.04, 0.24, 0.04, 'woodDark', -0.18, 0, 0.28); k.box(0.04, 0.24, 0.04, 'woodDark', 0.02, 0, 0.28); k.box(0.26, 0.04, 0.06, 'woodDark', -0.08, 0.24, 0.28); k.cyl(0.015, 0.015, 0.14, 6, 'iron', -0.08, 0.12, 0.28);
    k.box(0.2, 0.04, 0.12, 'woodLight', -0.08, 0.06, 0.28); for (let i = 0; i < 3; i++) k.box(0.1, 0.008, 0.14, 'white', 0.2, 0.03 + i * 0.01, 0.26);
  } },
  bank: { dims: { w: 0.6, d: 0.56, h: 0.5, roof: 'flat', wall: 'stone' }, finished(k) {
    const W = 0.58, D = 0.52; k.box(W + 0.08, 0.06, D + 0.08, 'stone'); k.box(W, 0.42, D, 0xe9e4d8, 0, 0.06); k.box(W + 0.04, 0.05, D + 0.04, LIME, 0, 0.48);
    for (let i = 0; i < 4; i++) k.cyl(0.025, 0.03, 0.42, 8, 0xe9e4d8, -0.21 + i * 0.14, 0.06, D / 2 + 0.05); k.gable(W + 0.04, 0.14, 0.12, 0xe9e4d8, 0, 0.53, D / 2 + 0.02);
    k.windows('left', W, D, 0.22, 2, 0.06, 0.12); k.box(0.12, 0.2, 0.01, 'woodDark', 0, 0.06, D / 2 + 0.005); k.box(0.05, 0.05, 0.01, 'gold', 0, 0.56, D / 2 + 0.1);
  } },
  observatory: { dims: { w: 0.5, d: 0.5, h: 0.6, roof: 'cone', wall: 'stone', round: true }, finished(k) {
    k.box(0.56, 0.05, 0.56, 'stoneDark'); k.cyl(0.2, 0.22, 0.46, 12, LIME, 0, 0.05); k.cyl(0.21, 0.21, 0.03, 12, 'stone', 0, 0.5);
    k.cyl(0.2, 0.03, 0.18, 12, 'bronze', 0, 0.53); k.box(0.06, 0.22, 0.012, 'black', 0, 0.52, 0.12, 0, -0.4);
    k.cyl(0.02, 0.03, 0.26, 8, 'woodDark', 0.04, 0.62, 0.08, 0.9); k.windows('front', 0.4, 0.4, 0.26, 1, 0.06, 0.1); k.door('front', 0.4, 0.4, 0.08, 0.15, 0, 'woodDark');
  } },
  harbour: { dims: { w: 1.6, d: 1.6, h: 0.3, roof: 'none', wall: 'stone' }, finished(k) {
    k.box(1.7, 0.06, 1.7, 'stone'); k.box(1.7, 0.02, 0.3, 'stoneDark', 0, 0.06, 0.7);
    for (let i = 0; i < 3; i++) { k.box(0.12, 0.04, 0.5, 'woodDark', -0.55 + i * 0.55, 0.04, 1.0); for (const s of [-1, 1]) k.cyl(0.02, 0.02, 0.12, 6, 'woodDark', -0.55 + i * 0.55 + s * 0.06, 0, 1.2); }
    k.box(0.9, 0.36, 0.4, OCHRE, -0.3, 0.06, -0.5); k.roof(0.9, 0.4, 0.18, 'roof', 0.42, OCHRE, -0.3, -0.5); k.windows('front', 0.9, 0.4, 0.2, 4, 0.07, 0.1, -0.3);
    k.box(0.04, 0.6, 0.04, 'woodDark', 0.5, 0.06, -0.2); k.box(0.36, 0.03, 0.03, 'woodDark', 0.66, 0.64, -0.2); k.box(0.008, 0.2, 0.008, 'black', 0.82, 0.44, -0.2); k.box(0.1, 0.07, 0.07, 'wood', 0.82, 0.38, -0.2); // crane
    for (let i = 0; i < 5; i++) k.box(0.1, 0.08, 0.1, i % 2 ? 'wood' : 'woodLight', 0.2 + (i % 3) * 0.12, 0.06 + Math.floor(i / 3) * 0.08, 0.25);
    for (let i = 0; i < 3; i++) k.cyl(0.04, 0.04, 0.1, 8, 'wood', 0.6, 0.06, 0.1 + i * 0.1, Math.PI / 2);
  } },
  clocktower: { dims: { w: 0.4, d: 0.4, h: 1.0, roof: 'cone', wall: 'stone' }, finished(k) {
    k.box(0.44, 0.05, 0.44, 'stoneDark'); k.box(0.3, 0.9, 0.3, 'brick', 0, 0.05); k.box(0.34, 0.04, 0.34, LIME, 0, 0.6); k.box(0.34, 0.04, 0.34, LIME, 0, 0.95);
    for (const [x, z, ry] of [[0, 0.152, 0], [0.152, 0, Math.PI / 2]]) { k.cyl(0.09, 0.09, 0.012, 14, 0xf3efe6, x, 0.78, z, ry ? 0 : Math.PI / 2, ry ? Math.PI / 2 : 0); }
    k.box(0.01, 0.07, 0.008, 'black', 0, 0.8, 0.16); k.box(0.05, 0.01, 0.008, 'black', 0.02, 0.78, 0.16);
    k.box(0.24, 0.18, 0.24, LIME, 0, 0.99); k.box(0.12, 0.14, 0.26, 'black', 0, 1.0, 0); k.cone(0.2, 0.34, 4, SLATE, 0, 1.17, 0, Math.PI / 4);
  } },
  cathedral: { dims: { w: 2.6, d: 2.6, h: 1.2, roof: 'gable', wall: 'stone' }, finished(k) {
    k.box(2.8, 0.05, 2.8, 'stoneDark'); const C = 0xd8ccb0;
    k.box(0.8, 0.8, 2.2, C, 0, 0.05, 0.1); k.roof(0.8, 2.2, 0.4, 'roof', 0.85, C, 0, 0.1);
    k.box(2.0, 0.66, 0.7, C, 0, 0.05, -0.3); k.roof(2.0, 0.7, 0.34, 'roof', 0.71, C, 0, -0.3);
    k.cyl(0.42, 0.44, 0.34, 16, C, 0, 0.85, -0.3); for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.box(0.04, 0.2, 0.06, 'black', Math.cos(a) * 0.43, 0.92, -0.3 + Math.sin(a) * 0.43, -a); }
    k.cyl(0.4, 0.44, 0.12, 16, TERRA, 0, 1.19, -0.3); k.cyl(0.32, 0.4, 0.12, 16, TERRA, 0, 1.31, -0.3); k.cyl(0.2, 0.32, 0.1, 16, TERRA, 0, 1.43, -0.3); k.cyl(0.06, 0.2, 0.06, 16, TERRA, 0, 1.53, -0.3); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.box(0.025, 0.36, 0.03, LIME, Math.cos(a) * 0.36, 1.19, -0.3 + Math.sin(a) * 0.36, -a, 0, 0); }
    k.cyl(0.07, 0.08, 0.14, 8, LIME, 0, 1.59, -0.3); k.cone(0.08, 0.12, 8, 'bronze', 0, 1.73, -0.3);
    for (const s of [-1, 1]) { k.box(0.3, 1.3, 0.3, C, s * 0.42, 0.05, 1.05); k.cone(0.2, 0.34, 4, SLATE, s * 0.42, 1.35, 1.05, Math.PI / 4); for (let f = 0; f < 3; f++) k.box(0.06, 0.16, 0.01, 'black', s * 0.42, 0.4 + f * 0.3, 1.205); }
    k.cyl(0.14, 0.14, 0.012, 16, 0x3a5a8a, 0, 0.62, 1.205, Math.PI / 2); k.box(0.24, 0.36, 0.02, 'woodDark', 0, 0.05, 1.205);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) k.box(0.04, 0.4, 0.02, 0x3a5a8a, s * 0.405, 0.25, -0.5 + i * 0.4);
    for (let i = 0; i < 4; i++) k.box(0.6, 0.03, 0.08, 'stone', 0, i * 0.03, 1.45 - i * 0.06);
  } },
});

// Returns { group, emitters } in building-local coords (origin = footprint center at ground level).
// per-house yard (Medium/High): low fence or wall round the back and sides, a vegetable bed, a bush and a woodpile or bench
export const YARD_KINDS = new Set(['polehut', 'hut', 'bonehut', 'mudhouse', 'brickhouse', 'stonehouse', 'timberhouse']);
function addYard(k, b) {
  const r = (i) => h01(b.id || 0, i, 7), stoneWall = b.kind === 'stonehouse' || b.kind === 'brickhouse', sx = r(1) < 0.5 ? -1 : 1;
  if (stoneWall) { k.box(0.92, 0.05, 0.04, 'stoneDark', 0, 0, -0.46); k.box(0.04, 0.05, 0.6, 'stoneDark', -0.46, 0, -0.16); k.box(0.04, 0.05, 0.6, 'stoneDark', 0.46, 0, -0.16); }
  else k.fence([[-0.46, 0.14], [-0.46, -0.46], [0.46, -0.46], [0.46, 0.14]], 0.05);
  k.box(0.13, 0.022, 0.38, 'soilDark', sx * 0.38, 0, -0.17); // vegetable bed beside the house
  const crop = r(2) < 0.5 ? 'crop2' : 'green';
  for (let i = 0; i < 3; i++) k.box(0.022, 0.035, 0.34, crop, sx * 0.38 - 0.04 + i * 0.04, 0.02, -0.17);
  k.add(new THREE.IcosahedronGeometry(0.06, 0), mat(r(3) < 0.5 ? 0x4f7d34 : 0x3f6e3a, { flatShading: true }), -sx * 0.36, 0.045, -0.36);
  if (r(4) < 0.55) { for (let i = 0; i < 3; i++) k.add(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), 'wood', -sx * 0.39 + (i === 2 ? 0 : (i - 0.5) * 0.04), 0.018 + (i === 2 ? 0.03 : 0), 0.05, Math.PI / 2, 0, 0); }
  else { k.box(0.035, 0.02, 0.12, 'woodLight', -sx * 0.39, 0.04, 0.05); k.box(0.03, 0.04, 0.015, 'woodDark', -sx * 0.39, 0, 0); k.box(0.03, 0.04, 0.015, 'woodDark', -sx * 0.39, 0, 0.1); }
}
export function buildModel(b, stage, baseOf, opts = {}) {
  let kit;
  if (b.ruin) kit = rubbleModel(b);
  else if (b.kind === 'custom') kit = customModel(b, stage, baseOf);
  else if (stage < 3) kit = stageModel(b.kind, stage);
  else {
    const def = MODELS[b.kind];
    if (def.gltf) { const c = loadGLTF(def.gltf); if (c.scene) { const s = c.scene.clone(true); s.scale.setScalar(def.scale || 1); s.position.y = def.offsetY || 0; s.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); return { group: s, emitters: [] }; } }
    kit = new Kit(); kit.seed = b.id || 0; def.finished(kit);
    if (opts.yard && YARD_KINDS.has(b.kind)) addYard(kit, b);
  }
  return { group: mergeByMaterial(kit.g), emitters: kit.emitters };
}
