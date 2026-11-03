// Production routes and command client; all HTTP responses/amounts are fixtures.
// No Nest process, ledger, DB, provider or real payment is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-exchange-wallet-cache');
await mkdir(out, { recursive: true });
const build = process.env.EXCHANGE_WALLET_BUILD ? path.resolve(root, process.env.EXCHANGE_WALLET_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.EXCHANGE_WALLET_BASELINE === '1';
const origin = 'http://127.0.0.1:4207';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4207, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-03T03:00:00.000Z';
const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
const listing = n => ({ id: id(n), revisionId: id(n + 100), version: 1,
  book: { id: id(n + 200), title: 'Sách trao đổi QA', authors: ['Tác giả QA'], publisher: null,
    publicationYear: null, language: 'vi', edition: null, category: 'Văn học', isbn: null },
  mode: 'Both', condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '', readable: true,
  hasMissingPages: false, missingEssentialContent: false, description: 'Dữ liệu QA', salePrice: 50000, exchangeValue: 50000,
  seller: { id: id(n === 4 ? 1 : 2), displayName: 'Bạn đọc QA' }, photos: [], publishedAt: now,
  fulfillment: null, purchaseAvailability: { status: 'Available', expiresAt: null } });
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['success', 'rejected', 'lost-ack']) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date(now));
    let funded = false, walletReads = 0, release;
    const commands = [], errors = [];
    const exchange = () => ({ id: id(3), initiatorId: id(1), recipientId: id(2), initiatorListingId: id(4), recipientListingId: id(5),
      status: 'AcceptedAwaitingFunding', revision: 1, initiatorDeposit: 50000, recipientDeposit: 50000,
      diffAmount: 0, diffPayerId: null, createdAt: now, updatedAt: now,
      fundingDeadline: '2026-11-03T04:00:00.000Z', initiatorFundedAt: funded ? now : null });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
      } });
      if (p === `/api/v1/exchanges/${id(3)}/funding` && request.method() === 'POST') {
        commands.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        await new Promise(resolve => { release = resolve; });
        if (commands.length === 1 && mode === 'rejected') return route.fulfill({ status: 400, json: { code: 'INVALID_STATE', message: 'QA rejected' } });
        funded = true;
        if (commands.length === 1 && mode === 'lost-ack') return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
        return route.fulfill({ json: exchange() });
      }
      assert.equal(request.method(), 'GET', 'Only synthetic login/funding may submit commands');
      if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
      if (p === '/api/v1/me/wallet') {
        walletReads++;
        return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND',
          available: funded ? 50000 : 100000, transactionHeld: funded ? 50000 : 0, withdrawalHeld: 0, total: 100000,
          serverTime: now, topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true } });
      }
      if (p === '/api/v1/me/wallet/history' || p === '/api/v1/me/topups') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p === '/api/v1/me/purchase-conversations' || p === `/api/v1/exchanges/${id(3)}/messages`) return route.fulfill({ json: [] });
      if (p === `/api/v1/exchanges/${id(3)}`) return route.fulfill({ json: exchange() });
      if (p === '/api/v1/listings/' + id(4)) return route.fulfill({ json: listing(4) });
      if (p === '/api/v1/listings/' + id(5)) return route.fulfill({ json: listing(5) });
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await page.goto(origin + '/wallet');
    await page.getByLabel(/^Email/).fill(actor.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const balance = page.locator('[class*="cardAvailableValue"]');
    await expect(balance).toContainText('100.000');
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    // Enter the existing legacy route without reloading the document/cache.
    await page.evaluate(path => {
      history.pushState({ key: 'qa-exchange', idx: (history.state?.idx ?? 0) + 1 }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, '/exchange/' + id(3));
    const action = page.locator('#exchange-actions').getByRole('button', { name: 'Đặt cọc mô phỏng', exact: true });
    await expect(action).toBeVisible();
    const menu = page.getByRole('region', { name: 'Menu tài khoản', exact: true });
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText('100.000');
      await page.keyboard.press('Escape');
    }
    const beforeCommand = walletReads;
    await action.click();
    const dialog = page.getByRole('dialog', { name: 'Đặt cọc mô phỏng', exact: true });
    await dialog.getByRole('button', { name: 'Đặt cọc mô phỏng', exact: true }).click();
    await expect.poll(() => commands.length).toBe(1);
    await page.waitForTimeout(100);
    assert.equal(walletReads, beforeCommand, 'Do not refresh wallet optimistically before an ACK');
    release();
    if (mode === 'rejected') {
      await expect(dialog.getByText('QA rejected', { exact: true })).toBeVisible();
      assert.equal(walletReads, beforeCommand);
      await dialog.getByRole('button', { name: 'Đặt cọc mô phỏng', exact: true }).click();
      await expect.poll(() => commands.length).toBe(2); release();
    } else if (mode === 'lost-ack') {
      const recovery = page.getByRole('region', { name: 'Khôi phục thao tác trao đổi', exact: true });
      await expect(recovery.getByRole('button', { name: 'Thử lại thao tác trước', exact: true })).toBeVisible();
      assert.equal(walletReads, beforeCommand, 'An unknown outcome does not invalidate wallet views');
      await recovery.getByRole('button', { name: 'Thử lại thao tác trước', exact: true }).click();
      await expect.poll(() => commands.length).toBe(2); release();
      assert.equal(commands[0].key, commands[1].key, 'Retry retains the original intent key');
      assert.equal(commands[0].body, commands[1].body, 'Retry retains the original body');
    }
    await expect(action).toHaveCount(0);
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Khôi phục thao tác trao đổi', exact: true })).toHaveCount(0);
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText(baseline ? '100.000' : '50.000');
      await page.keyboard.press('Escape');
    }
    await page.goBack();
    await expect(balance).toContainText(baseline ? '100.000' : '50.000');
    if (mode === 'success') await page.screenshot({ path: path.join(out, `wallet-${width}${baseline ? '-before' : ''}.png`) });
    assert.deepEqual(errors, []);
    checks.push({ width, mode, commands: commands.length, walletReads, refreshedAfterAck: !baseline, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
