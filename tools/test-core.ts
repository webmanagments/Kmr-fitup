// node --experimental-strip-types tools/test-core.ts
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, type TakeoutEntry} from '../src/core/library.ts';
import {EXAMPLE, SHEET_2, SHEET_3, SHEET_6} from '../src/core/samples.ts';
import {parseDirection, solve} from '../src/core/solve.ts';
import {formatLength, parseLength, parseSize} from '../src/core/units.ts';

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log('ok', name);
};

t('parse lengths', () => {
  assert.equal(parseLength(`22'-11 1/4"`), 275.25);
  assert.equal(parseLength(`2'-2 11/16"`), 26.6875);
  assert.equal(parseLength('8 1/2"'), 8.5);
  assert.equal(parseLength('5/8"'), 0.625);
  assert.equal(parseLength('1-1/2"'), 1.5);
  assert.equal(parseLength(`50'`), 600);
  assert.equal(parseLength(`22.5'`), 270);
  assert.equal(parseLength('3 ft 2 in'), 38);
  assert.equal(parseLength(`19’-9 5/16”`), 237.3125);
  assert.equal(parseLength('0"'), 0);
  assert.equal(parseLength('abc'), null);
  assert.equal(parseSize('6"'), 6);
  assert.equal(parseSize('1-1/2'), 1.5);
});
t('format lengths', () => {
  assert.equal(formatLength(275.25), `22'-11 1/4"`);
  assert.equal(formatLength(8.5), '8 1/2"');
  assert.equal(formatLength(590), `49'-2"`);
  assert.equal(formatLength(0.03), '0"');
  assert.equal(formatLength(-0.25), '-1/4"');
  assert.equal(formatLength(237.31), `19'-9 5/16"`);
});
t('directions', () => {
  const near = (a: any, b: number[]) => assert.ok(Math.abs(a.x - b[0]) + Math.abs(a.y - b[1]) + Math.abs(a.z - b[2]) < 1e-6, JSON.stringify(a));
  near(parseDirection('S'), [0, -1, 0]);
  near(parseDirection('Up'), [0, 0, 1]);
  near(parseDirection('S45E'), [Math.SQRT1_2, -Math.SQRT1_2, 0]);
  near(parseDirection('N 45 W 0.25 Up'), [-Math.SQRT1_2, Math.SQRT1_2, 0]);
  near(parseDirection('E 45 Down'), [Math.SQRT1_2, 0, -Math.SQRT1_2]);
  near(parseDirection('north east'), [Math.SQRT1_2, Math.SQRT1_2, 0]);
  assert.equal(parseDirection('sideways'), null);
});

t('worked example: 50\' between two 5" 90s cuts 49\'-2"', () => {
  const r = solve(EXAMPLE);
  assert.deepEqual(r.pieces.map(p => formatLength(p.cut)), [`9'-7"`, `49'-2"`, `7'-9"`]);
  assert.ok(r.ready);
  assert.ok(r.checks.some(c => c.level === 'ok' && /BOM/.test(c.text)));
  const z = r.points.find(p => p.id === 'T')!.pos!.z - r.points.find(p => p.id === 'E2')!.pos!.z;
  assert.equal(z, 98);
});
t('fusion allowance is added per fused end; root gap taken off for steel', () => {
  const r = solve(EXAMPLE, {...DEFAULT_SETTINGS, fusionAllowance: 1 / 4});
  assert.deepEqual(r.pieces.map(p => formatLength(p.cut)), [`9'-7 1/4"`, `49'-2 1/2"`, `7'-9 1/4"`]);
  assert.ok(!r.checks.some(c => /allowance is not set/.test(c.text)));
  const steel = solve({...EXAMPLE, joining: 'butt_weld', material: '6" STD CS'});
  assert.equal(steel.material, 'steel');
  assert.deepEqual(steel.pieces.map(p => formatLength(p.cut)), [`9'-6 7/8"`, `49'-1 3/4"`, `7'-8 7/8"`]);
});
t('steel falls back to ASME B16.9 take-outs', () => {
  const s = {...EXAMPLE, joining: 'butt_weld' as const, material: 'CS', fittings: EXAMPLE.fittings.map(f => ({...f, takeout: null}))};
  const r = solve(s, {...DEFAULT_SETTINGS, rootGap: 0});
  assert.equal(r.pieces[1].deductions[0].source, 'standard');
  assert.equal(formatLength(r.pieces[1].cut), `48'-6"`); // 600 - 9 - 9
});

t('sheet -3: lateral wye, pipe 19\'-9 5/16" matches the print, BOM flagged', () => {
  const r = solve(SHEET_3);
  const pipe = r.pieces.filter(p => p.status === 'ok');
  assert.equal(pipe.length, 1);
  assert.equal(formatLength(pipe[0].cut), `19'-9 5/16"`);
  assert.equal(pipe[0].printedMatch, true);
  assert.deepEqual(pipe[0].welds, ['1147']);
  assert.ok(r.checks.some(c => c.level === 'warn' && /BOM 19'-1 9\/16"/.test(c.text) && /7 3\/4"/.test(c.text)));
  assert.ok(r.ready);
  const w = r.points.find(p => p.id === 'W')!.pos!;
  assert.ok(Math.abs(w.x / 12 - 1085.86) < 0.01);
  assert.match(r.welds.find(x => x.number === '1146')!.joins, /wye.*↔ sheet ISO-6/);
});
t('sheet -6: needs the elbow take-outs, then adds up', () => {
  const r = solve(SHEET_6);
  assert.ok(!r.ready);
  assert.equal(r.checks.filter(c => c.level === 'error' && /take-out/.test(c.text)).length, 2);
  assert.equal(formatLength(r.pieces[0].cc), `5'-7 3/16"`);
  const e2 = r.points.find(p => p.id === 'E2')!.pos!;
  assert.ok(Math.abs(e2.y / 12 - 1223.8125) < 0.001);
  // Only the 90 unknown: the BOM total suggests a value for it.
  const lib45: TakeoutEntry[] = [{id: 'a', type: 'elbow45', size: 6, material: 'hdpe', takeout: 8.5}];
  const h = solve(SHEET_6, DEFAULT_SETTINGS, lib45);
  const hint = h.checks.find(c => c.level === 'info' && /If the 6" 90° elbow take-out is/.test(c.text));
  assert.ok(hint, JSON.stringify(h.checks));
  assert.equal(h.missing.length, 1);
  assert.equal(h.missing[0].suggest, 8.625);
  assert.equal(h.missing[0].field, 'takeout');
  // Both known: every piece cuts, the 45 runs straight into the -3 wye with no pipe.
  const lib = [...lib45, {id: 'b', type: 'elbow90', size: 6, material: 'hdpe', takeout: 8.625} as TakeoutEntry];
  const k = solve(SHEET_6, DEFAULT_SETTINGS, lib);
  assert.ok(k.ready);
  assert.equal(k.pieces[2].status, 'nopipe');
  assert.equal(k.pieces[0].deductions[0].source, 'library');
  assert.ok(k.checks.some(c => /matches the BOM/.test(c.text)), JSON.stringify(k.checks));
});
t('sheet -2: geometry from elevations and the wye branch', () => {
  const r = solve(SHEET_2);
  const e2 = r.points.find(p => p.id === 'E2')!.pos!;
  assert.ok(Math.abs(e2.x / 12 - 1039.45) < 0.01);
  assert.equal(formatLength(r.pieces[1].cc), `1'-5"`);
  assert.ok(r.checks.some(c => /Cleanout/.test(c.text)));
  assert.equal(r.welds.length, 7);
  assert.equal(r.fittings.find(f => f.id === 'F1')!.pos !== null, true);
});
t('bad data is reported, never silently fixed', () => {
  const s = structuredClone(EXAMPLE);
  s.legs[1].cc = '8"';
  const r = solve(s);
  assert.equal(r.pieces[1].status, 'negative');
  assert.ok(!r.ready);
  const s2 = structuredClone(EXAMPLE);
  s2.fittings[0].takeout = null;
  assert.ok(solve(s2).checks.some(c => c.level === 'error' && /90° elbow/.test(c.text)));
  const s3 = structuredClone(EXAMPLE);
  s3.legs[0].to = 'ZZ';
  assert.ok(solve(s3).checks.some(c => c.level === 'error' && /isn't on the sheet/.test(c.text)));
});
t('stick plan packs longest first', () => {
  const r = solve(EXAMPLE, {...DEFAULT_SETTINGS, stickLength: 50 * 12});
  assert.equal(r.plan.length, 2);
  assert.deepEqual(r.plan[1].pieces.map(p => p.id), ['P1', 'P3']);
});
console.log(`\n${n} passed`);
