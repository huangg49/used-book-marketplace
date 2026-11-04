// Production inbox with synthetic HTTP. No application DB or real chat service.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-chat-card-visibility');
await mkdir(out, { recursive: true });
const build = path.resolve(root, process.env.CHAT_CARD_BUILD ?? 'apps/user-web/dist');
const baseline = process.env.CHAT_CARD_BASELINE === '1';
const origin = 'http://127.0.0.1:4217';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4217, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = new Date().toISOString();
const buyer = { id: id(1), displayName: 'Bạn mua QA' }, seller = { id: id(2), displayName: 'Bạn bán QA' };
const rooms = Array.from({ length: 24 }, (_, index) => ({ id: id(index + 10), listingId: id(index + 100), buyer, seller,
  version: 1, status: 'Active', expiresAt: null, hasQuote: false, quotePreview: null, orderId: null,
  createdAt: now, closedAt: null, terms: { mode: 'Negotiation', pendingProposal: null, agreedPrice: null,
    agreedListingRevisionId: null, activeExchangeId: null, exchangeIds: [], locked: false } }));
const book = number => ({ id: id(number + 100), revisionId: id(number + 200), version: 1,
  book: { id: id(number + 300), title: 'Sách hội thoại QA ' + number, authors: ['Tác giả QA'], publisher: null,
    publicationYear: null, language: 'vi', edition: null, category: 'Văn học', isbn: null },
  mode: 'Sale', condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '', readable: true,
  hasMissingPages: false, missingEssentialContent: false, description: 'Dữ liệu QA', salePrice: 50000, exchangeValue: null,
  seller, photos: [], publishedAt: now, fulfillment: null, purchaseAvailability: { status: 'Available', expiresAt: null } });
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const [width, noObserver] of [[390, false], [1440, false], [390, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], listingReads = new Set();
    page.on('pageerror', error => errors.push(error.message));
    if (noObserver) await page.addInitScript(() => { window.IntersectionObserver = undefined; });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
        user: { ...buyer, email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' } } });
      assert.equal(request.method(), 'GET', 'Only synthetic login may submit');
      if (p === '/api/v1/me/purchase-conversations') return route.fulfill({ json: rooms });
      const room = rooms.find(item => p === '/api/v1/me/purchase-conversations/' + item.id);
      if (room) return route.fulfill({ json: room });
      if (p.endsWith('/messages/history')) return route.fulfill({ json: { items: [], olderCursor: null } });
      if (p.endsWith('/events')) return route.fulfill({ json: [] });
      if (p === '/api/v1/exchanges') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      const index = rooms.findIndex(item => p === '/api/v1/listings/' + item.listingId);
      if (index >= 0) {
        listingReads.add(index);
        return index === 11 ? route.fulfill({ status: 404, json: { code: 'NotFound' } }) : route.fulfill({ json: book(index) });
      }
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fchat');
    await page.getByLabel(/^Email/).fill('reader@example.test');
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const cards = page.locator('article[data-room-id]');
    await expect(cards).toHaveCount(12);
    await expect(cards.first().getByRole('heading')).toHaveText('Sách hội thoại QA 0');
    await page.waitForTimeout(300);
    const initialReads = listingReads.size;
    if (baseline || noObserver) assert.equal(initialReads, 12);
    else {
      assert(initialReads > 0);
      assert(initialReads <= 12);
      if (width === 390) assert(initialReads < 12);
    }
    await page.screenshot({ path: path.join(out, `inbox-${width}-${noObserver}${baseline ? '-before' : ''}.png`) });
    // A focused link loads its facts even before scrolling it into view.
    const last = page.locator(`[data-room-id="${rooms[11].id}"]`);
    await last.getByRole('link', { name: 'Mở cuộc trao đổi', exact: true }).evaluate(link => link.focus({ preventScroll: true }));
    await expect(last.getByRole('heading')).toHaveText('Bài đăng không còn công khai');
    assert(listingReads.has(11));
    for (let index = 0; index < 12; index++) {
      await cards.nth(index).scrollIntoViewIfNeeded();
      if (index !== 11) await expect(cards.nth(index).getByRole('heading')).toHaveText('Sách hội thoại QA ' + index);
    }
    assert.equal(listingReads.size, 12);
    await page.getByRole('button', { name: 'Xem thêm cuộc trao đổi', exact: true }).click();
    await expect(cards).toHaveCount(24);
    const opened = page.locator(`[data-room-id="${rooms[23].id}"]`);
    await opened.scrollIntoViewIfNeeded();
    await expect(opened.getByRole('heading')).toHaveText('Sách hội thoại QA 23');
    await opened.getByRole('link', { name: 'Mở cuộc trao đổi', exact: true }).click();
    await expect(page).toHaveURL(origin + '/chat/' + rooms[23].id);
    await expect(page.getByRole('heading', { name: 'Thỏa thuận giao dịch', exact: true })).toBeVisible();
    await page.goBack();
    await expect(cards).toHaveCount(24);
    await expect(opened).toBeVisible();
    await expect(opened.getByRole('heading')).toHaveText('Sách hội thoại QA 23');
    assert.deepEqual(errors, []);
    checks.push({ width, noObserver, initialReads, scroll: true, focus404: true, loadMore: true, roomAndBack: true });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
