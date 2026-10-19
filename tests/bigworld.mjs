// Large map: sea coast, 5+ neighbour towns with distinct cultures, save/load keeps the size, 90 days run clean
import * as S from '../src/sim.js';
const s = S.newGame({ seed: 7, size: 128 });
let sea = 0; for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (S.tile(s, x, y).sea) sea++;
const kinds = new Set(s.towns.map(t => t.kind));
console.log({ size: S.SIZE, sea, towns: s.towns.map(t => t.kind + '@' + t.x + ',' + t.y), animals: s.animals.length, start: s.start });
const fail = (m) => { console.log('FAIL', m); process.exit(1); };
if (S.SIZE !== 128) fail('size'); if (sea < 600) fail('no sea'); if (s.towns.length < 5) fail('few towns'); if (kinds.size < 4) fail('cultures');
if (S.tile(s, s.start.x, s.start.y).t !== S.T.GRASS) fail('start');
for (let i = 0; i < 24 * 90; i++) S.tick(s);
const j = S.serialize(s); S.newGame({ seed: 1 }); if (S.SIZE !== 64) fail('reset'); const d = S.deserialize(j); if (S.SIZE !== 128 || d.towns.length !== s.towns.length) fail('load');
console.log('pop', d.villagers ? d.villagers.length : '?', 'save KB', Math.round(j.length / 1024)); console.log('PASS');
