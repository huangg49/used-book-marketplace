// Production winner/payment UI; every API is synthetic, sockets are blocked.
// No ledger, point, carrier, DB or actual payment is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-point-order-wallet-cache');
await mkdir(out, { recursive: true });
const build = process.env.POINT_WALLET_BUILD ? path.resolve(root, process.env.POINT_WALLET_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.POINT_WALLET_BASELINE === '1';
const origin = 'http://127.0.0.1:4211';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4211, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z', deadline = '2026-11-05T02:00:00.000Z';
const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const method of ['SelfCollect', 'CarrierOutbound']) for (const mode of ['success', 'rejected', 'lost-ack']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(now));
    let paid = false, walletReads = 0, release;
    const commands = [], errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    const auction = () => ({ id: id(2), listingId: id(4), title: 'Phiên đấu giá QA', state: paid ? 'Sold' : 'AwaitingWinnerPayment',
      phase: 'Ended', startPrice: 10000, step: 10000, buyNowPrice: null, currentPrice: 50000, minimumBid: null,
      bidderCount: 1, startAt: '2026-11-03T02:00:00.000Z', endAt: '2026-11-04T02:00:00.000Z', pointName: 'Điểm mô phỏng QA', demoOnly: true });
    const participation = () => ({ auctionId: id(2), alias: 1, mode: 'Manual', ownLevel: 50000, boughtNow: false, leading: true,
      state: auction().state, currentPrice: 50000, minimumBid: null, fulfillmentMethod: 'SelfCollect', won: true,
      orderId: id(3), finalPrice: 50000, paymentDeadline: deadline, serverTime: now });
    const order = () => ({ id: id(3), auctionId: id(2), title: 'Phiên đấu giá QA', pointName: 'Điểm mô phỏng QA', role: 'Buyer',
      state: paid ? 'Fulfilling' : 'AwaitingPayment', version: paid ? 2 : 1,
      amounts: { bookPrice: 50000, outboundFee: 0, buyerTotal: 50000 }, fulfillmentMethod: paid ? method : 'SelfCollect',
      delivery: null, paymentDeadline: paid ? null : deadline, paidAt: paid ? now : null, serverTime: now,
      report: { outcome: 'Pass', inspectedAt: now, note: null, scope: 'Kiểm tra tình trạng QA' },
      acceptanceDeadline: paid ? '2026-11-07T03:00:00.000Z' : null, acceptedAt: null,
      collectionDeadline: null, collectedAt: null, inspectionDeadline: null, returnDeadline: null, refunded: false, resolution: null });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/socket.io/') return route.abort();
      if (p.startsWith('/api/v1/')) {
        if (p === '/api/v1/auth/login') return route.fulfill({ json: {
          accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
        } });
        if (p === `/api/v1/point-orders/${id(3)}/pay` && request.method() === 'POST') {
          const body = JSON.parse(request.postData());
          assert.deepEqual(body, method === 'SelfCollect' ? { expectedVersion: 1 } : {
            expectedVersion: 1, fulfillmentMethod: 'CarrierOutbound', destinationAddressId: id(5),
            expectedDestinationAddressVersion: 7, expectedOutboundFee: 0,
          });
          commands.push({ key: request.headers()['idempotency-key'], body: request.postData() });
          await new Promise(resolve => { release = resolve; });
          if (mode === 'rejected' && commands.length === 1) return route.fulfill({ status: 409, json: { code: 'InvalidState' } });
          paid = true;
          if (mode === 'lost-ack' && commands.length === 1) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
          return route.fulfill({ json: { id: id(6), entityType: 'PointOrder', entityId: id(3), auctionId: id(2), orderId: id(3),
            version: 2, state: 'Fulfilling', currentPrice: 50000, minimumBid: null, leading: true, serverTime: now } });
        }
        assert.equal(request.method(), 'GET', 'Only fixture auth/payment may submit');
        if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
        if (p === '/api/v1/me/wallet') {
          walletReads++;
          return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND', available: paid ? 50000 : 100000,
            transactionHeld: paid ? 50000 : 0, withdrawalHeld: 0, total: 100000, serverTime: now,
            topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true } });
        }
        if (p === `/api/v1/auctions/${id(2)}`) return route.fulfill({ json: { auction: auction(), leaderAlias: 1,
          history: [{ price: 50000, bidderAlias: 1, at: now }], serverTime: now } });
        if (p === `/api/v1/me/auctions/${id(2)}/participation`) return route.fulfill({ json: participation() });
        if (p === `/api/v1/me/point-orders/${id(3)}`) return route.fulfill({ json: order() });
        if (p === '/api/v1/me/auction-intakes') return route.fulfill({ json: { items: [] } });
        if (p === '/api/v1/me/addresses') return route.fulfill({ json: { items: [{ id: id(5), version: 7,
          recipientName: 'Người nhận QA', detail: 'Địa chỉ QA', serviceAreaCode: 'HCM-DEMO-v1', isDefault: true }] } });
        if (p === `/api/v1/me/point-orders/${id(3)}/delivery-quote`) return route.fulfill({ json: {
          addressId: id(5), addressVersion: 7, outboundFee: 0, buyerTotal: 50000,
        } });
        if (p === '/api/v1/me/wallet/history' || p === '/api/v1/me/topups') return route.fulfill({ json: { items: [], nextCursor: null } });
        if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
        return route.fulfill({ status: 404, json: { code: 'NotFound' } });
      }
      if (url.origin === origin) return route.continue();
      external.push(url.origin); return route.abort();
    });
    await page.goto(origin + '/wallet');
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
      await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
    }
    await page.evaluate(path => {
      history.pushState({ key: 'qa-point-order', idx: (history.state?.idx ?? 0) + 1 }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, '/auctions/' + id(2));
    await expect(page.getByText('Bạn đã thắng phiên đấu giá', { exact: true })).toBeVisible();
    if (method === 'CarrierOutbound') {
      await page.getByRole('button', { name: 'Giao tận nơi', exact: true }).click();
      await expect(page.getByLabel('Giao tới', { exact: true })).toHaveValue(id(5));
    }
    const action = page.getByRole('button', { name: /^Thanh toán 50\.000/ });
    const before = walletReads;
    const submit = async () => {
      await action.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Thanh toán', exact: true }).click();
    };
    await submit(); await expect.poll(() => commands.length).toBe(1);
    await page.waitForTimeout(100); assert.equal(walletReads, before, 'Pending payment must not refresh wallet'); release();
    if (mode === 'rejected') {
      await expect(action).toBeEnabled();
      assert.equal(walletReads, before, 'A definitive rejection does not refresh wallet');
      await submit(); await expect.poll(() => commands.length).toBe(2); release();
      assert.notEqual(commands[0].key, commands[1].key, 'Rejection releases the old intent');
    } else if (mode === 'lost-ack') {
      const retry = page.getByRole('button', { name: 'Thử lại thanh toán', exact: true });
      await expect(retry).toBeEnabled();
      assert.equal(walletReads, before, 'An unknown payment outcome does not refresh wallet');
      await expect(page.getByRole('button', { name: 'Giao tận nơi', exact: true })).toBeDisabled();
      await retry.click(); await expect.poll(() => commands.length).toBe(2); release();
      assert.deepEqual(commands[0], commands[1], 'Recovery pins key, version, address and fee');
    }
    await expect(action).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Thử lại thanh toán', exact: true })).toHaveCount(0);
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText(baseline ? '100.000' : '50.000');
      await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
    }
    await page.goBack();
    await expect(balance).toContainText(baseline ? '100.000' : '50.000');
    await expect(page.locator('[class*="cardHeldValue"]')).toHaveText(baseline ? /^0\s*₫$/ : /^50\.000\s*₫$/);
    if (mode === 'success' && method === 'SelfCollect') await page.screenshot({ path: path.join(out, `wallet-${width}${baseline ? '-before' : ''}.png`) });
    assert.deepEqual(errors, []); assert.deepEqual(external, [], 'No unmocked external traffic');
    checks.push({ width, method, mode, commands: commands.length, walletReads, pageErrors: 0 });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
