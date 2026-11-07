// Production UI/session, synthetic HTTP only. No DB, ledger or payment provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-wallet-credit-cache');
await mkdir(out, { recursive: true });
const build = process.env.WALLET_CREDIT_BUILD ? path.resolve(root, process.env.WALLET_CREDIT_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.WALLET_CREDIT_BASELINE === '1';
const pollingBaseline = process.env.WALLET_POLLING_BASELINE === '1';
const origin = 'http://127.0.0.1:4208';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4208, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z';
const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const entry of ['return', 'checkout', 'different-url']) for (const credited of [true, false]) {
    if (entry === 'different-url' && !credited) continue;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    // Freeze cache age only; polling, animations and browser timers still run.
    const measure = !baseline && entry === 'checkout' && credited;
    if (measure) await page.clock.install({ time: new Date(now) });
    else await page.clock.setFixedTime(new Date(now));
    let terminal = false, observedTerminal = false, walletReads = 0, creations = 0, providerStubs = 0;
    let statusReads = 0, reconciliationReads = 0, otherReads = 0;
    let polling;
    const errors = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    const topup = () => ({ id: id(2), amount: 25000, state: terminal ? 'Succeeded' : 'Pending', credited: terminal && credited,
      expiresAt: '2026-11-04T03:05:00.000Z', serverTime: now, updatedAt: now });
    // Context routing also contains the popup. Even the allowlisted destination
    // is fulfilled here: no request reaches sandbox.vnpayment.vn.
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (url.origin === 'https://sandbox.vnpayment.vn' && p === '/paymentv2/vpcpay.html') {
        providerStubs++;
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Payment HTTP fixture</title><p>QA only</p>' });
      }
      if (p.startsWith('/api/v1/')) {
        if (p === '/api/v1/auth/login') return route.fulfill({ json: {
          accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
        } });
        if (p === '/api/v1/me/topups/vnpay' && request.method() === 'POST') {
          creations++;
          return route.fulfill({ json: { entityId: id(2),
            paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?qa=fixture',
            expiresAt: '2026-11-04T03:05:00.000Z', serverTime: now } });
        }
        if (p === `/api/v1/me/topups/${id(2)}` || p === `/api/v1/me/topups/${id(2)}/vnpay-query`) {
          assert.equal(request.method(), p.endsWith('/vnpay-query') ? 'POST' : 'GET');
          if (request.method() === 'POST') reconciliationReads++;
          else statusReads++;
          if (terminal) observedTerminal = true;
          return route.fulfill({ json: topup() });
        }
        if (p === `/api/v1/me/topups/${id(3)}` || p === `/api/v1/me/topups/${id(3)}/vnpay-query`) {
          otherReads++;
          return route.fulfill({ json: { ...topup(), id: id(3), amount: 17000, state: 'Pending', credited: false } });
        }
        assert.equal(request.method(), 'GET', 'Only fixture auth/topup requests may submit');
        if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
        if (p === '/api/v1/me/wallet') {
          walletReads++;
          const available = terminal && credited ? 125000 : 100000;
          return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND', available,
            transactionHeld: 0, withdrawalHeld: 0, total: available, serverTime: now,
            topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true } });
        }
        if (p === '/api/v1/me/wallet/history' || p === '/api/v1/me/topups') {
          const items = entry === 'different-url' && p.endsWith('/topups')
            ? [{ ...topup(), id: id(3), amount: 17000, state: 'Pending', credited: false }]
            : [];
          return route.fulfill({ json: { items, nextCursor: null } });
        }
        if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
        return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      }
      if (url.origin === origin) return route.continue();
      unexpected.push(url.origin);
      return route.abort();
    });
    await page.goto(origin + (entry === 'return' ? `/wallet?topup=${id(2)}` : '/wallet'));
    await page.getByLabel(/^Email/).fill(actor.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const balance = page.locator('[class*="cardAvailableValue"]');
    await expect(balance).toContainText('100.000');
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    const menu = page.getByRole('region', { name: 'Menu tài khoản', exact: true });
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText('100.000');
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    }
    const before = walletReads;
    if (entry !== 'return') {
      await page.getByRole('button', { name: 'Nạp tiền VNPay', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Nạp tiền vào ví', exact: true });
      await dialog.locator('#topup-amount').fill('25000');
      await dialog.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click();
      await expect.poll(() => providerStubs).toBe(1);
      await expect(page).toHaveURL(new RegExp(`/wallet\\?topup=${id(2)}$`));
      if (entry === 'different-url') {
        await dialog.getByRole('link', { name: /17\.000/ }).click();
        await expect(page).toHaveURL(new RegExp(id(3) + '$'));
        await expect(page.locator('[class*="trackingAmount"]')).toContainText('17.000');
        assert(otherReads > 0);
      } else await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
    assert.equal(walletReads, before, 'Pending topups must not refresh wallet views');
    if (measure) {
      const popup = context.pages().find(tab => tab !== page);
      assert(popup);
      await page.bringToFront();
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
      const getBefore = statusReads;
      await page.clock.runFor(3100);
      await expect.poll(() => statusReads - getBefore).toBe(pollingBaseline ? 2 : 1);
      const pendingGets = statusReads - getBefore;
      const postBefore = reconciliationReads;
      terminal = true;
      await popup.goto(origin + '/wallet?payment-return=1&topup=' + id(2)).catch(error => {
        if (!popup.isClosed()) throw error;
      });
      await expect.poll(() => popup.isClosed()).toBe(true);
      await expect.poll(async () => {
        await page.clock.runFor(10);
        return balance.textContent();
      }).toContain('125.000');
      const returnPosts = reconciliationReads - postBefore;
      if (pollingBaseline) assert(returnPosts >= 2, 'Original checkout sends duplicate reconciliation');
      else assert.equal(returnPosts, 1, 'Return reconciles the shared intent once');
      polling = { pendingGets, returnPosts };
      await page.clock.resume();
    } else terminal = true;
    await expect.poll(() => observedTerminal, { timeout: 8000 }).toBe(true);
    await expect(balance).toContainText(credited ? '125.000' : '100.000');
    if (entry === 'different-url') {
      await expect(page).toHaveURL(new RegExp(id(3) + '$'));
      await expect(page.locator('[class*="trackingAmount"]')).toContainText('17.000');
    }
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText(credited && !baseline ? '125.000' : '100.000');
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    }
    if (!credited) {
      await page.waitForTimeout(300);
      assert.equal(walletReads, before, 'Succeeded alone does not prove the wallet was credited');
    }
    if (entry === 'return' && credited) await page.screenshot({ path: path.join(out, `wallet-${width}${baseline ? '-before' : ''}.png`) });
    assert.equal(creations, entry === 'return' ? 0 : 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpected, [], 'No unmocked external traffic');
    checks.push({ width, entry, credited, creations, providerStubs, walletReads, polling, pageErrors: 0 });
    await context.close();
  }
  const result = { status: 'PASS', baseline, pollingBaseline, checks };
  await writeFile(path.join(out, pollingBaseline ? 'before-polling.json' : baseline ? 'before.json' : 'after.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
