// Frontend-only wallet summary read states; no topup, payment or ledger writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-wallet-summary-read-states');
await mkdir(out, { recursive: true });
const baseline = process.env.WALLET_STATE_BASELINE === '1';
const origin = 'http://127.0.0.1:4228';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.WALLET_STATE_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4228, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['initial-error', 'cached-error', 'zero', 'nonzero']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let status = 200, reads = 0, hold = true, release;
    const summary = { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND',
      available: mode === 'zero' ? 0 : 75000, transactionHeld: mode === 'zero' ? 0 : 25000,
      withdrawalHeld: 0, total: mode === 'zero' ? 0 : 100000, serverTime: new Date().toISOString(),
      topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: false };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      assert.equal(request.method(), 'GET', 'Read recovery must not create payment intents or mutate ledger/provider');
      if (p === '/api/v1/me/wallet') {
        reads++;
        if (hold) await new Promise(resolve => { release = resolve; });
        return route.fulfill(status === 200 ? { json: summary } : { status, json: { code: 'QA_UNAVAILABLE' } });
      }
      if (p === '/api/v1/me/topups' || p === '/api/v1/me/wallet/history') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fwallet');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const card = page.getByRole('region', { name: /^Thẻ ví thành viên/ });
    const held = card.getByText('Đang ký quỹ', { exact: true }).locator('..').locator('span').last();
    const available = card.locator('[class*="cardAvailableValue"]');
    await expect(card).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    await expect.poll(() => typeof release).toBe('function');
    await expect(available).toHaveText('Đang tải…');
    if (baseline) await expect(held).toHaveText(/^0\D*$/);
    else await expect(held).toHaveText('Đang tải…');
    status = mode === 'initial-error' ? 503 : 200;
    hold = false; release();
    const refresh = page.getByRole('button', { name: 'Làm mới số dư ví', exact: true });
    if (mode !== 'initial-error') {
      await expect(held).toHaveText(mode === 'zero' ? /^0\D*$/ : /25\.000/);
      await expect(available).toHaveText(mode === 'zero' ? /^0\D*$/ : /75\.000/);
      if (mode === 'cached-error') { status = 503; await refresh.click(); }
    }
    if (mode.endsWith('error')) {
      await expect(available).toHaveText('—');
      if (baseline) await expect(held).toHaveText(mode === 'initial-error' ? /^0\D*$/ : /25\.000/);
      else {
        await expect(held).toHaveText('—');
        await expect(page.getByText('Chưa tải được số dư ví và tiền ký quỹ. Hãy làm mới để thử lại.', { exact: true })).toBeVisible();
        await expect(refresh).toHaveAttribute('aria-describedby', 'wallet-summary-error');
      }
      await card.screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${mode}-${width}.png`) });
      if (!baseline) await card.locator('..').screenshot({ path: path.join(out, `recovery-${mode}-${width}.png`) });
      status = 200; await refresh.click();
      await expect(held).toHaveText(/25\.000/);
      await expect(available).toHaveText(/75\.000/);
      if (!baseline) await expect(page.locator('#wallet-summary-error')).toHaveCount(0);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    checks.push({ width, mode, reads, loadingIsUnknown: !baseline, errorIsUnknown: !baseline,
      confirmedZeroPreserved: mode === 'zero', recoveryReadOnly: true });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
