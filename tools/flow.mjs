// Dev-only: walk the glasses app with the D-pad and the phone page with touch, against the mock
// database, with assertions and screenshots.
// Usage: node tools/flow.mjs [shotsDir]   (builds must be in docs/; starts its own servers)
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const shots = process.argv[2];
if (shots) mkdirSync(shots, {recursive: true});
const DBP = 9400 + Math.floor(Math.random() * 300);
const WEB = 4400 + Math.floor(Math.random() * 300);
const DB = `http://127.0.0.1:${DBP}`;
const db = spawn(process.execPath, ['tools/mock-db.mjs', String(DBP)], {stdio: ['ignore', 'pipe', 'inherit']});
const web = spawn('./node_modules/.bin/vite', ['preview', '--port', String(WEB), '--strictPort'], {stdio: ['ignore', 'pipe', 'inherit']});
await new Promise(r => db.stdout.once('data', r));
await new Promise(r => web.stdout.on('data', d => /Local/.test(String(d)) && r()));
const base = `http://127.0.0.1:${WEB}/`;

const browser = await chromium.launch({headless: true, executablePath: '/opt/google/chrome/chrome'});
let fails = 0;
const check = (n, ok, x = '') => (ok || fails++, console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x !== '' ? ` — ${x}` : ''}`));
const errors = [];
try {
  // ---------------- Glasses ----------------
  const g = await browser.newPage({viewport: {width: 600, height: 600}});
  g.on('pageerror', e => errors.push(`glasses: ${e.message}`));
  g.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`glasses: ${m.text()}`));
  const shot = async n => shots && (await g.screenshot({path: `${shots}/g-${n}.png`}));
  const key = async (k, n = 1, wait = 200) => {
    for (let i = 0; i < n; i++) {
      await g.keyboard.press(k);
      await g.waitForTimeout(wait);
    }
  };
  const focused = () => g.evaluate(() => document.activeElement?.getAttribute('data-nav') || document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 40) || 'none');
  const clipped = () =>
    g.evaluate(() =>
      [...document.querySelectorAll('button,[tabindex]:not([tabindex="-1"])')]
        .filter(el => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && (r.left < -1 || r.top < -1 || r.right > 601 || r.bottom > 601);
        })
        .map(el => el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 20)),
    );
  const noClip = async where => {
    const c = await clipped();
    check(`Nothing cut off: ${where}`, c.length === 0, c.join(', '));
  };
  const overflow = () =>
    g.evaluate(() =>
      [...document.querySelectorAll('.row-text,.row-mid,.job-name,.info-name,.btn,.tab,.badge')]
        .filter(el => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== 'ellipsis')
        .map(el => el.textContent.trim().slice(0, 30)),
    );

  await g.goto(base);
  await g.evaluate(d => {
    localStorage.clear();
    localStorage.setItem('kmr.dbOverride', d);
  }, DB);
  await g.reload();
  await g.waitForTimeout(3200);
  await shot('01-empty');
  const code = await g.evaluate(() => JSON.parse(localStorage.getItem('kmr.fitup.v1')).code);
  check('A pairing code is made and shown', code.length === 8 && (await g.textContent('.empty-home')).includes(`${code.slice(0, 4)}-${code.slice(4)}`));
  check('Link to the database works', (await g.textContent('.link')).includes('on'));
  check('Starts on the Pair button', (await focused()) === 'pair');
  await noClip('empty home');

  // Samples
  await key('ArrowRight');
  check('Right moves to Samples', (await focused()) === 'samples');
  await key('Enter', 1, 400);
  const jobs = await g.locator('.job-card').count();
  check('Samples add three cards on the first page', jobs === 3, jobs);
  await shot('02-home');
  await noClip('home with sheets');
  await key('ArrowUp', 3);
  check('Up reaches the first sheet', (await focused()).startsWith('job-demo0'));
  await key('ArrowDown', 3);
  check('Down past the last card turns the page', (await g.locator('.job-card').count()) === 3 && (await g.textContent('.pager b')) === '2/3');
  await key('ArrowUp');
  check('Up from the first card on page 2 goes back', (await g.textContent('.pager b')) === '1/3' && (await focused()).startsWith('job-demo2'));

  // Open ISO-6
  await key('Enter', 1, 600);
  check('Opens the sheet on the 3D view', (await focused()) === 'model');
  await shot('03-model');
  await noClip('model');
  check('ISO-6 is ready with Integrifuse sizes (the fittings on site)', (await g.textContent('.info')).includes(`2 pipes · 26'-6 3/8"`), await g.textContent('.info'));
  await key('ArrowRight', 1, 500);
  const info1 = await g.textContent('.info');
  check('Right selects the first part', /P1/.test(info1) && info1.includes(`CUT 4'-10 3/8"`), info1.slice(0, 80));
  await shot('04-part');
  await key('ArrowDown', 1, 600);
  check('Down changes the view', (await g.textContent('.model-view')) === 'Spin');
  await key('ArrowDown', 4, 150);
  // Checks tab: set the fusion allowance with the stepper
  await key('ArrowUp');
  check('Up goes to the open tab', (await focused()) === 'tab-model');
  await key('ArrowRight', 3);
  check('Right through the tabs opens Checks', (await focused()) === 'tab-checks' && (await g.locator('.check').count()) > 0);
  await key('ArrowDown');
  await shot('05-checks');
  await noClip('checks');
  const first = await g.textContent('.check');
  check('First check is the extra length', /Extra length is not set/.test(first), first);
  await key('Enter', 1, 400);
  check('Pinch opens the stepper', (await g.locator('.stepper').count()) === 1);
  check('Stepper starts at 3"', (await g.textContent('.stepper-val')) === '3"');
  await key('ArrowUp', 3, 60);
  await key('Escape', 1, 400);
  check('Back cancels without saving', (await g.locator('.stepper').count()) === 0 && /not set/.test(await g.textContent('.check')));
  await key('Enter', 1, 400);
  await shot('06-stepper');
  await key('ArrowRight', 2, 60);
  await key('ArrowLeft', 2, 60);
  await key('ArrowDown', 2, 60);
  check('Swipes change the value', (await g.textContent('.stepper-val')) === '2 7/8"', await g.textContent('.stepper-val'));
  await key('Enter', 1, 400);
  check('Pinch saves and closes', (await g.locator('.stepper').count()) === 0);
  check('Focus returns to the list', await g.evaluate(() => !!document.activeElement?.closest('.list-tab')));
  const checks = await g.locator('.check').allTextContents();
  check('No errors; says the sheet was drawn with GF sizes', !checks.some(c => /Need the|not set/.test(c)) && checks.some(c => /adds up with GF Central Plastics/.test(c)) && checks.some(c => /worked out with GF Central Plastics fittings/.test(c)), checks.join(' | ').slice(0, 300));
  await shot('07-checks-done');
  await key('ArrowUp', 4);
  check('Up from the first row lands on Checks tab', (await focused()) === 'tab-checks');

  // Cuts
  await key('ArrowLeft', 2);
  check('Cuts tab', (await focused()) === 'tab-cuts');
  await key('ArrowDown');
  const cuts = await g.locator('.row-big').allTextContents();
  check('ISO-6 cuts with 2 7/8" extra per pipe: 5\'-1 1/4", 21\'-10 7/8" (the 45 fuses straight onto the -3 wye)', cuts.join(',') === `5'-1 1/4",21'-10 7/8"`, cuts.join(', '));
  await key('Enter', 1, 300);
  check('Pinch marks a cut', (await g.locator('.row-btn.done').count()) === 1);
  await shot('08-cuts');
  await noClip('cuts');

  // Welds
  await key('ArrowUp');
  await key('ArrowRight');
  await key('ArrowDown');
  await key('Enter', 1, 300);
  check('Pinch marks a joint fused', (await g.locator('.row-btn.done').count()) === 1 && (await g.textContent('.foot')).includes('1/3 fused'));
  await shot('09-welds');
  await noClip('welds');

  // Sheet
  await key('ArrowUp');
  await key('ArrowRight', 2);
  check('Sheet tab', (await focused()) === 'tab-sheet');
  await shot('10-sheet');
  await noClip('sheet');

  // Model with take-outs known; pinch details
  await key('ArrowLeft', 4);
  await key('ArrowDown', 1, 400);
  const info2 = await g.textContent('.info');
  check('Selecting P1 shows its cut', info2.includes(`CUT 5'-1 1/4"`) && info2.includes('✓'), info2.slice(0, 80));
  await key('Enter', 1, 400);
  check('Pinch opens the part details', (await g.locator('.modal').count()) === 1 && (await g.textContent('.modal')).includes('Centre to centre'));
  await shot('11-detail');
  await noClip('detail');
  await key('Escape', 1, 400);
  check('Back closes the popup only', (await g.locator('.modal').count()) === 0 && (await g.locator('.tabs').count()) === 1);
  await key('Escape', 1, 600);
  check('Back again goes home', (await g.locator('.home').count()) === 1);
  check('Home returns to the card used', (await focused()).startsWith('job-demo2'));
  const sub = await g.evaluate(() => document.activeElement?.textContent ?? '');
  check('Card shows progress', sub.includes('1/2 cut') && sub.includes('1/3 joints'), sub);
  await shot('12-home-progress');
  check('Overflowing text', (await overflow()).length === 0, (await overflow()).join(', '));

  // Sheet -3 (wye) and the worked example
  await key('ArrowDown');
  await key('Enter', 1, 600);
  await key('ArrowRight', 2, 400);
  await shot('13-wye');
  await key('Escape', 1, 600);
  check('Coming back from a page-2 sheet lands on page 2', (await g.textContent('.pager b')) === '2/3' && (await focused()).startsWith('job-demo3'), await focused());
  await key('ArrowDown', 3);
  await key('Enter', 1, 600);
  await key('ArrowUp');
  await key('ArrowRight');
  await key('ArrowDown');
  const ex = await g.locator('.row-big').allTextContents();
  check('Worked example: 50\' between two 5" 90s = 49\'-2" + 2 7/8" per pipe', ex.includes(`49'-4 7/8"`), ex.join(', '));
  await key('Escape', 1, 600);

  // Pair screen
  await key('ArrowLeft');
  check('Left on a card flips back a page', (await g.textContent('.pager b')) === '2/3');
  await key('ArrowRight');
  check('Right on a card flips forward', (await g.textContent('.pager b')) === '3/3');
  await key('ArrowDown');
  check('Down from the last page reaches the buttons', ['pair', 'samples', 'calc', 'settings'].includes(await focused()), await focused());
  await key('ArrowLeft', 3);
  check('Pair button', (await focused()) === 'pair');
  await key('Enter', 1, 500);
  check('Pair screen shows the code', (await g.textContent('.code')) === `${code.slice(0, 4)}-${code.slice(4)}`);
  await shot('14-pair');
  await noClip('pair');
  await key('Escape', 1, 500);

  // Calculator
  await key('ArrowRight', 2);
  check('Calc button', (await focused()) === 'calc', await focused());
  await key('Enter', 1, 500);
  check('Calc opens on the angle', /Fitting angle/.test(await focused()));
  const out1 = await g.textContent('.calc-out');
  check('24" offset at 45°: travel 2\'-9 15/16", cut 1\'-4 15/16" with two 6" HDPE 45s', out1.includes(`2'-9 15/16"`) && out1.includes(`1'-4 15/16"`), out1);
  await shot('17-calc');
  await noClip('calc');
  await key('ArrowUp');
  check('Up lands on the open tab', (await focused()) === 'calc-offset');
  await key('ArrowRight');
  check('Rolling tab', (await focused()) === 'calc-rolling');
  const out2 = await g.textContent('.calc-out');
  check('Rise 12" + roll 16" = 20" true offset, travel 2\'-4 5/16"', out2.includes(`1'-8"`) && out2.includes(`2'-4 5/16"`), out2);
  await key('ArrowRight');
  await key('ArrowDown');
  await key('Enter');
  await key('Enter');
  const out3 = await g.textContent('.calc-out');
  check('Elbow tab: a 6" LR 90 takes out 9"', out3.includes('9"'), out3);
  await shot('18-calc-elbow');
  await key('Escape', 1, 500);

  // ---------------- Phone ----------------
  const ph = await browser.newPage({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true});
  ph.on('pageerror', e => errors.push(`phone: ${e.message}`));
  ph.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`phone: ${m.text()}`));
  await ph.goto(`${base}scan.html`);
  await ph.evaluate(d => {
    localStorage.clear();
    localStorage.setItem('kmr.dbOverride', d);
  }, DB);
  await ph.reload();
  await ph.waitForTimeout(500);
  check('Phone opens on Setup without a key', (await ph.locator('.seg .on').textContent()) === 'Setup');
  shots && (await ph.screenshot({path: `${shots}/p-01-setup.png`, fullPage: true}));
  await ph.fill('.code-input', code.toLowerCase());
  check('Code is cleaned up as typed', (await ph.inputValue('.code-input')) === `${code.slice(0, 4)}-${code.slice(4)}`);
  await ph.click('text=Done');
  // Three photos of the sheet, so the glasses get every one for their drawing viewer.
  await ph.setInputFiles('input[type=file][multiple]', ['public/icon-192.png', 'public/favicon.png', 'public/icon-192.png']);
  await ph.waitForSelector('.photo-count');
  await ph.click('summary:has-text("sample")');
  await ph.click('.samples .btn:text-is("ISO-3")');
  await ph.waitForTimeout(400);
  const pcuts = await ph.locator('.results .cut').allTextContents();
  check('Phone shows the -3 cut list', pcuts.includes(`19'-6 1/8"`), pcuts.join(', '));
  shots && (await ph.screenshot({path: `${shots}/p-02-review.png`, fullPage: true}));
  // Edit: rename and send
  await ph.fill('.title-input', 'DEMO-ISO-77');
  await ph.click('text=3. Send to glasses');
  await ph.waitForTimeout(1500);
  check('Phone says sent', (await ph.textContent('.msg')).includes('Sent ISO-77'));
  shots && (await ph.screenshot({path: `${shots}/p-03-sent.png`}));
  const got = await g.waitForSelector('.toast:has-text("ISO-77")', {timeout: 9000}).then(() => true, () => false);
  check('Glasses receive it', got && (await g.evaluate(() => JSON.parse(localStorage.getItem('kmr.fitup.v1')).jobs.some(j => j.name === 'ISO-77'))));
  check('…with all 3 photos', await g.evaluate(() => JSON.parse(localStorage.getItem('kmr.fitup.v1')).jobs.find(j => j.name === 'ISO-77').thumbs.length === 3));
  // Open it and flip through the photos in the drawing viewer.
  await g.evaluate(() => document.querySelector('[data-nav=settings]')?.focus());
  for (let i = 0; i < 8 && !(await focused()).startsWith('job-'); i++) await key('ArrowUp');
  await key('ArrowLeft', 2);
  await key('ArrowUp', 3);
  const name = await g.evaluate(() => document.activeElement?.querySelector('.job-name')?.textContent);
  check('ISO-77 is first on the list', name === 'ISO-77', name);
  await key('Enter', 1, 600);
  await key('ArrowUp');
  await key('ArrowRight', 4);
  await key('ArrowDown');
  check('Sheet tab offers all the photos', (await g.textContent('.sheet-tab')).includes('Drawing (3 photos)'));
  if (!/Drawing/.test(await focused())) await key('ArrowLeft');
  await key('Enter', 1, 500);
  check('Viewer opens on photo 1 of 3', (await g.textContent('.modal-title')).includes('photo 1 of 3'));
  await key('ArrowRight', 1, 300);
  check('Swipe shows photo 2 of 3', (await g.textContent('.modal-title')).includes('photo 2 of 3'));
  await shot('16-photos');
  await shot('15-received');

  // Wide check for horizontal scroll on phone
  const wide = await ph.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('Phone page has no sideways scroll', !wide);
} catch (e) {
  check('Walkthrough ran to the end', false, e.stack);
} finally {
  check('No page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  db.kill();
  web.kill();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}
