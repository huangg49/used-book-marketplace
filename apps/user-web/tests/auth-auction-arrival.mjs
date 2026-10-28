// Isolated frontend regression: synthetic Login only, no API/database writes.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const appRoot = path.join(root, 'apps/user-web')
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url))
const webRequire = createRequire(new URL('../package.json', import.meta.url))
const { chromium } = require('playwright')
const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href)
const origin = 'http://127.0.0.1:5197'
const evidence = path.join(root, process.env.AUTH_MOTION_EVIDENCE ?? '.impeccable/review/auth-auction-arrival')
await mkdir(evidence, { recursive: true })
process.env.VITE_API_BASE_URL = `${origin}/api/v1`
process.chdir(appRoot)
let server, browser, lastPage
const errors = [], checks = []
try {
  server = await createServer({ root: appRoot, server: { host: '127.0.0.1', port: 5197, strictPort: true } })
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) })
  const viewports = [['desktop', { width: 1366, height: 768 }], ['mobile', { width: 390, height: 844 }]];
  if (process.env.AUTH_MOTION_VIDEO) viewports.push(['user-465', { width: 465, height: 628 }]);
  for (const [name, viewport] of viewports) {
    const mobile = viewport.width <= 600;
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce',
      ...(process.env.AUTH_MOTION_VIDEO ? { recordVideo: { dir: path.join(root, '.tmp/auth-breeze-video'), size: viewport } } : {}) })
    // Synthetic HTTP fixtures have no realtime server; do not let Socket.IO
    // recurse through the dev proxy targeting this same frontend origin.
    await context.routeWebSocket(/\/socket\.io\//, socket => socket.close())
    await context.route(`${origin}/socket.io/**`, route =>
      route.fulfill({ status: 503, json: { message: 'Frontend-only QA: realtime unavailable' } }))
    await context.route(`${origin}/api/v1/**`, route => {
      if (new URL(route.request().url()).pathname === '/api/v1/auth/login') {
        if (route.request().postDataJSON().password !== 'QA-only-pass') return route.fulfill({ status: 401, json: { code: 'INVALID_CREDENTIALS' } })
        return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'q'.repeat(43), expiresIn: 900,
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'reader@example.test', displayName: 'Bạn đọc QA', status: 'ACTIVE', roles: ['MEMBER'] } } })
      }
      return route.fulfill({ status: 503, json: { message: 'QA isolated: no real API' } })
    })
    await context.addInitScript(() => {
      window.__arrival = { paper: false, curtain: false, coveredSeedSectors: 0, earlyStamp: false }
      new MutationObserver(records => {
        if (document.querySelector('[data-paper-storm]')?.dataset.renderer === 'preparing-intact') {
          const stamp = document.querySelector('[data-auth-stamp]');
          if (stamp && getComputedStyle(stamp).visibility !== 'hidden') window.__arrival.earlyStamp = true;
          if (new URL(location.href).searchParams.get('qaCapture') === 'before') window.__releaseCapture?.();
        }
        for (const record of records) for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue
          for (const [selector, key] of [['[data-paper-storm]', 'paper'], ['[data-auction-entrance]', 'curtain']]) {
            if (node.matches(selector) || node.querySelector(selector)) window.__arrival[key] = true
          }
        }
        if (document.querySelector('[data-paper-storm]')?.dataset.phase === 'covered') {
          const sectors = new Set()
          for (const svg of document.querySelectorAll('[data-paper-breeze] [data-breeze-kind="seed"] > svg')) {
            const box = svg.getBoundingClientRect(), x = box.left + box.width / 2, y = box.top + box.height / 2
            if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) sectors.add(`${Math.floor(x / innerWidth * 3)},${Math.floor(y / innerHeight * 3)}`)
          }
          window.__arrival.coveredSeedSectors = Math.max(window.__arrival.coveredSeedSectors, sectors.size)
        }
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-phase', 'data-renderer', 'style'] })
      document.addEventListener('DOMContentLoaded', () => {
        const label = document.createElement('div')
        label.textContent = 'QA · Login giả lập · không DB'
        Object.assign(label.style, { position: 'fixed', bottom: '0', right: '0', zIndex: '99999', color: '#5c0202', background: '#fcf8db', padding: '6px', font: '12px sans-serif' })
        document.body.append(label)
      })
    })
    const page = await context.newPage()
    lastPage = page
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.url().includes('/illustrations/auction-curtain/')) checks.push(`art request: ${name}`) })
    await page.goto(`${origin}/login?returnUrl=${encodeURIComponent('/auctions?buyNow=1#auction-list-title')}`)
    await page.getByRole('textbox', { name: /Email/ }).fill('reader@example.test')
    await page.getByRole('textbox', { name: /Mật khẩu/ }).fill('wrong-fixture-pass')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.getByText('Chưa đăng nhập được. Kiểm tra email và mật khẩu rồi thử lại.').waitFor()
    assert.equal(await page.locator('[data-paper-storm]').count(), 0)
    assert.equal(await page.locator('[data-paper-breeze]').getAttribute('hidden'), '')
    assert.ok(await page.getByRole('textbox', { name: /Mật khẩu/ }).inputValue())
    await page.getByRole('textbox', { name: /Mật khẩu/ }).fill('QA-only-pass')
    await page.waitForFunction(() => document.querySelector('[data-auth-paper]')?.dataset.flightReady === 'true')
    const scrubbed = await page.evaluate(async () => {
      // Exercise the serializer with a visible password and populated defaults.
      const input = document.querySelector('input[name="password"]') ?? document.querySelector('input[type="password"]');
      input.type = 'text'; input.defaultValue = 'QA-only-pass';
      const serialize = XMLSerializer.prototype.serializeToString;
      let serialized = '';
      XMLSerializer.prototype.serializeToString = function(node) { serialized = serialize.call(this, node); return serialized; };
      try {
        const { snapshotPaper } = await import('/src/components/auth/wind/capture.mjs');
        await snapshotPaper(document.querySelector('[data-auth-paper]'));
        return !serialized.includes('QA-only-pass') && !serialized.includes('reader@example.test');
      } finally { XMLSerializer.prototype.serializeToString = serialize; input.type = 'password'; input.defaultValue = ''; }
    });
    assert.equal(scrubbed, true, 'even revealed credentials/default values never enter the paper texture');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.locator('[data-paper-storm]').waitFor({ state: 'attached' })
    await page.waitForFunction(() => document.querySelector('[data-paper-storm]')?.dataset.renderer === 'webgl-intact')
    assert.equal(await page.locator('[data-auth-flight]').getAttribute('data-actors'), '3')
    assert.equal(await page.locator('[data-paper-storm] .half').count(), 0)
    if (process.env.AUTH_MOTION_VIDEO) {
      await page.screenshot({ path: path.join(evidence, `${name}-stamp.png`) });
      await page.waitForFunction(() => Number(document.querySelector('[data-auth-flight]')?.dataset.flightTime) >= 650);
      await page.screenshot({ path: path.join(evidence, `${name}-flight.png`) });
    }
    assert.equal(await page.locator('[data-paper-breeze]').getAttribute('data-phase'), 'gust')
    await page.waitForURL('**/auctions?buyNow=1#auction-list-title')
    await page.locator('[data-paper-storm]').waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.tagName === 'H1')
    assert.deepEqual(await page.evaluate(() => ({ paper: window.__arrival.paper, curtain: window.__arrival.curtain })), { paper: true, curtain: false })
    const coveredSectors = await page.evaluate(() => window.__arrival.coveredSeedSectors)
    assert.ok(coveredSectors >= 6, 'seeds span the full-screen paper during route coverage too')
    assert.equal(checks.filter(c => c === `art request: ${name}`).length, 0, 'no curtain art loaded behind paper')
    assert.equal(await page.locator('[inert]').count(), 0)
    assert.equal(await page.evaluate(() => document.body.style.overflow), '')
    const tail = page.locator('[data-paper-breeze]')
    assert.equal(await tail.getAttribute('data-phase'), 'lingering')
    assert.equal(await tail.evaluate(root => Array.from(root.querySelectorAll(':scope > div > div')).every(seed =>
      seed.getAnimations().filter(animation => animation.effect.getKeyframes().some(frame => 'transform' in frame)).length === 1)), true,
    'reveal retains the original flight rather than replacing its position/velocity')
    assert.equal(await tail.locator('[data-breeze-kind="seed"] svg').count(), mobile ? 16 : 26)
    assert.equal(await tail.locator('[data-breeze-kind="dust"] svg').count(), mobile ? 8 : 14)
    assert.equal(await tail.locator('[data-breeze-kind="seed"] [data-breeze-light]').count(), mobile ? 4 : 6)
    assert.equal(await tail.locator('filter').count(), 0, 'glow uses small radial assets, not costly blur filters')
    const occupied = await tail.evaluate(root => {
      const sectors = new Set()
      for (const svg of root.querySelectorAll('[data-breeze-kind="seed"] > svg')) {
        const box = svg.getBoundingClientRect()
        const x = box.left + box.width / 2, y = box.top + box.height / 2
        if (x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) sectors.add(`${Math.floor(x / innerWidth * 3)},${Math.floor(y / innerHeight * 3)}`)
      }
      return sectors.size
    })
    // The newly approved longer flight reveals at ~2.2s, later than the old tear.
    // Flutter is continuous: require broad coverage rather than one exact phase.
    assert.ok(occupied >= (mobile ? 6 : 8), `page-wide seeds at arrival: ${name} ${occupied}/9`)
    assert.equal(await tail.evaluate(node => getComputedStyle(node).pointerEvents), 'none')
    await page.screenshot({ path: path.join(evidence, `${name}-lingering.png`) })
    await page.getByLabel('Có giá mua ngay').click()
    assert.equal(await page.locator('[data-auction-entrance]').count(), 0, 'filter after paper does not start curtain')
    assert.equal(await tail.getAttribute('hidden'), null, 'same-page filters preserve the fading breeze')
    await page.screenshot({ path: path.join(evidence, `${name}.png`) })
    if (name === 'desktop' && !process.env.AUTH_MOTION_VIDEO) {
      // Simulate a suspended compositor: a wall-clock timer must not remove
      // still-visible seeds before their native fade completes.
      await tail.evaluate(root => {
        for (const animation of root.getAnimations({ subtree: true })) {
          if (animation.effect.getKeyframes().every(frame => !('transform' in frame))) animation.pause()
        }
      })
      await page.waitForTimeout(2600)
      assert.equal(await tail.getAttribute('hidden'), null, 'paused fades remain until truly transparent')
      await tail.evaluate(root => {
        for (const animation of root.getAnimations({ subtree: true })) if (animation.playState === 'paused') animation.play()
      })
      checks.push('desktop: suspended fade survives beyond 2500ms without abrupt disposal; resumes and cleans up on animation completion')
    }
    await page.waitForFunction(() => document.querySelector('[data-paper-breeze]')?.hidden)
    assert.equal(await tail.locator('svg').count(), 0, 'finite breeze releases all seed elements')
    checks.push(`${name}: page-wide gust; occupied sectors during full-screen coverage ${coveredSectors}/9, after paper ${occupied}/9; 16/26 seeds, 8/14 dust, 4/6 lit seeds; original flight retained; controls usable; nominal 2500ms fade with native completion cleanup`)
    if (process.env.AUTH_MOTION_VIDEO) {
      const video = page.video()
      await context.close()
      await video.saveAs(path.join(evidence, `${name}.webm`))
      continue
    }
    await page.getByRole('banner').getByRole('link', { name: 'Trang chủ Lật lại' }).click()
    await page.waitForURL(`${origin}/`)
    await page.getByRole('heading', { level: 1, name: 'SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI.' }).waitFor()
    if (name === 'mobile') await page.getByRole('banner').getByRole('button', { name: /menu|điều hướng/i }).click()
    await page.getByRole('navigation', { name: name === 'mobile' ? 'Điều hướng trên điện thoại' : 'Điều hướng chính', exact: true })
      .getByRole('link', { name: 'Đấu giá', exact: true }).click()
    await page.getByRole('heading', { level: 1, name: 'Đấu giá sách cũ' }).waitFor()
    assert.equal(await page.locator('[data-auction-entrance]').count(), 0, 'approved compact auction page has no curtain')
    checks.push(`${name}: rejected Login preserves draft; successful Login paper only, query/hash retained, focus/scroll restored; filter no curtain; subsequent navbar visit keeps compact auction page`)
    await page.reload()
    await page.getByRole('heading', { level: 1, name: 'Đấu giá sách cũ' }).waitFor()
    assert.equal(await page.locator('[data-auction-entrance]').count(), 0, 'approved compact auction page has no curtain')
    checks.push(`${name}: direct reload keeps compact auction page`)
    // Leaving during the harmless tail must still clear every decoration.
    await page.goto(`${origin}/login?returnUrl=%2Fauctions`)
    await page.getByRole('textbox', { name: /Email/ }).fill('reader@example.test')
    await page.getByRole('textbox', { name: /Mật khẩu/ }).fill('QA-only-pass')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('[data-paper-breeze]')?.dataset.phase === 'lingering')
    await page.getByRole('banner').getByRole('link', { name: 'Trang chủ Lật lại' }).click()
    await page.getByRole('heading', { level: 1, name: 'SÁCH MỚI. CHƯƠNG MỚI. CÙNG LẬT LẠI.' }).waitFor()
    assert.equal(await tail.getAttribute('hidden'), '')
    assert.equal(await tail.locator('svg').count(), 0)
    await page.goto(`${origin}/login?returnUrl=%2Fauctions`)
    await page.getByRole('textbox', { name: /Email/ }).fill('reader@example.test')
    await page.getByRole('textbox', { name: /Mật khẩu/ }).fill('QA-only-pass')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await page.locator('[data-paper-storm]').waitFor({ state: 'attached' })
    await page.goBack()
    await page.locator('[data-paper-storm]').waitFor({ state: 'detached' })
    assert.equal(await tail.getAttribute('hidden'), '')
    assert.equal(await page.locator('[inert]').count(), 0)
    checks.push(`${name}: leaving during lingering/Back during flight clears breeze and unlocks page`)
    await page.addInitScript(() => {
      if (!new URL(location.href).searchParams.has('qaCapture')) return;
      const gate = new Promise(resolve => { window.__releaseCapture = resolve; });
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function() {
        if (this.src.startsWith('data:image/svg+xml')) await gate;
        return decode.call(this);
      };
    });
    for (const failure of ['resize', 'context-loss', 'prepare-before-timeout', 'prepare-after-timeout', 'capture-unavailable']) {
      const delayed = failure.startsWith('prepare-');
      if (failure === 'capture-unavailable') await page.addInitScript(() => {
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(kind, ...options) { return kind === '2d' ? null : getContext.call(this, kind, ...options); };
      });
      await page.goto(`${origin}/login?returnUrl=%2Fauctions${delayed ? '&qaCapture=' + (failure === 'prepare-before-timeout' ? 'before' : 'after') : ''}`);
      if (failure !== 'capture-unavailable' && !delayed) await page.waitForFunction(() => document.querySelector('[data-auth-paper]')?.dataset.flightReady === 'true');
      await page.getByRole('textbox', { name: /Email/ }).fill('reader@example.test');
      await page.getByRole('textbox', { name: /Mật khẩu/ }).fill('QA-only-pass');
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await page.locator('[data-paper-storm]').waitFor({ state: 'attached' });
      if (delayed) {
        assert.equal(await page.evaluate(() => window.__arrival.earlyStamp), false, 'stamp cannot hit early while capture/module is preparing');
        if (failure === 'prepare-after-timeout') await page.waitForFunction(() => document.querySelector('[data-paper-storm]')?.dataset.renderer === 'compositor-intact');
        await page.waitForFunction(() => ['webgl-intact', 'compositor-intact'].includes(document.querySelector('[data-paper-storm]')?.dataset.renderer));
        const rendering = await page.locator('[data-paper-storm]').getAttribute('data-renderer');
        await page.waitForFunction(renderer => {
          const stamp = document.querySelector('[data-auth-stamp]');
          return stamp && getComputedStyle(stamp).visibility === (renderer === 'webgl-intact' ? 'hidden' : 'visible');
        }, rendering, { timeout: 500 });
        if (failure === 'prepare-after-timeout') {
          await page.evaluate(() => window.__releaseCapture());
          await page.waitForTimeout(180);
          assert.equal(await page.locator('[data-paper-storm]').getAttribute('data-renderer'), 'compositor-intact', 'late mesh preparation cannot restart the running fallback');
          assert.equal(await page.locator('[data-auth-flight]').getAttribute('hidden'), '');
        }
      }
      if (failure === 'resize') await page.setViewportSize({ width: viewport.width - 20, height: viewport.height });
      if (failure === 'context-loss') {
        await page.waitForFunction(() => document.querySelector('[data-paper-storm]')?.dataset.renderer === 'webgl-intact');
        await page.locator('[data-auth-flight]').dispatchEvent('webglcontextlost');
      }
      if (failure === 'capture-unavailable') await page.waitForFunction(() => document.querySelector('[data-paper-storm]')?.dataset.renderer === 'compositor-intact');
      await page.waitForURL('**/auctions');
      await page.locator('[data-paper-storm]').waitFor({ state: 'detached' });
      await page.waitForFunction(() => document.activeElement?.tagName === 'H1');
      assert.equal(await page.locator('[inert]').count(), 0);
      assert.equal(await page.locator('[data-auction-entrance]').count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      checks.push(`${name}: ${failure} completes navigation, no curtain/inert/scroll lock survives`);
    }
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(path.join(evidence, process.env.AUTH_MOTION_VIDEO ? 'video-runtime.json' : 'runtime.json'), JSON.stringify({ date: '2026-10-14', fixture: 'synthetic frontend Login; no real API/DB', checks: checks.filter(c => !c.startsWith('art request:')), pageErrors: errors }, null, 2) + '\n')
  console.log(JSON.stringify({ status: 'PASS', checks: checks.filter(c => !c.startsWith('art request:')), evidence }, null, 2))
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: path.join(evidence, 'failure.png') })
    console.error(JSON.stringify({ url: lastPage.url(), headings: await lastPage.locator('h1').allTextContents(), errors,
      navigation: await lastPage.getByRole('banner').innerText() }))
  }
  throw error
} finally { await browser?.close(); await server?.close() }
