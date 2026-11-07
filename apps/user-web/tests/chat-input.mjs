// Production chat with synthetic REST and a local Socket.IO fixture only; no DB.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.CHAT_INPUT_BUILD
  ? path.resolve(root, process.env.CHAT_INPUT_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/chat-input');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4206';
const server = await preview({
  configFile: false, root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4206, strictPort: true },
});
const apiRequire = createRequire(path.join(root, 'apps/api/package.json'));
const { Server } = createRequire(apiRequire.resolve('@nestjs/platform-socket.io'))('socket.io');
const io = new Server(server.httpServer, { serveClient: false });
const ns = io.of('/purchase-chat');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const base = Date.parse('2026-11-03T10:00:00.000Z');
const buyer = { id: uuid(1), displayName: 'Bạn đọc QA A' }, seller = { id: uuid(2), displayName: 'Bạn đọc QA B' };
const originalRoom = { id: uuid(3), listingId: uuid(4), buyer, seller, version: 1, status: 'Active', expiresAt: null, hasQuote: false, quotePreview: null, orderId: null,
  createdAt: new Date(base).toISOString(), closedAt: null, terms: { mode: 'Negotiation', pendingProposal: null, agreedPrice: null, agreedListingRevisionId: null, activeExchangeId: null, exchangeIds: [], locked: false } };
const originalMessages = Array.from({ length: 40 }, (_, i) => ({ id: uuid(100 + i), conversationId: originalRoom.id, senderId: i % 2 ? buyer.id : seller.id,
  body: 'Tin kiểm thử ' + (i + 1), sentAt: new Date(base + i * 1000).toISOString() }));
const book = { id: uuid(4), revisionId: uuid(5), version: 1, book: { id: uuid(6), title: 'Sách QA', authors: ['Tác giả QA'], publisher: null, publicationYear: null, language: 'vi', edition: null, category: 'Văn học', isbn: null },
  mode: 'Sale', condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '', readable: true, hasMissingPages: false, missingEssentialContent: false,
  description: 'Dữ liệu giả', salePrice: 50000, exchangeValue: null, seller, photos: [], publishedAt: new Date(base).toISOString(), fulfillment: null, purchaseAvailability: { status: 'Available', expiresAt: null } };
ns.on('connection', socket => {
  socket.on('purchase:join', (rid, ack) => { socket.join(rid); ack({ ok: rid === originalRoom.id }); });
});
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    let room = originalRoom, denied = false, historyReads = 0;
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Asia/Ho_Chi_Minh' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.qaFormats = 0;
      const Original = Intl.DateTimeFormat;
      Intl.DateTimeFormat = new Proxy(Original, { construct(target, args, newTarget) { window.qaFormats++; return Reflect.construct(target, args, newTarget); } });
    });
    await page.route('**/api/v1/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
        user: { ...buyer, email: 'reader@qa.invalid', status: 'ACTIVE', roles: ['MEMBER'] } } });
      assert.equal(route.request().method(), 'GET', 'This fixture must not send any command');
      if (pathname === '/api/v1/me/purchase-conversations') return route.fulfill({ json: [room] });
      if (pathname === '/api/v1/me/purchase-conversations/' + room.id) return route.fulfill({ json: room });
      if (pathname.endsWith('/messages/history')) {
        historyReads++;
        return denied ? route.fulfill({ status: 403, json: { code: 'QA_DENIED' } }) : route.fulfill({ json: { items: originalMessages, olderCursor: null } });
      }
      if (pathname.endsWith('/events')) return route.fulfill({ json: [] });
      if (pathname === '/api/v1/listings/' + book.id) return route.fulfill({ json: book });
      if (pathname.includes('notifications')) return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent('/chat/' + room.id));
    await page.getByLabel(/^Email/).fill('reader@qa.invalid');
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const messages = page.locator('[data-chat-message]');
    await expect(messages).toHaveCount(40);
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    if (width === 390) await page.getByRole('button', { name: 'Hội thoại', exact: true }).click();
    const input = page.locator('#chat-message');
    await input.click();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const before = await messages.evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, cls: n.className, time: n.querySelector('time').dateTime })));
    await page.evaluate(() => { window.qaFormats = 0; });
    await input.pressSequentially('Xin chao', { delay: 15 });
    assert.equal(await page.evaluate(() => window.qaFormats), 0, 'Typing must not reconstruct timestamps for unchanged messages');
    await expect(input).toHaveValue('Xin chao');
    await expect(input).toBeFocused();
    assert.deepEqual(await messages.evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, cls: n.className, time: n.querySelector('time').dateTime }))), before);
    const first = messages.first();
    await first.screenshot({ path: path.join(out, `message-${width}.png`) });
    const incoming = { id: uuid(180), conversationId: room.id, senderId: seller.id, body: 'Tin mới qua socket QA', sentAt: new Date(base + 60000).toISOString() };
    ns.to(room.id).emit('purchase:message', incoming);
    await expect(page.getByText(incoming.body, { exact: true })).toBeVisible();
    await expect(messages).toHaveCount(41);
    ns.to(room.id).emit('purchase:message', incoming);
    await page.waitForTimeout(100);
    await expect(messages).toHaveCount(41);
    // A new server representation for an existing history ID must reach every displayed field.
    const replaced = { ...originalMessages[0], senderId: buyer.id, body: 'Nội dung server QA mới', sentAt: new Date(base + 120000).toISOString() };
    ns.to(room.id).emit('purchase:message', replaced);
    const updated = messages.filter({ hasText: replaced.body });
    await expect(updated).toHaveCount(1);
    await expect(updated.locator('time')).toHaveAttribute('datetime', replaced.sentAt);
    await expect(updated.locator('time')).toContainText('17:02');
    await expect(updated.locator('p').first()).toHaveText('Bạn');
    assert((await updated.getAttribute('class')).includes('own'));
    await expect(messages).toHaveCount(41);
    await expect(input).toHaveValue('Xin chao');
    room = { ...room, seller: { ...seller, displayName: 'Bạn đọc QA B mới' }, version: 2 };
    await expect.poll(() => messages.locator('p').filter({ hasText: /^Bạn đọc QA B mới$/ }).count(), { timeout: 7000 }).toBeGreaterThan(0);
    assert.equal(await messages.locator('p').filter({ hasText: /^Bạn đọc QA B$/ }).count(), 0);
    // Cached rows must disappear when the history read is denied, despite memoization.
    denied = true;
    const previousReads = historyReads;
    ns.disconnectSockets(true);
    await page.getByRole('button', { name: 'Kết nối lại', exact: true }).click();
    await expect.poll(() => historyReads).toBeGreaterThan(previousReads);
    await expect(messages).toHaveCount(0);
    await expect(input).toHaveValue('Xin chao');
    assert.deepEqual(errors, []);
    checks.push({ width, typingFormats: 0, unchangedHistory: true, draftAndFocus: true, liveAndDedup: true,
      updatedBodyTimeOwner: true, senderRename: true, deniedHistoryCleared: true, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => io.close(resolve));
  if (server.httpServer.listening) await new Promise(resolve => server.httpServer.close(resolve));
}
