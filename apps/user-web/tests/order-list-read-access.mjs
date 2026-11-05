// Production /orders; all HTTP synthetic, no order/payment/chat mutations.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-order-list-read-access');
await mkdir(out, { recursive: true });
const baseline = process.env.ORDER_LIST_BASELINE === '1', origin = 'http://127.0.0.1:4244';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.ORDER_LIST_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4244, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = []; let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['refresh', 'next-page']) for (const failure of [403, 503]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], cursors = [];
    page.on('pageerror', error => errors.push(error.message));
    let status = 200;
    const rows = (offset, count) => Array.from({ length: count }, (_, i) => ({ id: id(offset + i),
      title: 'Sách QA đơn ' + (offset + i), version: 1, state: 'Preparing', role: i % 2 ? 'Seller' : 'Buyer', createdAt: new Date().toISOString() }));
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      assert.equal(request.method(), 'GET', 'Only synthetic login and reads permitted');
      if (p === '/api/v1/me/orders') {
        const cursor = url.searchParams.get('cursor'); cursors.push(cursor);
        assert.equal(url.searchParams.get('limit'), '20');
        if (cursor) assert.equal(cursor, id(119));
        if (status !== 200) return route.fulfill({ status, json: { code: 'QA_READ_FAILURE' } });
        return route.fulfill({ json: { items: cursor ? rows(120, 1) : rows(100, 20), nextCursor: cursor ? null : id(119) } });
      }
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Forders');
    await page.getByLabel(/^Email/).fill(user.email); await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const results = page.locator('#direct-order-results'), pager = page.getByRole('navigation', { name: 'Điều hướng phân trang', exact: true });
    await expect(results.locator('article')).toHaveCount(8);
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    await pager.getByRole('button', { name: 'Trang 3', exact: true }).click();
    await expect(results.locator('article')).toHaveCount(4);
    status = failure;
    if (mode === 'refresh') {
      await page.clock.setFixedTime(new Date(Date.now() + 20000));
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    } else await pager.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    const denied = !baseline && failure === 403;
    await expect(results.locator('article')).toHaveCount(denied ? 0 : 4);
    await expect(pager).toHaveCount(denied ? 0 : 1);
    const tabs = page.getByRole('tablist', { name: 'Lọc theo vai trò', exact: true });
    await expect(tabs.locator('span[class*="tabBadge"]')).toHaveCount(denied ? 0 : 3);
    await expect(page.getByRole('heading', { name: 'Bạn chưa có đơn hàng nào', exact: true })).toHaveCount(0);
    if (denied) await expect(page.getByText('Quyền xem đơn hàng đã thay đổi. Kiểm tra phiên đăng nhập và thử lại.', { exact: true })).toBeVisible();
    await page.getByRole('alert').screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${mode}-${failure}-${width}.png`) });
    const readsBefore = cursors.length; status = 200;
    if (mode === 'refresh' || denied) await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    else await pager.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(results.locator('article')).toHaveCount(mode === 'next-page' && !denied ? 5 : 4);
    if (mode === 'next-page') assert.equal(cursors[readsBefore], denied ? null : id(119), 'Denied reads refetch root; temporary pagination errors retry the cursor');
    await expect(pager).toBeVisible();
    await expect(tabs.locator('span[class*="tabBadge"]')).toHaveCount(3);
    // Filtering still uses loaded data and offers older pages when needed.
    await page.getByRole('tab', { name: /^Đơn mua/ }).click();
    await expect(results.locator('article')).toHaveCount(8);
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    checks.push({ width, mode, failure, deniedCacheHidden: denied, recoveryReadOnly: true, reads: cursors.length }); await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
