// Verify the production chat cards against the private Order and Exchange API contracts.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const origin = 'http://127.0.0.1:4249';
const evidence = path.join(root, '.tmp/chat-transaction-covers');
await mkdir(evidence, { recursive: true });
const server = await preview({
  configFile: false,
  root: path.join(root, 'apps/user-web'),
  build: { outDir: path.join(root, 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4249, strictPort: true },
});

const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = new Date().toISOString();
const buyer = { id: id(1), displayName: 'Người mua QA' };
const seller = { id: id(2), displayName: 'Người bán QA' };
const orderRoom = (n) => ({
  id: id(n), listingId: id(100 + n), buyer, seller, version: 1,
  status: 'OrderCreated', expiresAt: null, hasQuote: false, quotePreview: null,
  orderId: id(200 + n), createdAt: now, closedAt: now,
});
const rooms = [orderRoom(10), orderRoom(11), orderRoom(12)];
const [paid, denied, expired] = rooms;
const coverId = (room) => id(300 + rooms.indexOf(room));
const orderMediaPath = (room) => '/api/v1/me/orders/' + room.orderId + '/media/' + coverId(room) + '/read';
const order = (room) => ({
  id: room.orderId, role: 'Buyer', state: 'Completed', version: 1,
  paymentDeadline: now, paymentEnabled: false,
  amounts: { bookPrice: 50000, shippingFee: 30000, buyerTotal: 80000 },
  conversationId: room.id, serverTime: now, createdAt: now, paidAt: now, moneyHeld: 0,
  canCancel: false, sellerAcceptanceEnabled: false, canReject: false,
  sellerConfirmationDeadline: null, shipmentRegistrationEnabled: false,
  deliveredAt: null, inspectionDeadline: null, carrierReview: null, deliveryReview: null,
  preparation: null, ownAddress: { recipientName: 'QA', phone: '0000000000', localityCode: 'DEMO-A', detail: 'QA' },
  shippingAddress: null,
  item: {
    listingId: room.listingId, metadata: { title: 'Sách đã rời kệ ' + rooms.indexOf(room) },
    mediaIds: [coverId(room)], condition: 'Good', description: '', coverNote: '', pages: '',
  },
});
const snapshot = (n, owner) => ({
  listingId: id(n), listingVersion: 1, revisionId: id(n + 100),
  ownerId: owner.id, ownerDisplayName: owner.displayName, bookId: id(n + 200), catalogRevisionId: id(n + 300),
  book: { title: 'Bìa trao đổi ' + n, authors: [], isbn: null, edition: null, publisher: null,
    publicationYear: null, language: 'vi', category: 'Văn học' },
  condition: 'Good', description: '', pages: '', coverNote: '', notes: '', accessories: '',
  readable: true, hasMissingPages: false, missingEssentialContent: false, exchangeValue: 50000,
  mediaIds: [id(n + 400)],
});
const exchange = (n, hasAgreement) => ({
  id: id(n), initiatorId: buyer.id, recipientId: seller.id, initiatorListingId: id(n + 1000),
  recipientListingId: id(n + 2000), status: 'Completed', revision: 1,
  initiatorDeposit: 50000, recipientDeposit: 50000, diffAmount: 0, diffPayerId: null,
  createdAt: now, updatedAt: now,
  agreement: hasAgreement ? {
    initiatorBooks: [snapshot(n + 1000, buyer)], recipientBook: snapshot(n + 2000, seller),
  } : null,
});
const exchanges = [exchange(20, true), exchange(21, true), exchange(22, false)];
const publicReads = [];
let browser;
try {
  browser = await chromium.launch();
  for (const [width, actor] of [[320, buyer], [1440, seller]]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const user = { ...actor, email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
    const received = (row) => actor === buyer ? row.agreement.recipientBook : row.agreement.initiatorBooks[0];
    const exchangeMediaPath = (row) => {
      const book = received(row);
      return '/api/v1/exchanges/' + row.id + '/books/' + book.listingId + '/photos/' + book.mediaIds[0];
    };
    const link = (name, valid = true) => ({
      url: origin + '/cover/' + name + '.svg',
      expiresAt: new Date(Date.now() + (valid ? 300000 : -300000)).toISOString(),
    });
    const mediaReads = new Set();
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: {
        user, accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
      } });
      assert.equal(request.method(), 'GET');
      if (p === '/api/v1/auth/me') return route.fulfill({ json: user });
      if (p === '/api/v1/me/purchase-conversations') return route.fulfill({ json: rooms });
      if (p === '/api/v1/exchanges') return route.fulfill({ json: { items: exchanges, nextCursor: null } });
      if (p === '/api/v1/me/auctions') return route.fulfill({ json: { items: [], nextCursor: null, serverTime: now } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/listings/')) {
        publicReads.push(p);
        return route.fulfill({ status: 404, json: { code: 'NotFound' } });
      }
      const room = rooms.find((value) => p === '/api/v1/me/orders/' + value.orderId);
      if (room) return route.fulfill(room === denied ? { status: 403, json: { code: 'Forbidden' } } : { json: order(room) });
      if (p === orderMediaPath(paid) || p === orderMediaPath(expired) ||
          p === exchangeMediaPath(exchanges[0]) || p === exchangeMediaPath(exchanges[1])) {
        mediaReads.add(p);
        assert.equal(request.headers().authorization, 'Bearer fixture-access');
        return route.fulfill({ json: p === orderMediaPath(paid) ? link('order')
          : p === orderMediaPath(expired) ? link('expired', false)
            : p === exchangeMediaPath(exchanges[0]) ? link('exchange') : link('broken') });
      }
      if (p === '/cover/expired.svg') throw new Error('An expired private image URL was requested');
      if (p === '/cover/broken.svg') return route.fulfill({ status: 404 });
      if (p.startsWith('/cover/')) return route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="88"><rect width="64" height="88" fill="#254337"/></svg>',
      });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 404, json: { code: 'NotFound' } });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fchat');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const card = (value) => page.locator('article[data-room-id="' + value.id + '"]');
    const checkCover = async (row, title, src) => {
      const item = card(row);
      await item.scrollIntoViewIfNeeded();
      await expect(item.getByRole('heading')).toHaveText(title);
      const image = item.locator('img').first();
      await expect(image).toHaveAttribute('src', src);
      await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0)).toBe(true);
    };
    await checkCover(paid, 'Sách đã rời kệ 0', origin + '/cover/order.svg');
    await checkCover(denied, 'Không xem được thông tin đơn hàng', '/illustrations/chat/no-cover.svg');
    await expect(card(denied).getByRole('link', { name: 'Mở cuộc trao đổi' })).toHaveAttribute('href', '/chat/' + denied.id);
    await checkCover(expired, 'Sách đã rời kệ 2', '/illustrations/chat/no-cover.svg');
    await checkCover(exchanges[0], received(exchanges[0]).book.title, origin + '/cover/exchange.svg');
    await checkCover(exchanges[1], received(exchanges[1]).book.title, '/illustrations/chat/swap-cover.svg');
    await checkCover(exchanges[2], 'Hồ sơ cũ — thiếu bản chụp sách', '/illustrations/chat/swap-cover.svg');
    assert.deepEqual(mediaReads, new Set([
      orderMediaPath(paid), orderMediaPath(expired),
      exchangeMediaPath(exchanges[0]), exchangeMediaPath(exchanges[1]),
    ]));
    await page.getByRole('searchbox').fill('Sách đã rời kệ 0');
    await expect(page.locator('article[data-room-id]')).toHaveCount(1);
    await expect(card(paid)).toBeVisible();
    await page.getByRole('searchbox').clear();
    await expect(page.locator('article[data-room-id]')).toHaveCount(6);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await card(paid).screenshot({ path: path.join(evidence, 'order-' + width + '.png') });
    await card(exchanges[0]).screenshot({ path: path.join(evidence, 'exchange-' + width + '.png') });
    assert.deepEqual(errors, []);
    await context.close();
  }
  assert.deepEqual(publicReads, []);
  console.log('Chat transaction covers passed for buyer at 320px and seller at 1440px');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
