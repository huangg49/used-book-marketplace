// Production chat route; synthetic HTTP only, no API process, DB or money commands.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const origin = 'http://127.0.0.1:4259', out = path.join(root, '.tmp/exchange-finance-recovery');
await mkdir(out, { recursive: true });
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.EXCHANGE_FINANCE_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4259, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = new Date().toISOString();
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
const other = { id: id(2), displayName: 'Đối tác QA' };
const room = { id: id(6), listingId: id(5), buyer: user, seller: other, version: 1, status: 'Active',
  expiresAt: null, hasQuote: false, quotePreview: null, orderId: null, createdAt: now, closedAt: null,
  terms: { mode: 'Exchange', pendingProposal: null, agreedPrice: null, agreedListingRevisionId: null,
    activeExchangeId: id(3), exchangeIds: [id(3)], locked: true } };
const exchange = { id: id(3), initiatorId: user.id, recipientId: other.id, initiatorListingId: id(4), recipientListingId: id(5),
  status: 'Proposed', revision: 1, initiatorDeposit: 50000, recipientDeposit: 50000,
  diffAmount: 0, diffPayerId: null, createdAt: now, updatedAt: now };
const listing = n => ({ id: id(n), revisionId: id(n + 100), version: 1,
  book: { id: id(n + 200), title: 'Sách trao đổi QA', authors: ['Tác giả QA'], publisher: null, publicationYear: null,
    language: 'vi', edition: null, category: 'Văn học', isbn: null },
  mode: 'Both', condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '', readable: true,
  hasMissingPages: false, missingEssentialContent: false, description: 'Dữ liệu QA', salePrice: 50000, exchangeValue: 50000,
  seller: n === 4 ? user : other, photos: [], publishedAt: now, fulfillment: null,
  purchaseAvailability: { status: 'Available', expiresAt: null } });
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let failure = 0, standalone = false, messagesFailure = 0, exchangeResult = exchange;
    const returnCommands = [];
    const messageCursors = [];
    await context.route('**/api/v1/**', route => {
      const request = route.request(), p = new URL(request.url()).pathname.slice('/api/v1'.length);
      if (p === '/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === '/exchanges/' + exchange.id + '/return-resolution') {
        assert.equal(request.method(), 'POST');
        const command = request.postDataJSON();
        assert.equal(command.action, 'Appeal');
        returnCommands.push({ body: command, key: request.headers()['idempotency-key'] });
        if (returnCommands.length === 1) {
          exchangeResult = { ...exchangeResult, revision: 9, returnResolution: {
            ...exchangeResult.returnResolution, appeals: [{ by: user.id, note: command.note }],
          } };
          return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE' } });
        }
        return route.fulfill({ json: exchangeResult });
      }
      assert.equal(request.method(), 'GET', 'Recovery must only read existing state');
      if (p === '/auth/me') return route.fulfill({ json: user });
      if (p === '/me/purchase-conversations') return route.fulfill({ json: standalone ? [] : [room] });
      if (p === `/me/purchase-conversations/${room.id}`) return route.fulfill({ json: room });
      if (p === `/exchanges/${exchange.id}/messages`) {
        const search = new URL(request.url()).searchParams;
        assert.equal(search.get('limit'), '40');
        const before = search.get('before');
        messageCursors.push(before);
        if (messagesFailure) return route.fulfill({ status: messagesFailure, json: { code: 'QA_READ_FAILURE' } });
        const numbers = before ? [461] : Array.from({ length: 40 }, (_, i) => 462 + i);
        return route.fulfill({ json: {
          items: numbers.map(n => ({ id: id(n), exchangeId: exchange.id, senderId: other.id, body: 'Tin thử ' + n, sentAt: now })),
          olderCursor: before ? null : 'older-fixture-cursor',
        } });
      }
      if (p.endsWith('/evidence')) return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p.endsWith('/messages/history')) return route.fulfill({ json: { items: [], olderCursor: null } });
      if (p.endsWith('/events')) return route.fulfill({ json: [] });
      if (p === `/exchanges/${exchange.id}`) return failure
        ? route.fulfill({ status: failure, json: { code: failure === 403 ? 'Forbidden' : 'Unavailable' } })
        : route.fulfill({ json: exchangeResult });
      if (p === '/listings/' + id(4)) return route.fulfill({ json: listing(4) });
      if (p === '/listings/' + id(5)) return route.fulfill({ json: listing(5) });
      if (p === '/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent('/chat/' + room.id));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const detail = page.getByRole('region', { name: 'Chi tiết trao đổi', exact: true });
    await expect(detail).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    failure = 503;
    await expect(page.getByRole('heading', { name: 'Chưa tải được trạng thái hiện tại', exact: true })).toBeVisible({ timeout: 15000 });
    const retry = page.getByRole('button', { name: 'Thử lại', exact: true });
    assert.equal(await retry.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(92, 2, 2)');
    await retry.hover();
    assert.equal(await retry.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(40, 25, 20)');
    await page.mouse.move(0, 0);
    const finance = page.getByRole('region', { name: 'Tóm tắt tài chính đổi sách', exact: true });
    await expect(finance.getByRole('alert')).toContainText('Các giá trị dưới đây thuộc lần tải trước.');
    await expect(finance.locator('dt').filter({ hasText: /^Cọc bảo chứng của bạn$/ })).toHaveCount(1);
    await expect(detail.getByRole('region', { name: 'Hành động của bạn', exact: true })).toHaveCount(0);
    failure = 403;
    await finance.getByRole('button', { name: 'Tải lại khoản trao đổi', exact: true }).click();
    await expect(finance.getByRole('alert')).toContainText('Không thể xem khoản trao đổi với quyền truy cập hiện tại.');
    await expect(finance.locator('dl')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Sách và thỏa thuận', exact: true })).toHaveCount(0);
    await page.evaluate(() => document.documentElement.style.fontSize = '130%');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await finance.getByRole('alert').evaluate(node => node.getBoundingClientRect().width > 200), 'Recovery copy must have readable line width');
    await page.locator('[class*="dossierBody"]').evaluateAll(nodes => nodes.forEach(node => node.scrollTo(0, 0)));
    await page.screenshot({ path: path.join(out, `denied-${width}.png`), fullPage: true });
    failure = 0;
    await finance.getByRole('button', { name: 'Tải lại khoản trao đổi', exact: true }).click();
    await expect(detail).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chưa tải được trạng thái hiện tại', exact: true })).toHaveCount(0);
    standalone = true;
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent('/exchange/' + exchange.id));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: /^Nhắn cho / }).click();
    const chat = page.getByRole('region', { name: /Tin nhắn Đổi sách/ });
    await expect(chat.getByText('Tin thử 501', { exact: true })).toBeVisible();
    await expect(chat.getByText('Tin thử 461', { exact: true })).toHaveCount(0);
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    await chat.getByRole('log').evaluate(node => node.scrollTo(0, 0));
    await chat.getByRole('button', { name: 'Tải tin nhắn cũ', exact: true }).click();
    await expect(chat.getByText('Tin thử 461', { exact: true })).toBeVisible();
    await expect(chat.getByText('Tin thử 501', { exact: true })).toHaveCount(1);
    assert.ok(messageCursors.includes('older-fixture-cursor'));
    messagesFailure = 403;
    await expect(chat.getByRole('alert')).toContainText('Bạn hiện không thể xem tin nhắn', { timeout: 16000 });
    await expect(chat.getByText('Tin thử 501', { exact: true })).toHaveCount(0);
    await expect(chat.getByRole('button', { name: 'Gửi tin nhắn', exact: true })).toHaveCount(0);
    messagesFailure = 0;
    exchangeResult = { ...exchange, status: 'ResolutionPending', revision: 8,
      initiatorDeposit: 300000, recipientDeposit: 100000, diffAmount: 200000, diffPayerId: user.id,
      initiatorShippedAt: now, recipientReceivedAt: now,
      returnResolution: {
        phase: 'ReturnOrdered', ownerId: user.id, holderId: other.id, listingId: exchange.initiatorListingId,
        note: 'Đã xác minh một bên nhận sách và quá hạn gửi.',
        evidenceDueAt: now, appealDueAt: new Date(Date.now() + 48 * 3600000).toISOString(),
        effectiveAt: null, appeals: [], returnDueAt: new Date(Date.now() + 120 * 3600000).toISOString(),
        trackingCode: null, returnedAt: null, checkDueAt: null, outcome: null,
        compensation: 0, ownerDeposit: 300000, holderDeposit: 100000, differenceAmount: 200000, differencePayerId: user.id,
      },
    };
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent('/exchange/' + exchange.id));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Đã có quyết định trả sách', exact: true });
    await expect(panel.getByText(/cọc của bạn và .*tiền bù bạn đã nộp/)).toBeVisible();
    await panel.getByRole('button', { name: 'Gửi kháng nghị', exact: true }).click();
    await panel.getByRole('textbox', { name: 'Nội dung gửi' }).fill('Xin đối chiếu thêm bằng chứng giao nhận.');
    await panel.locator('form').getByRole('button', { name: 'Gửi kháng nghị', exact: true }).click();
    await page.getByRole('button', { name: /Thử lại thao tác|Thử lại yêu cầu/ }).click();
    await expect(panel.getByText(/Đã có kháng nghị/)).toBeVisible();
    assert.equal(returnCommands.length, 2);
    assert.deepEqual(returnCommands[0], returnCommands[1]);
    await page.screenshot({ path: path.join(out, 'return-appeal-' + width + '.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(`PASS exchange finance recovery ${width}: stale warning/amounts, denied redaction, read-only retry, return appeal with exact replay`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
