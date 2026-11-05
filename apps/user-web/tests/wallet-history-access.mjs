// Read-only synthetic wallet history: denied cache versus temporary read failure.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-wallet-history-access');
await mkdir(out, { recursive: true });
const baseline = process.env.WALLET_HISTORY_BASELINE === '1';
const origin = 'http://127.0.0.1:4231';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.WALLET_HISTORY_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4231, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['refresh', 'next-page']) for (const failure of [403, 503]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], cursors = [];
    page.on('pageerror', error => errors.push(error.message));
    let status = 200;
    const now = new Date().toISOString();
    const summary = { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND', available: 75000,
      transactionHeld: 0, withdrawalHeld: 0, total: 75000, serverTime: now,
      topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: true, vnpayEnabled: false };
    const rows = (offset, count) => Array.from({ length: count }, (_, i) => ({ journalId: id(offset + i),
      withdrawalId: id(200 + offset + i), withdrawalState: 'Requested', topupId: null, orderId: null,
      type: 'WithdrawalHold', amount: -15000, balanceAfter: 75000, postedAt: now,
      demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND' }));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      assert.equal(request.method(), 'GET', 'Only synthetic login and reads are permitted');
      if (p === '/api/v1/me/wallet/history') {
        const cursor = url.searchParams.get('cursor');
        cursors.push(cursor);
        if (status !== 200) return route.fulfill({ status, json: { code: 'QA_READ_FAILURE' } });
        assert.equal(url.searchParams.get('limit'), '20');
        if (cursor) assert.equal(cursor, id(119));
        return route.fulfill({ json: { items: cursor ? rows(120, 1) : rows(100, 20), nextCursor: cursor ? null : id(119) } });
      }
      if (p === '/api/v1/me/wallet') return route.fulfill({ json: summary });
      if (p === '/api/v1/me/withdrawals' || p === '/api/v1/me/topups') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fwallet');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const history = page.getByRole('region', { name: 'Lịch sử giao dịch', exact: true });
    const pager = page.getByRole('navigation', { name: 'Điều hướng phân trang', exact: true });
    await expect(history.locator('li')).toHaveCount(10);
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    await pager.getByRole('button', { name: 'Trang 2', exact: true }).click();
    await expect(pager.getByRole('button', { name: 'Trang 2', exact: true })).toHaveAttribute('aria-current', 'page');
    status = failure;
    if (mode === 'refresh') await page.getByRole('button', { name: 'Làm mới số dư ví', exact: true }).click();
    else await pager.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
    await expect(history.getByRole('alert')).toBeVisible();
    const hidden = !baseline && failure === 403;
    await expect(history.locator('li')).toHaveCount(hidden ? 0 : 10);
    await expect(pager).toHaveCount(hidden ? 0 : 1);
    await expect(history.getByLabel('Chưa có giao dịch', { exact: true })).toHaveCount(0);
    if (hidden) {
      await expect(history.getByText('Quyền xem lịch sử ví đã thay đổi. Kiểm tra phiên đăng nhập và thử lại.', { exact: true })).toBeVisible();
      await expect(history.getByText(/Các giao dịch hiện tại vẫn được giữ/)).toHaveCount(0);
    }
    await history.screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${mode}-${failure}-${width}.png`) });
    const readsBeforeRetry = cursors.length;
    status = 200;
    if (mode === 'refresh' || hidden) await history.getByRole('button', { name: 'Thử lại', exact: true }).click();
    else await pager.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
    await expect(history.getByRole('alert')).toHaveCount(0);
    await expect(history.locator('li')).toHaveCount(mode === 'next-page' && !hidden ? 1 : 10);
    if (mode === 'next-page') assert.equal(cursors[readsBeforeRetry], hidden ? null : id(119), 'Denied reads recover through refetch; temporary next-page errors retry the same cursor');
    await expect(pager).toBeVisible();
    await expect(history.getByText('Chờ duyệt', { exact: true })).toHaveCount(mode === 'next-page' && !hidden ? 1 : 10);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    checks.push({ width, mode, failure, deniedCacheHidden: hidden, recoveryReadOnly: true, reads: cursors.length });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
