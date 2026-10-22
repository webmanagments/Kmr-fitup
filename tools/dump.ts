import {solve} from '../src/core/solve.ts';
import {SAMPLES} from '../src/core/samples.ts';
import {formatLength as f} from '../src/core/units.ts';
for (const s of SAMPLES) {
  const r = solve(s);
  console.log('\n==', s.drawing.number, r.material, 'ready', r.ready);
  for (const p of r.pieces) console.log(p.id, p.leg, p.status, 'cc', f(p.cc), p.ccSource, '| ded', p.deductions.map(d => `${d.label}=${f(d.inches)}(${d.source})`).join(', '), '| net', f(p.net), 'cut', f(p.cut), 'printed', f(p.printedPipe), p.printedMatch, p.welds.join(','));
  for (const pt of r.points) console.log('  pt', pt.id, pt.posSource, pt.pos && [pt.pos.x / 12, pt.pos.y / 12, pt.pos.z / 12].map(n => n.toFixed(2)).join(' '));
  for (const w of r.welds) console.log('  weld', w.number, w.joins);
  for (const c of r.checks) console.log('  ', c.level, c.text);
}
