// Production shelf/editor lifecycle recovery; synthetic HTTP/media only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-listing-action-recovery');
await mkdir(out, { recursive: true });
const baseline = process.env.LISTING_ACTION_BASELINE === '1';
const origin = 'http://127.0.0.1:4223';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.LISTING_ACTION_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4223, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T07:00:00.000Z';
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const entry of ['shelf', 'editor']) for (const action of ['hide', 'archive', ...baseline ? [] : ['conflict']]) {
    const hiding = action !== 'archive', conflict = action === 'conflict';
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let archived = false, failedRead = false, probeRead = false;
    let listing = { id: id(10), version: 3, channel: 'Marketplace', catalogStatus: 'Confirmed',
      state: { moderation: 'Approved', visibility: 'Visible', trade: 'Available' },
      currentRevision: { id: id(11), bookId: id(12), content: { bookId: id(12), mode: 'Exchange', condition: 'Good',
        pages: 'Ruột sách QA', coverNote: 'Bìa nguyên', notes: 'Không có', accessories: 'Không có', description: 'Mô tả QA cho bản sách đã duyệt, dùng để kiểm phục hồi.',
        readable: true, hasMissingPages: false, missingEssentialContent: false, salePrice: null, exchangeValue: 50000, mediaIds: [id(13)] } } };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === `/api/v1/listings/${id(10)}/${hiding ? 'visibility' : 'archive'}` && request.method() === (hiding ? 'PUT' : 'POST')) {
        writes.push({ path: p, key: request.headers()['idempotency-key'], body: request.postData() });
        if (conflict) return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT' } });
        if (writes.length > 1) {
          if (writes.at(-1).key !== writes[0].key) return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT' } });
          return route.fulfill({ json: { entityId: id(10), version: 4 } });
        }
        if (action === 'archive') archived = true;
        else listing = { ...listing, version: 4, state: { ...listing.state, visibility: 'Hidden' } };
        return route.abort('failed');
      }
      assert.equal(request.method(), 'GET', 'Opposite or unrelated commands are forbidden in this fixture');
      if (p === '/api/v1/me/listings') return route.fulfill({ json: { items: archived ? [] : [listing], nextCursor: null } });
      if (p === `/api/v1/me/listings/${id(10)}`) {
        if (probeRead) failedRead = true;
        return route.fulfill(probeRead ? { status: 503, json: { code: 'QA_READ_FAILED' } }
          : archived ? { status: 404, json: { code: 'NOT_FOUND' } } : { json: listing });
      }
      if (p === `/api/v1/catalog/books/${id(12)}`) return route.fulfill({ json: { title: 'Sách lifecycle QA', authors: ['Tác giả QA'], category: 'Văn học' } });
      if (p === `/api/v1/me/listings/${id(10)}/media/${id(13)}/read`) return route.fulfill({ json: { id: id(13), width: 100, height: 160,
        url: origin + '/qa-cover.svg', expiresAt: new Date(Date.now() + 60000).toISOString() } });
      if (p === '/api/v1/me/addresses') return route.fulfill({ json: { version: 0, items: [] } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p === `/api/v1/members/${id(1)}/reputation`) return route.fulfill({ json: { userId: id(1), displayName: user.displayName,
        completedTransactions: 0, verifiedViolations: 0, reviewCount: 0, partnerRatingCount: 0, bookRatingCount: 0,
        partnerRating: null, bookRating: null, items: [], nextCursor: null, serverTime: now } });
      if (p === '/api/v1/me/review-transactions') return route.fulfill({ json: { items: [], nextCursor: null, serverTime: now } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin && p === '/qa-cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160"><rect width="100" height="160" fill="#5c0202"/></svg>' });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    const target = entry === 'shelf' ? '/my-books' : `/my-books/${id(10)}/edit`;
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(target));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sách lifecycle QA', exact: true })).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    await page.getByRole('button', { name: hiding ? entry === 'shelf' ? 'Tạm ẩn' : 'Tạm ẩn sách' : entry === 'shelf' ? 'Xóa' : 'Xóa bài đăng', exact: true }).click();
    const dialog = page.getByRole(hiding ? 'dialog' : 'alertdialog', { name: hiding ? 'Tạm ẩn bài đăng?' : 'Gỡ bài đăng khỏi kệ sách?', exact: true });
    await dialog.getByRole('button', { name: hiding ? 'Tạm ẩn bài' : 'Xóa vĩnh viễn', exact: true }).evaluate(button => { button.click(); button.click(); });
    await expect.poll(() => writes.length).toBeGreaterThan(0);
    const recovery = page.getByRole('region', { name: 'Xác minh thao tác bài đăng', exact: true });
    if (!baseline) {
      await expect(recovery).toBeVisible();
      await expect(recovery.getByRole('button', { name: conflict ? 'Đối chiếu lại bài đăng' : 'Xác minh thao tác bài đăng', exact: true })).toBeEnabled();
      assert.equal(writes.length, 1);
    } else {
      // The old row can leave a failed confirmation open; close it as a user would.
      if (entry === 'shelf' && action === 'hide') {
        const cancel = dialog.getByRole('button', { name: 'Hủy', exact: true });
        await expect(cancel).toBeEnabled();
        await cancel.evaluate(button => button.click());
      }
      await expect(dialog).not.toBeVisible();
      await expect(recovery).toHaveCount(0);
    }
    if (width === 390) {
      const menu = page.getByRole('button', { name: /^Menu:/ });
      if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
    }
    await page.getByRole('link', { name: 'Đánh giá của tôi', exact: true }).click();
    if (!baseline) {
      const leave = page.getByRole('alertdialog', { name: 'Rời trang khi chưa xác minh?', exact: true });
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Ở lại tiếp tục', exact: true }).click();
      await expect(page).toHaveURL(origin + target);
      if (width === 390) {
        const menu = page.getByRole('button', { name: /^Menu:/ });
        if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      }
      await page.getByRole('link', { name: 'Đánh giá của tôi', exact: true }).click();
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Rời trang', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Đánh giá của tôi', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(origin + target);
    if (baseline) await expect(recovery).toHaveCount(0);
    else {
      const retry = recovery.getByRole('button', { name: conflict ? 'Đối chiếu lại bài đăng' : 'Xác minh thao tác bài đăng', exact: true });
      await expect(retry).toBeEnabled();
      if (hiding) await expect(page.getByRole('button', { name: conflict ? entry === 'shelf' ? 'Tạm ẩn' : 'Tạm ẩn sách' : entry === 'shelf' ? 'Hiện lại' : 'Hiện lại trên kệ', exact: true })).toBeDisabled();
      await retry.focus();
      assert.equal(await retry.evaluate(button => getComputedStyle(button).outlineOffset), '0px');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await recovery.screenshot({ path: path.join(out, `${entry}-${action}-${width}.png`) });
      if (conflict) {
        probeRead = true;
        await retry.click();
        await expect.poll(() => failedRead).toBe(true);
        await expect(recovery.getByRole('alert')).toContainText('Thao tác vẫn được giữ');
        await expect(retry).toBeEnabled();
        assert.equal(writes.length, 1);
        probeRead = false;
      }
      await retry.click();
      if (entry === 'editor' && action === 'archive') await expect(page).toHaveURL(origin + '/my-books');
      else await expect(retry).toHaveCount(0);
      assert.equal(writes.length, conflict ? 1 : 2);
      if (!conflict) assert.equal(JSON.stringify(writes[0]) === JSON.stringify(writes[1]), true, 'Recovery after remount/deleted read keeps exact path, key, body and version');
      if (action === 'hide') await expect(page.getByRole('button', { name: entry === 'shelf' ? 'Hiện lại' : 'Hiện lại trên kệ', exact: true })).toBeEnabled();
      if (conflict) await expect(page.getByRole('button', { name: entry === 'shelf' ? 'Tạm ẩn' : 'Tạm ẩn sách', exact: true })).toBeEnabled();
    }
    assert.deepEqual(errors, []);
    checks.push({ width, entry, action, recoveryAfterRemount: !baseline, deletedReadRecoverable: action === 'archive' ? !baseline : undefined,
      oppositeActionBlockedUntilAck: action === 'hide' ? !baseline : undefined, exactReplay: !baseline && !conflict,
      refusalFrozenUntilRead: conflict || undefined });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
