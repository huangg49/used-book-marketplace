import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { JOURNEY_TIMING as T } from '../previews/auth-wind/journey-timing.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const appRoot = path.join(root, 'apps/user-web');
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const webRequire = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
const evidence = path.join(root, process.env.AUTH_WIND_EVIDENCE ?? '.impeccable/review/auth-wind-journey');
await mkdir(evidence, { recursive: true });
process.chdir(appRoot);
const server = await createServer({ root: appRoot, server: { host: '127.0.0.1', port: 5199, strictPort: true } });
let browser;
const results = [];
try {
  await server.listen(); browser = await chromium.launch();
  for (const [name, viewport] of [['desktop', { width: 1366, height: 768 }], ['mobile', { width: 390, height: 844 }]]) {
    const errors = [], api = [];
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce', recordVideo: { dir: path.join(root, '.tmp/auth-wind-video'), size: viewport } });
    await context.route('**/api/**', route => { api.push(route.request().url()); return route.abort(); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5199/previews/auth-wind/journey/');
    await page.waitForFunction(() => !document.querySelector('.wind-primary')?.disabled, null, { timeout: 15000 });
    const seek = time => page.locator('#wind-time').fill(String(Math.round(time / T.end * 1000)));
    const state = () => page.evaluate(() => ({
      time: Number(document.querySelector('.paper-canvas').dataset.journeyTime),
      inline: document.querySelector('.journey-destination').getAttribute('style'),
      destinationData: document.querySelector('.journey-destination').dataset.arrived,
      transition: getComputedStyle(document.querySelector('.journey-destination')).transition,
      destination: getComputedStyle(document.querySelector('.journey-destination')).visibility,
      source: getComputedStyle(document.querySelector('.wind-source')).visibility,
      outsideHidden: document.querySelector('.journey-outside').hidden,
      breezeHidden: document.querySelector('.journey-breeze').hidden,
      seeds: [...document.querySelectorAll('[data-breeze-kind="seed"]')].map(node => Number(getComputedStyle(node).opacity)),
      pages: [...document.querySelector('.journey-outside').children].map(node => node.getBoundingClientRect().toJSON()),
      animations: document.querySelector('.journey-outside').getAnimations({ subtree: true }).map(a => ({ state: a.playState, time: a.currentTime })),
    }));
    await page.screenshot({ path: path.join(evidence, `${name}-rest.png`) });
    const samples = [];
    for (const [label, time] of [['stamp', 150], ['flight', 560], ['cover', 1340], ['handoff', 1370], ['reveal', 1800], ['arrived', 2300], ['tail', 3400], ['end', T.end]]) {
      await seek(time); await page.waitForFunction(target => Math.abs(Number(document.querySelector('.paper-canvas').dataset.journeyTime) - target) < 4, time);
      const sample = await state(); samples.push({ label, ...sample });
      assert.ok(sample.animations.every(a => a.state === 'paused' && Number.isFinite(a.time)), 'One paused common clock, no independent background motion');
      if (time < T.covered) assert.equal(sample.destination, 'hidden');
      else { assert.equal(sample.destination, 'visible'); assert.equal(sample.source, 'hidden'); }
      if (label === 'handoff') {
        const paper = sample.pages[0];
        assert.ok(paper.x + paper.width * .12 < 0 && paper.x + paper.width * .88 > viewport.width && paper.y + paper.height * .12 < 0 && paper.y + paper.height * .88 > viewport.height, 'Destination swaps inside the opaque core of the outside sheet');
      }
      if (label === 'arrived') { assert.ok(sample.outsideHidden); assert.ok(sample.seeds.some(opacity => opacity > .3)); }
      if (label === 'end') { assert.ok(sample.breezeHidden); assert.ok(sample.seeds.every(opacity => opacity < .001)); }
      await page.screenshot({ path: path.join(evidence, `${name}-${label}.png`) });
    }
    assert.ok(samples.find(s => s.label === 'tail').seeds.reduce((a,b)=>a+b,0) < samples.find(s => s.label === 'arrived').seeds.reduce((a,b)=>a+b,0), 'Individual seeds dissolve across the lingering tail');
    await page.getByRole('button', { name: 'Về trạng thái đầu' }).click();
    assert.equal((await state()).destination, 'hidden');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: 'Xem lại', exact: true }).waitFor({ timeout: 8000 });
    assert.equal((await state()).destination, 'visible');
    await page.getByRole('button', { name: 'Về trạng thái đầu' }).click();
    await page.getByLabel('Xem chậm').check();
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: 'Tạm dừng', exact: true }).click();
    const paused = await state(); await page.waitForTimeout(150); assert.equal((await state()).time, paused.time);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await state(); await page.waitForTimeout(100); assert.equal((await state()).time, hidden.time);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await seek(2500); assert.ok((await state()).seeds.some(opacity => opacity > .3), 'Breeze is restored on visibility return');
    await seek(2500); await page.setViewportSize({ width: viewport.width - 10, height: viewport.height - 10 });
    await page.waitForFunction(() => !document.querySelector('.wind-primary').disabled && document.querySelector('#wind-time').value === '0');
    assert.equal((await state()).destination, 'hidden');
    assert.deepEqual(errors, []); assert.deepEqual(api, []);
    const video = page.video(); await context.close(); await copyFile(await video.path(), path.join(evidence, `${name}.webm`));
    results.push({ name, viewport, samples, errors, api, reducedMotion: 'reduce', replay: 'PASS', pause: 'PASS', resize: 'PASS', visibility: 'PASS' });
    console.log(`${name}: PASS`);
  }
  await writeFile(path.join(evidence, 'runtime.json'), JSON.stringify({ timing: T, results }, null, 2));
} finally { await browser?.close(); await server.close(); }
