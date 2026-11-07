// Production order/chat routes; synthetic HTTP only, sockets blocked.
// No application API, DB, ledger, carrier or settlement process is contacted.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-order-wallet-cache');
await mkdir(out, { recursive: true });
const build = process.env.ORDER_WALLET_BUILD ? path.resolve(root, process.env.ORDER_WALLET_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.ORDER_WALLET_BASELINE === '1';
const origin = 'http://127.0.0.1:4210';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4210, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z', future = '2026-11-04T04:00:00.000Z';
const buyer = { id: id(1), displayName: 'Bạn mua QA' }, seller = { id: id(2), displayName: 'Bạn bán QA' };
const room = { id: id(4), listingId: id(5), buyer, seller, version: 1, status: 'OrderCreated', expiresAt: null,
  hasQuote: false, quotePreview: null, orderId: id(3), createdAt: now, closedAt: now,
  terms: { mode: 'Negotiation', pendingProposal: null, agreedPrice: 50000, agreedListingRevisionId: id(6),
    activeExchangeId: null, exchangeIds: [], locked: true } };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['pay', 'rejected', 'lost-ack', 'cancel', 'completed-buyer', 'completed-seller']) {
    const completedCase = mode.startsWith('completed-'), role = mode === 'completed-seller' ? 'Seller' : 'Buyer';
    const actor = { ...(role === 'Seller' ? seller : buyer), email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
    const initial = mode === 'completed-buyer' ? 50000 : 100000;
    const final = mode === 'cancel' || mode === 'completed-buyer' ? initial : mode === 'completed-seller' ? 145000 : 50000;
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date(now));
    let changed = false, walletReads = 0, release, terminalReads = 0;
    const commands = [], errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    const order = () => ({ id: id(3), role, version: changed ? 2 : 1, conversationId: room.id, purchaseMode: 'Negotiated',
      state: changed ? completedCase ? 'Completed' : mode === 'cancel' ? 'Cancelled' : 'PendingSellerConfirmation' : completedCase ? 'Inspection' : 'AwaitingPayment',
      paymentDeadline: future, paymentEnabled: !changed && !completedCase, canCancel: !changed && !completedCase,
      amounts: { bookPrice: 50000, shippingFee: 0, buyerTotal: 50000 }, serverTime: now, createdAt: now,
      paidAt: completedCase || (changed && mode !== 'cancel') ? now : null,
      moneyHeld: mode === 'cancel' || (completedCase && changed) ? 0 : completedCase || changed ? 50000 : 0,
      sellerAcceptanceEnabled: false, canReject: false, sellerConfirmationDeadline: null, shipmentRegistrationEnabled: false,
      deliveredAt: completedCase ? now : null, inspectionDeadline: completedCase ? future : null,
      carrierReview: null, deliveryReview: null, preparation: null,
      ownAddress: { recipientName: 'Người nhận QA', phone: '0900000000', localityCode: 'DEMO-A', detail: 'Địa chỉ QA' }, shippingAddress: null,
      item: { listingId: id(5), metadata: { title: 'Sách đơn hàng QA' }, condition: 'Good', description: 'Dữ liệu tổng hợp QA', coverNote: '', pages: '' } });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/socket.io/') return route.abort();
      if (p.startsWith('/api/v1/')) {
        if (p === '/api/v1/auth/login') return route.fulfill({ json: {
          accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
        } });
        if (p === `/api/v1/orders/${id(3)}/${mode === 'cancel' ? 'cancel' : 'pay'}` && request.method() === 'POST') {
          commands.push({ key: request.headers()['idempotency-key'], body: request.postData() });
          await new Promise(resolve => { release = resolve; });
          if (mode === 'rejected' && commands.length === 1) return route.fulfill({ status: 400, json: { code: 'INVALID_STATE' } });
          changed = true;
          if (mode === 'lost-ack' && commands.length === 1) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
          return route.fulfill({ json: { id: id(7), entityType: 'Order', entityId: id(3), contextId: room.id, version: 2,
            state: order().state, paymentDeadline: future, serverTime: now, affectedListings: [] } });
        }
        assert.equal(request.method(), 'GET', 'Only fixture auth/pay/cancel may submit commands');
        if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
        if (p === '/api/v1/me/wallet') {
          walletReads++;
          const available = changed ? final : initial;
          const held = mode === 'completed-buyer' ? changed ? 0 : 50000 : !completedCase && changed && mode !== 'cancel' ? 50000 : 0;
          return route.fulfill({ json: { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND', available,
            transactionHeld: held, withdrawalHeld: 0, total: available + held, serverTime: now,
            topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true } });
        }
        if (p === `/api/v1/me/orders/${id(3)}`) { if (changed) terminalReads++; return route.fulfill({ json: order() }); }
        if (p === '/api/v1/me/purchase-conversations') return route.fulfill({ json: [room] });
        if (p === `/api/v1/me/purchase-conversations/${room.id}`) return route.fulfill({ json: room });
        if (p.endsWith('/messages/history')) return route.fulfill({ json: { items: [], olderCursor: null } });
        if (p.endsWith('/events')) return route.fulfill({ json: [] });
        if (p === '/api/v1/service-areas') return route.fulfill({ json: { localities: [{ code: 'DEMO-A', label: 'TP.HCM' }] } });
        if (p === '/api/v1/me/wallet/history' || p === '/api/v1/me/topups') return route.fulfill({ json: { items: [], nextCursor: null } });
        if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
        // Archived listing and unavailable review rights are explicit fixture states.
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
    const money = value => new Intl.NumberFormat('vi-VN').format(value);
    await expect(balance).toContainText(money(initial));
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    const menu = page.getByRole('region', { name: 'Menu tài khoản', exact: true });
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText(money(initial));
      await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
    }
    await page.evaluate(path => {
      history.pushState({ key: 'qa-order', idx: (history.state?.idx ?? 0) + 1 }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, '/orders/' + id(3));
    await expect(page).toHaveURL(origin + '/chat/' + room.id);
    const region = page.getByRole('region', { name: 'Chi tiết đơn hàng', exact: true });
    await expect(region).toBeVisible();
    const before = walletReads;
    if (completedCase) {
      changed = true;
      await expect(region.getByText('Đơn hàng đã hoàn tất thành công', { exact: true })).toBeVisible({ timeout: 8000 });
      assert.equal(commands.length, 0, 'A worker state observation submits no command');
    } else {
      const action = region.getByRole('button', { name: mode === 'cancel' ? 'Hủy đơn chưa thanh toán' : /^Thanh toán ngay/ });
      await action.click(); await expect.poll(() => commands.length).toBe(1);
      await page.waitForTimeout(100); assert.equal(walletReads, before, 'No wallet invalidation before ACK'); release();
      if (mode === 'rejected' || mode === 'lost-ack') {
        const retry = region.getByRole('button', { name: mode === 'lost-ack' ? 'Thử lại thanh toán' : /^Thanh toán ngay/ });
        await expect(retry).toBeEnabled();
        assert.equal(walletReads, before, 'Rejected/unknown results do not refresh money');
        await retry.click(); await expect.poll(() => commands.length).toBe(2); release();
        if (mode === 'lost-ack') assert.deepEqual(commands[0], commands[1], 'Recovery preserves original key/body/version');
        else assert.notEqual(commands[0].key, commands[1].key, 'Definitive rejection releases the original intent');
      }
      await expect.poll(() => terminalReads).toBeGreaterThan(0);
      await expect(region.getByRole('button', { name: /Thử lại thanh toán|Thanh toán ngay|Hủy đơn chưa thanh toán/ })).toHaveCount(0);
    }
    if (width === 1440) {
      await page.getByRole('button', { name: /^Tài khoản của/ }).click();
      await expect(menu.locator('[class*="hubBalance"]')).toContainText(money(baseline ? initial : final));
      await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0);
    }
    await page.goBack();
    await expect(balance).toContainText(money(final));
    if (mode === 'completed-buyer') await expect(page.locator('[class*="cardHeldValue"]')).toHaveText(/^0\s*₫$/);
    if (mode === 'pay') await page.screenshot({ path: path.join(out, `wallet-${width}${baseline ? '-before' : ''}.png`) });
    assert.deepEqual(errors, []); assert.deepEqual(external, [], 'No unmocked external traffic');
    checks.push({ width, mode, role, commands: commands.length, walletReads, pageErrors: 0 });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
