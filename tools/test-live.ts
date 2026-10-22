// node --experimental-strip-types tools/test-live.ts
import assert from 'node:assert/strict';
import {makeJudge, measure, type Frame} from '../src/phone/live.ts';

// A synthetic "sheet": white paper with dark lines, optionally shifted (motion), blurred, dark or small.
function sheet({shift = 0, blur = false, dim = 1, paper = 1}: {shift?: number; blur?: boolean; dim?: number; paper?: number}): Frame {
  const w = 200;
  const h = 150;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inPaper = Math.abs(x - w / 2) < (w / 2) * paper && Math.abs(y - h / 2) < (h / 2) * paper;
      let v = inPaper ? 235 : 45;
      const line = (x + shift) % 23 === 0 || (y * 3 + x + shift) % 41 === 0;
      if (inPaper && line) v = 30;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v * dim;
      data[i + 3] = 255;
    }
  if (blur) {
    const copy = data.slice();
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++)
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += copy[((y + dy) * w + x + dx) * 4 + c];
          data[(y * w + x) * 4 + c] = s / 9;
        }
  }
  return {w, h, data};
}

const run = (frames: Frame[]) => {
  const j = makeJudge();
  let prev: Float32Array | null = null;
  let t = 0;
  let last;
  for (const f of frames) {
    const r = measure(f, prev);
    prev = r.g;
    last = j.push(r.m, (t += 120));
    if (last.ready) return {ready: true, at: t, last};
  }
  return {ready: false, at: t, last: last!};
};

const steady = Array.from({length: 12}, () => sheet({}));
const r1 = run(steady);
assert.ok(r1.ready, JSON.stringify(r1.last));
assert.ok(r1.at >= 700, `waits a moment before snapping (${r1.at}ms)`);
console.log('ok steady, sharp sheet snaps after holding');

const shaky = Array.from({length: 40}, (_, i) => sheet({shift: (i * 7) % 23}));
const r2 = run(shaky);
assert.ok(!r2.ready);
assert.equal(r2.last.tip, 'Hold still');
console.log('ok moving camera never snaps');

const r3 = run(Array.from({length: 12}, () => sheet({paper: 0.3})));
assert.ok(!r3.ready && /Point|closer/.test(r3.last.tip), r3.last.tip);
console.log('ok sheet too small asks to move closer');

const r4 = run(Array.from({length: 12}, () => sheet({dim: 0.2})));
assert.ok(!r4.ready && /dark|Point/.test(r4.last.tip), r4.last.tip);
console.log('ok too dark');

// Sharp frames first, then the focus drifts: blurry frames don't count as sharp.
const j = makeJudge();
let prev: Float32Array | null = null;
let t = 0;
for (let i = 0; i < 4; i++) {
  const r = measure(sheet({}), prev);
  prev = r.g;
  j.push(r.m, (t += 120));
}
const b = measure(sheet({blur: true}), prev);
assert.equal(j.push(b.m, (t += 120)).ok.sharp, false);
console.log('ok blur after sharp is caught');
console.log('\nall passed');
