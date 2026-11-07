// Production pending count; synthetic GET pagination only, never withdrawal commands.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-pending-withdrawal-pagination');
await mkdir(out, { recursive: true });
const baseline = process.env.PENDING_WITHDRAWAL_BASELINE === '1';
const origin = 'http://127.0.0.1:4230';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.PENDING_WITHDRAWAL_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4230, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['cycle', 'partial-error', 'cancel', 'valid-pages']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], reads = [];
    page.on('pageerror', error => errors.push(error.message));
    const now = new Date().toISOString();
    let fail = true, release;
    const row = n => ({ id: id(n), ownerId: user.id, ownerName: user.displayName,
      amount: 100000, fee: 0, reason: 'Personal', reasonDetail: '', recipient: { bankName: 'Ngân hàng QA', accountNumber: '000000123456', accountHolder: 'NGUOI DUNG QA' },
      state: 'Requested', version: 1, approverId: null, payoutRef: null, createdAt: now, updatedAt: now,
      history: [], processingMode: 'Manual', demoOnly: true });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      assert.equal(request.method(), 'GET', 'Only synthetic login and reads are permitted');
      if (p === '/api/v1/me/withdrawals') {
        const cursor = url.searchParams.get('cursor');
        reads.push(cursor);
        assert.equal(url.searchParams.get('state'), 'Requested');
        assert.equal(url.searchParams.get('limit'), '100');
        if (mode === 'cancel' && reads.length === 1) await new Promise(resolve => { release = resolve; });
        // Bound the faulty baseline inside the fixture; never let a test flood even a fake endpoint.
        if (mode === 'cycle' && reads.length >= 6 || mode === 'partial-error' && fail && cursor)
          return route.fulfill({ status: 503, json: { code: 'QA_STOP' } });
        const cyclic = mode === 'cycle';
        const items = !cursor ? [row(10), row(11)] : cursor === id(40) ? [row(11), row(12)] : [row(13)];
        return route.fulfill({ json: { items, nextCursor: !cursor ? id(40) : cursor === id(40) ? id(41) : cyclic ? id(40) : null } });
      }
      if (p === '/api/v1/me/wallet') return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND',
        available: 500000, transactionHeld: 0, withdrawalHeld: 400000, total: 900000, serverTime: now,
        topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: true, vnpayEnabled: false } });
      if (p === '/api/v1/me/cart') return route.fulfill({ json: { id: user.id, version: 1, serverTime: now, items: [] } });
      if (p === '/api/v1/me/topups' || p === '/api/v1/me/wallet/history') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fwallet');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Ví & Ký Quỹ Thư Quán', exact: true })).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    if (mode === 'cancel') {
      await expect.poll(() => typeof release).toBe('function');
      if (width === 390) {
        const menu = page.getByRole('button', { name: /^Menu:/ });
        if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      }
      await page.getByRole('link', { name: 'Giỏ sách', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Giỏ sách', exact: true })).toBeVisible();
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/me/withdrawals');
      release(); await response;
      // A bounded observation after the held response proves the old chain continues
      // in the baseline; deterministic cancellation timing is also covered by unit tests.
      await page.waitForTimeout(500);
      assert.equal(reads.length, baseline ? 3 : 1, 'Leaving the wallet stops subsequent cursor reads');
    } else if (mode === 'cycle' || mode === 'partial-error') {
      const error = page.getByRole('alert').filter({ hasText: 'Chưa kiểm tra được yêu cầu rút tiền đang chờ.' });
      await expect(error).toBeVisible();
      await expect(page.getByRole('heading', { name: /^Bạn đang có/ })).toHaveCount(0);
      assert.equal(reads.length, mode === 'cycle' ? baseline ? 6 : 3 : 2);
      await error.screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${mode}-${width}.png`) });
      if (mode === 'partial-error') {
        fail = false;
        await error.getByRole('button', { name: 'Thử lại', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Bạn đang có 4 đơn rút tiền chờ duyệt', exact: true })).toBeVisible();
      }
    } else {
      await expect(page.getByRole('heading', { name: 'Bạn đang có 4 đơn rút tiền chờ duyệt', exact: true })).toBeVisible();
      assert.equal(reads.length, 3, 'All valid pages are still read and duplicate IDs counted once');
    }
    assert.deepEqual(errors, []);
    checks.push({ width, mode, reads: reads.length, boundedCycle: mode === 'cycle' ? !baseline : undefined,
      canceledContinuation: mode === 'cancel' ? !baseline : undefined, completeCountOnly: mode !== 'cancel' });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
