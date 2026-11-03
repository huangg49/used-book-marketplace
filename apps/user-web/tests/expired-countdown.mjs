// Production My Auctions; synthetic HTTP, controlled timer counts (not CPU/FPS).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-expired-countdown');
await mkdir(out, { recursive: true });
const build = process.env.EXPIRED_CLOCK_BUILD ? path.resolve(root, process.env.EXPIRED_CLOCK_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.EXPIRED_CLOCK_BASELINE === '1';
const origin = 'http://127.0.0.1:4212';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4212, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const epoch = Date.parse('2026-11-04T03:00:00.000Z'), iso = offset => new Date(epoch + offset).toISOString();
const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const phase of ['live', 'ended']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let reads = 0;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/socket.io/') return route.abort();
      if (p.startsWith('/api/v1/')) {
        if (p === '/api/v1/auth/login') return route.fulfill({ json: {
          accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
        } });
        assert.equal(request.method(), 'GET', 'Only synthetic login may submit');
        if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
        if (p === '/api/v1/me/auction-intakes' || p === '/api/v1/handover-points') return route.fulfill({ json: { items: [] } });
        if (p === '/api/v1/me/auctions') {
          reads++;
          return route.fulfill({ json: { items: Array.from({ length: 8 }, (_, index) => ({
            auction: { id: id(index + 10), listingId: id(index + 100), title: 'Phiên QA ' + index,
              state: phase === 'live' ? 'Active' : 'Sold', phase: phase === 'live' ? 'Live' : 'Ended',
              startPrice: 50000, step: 10000, buyNowPrice: null, currentPrice: 70000, minimumBid: phase === 'live' ? 80000 : null,
              bidderCount: 2, startAt: iso(-3600000), endAt: iso(phase === 'live' ? 5000 : -1000),
              pointName: 'Điểm QA', demoOnly: true },
            role: 'Bidder', leading: true, won: phase === 'ended', needsPayment: false, paymentDeadline: null,
          })), nextCursor: null, serverTime: iso(0) } });
        }
        if (p === '/api/v1/me/wallet') return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND',
          available: 100000, transactionHeld: 0, withdrawalHeld: 0, total: 100000, serverTime: iso(0),
          topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true } });
        if (p === '/api/v1/me/wallet/history' || p === '/api/v1/me/topups') return route.fulfill({ json: { items: [], nextCursor: null } });
        if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
        return route.fulfill({ status: 404, json: { code: 'NotFound' } });
      }
      if (url.origin === origin) return route.continue();
      throw new Error('Unexpected external traffic');
    });
    await page.goto(origin + '/wallet');
    await page.getByLabel(/^Email/).fill(actor.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.locator('[class*="cardAvailableValue"]')).toContainText('100.000');
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    const deviceTime = epoch + 10 * 86400000;
    await page.clock.install({ time: new Date(deviceTime) });
    await page.clock.pauseAt(new Date(deviceTime + 1000));
    await page.evaluate(() => {
      window.qaClock = { active: new Set(), calls: 0 };
      const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
      window.setInterval = (fn, delay, ...args) => {
        const token = interval(delay === 1000 ? (...values) => { window.qaClock.calls++; fn(...values); } : fn, delay, ...args);
        if (delay === 1000) window.qaClock.active.add(token);
        return token;
      };
      window.clearInterval = token => { window.qaClock.active.delete(token); return clear(token); };
      history.pushState({ key: 'qa-clock', idx: (history.state?.idx ?? 0) + 1 }, '', '/my-auctions');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    const rows = page.locator('article[class*="row"]');
    await expect.poll(async () => { await page.clock.runFor(1); return rows.count(); }).toBe(8);
    const active = () => page.evaluate(() => window.qaClock.active.size);
    const timersBefore = await active();
    assert.equal(timersBefore, baseline ? 16 : phase === 'live' ? 8 : 0);
    await page.evaluate(() => { window.qaClock.calls = 0; });
    await page.clock.runFor(2000);
    const callbacks = await page.evaluate(() => window.qaClock.calls);
    assert.equal(callbacks, baseline ? 32 : phase === 'live' ? 16 : 0);
    if (phase === 'live') {
      await expect(rows.first()).toContainText('Còn 00:03');
      await page.clock.runFor(4000);
      await expect(rows.first()).not.toContainText('Còn');
      assert.equal(await active(), baseline ? 16 : 0, 'Expired clocks stop; no local server transition is invented');
    } else await expect(rows.first()).toContainText('Bạn đã thắng và thanh toán');
    assert.equal(reads, 1, 'Ticks do not fetch or mutate auction state');
    await page.screenshot({ path: path.join(out, `my-auctions-${width}-${phase}${baseline ? '-before' : ''}.png`) });
    await page.goBack();
    await page.clock.runFor(100);
    await expect(page.locator('[class*="cardAvailableValue"]')).toContainText('100.000');
    assert.equal(await active(), 0, 'Unmount clears every countdown');
    assert.deepEqual(errors, []);
    checks.push({ width, phase, timersBefore, callbacksIn2Seconds: callbacks, afterExpiry: baseline ? 16 : 0, reads, pageErrors: 0 });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
