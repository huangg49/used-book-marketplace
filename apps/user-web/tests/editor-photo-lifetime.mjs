// Isolated production editor resource lifetime. No upload/API/storage writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-editor-photo-lifetime');
await mkdir(out, { recursive: true });
const baseline = process.env.EDITOR_PHOTO_BASELINE === '1';
const origin = 'http://127.0.0.1:4224';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.EDITOR_PHOTO_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4224, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const listing = { id: id(10), version: 3, channel: 'Marketplace', catalogStatus: 'Confirmed',
  state: { moderation: 'Draft', visibility: 'Visible', trade: 'Available' },
  currentRevision: { id: id(11), bookId: id(12), content: { bookId: id(12), mode: 'Exchange', condition: 'Good',
    pages: 'Ruột sách QA', coverNote: 'Bìa nguyên', notes: 'Không có', accessories: 'Không có', description: 'Mô tả QA cho bản nháp sách, dùng để kiểm ảnh tạm.',
    readable: true, hasMissingPages: false, missingEssentialContent: false, salePrice: null, exchangeValue: 50000, mediaIds: [id(13)] } } };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const count of [3, 10]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      const live = new Set(); let created = 0, revoked = 0;
      URL.createObjectURL = blob => { const url = create(blob); live.add(url); created++; return url; };
      URL.revokeObjectURL = url => { if (live.delete(url)) revoked++; revoke(url); };
      window.__photoResources = () => ({ created, revoked, live: live.size });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      assert.equal(request.method(), 'GET', 'Photo lifetime must not save, upload, submit, or mutate any resource');
      if (p === `/api/v1/me/listings/${id(10)}`) return route.fulfill({ json: listing });
      if (p === `/api/v1/catalog/books/${id(12)}`) return route.fulfill({ json: { title: 'Sách QA ảnh tạm', authors: ['Tác giả QA'], category: 'Văn học' } });
      if (p === `/api/v1/me/listings/${id(10)}/media/${id(13)}/read`) return route.fulfill({ json: { id: id(13), width: 100, height: 160,
        url: origin + '/qa-cover.svg', expiresAt: new Date(Date.now() + 60000).toISOString() } });
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
    await expect(page.locator('#field-pages')).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    const png = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 120;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#5c0202'; ctx.fillRect(0, 0, 80, 120);
      return canvas.toDataURL('image/png').split(',')[1];
    }), 'base64');
    await page.locator('input[type=file]').setInputFiles(Array.from({ length: count }, (_, i) => ({ name: `qa-${i}.png`, mimeType: 'image/png', buffer: png })));
    const visible = Math.min(count, 7), photos = page.getByAltText(/^Ảnh mới qa-/);
    await expect(photos).toHaveCount(visible);
    await expect.poll(() => page.evaluate(() => Array.from(document.querySelectorAll('img[src^="blob:"]')).every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    const afterAdd = await page.evaluate(() => window.__photoResources());
    assert.equal(afterAdd.live, baseline ? count : visible);
    if (!baseline) assert.equal(afterAdd.created, visible, 'Unused files never allocate preview URLs');
    const card = page.locator('li').filter({ has: page.getByAltText('Ảnh mới qa-1.png', { exact: true }) });
    await card.hover();
    await card.getByRole('button', { name: 'Làm bìa', exact: true }).click();
    await expect(photos.first()).toHaveAttribute('alt', 'Ảnh mới qa-1.png');
    assert.equal((await page.evaluate(() => window.__photoResources())).live, afterAdd.live, 'Reordering never revokes a retained preview');
    await card.hover();
    await card.getByRole('button', { name: 'Xóa ảnh này', exact: true }).click();
    await expect(photos).toHaveCount(visible - 1);
    await expect.poll(async () => (await page.evaluate(() => window.__photoResources())).live).toBe(afterAdd.live - 1);
    await expect.poll(() => photos.evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
    if (!baseline && count === 3) await page.locator('ul').filter({ has: photos.first() }).last().screenshot({ path: path.join(out, `previews-${width}.png`) });
    await page.getByRole('link', { name: 'Về kệ sách của tôi', exact: true }).click();
    const leave = page.getByRole('alertdialog', { name: 'Rời trang khi chưa lưu?', exact: true });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Rời trang', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kệ sách của tôi', exact: true })).toBeVisible();
    const afterLeave = await page.evaluate(() => window.__photoResources());
    assert.equal(afterLeave.live, baseline ? count - 1 : 0);
    assert.deepEqual(errors, []);
    checks.push({ width, selected: count, shown: visible, afterAdd, afterLeave, retainedPreviewsDecoded: true });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
