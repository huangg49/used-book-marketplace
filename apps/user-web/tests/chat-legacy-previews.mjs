// Production inbox and detail routes. Every API response is synthetic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-chat-legacy-previews');
await mkdir(out, { recursive: true });
const build = path.resolve(root, process.env.LEGACY_PREVIEW_BUILD ?? 'apps/user-web/dist');
const baseline = process.env.LEGACY_PREVIEW_BASELINE === '1';
const origin = 'http://127.0.0.1:4216';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4216, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z';
const snapshot = (number, owner) => ({ listingId: id(number), listingVersion: 1, revisionId: id(number + 100),
  ownerId: id(owner), ownerDisplayName: owner === 1 ? 'Người đề nghị QA' : 'Người nhận QA',
  bookId: id(number + 200), catalogRevisionId: id(number + 300),
  book: { title: 'Sách QA ' + number, authors: ['Tác giả QA'], isbn: null, edition: null, publisher: null,
    publicationYear: null, language: 'vi', category: 'Văn học' },
  condition: 'Good', description: '', pages: '', coverNote: '', notes: '', accessories: '', readable: true,
  hasMissingPages: false, missingEssentialContent: false, exchangeValue: 50000, mediaIds: [id(number + 400)] });
const rows = Array.from({ length: 12 }, (_, index) => {
  const number = 20 + index * 3;
  return { id: id(1000 + index), initiatorId: id(1), recipientId: id(2),
    initiatorListingId: id(number), initiatorListingIds: [id(number), id(number + 1)], recipientListingId: id(number + 2),
    status: 'AcceptedAwaitingFunding', revision: 1, initiatorDeposit: 50000, recipientDeposit: 100000,
    diffAmount: 0, diffPayerId: null, createdAt: now, updatedAt: now, fundingDeadline: '2026-11-05T03:00:00.000Z',
    agreement: index === 11 ? null : { initiatorBooks: [snapshot(number, 1), snapshot(number + 1, 1)], recipientBook: snapshot(number + 2, 2) } };
});
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const owner of [1, 2]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let details = 0, photos = 0, failList = false;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
        user: { id: id(owner), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' } } });
      assert.equal(request.method(), 'GET', 'Only fixture login may submit');
      if (p === '/api/v1/exchanges') return failList
        ? route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } })
        : route.fulfill({ json: { items: rows, nextCursor: null } });
      if (p === '/api/v1/me/purchase-conversations') return route.fulfill({ json: [] });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      const row = rows.find(item => p === '/api/v1/exchanges/' + item.id);
      if (row) { details++; return route.fulfill({ json: row }); }
      if (p.includes('/books/') && p.includes('/photos/')) {
        photos++;
        return route.fulfill({ json: { url: origin + '/qa-cover.svg' } });
      }
      if (p.endsWith('/messages')) return route.fulfill({ json: [] });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin && p === '/qa-cover.svg') return route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160"><rect width="100" height="160" fill="#5c0202"/></svg>' });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fchat');
    await page.getByLabel(/^Email/).fill('reader@example.test');
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const cards = page.locator('article[data-room-id]');
    await expect(cards).toHaveCount(12);
    const first = page.locator(`[data-room-id="${rows[0].id}"]`);
    const title = owner === 1 ? 'Sách QA 22' : 'Sách QA 20, Sách QA 21';
    await expect(first.getByRole('heading')).toHaveText(title);
    await expect(first).toContainText(owner === 1 ? 'Người nhận QA' : 'Người đề nghị QA');
    const old = page.locator(`[data-room-id="${rows[11].id}"]`);
    await expect(old).toContainText('Hồ sơ cũ — thiếu bản chụp sách');
    await expect(old).toContainText('Đối tác trao đổi');
    if (baseline) { await expect.poll(() => details).toBe(12); await expect.poll(() => photos).toBe(33); }
    else { assert.equal(details, 0); assert.equal(photos, 0); }
    const initial = { details, photos };
    await first.getByRole('link', { name: 'Mở phiếu và hội thoại', exact: true }).click();
    await expect(page.locator('#exchange-actions')).toBeVisible();
    await expect(page.getByRole('heading', { name: title.split(', ')[0], exact: true })).toBeVisible();
    await expect.poll(() => details, { timeout: 8000 }).toBeGreaterThan(initial.details);
    await expect.poll(() => photos, { timeout: 8000 }).toBeGreaterThan(initial.photos);
    await page.goBack();
    await expect(first).toBeVisible();
    await expect(first.getByRole('heading')).toHaveText(title);
    // A list outage keeps the already read previews and exposes its retry.
    failList = true;
    await expect(page.getByText('Chưa tải được danh sách đổi sách.', { exact: false })).toBeVisible({ timeout: 8000 });
    await expect(first.getByRole('heading')).toHaveText(title);
    await page.screenshot({ path: path.join(out, `inbox-${width}-${owner}${baseline ? '-before' : ''}.png`) });
    failList = false;
    await page.getByRole('alert').filter({ hasText: 'Chưa tải được danh sách đổi sách.' }).getByRole('button', { name: 'Thử lại' }).click();
    await expect(page.getByText('Chưa tải được danh sách đổi sách.', { exact: false })).toHaveCount(0);
    assert.deepEqual(errors, []);
    checks.push({ width, owner, initial, detailEntry: true, back: true, listErrorRetry: true });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
