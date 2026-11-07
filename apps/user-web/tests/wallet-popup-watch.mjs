// Production Wallet popup lifecycle; HTTP is synthetic, including the provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-wallet-popup-watch');
await mkdir(out, { recursive: true });
const build = process.env.POPUP_WATCH_BUILD ? path.resolve(root, process.env.POPUP_WATCH_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.POPUP_WATCH_BASELINE === '1';
const origin = 'http://127.0.0.1:4213';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4213, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = new Date().toISOString(), expiresAt = new Date(Date.now() + 300000).toISOString();
const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['close-reopen', 'rejected', 'blocked', 'unmount']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], creations = [];
    let providerStubs = 0, release;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.qaPopup = { active: new Set(), calls: 0 };
      const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
      window.setInterval = (fn, delay, ...args) => {
        const token = interval(delay === 500 ? (...values) => { window.qaPopup.calls++; fn(...values); } : fn, delay, ...args);
        if (delay === 500) window.qaPopup.active.add(token);
        return token;
      };
      window.clearInterval = token => { window.qaPopup.active.delete(token); return clear(token); };
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (url.origin === 'https://sandbox.vnpayment.vn' && p === '/paymentv2/vpcpay.html') {
        providerStubs++;
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Payment fixture</title><p>QA only</p>' });
      }
      if (p.startsWith('/api/v1/')) {
        if (p === '/api/v1/auth/login') return route.fulfill({ json: {
          accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
        } });
        if (p === '/api/v1/me/topups/vnpay') {
          assert.equal(request.method(), 'POST');
          creations.push({ key: request.headers()['idempotency-key'], body: request.postData() });
          if (mode === 'unmount') await new Promise(resolve => { release = resolve; });
          if (mode === 'rejected') return route.fulfill({ status: 409, json: { code: 'InvalidState' } });
          return route.fulfill({ json: { entityId: id(2), paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?qa=fixture', expiresAt, serverTime: now } });
        }
        if (p === `/api/v1/me/topups/${id(2)}` || p === `/api/v1/me/topups/${id(2)}/vnpay-query`) {
          assert.equal(request.method(), p.endsWith('vnpay-query') ? 'POST' : 'GET');
          return route.fulfill({ json: { id: id(2), amount: 25000, state: 'Pending', credited: false, expiresAt, serverTime: now, updatedAt: now } });
        }
        assert.equal(request.method(), 'GET', 'Only fixture auth/topup commands may submit');
        if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
        if (p === '/api/v1/me/wallet') return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND',
          available: 100000, transactionHeld: 0, withdrawalHeld: 0, total: 100000, serverTime: now,
          topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true } });
        if (p === '/api/v1/me/wallet/history' || p === '/api/v1/me/topups' || p === '/api/v1/me/orders') return route.fulfill({ json: { items: [], nextCursor: null } });
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
    const active = () => page.evaluate(() => window.qaPopup.active.size);
    assert.equal(await active(), baseline ? 1 : 0);
    await page.evaluate(() => { window.qaPopup.calls = 0; });
    await page.waitForTimeout(2100);
    const idleCalls = await page.evaluate(() => window.qaPopup.calls);
    if (baseline) assert(idleCalls >= 3 && idleCalls <= 6, 'Observe the original idle loop');
    else assert.equal(idleCalls, 0);
    await page.getByRole('button', { name: 'Nạp tiền VNPay', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nạp tiền vào ví', exact: true });
    await dialog.locator('#topup-amount').fill('25000');
    const submit = dialog.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true });
    if (mode === 'blocked') {
      await page.evaluate(() => { window.open = () => null; });
      await submit.click();
      await expect(dialog.getByRole('alert')).toContainText('Trình duyệt đã chặn');
      assert.equal(creations.length, 0);
    } else {
      const pending = page.waitForEvent('popup'); await submit.click(); const popup = await pending;
      await expect.poll(() => creations.length).toBe(1);
      if (mode === 'unmount') {
        assert.equal(await active(), 1);
        await page.evaluate(() => {
          history.pushState({ key: 'qa-away', idx: (history.state?.idx ?? 0) + 1 }, '', '/orders');
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        await expect(page.getByRole('heading', { name: 'Đơn hàng của tôi', exact: true })).toBeVisible();
        assert.equal(await active(), 0);
        release(); await expect.poll(() => popup.isClosed()).toBe(true);
      } else if (mode === 'rejected') {
        await expect(dialog.getByRole('alert')).toBeVisible();
        await expect.poll(() => popup.isClosed()).toBe(true);
      } else {
        await expect.poll(() => providerStubs).toBe(1);
        await page.bringToFront(); assert.equal(await active(), 1);
        await popup.close(); await expect(submit).toBeEnabled();
        assert.equal(await active(), baseline ? 1 : 0);
        const again = page.waitForEvent('popup'); await submit.click(); const second = await again;
        await expect.poll(() => providerStubs).toBe(2);
        assert.deepEqual(creations[0], creations[1], 'Closing/reopening keeps the frozen intent');
        await page.bringToFront(); assert.equal(await active(), 1);
        await second.close(); await expect(submit).toBeEnabled();
      }
    }
    const after = await active();
    assert.equal(after, baseline && mode !== 'unmount' ? 1 : 0);
    assert.deepEqual(errors, []);
    checks.push({ width, mode, idleCallsIn2100ms: idleCalls, creations: creations.length, providerStubs, afterTimers: after, pageErrors: 0 });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
