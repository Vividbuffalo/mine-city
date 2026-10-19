// villagers carry materials from the camp to a build site; construction can't run ahead of delivered materials
import * as S from '../src/sim.js';
const run = (withV) => { const s = S.newGame({ seed: 42 }), { x, y } = s.start; s.res.wood += 200; const r = S.applyCommand(s, { type: 'place', kind: 'longhouse', x: x + 2, y: y + 2 }); if (!r.ok) throw new Error(r.err);
  if (withV) S.applyCommand(s, { type: 'villagerTask', ids: s.units.map(u => u.id), x: x + 2, y: y + 2 });
  const states = new Set(); let h = 0; for (; h < 200 && !s.buildings[r.id].done; h++) { S.tick(s); for (const u of s.units) states.add(u.vstate); }
  return { hours: h, states: [...states], mg: s.buildings[r.id].mg, mt: s.buildings[r.id].mt }; };
const a = run(false), b = run(true); console.log({ alone: a, villagers: b });
const ok = b.hours < a.hours * 0.7 && b.states.includes('hauling') && b.states.includes('building');
console.log(ok ? 'PASS' : 'FAIL'); if (!ok) process.exit(1);
