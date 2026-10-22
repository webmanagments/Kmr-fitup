// node --experimental-strip-types tools/test-pair.ts   (starts the mock database itself)
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {makeJob} from '../src/core/job.ts';
import {formatCode, normalizeCode, newPairCode, open, receiveJobs, seal, sendJob} from '../src/core/pair.ts';
import {normalizeSheet, buildRequest, checkPrompt, readingFrom, readingProblems, SHEET_TOOL} from '../src/core/reader.ts';
import {SHEET_13, SHEET_3, SHEET_6} from '../src/core/samples.ts';
import {solve} from '../src/core/solve.ts';

const port = 9300 + Math.floor(Math.random() * 500);
(globalThis as any).localStorage = {getItem: (k: string) => (k === 'kmr.dbOverride' ? `http://127.0.0.1:${port}` : null)};
const srv = spawn(process.execPath, ['tools/mock-db.mjs', String(port)], {stdio: ['ignore', 'pipe', 'inherit']});
await new Promise(r => srv.stdout!.once('data', r));
try {
  const code = newPairCode();
  assert.equal(code.length, 8);
  assert.equal(normalizeCode(formatCode(code).toLowerCase()), code);
  assert.equal(normalizeCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizeCode('o1il'), '0111');

  const s = await seal(code, {hello: 'x'.repeat(5000)});
  assert.ok(s.ct.length < 400, 'gzip shrinks it');
  assert.deepEqual(await open(code, s), {hello: 'x'.repeat(5000)});
  await assert.rejects(open(newPairCode(), s));

  const a = makeJob(SHEET_6);
  const b = makeJob(SHEET_3);
  assert.deepEqual(await sendJob(code, a), {ok: true});
  assert.deepEqual(await sendJob(formatCode(code), b), {ok: true});
  assert.deepEqual(await sendJob('abc', b), {ok: false, why: 'bad'});
  const got = await receiveJobs(code);
  assert.ok(got.ok);
  assert.deepEqual(got.jobs.map(j => j.name).sort(), ['ISO-3', 'ISO-6']);
  assert.deepEqual(solve(got.jobs.find(j => j.name.endsWith('-3'))!.sheet).pieces.map(p => p.cut), solve(SHEET_3).pieces.map(p => p.cut));
  const again = await receiveJobs(code);
  assert.ok(again.ok && again.jobs.length === 0, 'box is emptied');
  const other = await receiveJobs(newPairCode());
  assert.ok(other.ok && other.jobs.length === 0);
  console.log('ok pairing round trip');

  // The reader's cleanup keeps good data and repairs a sloppy reply.
  assert.deepEqual(normalizeSheet(JSON.parse(JSON.stringify(SHEET_3))).legs, SHEET_3.legs.map(l => ({direction: null, cc: null, pipe: null, slope: null, bomItem: null, ...l})));
  const messy = normalizeSheet({
    drawing: {number: 'X-1'},
    material: '6" HDPE',
    points: [{id: 'A', kind: 'end', e: '1083.64', el: 3351.95}, {id: 'A'}],
    legs: [{id: 'L1', from: 'A', to: 'Z', cc: `10'-0"`}, {id: 'L2', from: 'A', to: 'A'}],
    fittings: [{id: 'F1', type: 'elbow', point: 'Z', takeouts: {L1: '5"', L9: '3"'}}],
    welds: [{number: 1145, point: 'A'}, {number: '9', point: 'nowhere'}],
    bom: [{description: 'PIPE', qty: `10'`}],
  });
  assert.equal(messy.joining, 'butt_fusion');
  assert.equal(messy.points[0].e, 1083.64);
  assert.deepEqual(messy.points.map(p => p.id), ['A', "A'", 'Z']);
  assert.equal(messy.legs.length, 1);
  assert.equal(messy.fittings[0].type, 'other');
  assert.deepEqual(messy.fittings[0].takeouts, {L1: '5"'});
  assert.deepEqual(messy.welds.map(w => w.number), ['1145']);
  assert.equal(messy.bom[0].item, 1);
  const req = buildRequest([{mediaType: 'image/jpeg', data: 'AAAA'}, {mediaType: 'image/jpeg', data: 'BBBB'}], 'claude-sonnet-5-5', 'it is 6 inch');
  assert.equal(req.tool_choice.type, 'auto');
  assert.equal(req.tools[0].name, SHEET_TOOL.name);
  // Reading comes from the tool call, or from JSON in a text answer.
  assert.deepEqual(readingFrom({content: [{type: 'thinking'}, {type: 'tool_use', name: SHEET_TOOL.name, input: {legs: []}}]}), {legs: []});
  assert.deepEqual(readingFrom({content: [{type: 'text', text: 'Here:\n```json\n{"points": [], "legs": [1]}\n```'}]}), {points: [], legs: [1]});
  assert.equal(readingFrom({content: [{type: 'text', text: 'I cannot read this.'}]}), null);
  assert.equal((req.messages[0].content as any[]).length, 5); // 2 x (label + photo) + instructions
  assert.match(JSON.stringify(req), /all of ONE sheet/);
  assert.match(req.system, /EXAMPLE of a correct reading/);
  assert.match(JSON.stringify(req.messages[0].content[0]), /Photo 1 of 2/);
  assert.match(JSON.stringify(req.messages[0].content[2]), /Photo 2 of 2/);
  assert.match(JSON.stringify(req), /ONE complete reading/);
  // The double-check: a good reading has nothing to fix; a misread one is caught.
  assert.deepEqual(readingProblems(SHEET_13), []);
  const bad = structuredClone(SHEET_13);
  bad.legs[3].cc = `23'-8 5/16"`; // a misread digit
  const probs = readingProblems(bad);
  assert.ok(probs.some(p => /BOM/.test(p)), probs.join(' | '));
  const noWelds = structuredClone(SHEET_13);
  noWelds.welds = [];
  assert.ok(readingProblems(noWelds).some(p => /joint numbers/.test(p)));
  const cp = checkPrompt(bad, probs);
  assert.match(cp, /First reading:/);
  assert.match(cp, /23'-8 5\/16/);
  const req2 = buildRequest([{mediaType: 'image/jpeg', data: 'AAAA'}], 'claude-opus-5-5', '', cp);
  assert.match(JSON.stringify(req2.messages[0].content.at(-1)), /calculator worked out the cuts/);
  console.log('ok reader cleanup, request and double-check');
  console.log('\nall passed');
} finally {
  srv.kill();
}
