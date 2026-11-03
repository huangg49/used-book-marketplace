// Actual hook and Lenis in a small routed surface; no backend, session or DB.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default;
const out = path.join(root, '.tmp/member-web-smooth-scroll');
await mkdir(out, { recursive: true });
const source = root.replaceAll('\\', '/').replace(/\/$/, '');
const baseline = process.env.SMOOTH_SCROLL_BASELINE;
const hook = baseline ? `${source}/.tmp/member-web-smooth-scroll/baseline-hook.ts` :
  `${source}/apps/user-web/src/hooks/useSmoothScroll.ts`;
if (baseline) await writeFile(path.join(out, 'baseline-hook.ts'), execFileSync('git',
  ['show', `${baseline}:apps/user-web/src/hooks/useSmoothScroll.ts`], { cwd: root }));
await writeFile(path.join(out, 'index.html'), '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0"><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
await writeFile(path.join(out, 'fixture.tsx'), `
import React,{StrictMode} from 'react';import{createRoot}from'react-dom/client';
import{BrowserRouter,useNavigate,useLocation}from'react-router-dom';
import{getLenis,useGlobalSmoothScroll}from'/@fs/${hook}';
function Surface(){useGlobalSmoothScroll();const navigate=useNavigate();const location=useLocation();
window.qa={get:getLenis,navigate,calls:0,times:[],position:()=>scrollY};
return <main style={{height:5000,background:'linear-gradient(#fcf8db,#b6dac5)'}}>
<h1 style={{margin:0}}>QA smooth scroll — {location.pathname}</h1>
<div id="target" style={{position:'absolute',top:1800}}>Anchor</div>
<div data-lenis-prevent style={{position:'fixed',right:10,top:100,width:100,height:100,overflow:'auto'}}>
<div style={{height:1000}}>Nested scroll</div></div></main>}
createRoot(document.getElementById('root')).render(<StrictMode><BrowserRouter><Surface/></BrowserRouter></StrictMode>);
`);
const server = await createServer({
  configFile: false, root: out, plugins: [react()],
  cacheDir: path.join(out, 'vite'),
  resolve: { alias: Object.fromEntries(['react', 'react-dom', 'react-router-dom', 'lenis'].map(n =>
    [n, path.join(root, 'apps/user-web/node_modules', n)])), dedupe: ['react', 'react-dom'] },
  server: { host: '127.0.0.1', port: 5203, strictPort: true, fs: { allow: [root] } },
});
const reports = [];
let browser;
async function instrument(page) {
  await page.waitForFunction(() => !!window.qa?.get());
  await page.evaluate(() => {
    const lenis = window.qa.get();
    const raf = lenis.raf.bind(lenis);
    lenis.raf = time => { window.qa.calls++; raf(time); };
  });
}
async function idle(page) {
  await page.waitForFunction(() => !window.qa.get()?.isScrolling);
  await page.waitForTimeout(150);
  const start = await page.evaluate(() => window.qa.calls);
  await page.waitForTimeout(1000);
  return (await page.evaluate(() => window.qa.calls)) - start;
}
async function sample(page, command) {
  return page.evaluate(async command => {
    const lenis = window.qa.get();
    const start = performance.now();
    const samples = [];
    if (command === 'programmatic') lenis.scrollTo('#target', { duration: .65 });
    else window.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, cancelable: true }));
    await new Promise(resolve => {
      function frame() {
        samples.push({ t: performance.now() - start, y: scrollY });
        if (performance.now() - start < 1500) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    return samples;
  }, command);
}
try {
  await server.listen();
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const reducedMotion of ['reduce', 'no-preference']) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion,
      isMobile: width === 390, hasTouch: width === 390 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5203/');
    await instrument(page);
    const initialIdle = await idle(page);
    const wheel = await sample(page, 'wheel');
    assert.equal(wheel.at(-1).y, 540, 'Retain the .9 wheel multiplier');
    const afterWheelIdle = await idle(page);
    await page.evaluate(() => window.qa.get().stop());
    await page.mouse.move(40, 400);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => scrollY), 540, 'A modal stop still blocks wheel input');
    await page.evaluate(() => window.qa.get().start());
    const programmatic = await sample(page, 'programmatic');
    assert.equal(programmatic.at(-1).y, 1800, 'Programmatic anchors still finish');
    const afterCommandIdle = await idle(page);
    if (!baseline) {
      assert.equal(initialIdle, 0, 'Do not tick Lenis while idle');
      assert.equal(afterWheelIdle, 0, 'Stop ticking once the wheel animation completes');
      assert.equal(afterCommandIdle, 0, 'Stop ticking once the anchor animation completes');
      for (const samples of [wheel, programmatic]) {
        assert(samples.some(p => p.t > 40 && p.t < 250 && p.y > (samples === wheel ? 0 : 540) && p.y < samples.at(-1).y),
          'Keep intermediate smooth positions under both motion preferences');
      }
    }
    // Completion can synchronously issue another scroll; it must not fork the loop.
    await page.evaluate(() => new Promise(resolve => {
      const lenis = window.qa.get();
      lenis.scrollTo(2000, { duration: .2, onComplete: () => {
        lenis.scrollTo(1800, { duration: .2, onComplete: resolve });
      } });
    }));
    assert.equal(await page.evaluate(() => scrollY), 1800);
    if (!baseline) assert.equal(await idle(page), 0, 'A chained completion returns to sleep');
    // Native keyboard, nested scrolling, interruption, Back and a second wake after idle.
    await page.mouse.move(40, 400);
    const nested = page.locator('[data-lenis-prevent]');
    const outerY = await page.evaluate(() => scrollY);
    await nested.hover();
    await page.mouse.wheel(0, 100);
    await expect.poll(() => nested.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    assert.equal(await page.evaluate(() => scrollY), outerY);
    await page.mouse.move(40, 400);
    await page.keyboard.press('PageDown');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(outerY);
    await page.waitForTimeout(200);
    if (width === 390) {
      const beforeTouch = await page.evaluate(() => scrollY);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 40, y: 650 }] });
      for (let y = 620; y >= 350; y -= 30) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 40, y }] });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeTouch);
      await cdp.detach();
    }
    await page.evaluate(() => { window.qa.get().scrollTo(3500, { duration: 1.15 }); window.qa.navigate('/chat'); });
    await page.waitForFunction(() => location.pathname === '/chat' && window.qa.get() === null);
    assert.equal(await page.evaluate(() => document.documentElement.className.includes('lenis')), false);
    await page.evaluate(() => window.qa.navigate('/books'));
    await instrument(page);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.evaluate(() => window.qa.get().scrollTo(1000, { duration: .65 }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1000);
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/chat' && window.qa.get() === null);
    await page.goBack();
    await instrument(page);
    await page.evaluate(() => window.qa.navigate('/orders/qa'));
    await page.waitForFunction(() => location.pathname === '/orders/qa' && window.qa.get() === null);
    assert.deepEqual(errors, []);
    reports.push({ width, reducedMotion, initialIdle, afterWheelIdle, afterCommandIdle, wheel, programmatic });
    await page.screenshot({ path: path.join(out, `${width}-${reducedMotion}.png`) });
    await page.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, profiles: reports.map(({ wheel: _wheel, programmatic: _programmatic, ...r }) => r) }, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
