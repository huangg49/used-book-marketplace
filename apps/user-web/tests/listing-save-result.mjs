// Production draft save result: synthetic auth, HTTP, image and upload stages.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-listing-save-result');
await mkdir(out, { recursive: true });
const baseline = process.env.LISTING_SAVE_BASELINE === '1';
const origin = 'http://127.0.0.1:4225';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.LISTING_SAVE_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4225, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const scenario of ['saved', 'photo-read-error', 'slow-read', ...baseline ? [] : ['stale-read']]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], saves = [];
    page.on('pageerror', error => errors.push(error.message));
    let reservations = 0, readFailures = 0, failRead = scenario === 'photo-read-error', slowRead = scenario === 'slow-read', readStarted = false;
    let releaseRead;
    let stale = scenario === 'stale-read';
    let listing = { id: id(10), version: 3, channel: 'Marketplace', catalogStatus: 'Confirmed',
      state: { moderation: 'Draft', visibility: 'Visible', trade: 'Available' },
      currentRevision: { id: id(11), bookId: id(12), content: { bookId: id(12), mode: 'Exchange', condition: 'Good',
        pages: 'Ruột sách QA', coverNote: 'Bìa nguyên', notes: 'Không có', accessories: 'Không có', description: 'Mô tả QA cho bản nháp sách, dùng để kiểm kết quả lưu.',
        readable: true, hasMissingPages: false, missingEssentialContent: false, salePrice: null, exchangeValue: 50000, mediaIds: [id(13)] } } };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === `/api/v1/listings/${id(10)}/draft` && request.method() === 'PUT') {
        const body = JSON.parse(request.postData());
        assert.equal(body.expectedVersion, listing.version, 'Save uses the current acknowledged listing version');
        saves.push({ key: request.headers()['idempotency-key'], body });
        listing = { ...listing, version: listing.version + 1, currentRevision: { ...listing.currentRevision, content: body.content } };
        return route.fulfill({ json: { entityId: listing.id, version: listing.version } });
      }
      if (p === `/api/v1/listings/${id(10)}/media` && request.method() === 'POST') {
        reservations++;
        return route.fulfill({ json: { entityId: id(19 + reservations), version: 1 } });
      }
      if (/\/listings\/[^/]+\/media\/[^/]+\/upload-ticket$/.test(p)) return route.fulfill({ json: { path: '/qa-upload', headers: {} } });
      if (p === '/api/v1/qa-upload' && request.method() === 'PUT') return route.fulfill({ json: null });
      if (/\/listings\/[^/]+\/media\/[^/]+\/finalize$/.test(p)) return route.fulfill({ json: { entityId: p.split('/').at(-2), version: 2 } });
      assert.equal(request.method(), 'GET', 'No submit or unrelated commands in save-result fixtures');
      if (p === `/api/v1/me/listings/${id(10)}`) {
        if (saves.length) {
          readStarted = true;
          if (slowRead) await new Promise(resolve => { releaseRead = resolve; });
          if (failRead) { readFailures++; return route.fulfill({ status: 503, json: { code: 'QA_READ_FAILED' } }); }
          if (stale) { stale = false; return route.fulfill({ json: { ...listing, version: 3 } }); }
        }
        return route.fulfill({ json: listing });
      }
      if (p === `/api/v1/catalog/books/${id(12)}`) return route.fulfill({ json: { title: 'Sách QA kết quả lưu', authors: ['Tác giả QA'], category: 'Văn học' } });
      if (/\/me\/listings\/[^/]+\/media\/[^/]+\/read$/.test(p)) return route.fulfill({ json: { id: p.split('/').at(-2), width: 100, height: 160,
        url: origin + '/qa-cover.svg', expiresAt: new Date(Date.now() + 60000).toISOString() } });
      if (/\/me\/listings\/[^/]+\/media\/[^/]+$/.test(p)) return route.fulfill({ json: { id: p.split('/').at(-1), version: 1, status: 'Ready' } });
      if (p === '/api/v1/me/addresses') return route.fulfill({ json: { version: 0, items: [] } });
      if (p === '/api/v1/me/listings') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin && p === '/qa-cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160"><rect width="100" height="160" fill="#5c0202"/></svg>' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(`/my-books/${id(10)}/edit`));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const pages = page.locator('#field-pages');
    await expect(pages).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    if (scenario === 'photo-read-error') {
      const png = Buffer.from(await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 120; return canvas.toDataURL('image/png').split(',')[1]; }), 'base64');
      await page.locator('input[type=file]').setInputFiles({ name: 'qa-saved.png', mimeType: 'image/png', buffer: png });
      await expect(page.getByAltText('Ảnh mới qa-saved.png', { exact: true })).toBeVisible();
    }
    await pages.fill('Ruột sách QA đã sửa trước khi lưu');
    if (scenario === 'saved') await page.getByRole('checkbox', { name: /Tôi cam kết/ }).check();
    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await expect.poll(() => saves.length).toBe(1);
    if (scenario === 'stale-read') {
      const retry = page.getByRole('button', { name: 'Tải lại bản nháp đã lưu', exact: true });
      await expect(retry).toBeEnabled();
      await expect(pages).toBeDisabled();
      await retry.click();
      assert.equal(saves.length, 1, 'An older read never resends a known Save');
    }
    if (scenario === 'photo-read-error') {
      await expect.poll(() => readFailures).toBeGreaterThan(0);
      if (baseline) {
        await expect(page.getByRole('heading', { name: 'Không mở được bài đăng', exact: true })).toBeVisible();
        failRead = false;
        await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
      } else {
        const retry = page.getByRole('button', { name: 'Tải lại bản nháp đã lưu', exact: true });
        await expect(retry).toBeEnabled();
        await retry.click();
        await expect.poll(() => readFailures).toBeGreaterThan(1);
        await expect(retry).toBeEnabled();
        assert.equal(saves.length, 1, 'Known ACK recovery never sends Save again');
        await page.getByRole('region', { name: 'Bản nháp đã lưu' }).screenshot({ path: path.join(out, `saved-read-error-${width}.png`) });
        failRead = false;
        await retry.click();
      }
      await expect(pages).toBeEnabled();
      await expect(page.getByAltText('Ảnh mới qa-saved.png', { exact: true })).toHaveCount(baseline ? 1 : 0);
      await pages.fill('Ruột sách QA sửa tiếp sau khi lưu');
      await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
      await expect.poll(() => saves.length).toBe(2);
      assert.equal(reservations, baseline ? 2 : 1, 'A saved photo is reused for subsequent saves');
      assert.equal(saves[1].body.content.mediaIds.includes(id(20)), !baseline);
    } else if (scenario === 'slow-read') {
      await expect.poll(() => readStarted).toBe(true);
      if (baseline) await expect(pages).toBeEnabled();
      else await expect(pages).toBeDisabled();
      slowRead = false; releaseRead();
    }
    await expect(pages).toBeEnabled();
    await expect(page.getByText('Đã lưu bản nháp thành công!', { exact: false })).toBeVisible();
    if (scenario === 'saved') {
      await expect(page.getByRole('checkbox', { name: /Tôi cam kết/ })).toBeChecked();
      await pages.fill('Ruột sách QA sửa tiếp nhưng chưa lưu');
      await expect(page.getByText('Đã lưu bản nháp thành công!', { exact: false })).toHaveCount(baseline ? 1 : 0);
      await page.getByRole('link', { name: 'Về kệ sách của tôi', exact: true }).click();
      const unsaved = page.getByRole('alertdialog', { name: 'Rời trang khi chưa lưu?', exact: true });
      await expect(unsaved).toBeVisible();
      await unsaved.getByRole('button', { name: 'Ở lại tiếp tục', exact: true }).click();
      await expect(unsaved).toHaveCount(0);
      await pages.fill('Ruột sách QA đã sửa trước khi lưu');
      await expect(pages).toHaveValue('Ruột sách QA đã sửa trước khi lưu');
    }
    await page.getByRole('link', { name: 'Về kệ sách của tôi', exact: true }).click();
    const leave = page.getByRole('alertdialog', { name: 'Rời trang khi chưa lưu?', exact: true });
    if (baseline) {
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Rời trang', exact: true }).click();
    } else await expect(leave).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Kệ sách của tôi', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    checks.push({ width, scenario, saves: saves.length, reservations, readFailures,
      knownAckReadRecovery: !baseline, canonicalSavedForm: !baseline });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
