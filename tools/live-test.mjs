// Dev-only: live scan end to end with a fake camera feed (an .mjpeg of a sheet photo) and a fake
// Claude. Usage: node tools/live-test.mjs feed.mjpeg [shotsDir]
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const [feed, shots] = process.argv.slice(2);
const WEB = 4700 + Math.floor(Math.random() * 200);
const web = spawn('./node_modules/.bin/vite', ['preview', '--port', String(WEB), '--strictPort'], {stdio: ['ignore', 'pipe', 'inherit']});
await new Promise(r => web.stdout.on('data', d => /Local/.test(String(d)) && r()));
const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/google/chrome/chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${feed}`],
});
let fails = 0;
const check = (n, ok, x = '') => (ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? ` — ${x}` : ''}`));
const errors = [];
try {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true, permissions: ['camera']});
  const ph = await ctx.newPage();
  ph.on('pageerror', e => errors.push(e.message));
  const calls = [];
  await ph.route('https://api.anthropic.com/**', async route => {
    const body = JSON.parse(route.request().postData());
    calls.push(body);
    const imgs = body.messages[0].content.filter(c => c.type === 'image').length;
    const sheet = {
      drawing: {number: 'DEMO-ISO-6'},
      size: '6"',
      material: '6" IPS SDR 11 HDPE PE4710',
      joining: 'butt_fusion',
      points: [
        {id: 'T', kind: 'end', e: 1083.75, n: 1246.75, el: 357.67},
        {id: 'E1', kind: 'center', el: 352.07},
        {id: 'E2', kind: 'center', el: 351.96},
        {id: 'B', kind: 'end', e: 1084.25, n: 1223.31, el: 351.95, cont: 'DEMO-ISO-3'},
      ],
      legs: [
        {id: 'L1', from: 'T', to: 'E1', direction: 'Down'},
        {id: 'L2', from: 'E1', to: 'E2', direction: 'S', cc: `22'-11 1/4"`},
        {id: 'L3', from: 'E2', to: 'B', direction: 'S45E', cc: '8 1/2"'},
      ],
      fittings: [
        {id: 'F1', type: 'elbow90', point: 'E1'},
        {id: 'F2', type: 'elbow45', point: 'E2'},
      ],
      welds: [],
      bom: [{item: 1, description: 'PIPE', qty: `26'-4 11/16"`}],
      unreadable: imgs < 2 ? ['the bill of materials quantities'] : [],
      confidence: imgs < 2 ? 'medium' : 'high',
    };
    await route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({model: body.model, stop_reason: 'tool_use', usage: {input_tokens: 4000, output_tokens: 1500}, content: [{type: 'tool_use', id: 't1', name: 'record_isometric', input: sheet}]})});
  });
  await ph.goto(`http://127.0.0.1:${WEB}/scan.html`);
  await ph.evaluate(() => localStorage.setItem('kmr.fitup.phone.v1', JSON.stringify({apiKey: 'sk-ant-test', code: 'ABCD1234'})));
  await ph.reload();
  await ph.click('text=Live scan');
  await ph.waitForSelector('.live');
  await ph.waitForTimeout(700);
  shots && (await ph.screenshot({path: `${shots}/live-1.png`}));
  const t0 = Date.now();
  await ph.waitForSelector('.live', {state: 'detached', timeout: 20000});
  check('Auto-captures once the feed is steady and sharp', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await ph.waitForSelector('.improve', {timeout: 15000});
  check('First read sent one photo', calls.length === 1 && calls[0].messages[0].content.filter(c => c.type === 'image').length === 1);
  const img = calls[0].messages[0].content.find(c => c.type === 'image').source.data;
  check('Photo for Claude is a real JPEG', Buffer.from(img, 'base64').subarray(0, 2).toString('hex') === 'ffd8', `${Math.round(img.length / 1024)} KB`);
  check('Asks for a close-up of what it could not read', (await ph.textContent('.improve')).includes('bill of materials'));
  shots && (await ph.screenshot({path: `${shots}/live-2.png`, fullPage: false}));
  await ph.click('text=Live close-up');
  await ph.waitForSelector('.live');
  await ph.waitForTimeout(600);
  shots && (await ph.screenshot({path: `${shots}/live-3.png`}));
  await ph.waitForSelector('.live', {state: 'detached', timeout: 20000});
  await ph.waitForFunction(() => document.querySelectorAll('.results .cut').length > 0 && !document.querySelector('.improve') && !document.querySelector('.card.reading'), null, {timeout: 15000});
  check('Second read sends both photos with what was missing', calls.length === 2 && calls[1].messages[0].content.filter(c => c.type === 'image').length === 2 && JSON.stringify(calls[1]).includes('bill of materials quantities'));
  const cuts = await ph.locator('.results .cut').allTextContents();
  check('Cut list shows', cuts.includes(`4'-10 9/16"`), cuts.join(', '));
  shots && (await ph.screenshot({path: `${shots}/live-4.png`}));
} catch (e) {
  check('Ran to the end', false, e.message);
} finally {
  check('No page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  web.kill();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}
