// Production withdrawal retry, synthetic auth/HTTP only. No ledger, bank or DB writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-withdrawal-retry-permission');
await mkdir(out, { recursive: true });
const baseline = process.env.WITHDRAWAL_RETRY_BASELINE === '1';
const origin = 'http://127.0.0.1:4229';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.WITHDRAWAL_RETRY_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4229, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const status of baseline ? [403, 409] : [403, 408, 429, 503, 409]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const now = new Date().toISOString();
    let committed = false;
    const row = () => ({ id: id(10), ownerId: user.id, ownerName: user.displayName,
      ...JSON.parse(writes[0].body), state: 'Requested', fee: 0, version: 1, approverId: null, payoutRef: null,
      createdAt: now, updatedAt: now, history: [{ state: 'Requested', at: now, note: 'Yêu cầu QA' }], processingMode: 'Manual', demoOnly: true });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === '/api/v1/me/withdrawals' && request.method() === 'POST') {
        writes.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (writes.length === 1) {
          if (status === 409) return route.fulfill({ status, json: { code: 'CONFLICT', message: 'Yêu cầu QA bị từ chối xác định.' } });
          committed = true;
          return route.abort('failed');
        }
        if (writes.length === 2) return route.fulfill({ status, json: { code: 'QA_REFUSAL', message: 'Lần kiểm tra QA chưa được phép.' } });
        if (writes[0].key !== writes.at(-1).key) return route.fulfill({ status: 409, json: { code: 'QA_DIFFERENT_KEY' } });
        return route.fulfill({ json: { id: id(11), entityType: 'Withdrawal', entityId: id(10), version: 1, state: 'Requested', serverTime: now, demoOnly: true } });
      }
      assert.equal(request.method(), 'GET', 'Only the synthetic withdrawal command is permitted');
      if (p === '/api/v1/me/wallet') return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND',
        available: committed ? 400000 : 500000, transactionHeld: 0, withdrawalHeld: committed ? 100000 : 0,
        total: 500000, serverTime: now, topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: true, vnpayEnabled: false } });
      if (p === '/api/v1/me/withdrawals') return route.fulfill({ json: { items: committed ? [row()] : [], nextCursor: null } });
      if (p === `/api/v1/me/withdrawals/${id(10)}`) return route.fulfill({ json: row() });
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
    await page.getByRole('button', { name: 'Rút tiền', exact: true }).click();
    const entry = page.getByRole('dialog', { name: 'Rút tiền từ ví', exact: true });
    await entry.getByLabel('Số tiền muốn rút', { exact: true }).fill('100000');
    await entry.getByLabel('Lý do rút tiền', { exact: false }).selectOption('Personal');
    await entry.getByLabel('Ngân hàng', { exact: true }).fill('Ngân hàng QA');
    await entry.getByLabel('Số tài khoản', { exact: true }).fill('000000123456');
    await entry.getByLabel('Tên chủ tài khoản', { exact: true }).fill('NGUOI DUNG QA');
    await entry.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
    const review = page.getByRole('dialog', { name: 'Xác nhận rút tiền', exact: true });
    await review.getByRole('button', { name: 'Xác nhận gửi yêu cầu', exact: true }).evaluate(button => { button.click(); button.click(); });
    const retry = review.getByRole('button', { name: 'Kiểm tra lại yêu cầu', exact: true });
    if (status === 409) {
      await expect(entry).toBeVisible();
      await expect(entry.getByLabel('Số tiền muốn rút', { exact: true })).toBeEnabled();
      await expect(entry.getByLabel('Số tiền muốn rút', { exact: true })).toHaveValue('100.000');
      assert.equal(writes.length, 1, 'Definitive refusal releases editing without duplicate requests');
    } else {
      await expect(retry).toBeEnabled();
      assert.equal(writes.length, 1, 'Synchronous duplicate submit is coalesced');
      await retry.click();
      await expect.poll(() => writes.length).toBe(2);
      if (baseline && status === 403) {
        await expect(entry).toBeVisible();
        await expect(entry.getByLabel('Số tiền muốn rút', { exact: true })).toBeEnabled();
        await entry.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
        await review.getByRole('button', { name: 'Xác nhận gửi yêu cầu', exact: true }).click();
        await expect.poll(() => writes.length).toBe(3);
        assert.equal(writes[0].key !== writes[2].key, true, 'Baseline loses the original intent after permission refusal');
      } else {
        await expect(retry).toBeEnabled();
        await expect(entry).not.toBeVisible();
        await expect(review.getByRole('button', { name: 'Chỉnh sửa', exact: true })).toHaveCount(0);
        await expect(review.getByText('000000123456', { exact: true })).toBeVisible();
        if (status === 403) await review.screenshot({ path: path.join(out, `pending-${width}.png`) });
        await retry.click();
        await expect(page.getByRole('dialog', { name: 'Chi tiết rút tiền', exact: true })).toBeVisible();
        assert.equal(writes.length, 3);
        assert.equal(writes.every(write => JSON.stringify(write) === JSON.stringify(writes[0])), true, 'Every retry retains exact key and immutable body');
      }
    }
    assert.deepEqual(errors, []);
    checks.push({ width, status, requests: writes.length, retainsIntent: status !== 409 ? !baseline : undefined,
      definitiveRefusalEditable: status === 409 || undefined });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
