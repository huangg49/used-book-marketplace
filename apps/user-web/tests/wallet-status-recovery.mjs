// Production UI with isolated HTTP fixtures; no DB, ledger or payment provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const origin = 'http://127.0.0.1:4293';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  preview: { host: '127.0.0.1', port: 4293, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    let mode = 'pending', reads = 0, denied = 0;
    const errors = [], commands = [];
    const now = new Date().toISOString(), expiresAt = new Date(Date.now() + 300000).toISOString();
    const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
      } });
      if (p === `/api/v1/me/topups/${id(2)}` || p === `/api/v1/me/topups/${id(2)}/vnpay-query`) {
        reads++;
        if (mode === 'unavailable') { denied++; return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } }); }
        return route.fulfill({ json: { id: id(2), amount: 25000, state: mode === 'paid' ? 'Succeeded' : 'Pending',
          credited: mode === 'paid', expiresAt, serverTime: now, updatedAt: now } });
      }
      if (p.startsWith('/api/v1/')) {
        if (request.method() !== 'GET') commands.push(p);
        if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
        if (p === '/api/v1/me/wallet') return route.fulfill({ json: {
          demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND', available: 100000,
          transactionHeld: 0, withdrawalHeld: 0, total: 100000, serverTime: now,
          topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true,
        } });
        if (['/api/v1/me/topups', '/api/v1/me/wallet/history'].includes(p)) return route.fulfill({ json: { items: [], nextCursor: null } });
        return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      }
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent('/wallet?topup=' + id(2)));
    await page.getByLabel(/^Email/).fill(actor.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const status = page.getByRole('status').filter({ has: page.getByRole('heading', { name: 'Chờ thanh toán', exact: true }) });
    await expect(status).toBeVisible();
    mode = 'unavailable';
    await expect.poll(() => denied, { timeout: 10000 }).toBeGreaterThan(0);
    const alert = page.getByRole('alert').filter({ hasText: 'Chưa xác minh được yêu cầu nạp này.' });
    await expect(alert).toBeVisible({ timeout: 10000 });
    await expect(status).toBeVisible();
    await expect(page.getByRole('timer', { name: 'Thời gian thanh toán còn lại', exact: true })).toBeVisible();
    const previous = reads;
    mode = 'paid';
    await alert.getByRole('button', { name: 'Kiểm tra lại', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Đã nạp ví thành công', exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
    assert.ok(reads > previous);
    assert.deepEqual(commands, []);
    assert.deepEqual(errors, []);
    checks.push({ width, failedReadRetainsStatus: true, explicitRetry: true, noMoneyCommands: true });
    await context.close();
  }
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
