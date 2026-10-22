// node --experimental-strip-types tools/test-core.ts
import assert from 'node:assert/strict';
import {DEFAULT_SETTINGS, lookup, type TakeoutEntry} from '../src/core/library.ts';
import {EXAMPLE, SHEET_11, SHEET_13, SHEET_2, SHEET_3, SHEET_6} from '../src/core/samples.ts';
import {parseDirection, solve} from '../src/core/solve.ts';
import {formatLength, parseLength, parseSize} from '../src/core/units.ts';
import {makerFits, makerLine} from '../src/core/makers.ts';
import {angleFor, cutFromTravel, elbowTakeout, equalSpread, miter, offset, rollingOffset} from '../src/core/fitmath.ts';

let n = 0;
// The B&V sheets were drawn with GF Central Plastics sizes; the BOM checks use those.
const GF = {...DEFAULT_SETTINGS, brand: 'gf' as const};
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
  assert.equal(formatLength(72.875), `6'-0 7/8"`);
  assert.equal(formatLength(12.625), `1'-0 5/8"`);
  assert.equal(formatLength(0.625), '5/8"');
  assert.equal(formatLength(24), `2'-0"`);
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
  const r = solve(SHEET_3, GF);
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
t('sheet -6: catalog molded take-outs add up to its BOM to the 1/16"', () => {
  const r = solve(SHEET_6, GF);
  assert.ok(r.ready, JSON.stringify(r.checks));
  assert.equal(formatLength(r.pieces[0].cc), `5'-7 3/16"`);
  const e2 = r.points.find(p => p.id === 'E2')!.pos!;
  assert.ok(Math.abs(e2.y / 12 - 1223.8125) < 0.001);
  assert.deepEqual(r.pieces.map(p => formatLength(p.cut)), [`4'-10 9/16"`, `21'-6 1/8"`, '—']);
  assert.equal(r.pieces[2].status, 'nopipe'); // the 45 fuses straight onto the -3 wye
  assert.equal(r.pieces[0].deductions[0].source, 'standard');
  assert.equal(r.pieces[0].deductions[0].inches, 8.625);
  assert.equal(r.pieces[1].deductions[1].inches, 8.5);
  assert.equal(r.pieces[1].takeout, 17.125); // the pipe's take-out: 90 (8 5/8") + 45 (8 1/2")
  assert.equal(r.pieces[0].takeout, 8.625);
  assert.ok(r.checks.some(c => c.level === 'ok' && /matches the BOM \(26'-4 11\/16"\)/.test(c.text)), JSON.stringify(r.checks));
  // 3' / 2'-6" take-outs can't fit: the 45 sits 8 1/2" from the wye, and the pipe falls 6'+ short of the BOM.
  const field: TakeoutEntry[] = [
    {id: 'a', type: 'elbow90', size: 6, material: 'hdpe', takeout: 36},
    {id: 'b', type: 'elbow45', size: 6, material: 'hdpe', takeout: 30},
  ];
  const f = solve(SHEET_6, GF, field);
  assert.ok(!f.ready);
  assert.equal(f.pieces[2].status, 'negative');
  assert.equal(f.pieces[0].deductions[0].source, 'library');
});
t('one unknown take-out: the BOM total suggests it', () => {
  const s = structuredClone(SHEET_6);
  s.fittings[0].type = 'elbow22'; // no catalog value
  const h = solve(s, GF);
  assert.ok(h.checks.find(c => c.level === 'info' && /If the 6" 22½° elbow is 8 5\/8" centre to end/.test(c.text)), JSON.stringify(h.checks));
  assert.equal(h.missing.length, 1);
  assert.equal(h.missing[0].suggest, 8.625);
  assert.equal(h.missing[0].field, 'takeout');
});
t('HDPE catalog covers 2"-12" 90s, 45s and tees', () => {
  const lk = (type: any, size: number) => lookup([], type, size, 'hdpe')?.entry;
  assert.equal(lk('elbow90', 6)!.takeout, 8.625);
  assert.equal(lk('elbow45', 6)!.takeout, 8.5);
  assert.equal(lk('tee', 6)!.takeout, 9);
  assert.equal(lk('tee', 6)!.branch, 9);
  assert.equal(lk('elbow90', 12)!.takeout, 15.25);
  assert.deepEqual([lk('lateral', 6)!.takeout, lk('lateral', 6)!.outlet, lk('lateral', 6)!.branch], [26.6875, 0, 27.375]);
  assert.equal(lk('cleanout', 6)!.laying, 15.125);
  assert.equal(lookup([], 'reducer', 6, 'hdpe', 4)!.entry.laying, 9.25);
  assert.equal(lookup([], 'reducer', 6, 'hdpe', 3)!.entry.other, 'Integrifuse'); // no GF size: the other maker's, flagged
  assert.equal(lookup([{id: 'x', type: 'elbow90', size: 6, material: 'hdpe', takeout: 9}], 'elbow90', 6, 'hdpe')!.source, 'library');
});
t('sheet -13: cleanout riser, rolled 45s and lateral add up to the BOM (25\'-3 5/16")', () => {
  const r = solve(SHEET_13, GF);
  assert.ok(r.ready, JSON.stringify(r.checks));
  const cut = r.pieces.filter(p => p.status === 'ok').map(p => formatLength(p.cut));
  assert.deepEqual(cut, [`2'-0"`, `23'-3 5/16"`]);
  assert.deepEqual(r.pieces.map(p => p.status), ['ok', 'nopipe', 'nopipe', 'ok', 'nopipe']);
  assert.ok(r.checks.some(c => c.level === 'ok' && /matches the BOM \(25'-3 5\/16"\)/.test(c.text)));
  const wye = r.fittings.find(f => f.fitting.type === 'lateral')!;
  assert.deepEqual(wye.ports.map(p => [p.role, p.takeout]), [['takeout', 26.6875], ['outlet', 0], ['branch', 27.375]]);
  const w = Object.fromEntries(r.welds.map(x => [x.number, x.joins]));
  assert.match(w['1472'], /45° elbow.*↔.*45° elbow/);
  assert.match(w['1471'], /45° elbow.*↔.*lateral wye/);
  assert.match(w['1473'], /Pipe P1 ↔ 6" 45° elbow/);
  // The wye centre sits where the branch meets the run: 23'-3 5/16" from the -12 end.
  const W = r.points.find(p => p.id === 'W')!.pos!;
  assert.ok(Math.abs(W.x / 12 - 740.637) < 0.02, String(W.x / 12)); // within 1/4" of the branch-end geometry
});
t('sheet -11 (4"): 90, 45 and a 6x4 reducer add up to the BOM (24\'-2")', () => {
  const r = solve(SHEET_11, GF);
  assert.ok(r.ready, JSON.stringify(r.checks));
  assert.deepEqual(r.pieces.map(p => formatLength(p.cut)), [`5'-6 1/2"`, `18'-7 1/2"`, '—']);
  assert.deepEqual(r.pieces.map(p => formatLength(p.takeout)), [`6 3/8"`, `1'-0 5/8"`, `1'-3 1/2"`]);
  assert.ok(r.checks.some(c => c.level === 'ok' && /matches the BOM \(24'-2"\)/.test(c.text)));
  assert.equal(r.fittings.find(f => f.fitting.type === 'reducer')!.name, '6" x 4" Reducer (item 2)');
  assert.equal(r.size, 4);
});
t('sheet -2: geometry from elevations and the wye branch', () => {
  const r = solve(SHEET_2, GF);
  const e2 = r.points.find(p => p.id === 'E2')!.pos!;
  assert.ok(Math.abs(e2.x / 12 - 1039.45) < 0.01);
  assert.equal(formatLength(r.pieces[1].cc), `1'-5"`);
  assert.ok(r.ready, JSON.stringify(r.checks)); // the cleanout now comes from the sheet-derived table
  assert.ok(r.checks.some(c => c.level === 'ok' && /matches the BOM/.test(c.text)));
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
  s2.fittings[0].type = 'elbow22';
  assert.ok(solve(s2).checks.some(c => c.level === 'error' && /22½° elbow/.test(c.text)));
  const s3 = structuredClone(EXAMPLE);
  s3.legs[0].to = 'ZZ';
  assert.ok(solve(s3).checks.some(c => c.level === 'error' && /isn't on the sheet/.test(c.text)));
});
t('stick plan packs longest first', () => {
  const r = solve(EXAMPLE, {...DEFAULT_SETTINGS, stickLength: 50 * 12});
  assert.equal(r.plan.length, 2);
  assert.deepEqual(r.plan[1].pieces.map(p => p.id), ['P1', 'P3']);
});
t('fitter math: offsets, rolling offsets, elbow take-outs, miters', () => {
  const near = (a: number, b: number, tol = 1 / 32) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
  near(offset(10, 45).travel, 14.142);
  near(offset(10, 45).multiplier, 1.414, 0.001);
  near(offset(12, 22.5).travel, 31.358);
  near(offset(12, 22.5).run, 28.971);
  near(offset(10, 30).travel, 20);
  near(offset(10, 60).travel, 11.547);
  const r = rollingOffset(12, 16, 45);
  near(r.trueOffset, 20);
  near(r.travel, 28.284);
  near(elbowTakeout(6, 90), 9); // B16.9 LR 90
  near(elbowTakeout(6, 45), 3.728, 0.03); // B16.9 says 3 3/4"
  near(elbowTakeout(6, 90, 'SR'), 6);
  const m = miter(6.625, 90, 3);
  assert.equal(m.welds, 2);
  near(m.cutAngle, 22.5, 0.001);
  near(m.cutback, 2.744);
  near(equalSpread(12, 45).difference, 4.971);
  near(cutFromTravel(28.284, 3.75, 3.75, -1 / 16), 20.659);
  near(angleFor(10, 10), 45, 0.001);
  // Steel catalog additions
  const lk = (type: any, size: number, s2?: number) => lookup([], type, size, 'steel', s2)?.entry;
  assert.equal(lk('reducer', 6, 4)!.laying, 5.5);
  assert.equal(lk('cap', 6)!.laying, 3.5);
  assert.equal(lk('flange', 6)!.laying, 3.5);
  assert.equal(lk('elbow22', 6)!.takeout, 1.8125); // 9 × tan 11.25° = 1.79
});
t('fitting makers: Integrifuse sizes, fallbacks and which maker a sheet was drawn with', () => {
  const lk = (type: any, size: number, s2?: number) => lookup([], type, size, 'hdpe', s2, 'integrifuse')?.entry;
  assert.equal(DEFAULT_SETTINGS.brand, 'integrifuse'); // the fittings on site
  assert.equal(lk('elbow90', 6)!.takeout, 8.8125); // 8.80
  assert.equal(lk('elbow45', 6)!.takeout, 6.4375); // 6.46 (item 100013)
  assert.equal(lk('elbow90', 2)!.takeout, 4.75); // 4.72
  assert.equal(lk('elbow45', 4)!.takeout, 5.125); // 5.14
  assert.equal(lk('tee', 4)!.branch, 7);
  assert.equal(lk('reducer', 6, 4)!.laying, 11.4375); // 11.42
  assert.equal(lk('cap', 6)!.takeout, 7.0625); // 7.08
  const wye = lk('lateral', 6)!; // item 100906: A 33.74, B 6.18, C 25.54
  assert.deepEqual([wye.takeout, wye.outlet, wye.branch], [27.5625, 6.1875, 25.5625]);
  assert.equal(lk('elbow90', 10)!.other, 'GF Central Plastics'); // Integrifuse doesn't list 10": GF, flagged
  assert.equal(lk('cleanout', 6)!.note, 'From the B&V HDPE isometrics (matches their BOMs)'); // no maker figure: the drawings'
  // Sheet -6 with Integrifuse fittings: P1 = 5'-7 3/16" − 8 13/16", P2 = 22'-11 1/4" − 8 13/16" − 6 7/16",
  // and the shorter 45 leaves a 2 1/16" piece before the -3 wye.
  const r = solve(SHEET_6);
  assert.deepEqual(r.pieces.map(p => formatLength(p.cut)), [`4'-10 3/8"`, `21'-8"`, '2 1/16"']);
  // A missing size from the chosen maker uses the other's and says so.
  const s = structuredClone(SHEET_6);
  s.fittings[0].size = '10"';
  assert.ok(solve(s, {...DEFAULT_SETTINGS, brand: 'integrifuse'}).checks.some(c => /Using the GF Central Plastics size for the 10" 90° elbow/.test(c.text)));
  // Which maker the sheets add up with
  const fmt = formatLength;
  for (const sh of [SHEET_6, SHEET_11, SHEET_13]) assert.match(makerLine(sh, GF, fmt)!, /adds up with GF Central Plastics/);
  const fits = makerFits(SHEET_6, GF);
  assert.equal(fits.find(f => f.brand === 'gf')!.off, 0);
  // Integrifuse's longer 90 takes 3/8" more; its shorter 45 leaves 2 1/16" more on P2 and a new 2 1/16" piece.
  assert.equal(fits.find(f => f.brand === 'integrifuse')!.off, 3.75);
});
console.log(`\n${n} passed`);
