// Production publishing with a fresh owner-shelf cache. All HTTP/upload stages are synthetic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-publish-owner-cache');
await mkdir(out, { recursive: true });
const baseline = process.env.PUBLISH_CACHE_BASELINE === '1';
const origin = 'http://127.0.0.1:4226';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.PUBLISH_CACHE_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4226, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const title = 'Sách QA mới gửi duyệt';
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const outcome of ['success', 'lost-ack', 'refused']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], submissions = [];
    page.on('pageerror', error => errors.push(error.message));
    let submitted = false, shelfReads = 0, commandCounts = { catalog: 0, draft: 0, media: 0, bytes: 0, finalize: 0, save: 0 };
    let content;
    const currentListing = () => ({ id: id(10), version: 3, channel: 'Marketplace', catalogStatus: 'Pending',
      state: { moderation: 'PendingReview', visibility: 'Visible', trade: 'Available' },
      currentRevision: { id: id(11), bookId: id(12), content } });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === `/api/v1/listings/${id(10)}/submit` && request.method() === 'POST') {
        submissions.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (outcome === 'refused') return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'Bản sách QA đã đổi phiên bản.' } });
        submitted = true;
        if (outcome === 'lost-ack' && submissions.length === 1) return route.abort('failed');
        return route.fulfill({ json: { entityId: id(10), version: 3 } });
      }
      if (p === '/api/v1/catalog/requests' && request.method() === 'POST') { commandCounts.catalog++; return route.fulfill({ json: { entityId: id(12), version: 1 } }); }
      if (p === '/api/v1/listings' && request.method() === 'POST') { commandCounts.draft++; return route.fulfill({ json: { entityId: id(10), version: 1 } }); }
      if (p === `/api/v1/listings/${id(10)}/media` && request.method() === 'POST') { commandCounts.media++; return route.fulfill({ json: { entityId: id(13), version: 1 } }); }
      if (p.endsWith(`/media/${id(13)}/upload-ticket`)) return route.fulfill({ json: { path: '/qa-upload', headers: {} } });
      if (p === '/api/v1/qa-upload' && request.method() === 'PUT') { commandCounts.bytes++; return route.fulfill({ json: null }); }
      if (p.endsWith(`/media/${id(13)}/finalize`) && request.method() === 'POST') { commandCounts.finalize++; return route.fulfill({ json: { entityId: id(13), version: 2 } }); }
      if (p === `/api/v1/listings/${id(10)}/draft` && request.method() === 'PUT') {
        commandCounts.save++; content = request.postDataJSON().content;
        return route.fulfill({ json: { entityId: id(10), version: 2 } });
      }
      assert.equal(request.method(), 'GET', 'Only the existing publishing commands are permitted');
      if (p === '/api/v1/me/listings') { shelfReads++; return route.fulfill({ json: { items: submitted ? [currentListing()] : [], nextCursor: null } }); }
      if (p === `/api/v1/me/listings/${id(10)}/media/${id(13)}/read`) return route.fulfill({ json: { id: id(13), width: 80, height: 120,
        url: origin + '/qa-cover.svg', expiresAt: new Date(Date.now() + 120000).toISOString() } });
      if (p === `/api/v1/me/listings/${id(10)}/media/${id(13)}`) return route.fulfill({ json: { id: id(13), version: 1, status: 'Ready' } });
      if (p === `/api/v1/me/catalog-requests/${id(12)}`) return route.fulfill({ json: { currentRevision: { metadata: { title, authors: ['Tác giả QA'], category: 'Sách khác' } } } });
      if (p === '/api/v1/me/addresses') return route.fulfill({ json: { version: 0, items: [] } });
      if (p === '/api/v1/service-areas') return route.fulfill({ json: { code: 'HCM-DEMO-v1', localities: [] } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin && p === '/qa-cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120"><rect width="80" height="120" fill="#5c0202"/></svg>' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fmy-books');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kệ sách đang trống', exact: true })).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    // Fix Date only to retain the 15-second freshness window; timers and authored
    // animations continue normally. This tests invalidation independently of TTL.
    await page.clock.setFixedTime(new Date());
    assert.equal(shelfReads, 1);
    await page.locator('main').getByRole('link', { name: 'Đăng sách', exact: true }).click();
    const step = name => page.getByRole('navigation', { name: 'Các bước đăng sách', exact: true }).getByRole('button', { name });
    await page.getByRole('button', { name: 'Không thấy sách? Tự nhập theo bìa', exact: true }).click();
    await page.getByLabel('Tên sách', { exact: true }).fill(title);
    await page.getByLabel('Tác giả', { exact: true }).fill('Tác giả QA');
    await page.getByRole('combobox', { name: 'Danh mục sách', exact: true }).selectOption({ label: 'Sách khác' });
    await step(/Ảnh bản sách/).click();
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 120; return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await page.locator('#cover-file').setInputFiles({ name: 'qa-cover.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('img', { name: /^Ảnh bìa (?:bản sách|gốc đã chọn)$/ })).toBeVisible();
    await step(/Tình trạng/).click();
    for (const label of ['Ruột sách', 'Bìa và gáy', 'Ghi chú, đánh dấu', 'Phụ kiện']) await page.getByLabel(label, { exact: true }).fill('Thông tin QA');
    await page.getByLabel('Mô tả chung', { exact: true }).fill('Mô tả QA đầy đủ cho bản sách dùng kiểm luồng gửi duyệt.');
    for (const [name, index] of [['readable', 0], ['hasMissingPages', 1], ['missingEssentialContent', 1]]) await page.locator(`input[name=${name}]`).nth(index).locator('..').click();
    await step(/Bán hoặc đổi/).click();
    await page.getByRole('radio', { name: 'Đổi sách', exact: true }).locator('..').click();
    await page.getByLabel('Giá trị đổi (VNĐ)', { exact: true }).fill('50000');
    await step(/Kiểm tra/).click();
    await page.getByLabel('Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.').check();
    await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
    await expect.poll(() => submissions.length).toBe(1);
    if (outcome !== 'success') {
      await expect(page.getByRole('alert')).toBeVisible();
      assert.equal(shelfReads, 1, 'Unknown/refused command does not report refreshed success');
      if (outcome === 'lost-ack') {
        await page.getByRole('button', { name: 'Thử gửi lại', exact: true }).click();
        await expect.poll(() => submissions.length).toBe(2);
        assert.equal(JSON.stringify(submissions[0]) === JSON.stringify(submissions[1]), true, 'Submit retry keeps its original key/body/version');
      }
    }
    if (outcome !== 'refused') await expect(page.getByRole('heading', { name: 'Đã gửi duyệt', exact: true })).toBeVisible();
    if (width === 390) await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    else await page.getByRole('button', { name: /^Tài khoản của / }).click();
    await page.getByRole('link', { name: 'Kệ sách của tôi', exact: true }).click();
    if (outcome === 'refused') await page.getByRole('dialog', { name: 'Rời bàn đăng sách?', exact: true }).getByRole('button', { name: 'Rời trang', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kệ sách của tôi', exact: true })).toBeVisible();
    const visible = !baseline && outcome !== 'refused';
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(visible ? 1 : 0);
    assert.equal(shelfReads, visible ? 2 : 1);
    assert.equal(Object.values(commandCounts).every(count => count === 1), true, 'Retries never repeat acknowledged upload/save stages');
    assert.deepEqual(errors, []);
    await page.locator('main').screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${outcome}-${width}.png`) });
    checks.push({ width, outcome, shelfReads, freshShelfUpdated: visible, stageCommands: commandCounts, submitRequests: submissions.length });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
