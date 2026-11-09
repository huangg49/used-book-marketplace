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
  for (const width of [390, 1440]) for (const outcome of ['success', 'lost-ack', 'refused', ...baseline ? [] : ['revised', 'autofill']]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], submissions = [];
    page.on('pageerror', error => errors.push(error.message));
    let submitted = false, shelfReads = 0, draftReads = 0, saves = [], commandCounts = { catalog: 0, draft: 0, media: 0, bytes: 0, finalize: 0, save: 0 };
    let content, outgoingTitle;
    const currentListing = () => ({ id: id(10), version: outcome === 'revised' ? 5 : 3, channel: 'Marketplace', catalogStatus: 'Pending',
      state: { moderation: 'PendingReview', visibility: 'Visible', trade: 'Available' },
      currentRevision: { id: id(11), bookId: id(12), content } });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === `/api/v1/listings/${id(10)}/submit` && request.method() === 'POST') {
        submissions.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (outcome === 'refused' || (outcome === 'revised' && submissions.length === 1)) return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'Bản sách QA đã đổi phiên bản.' } });
        submitted = true;
        if (outcome === 'lost-ack' && submissions.length === 1) return route.abort('failed');
        return route.fulfill({ json: { entityId: id(10), version: outcome === 'revised' ? 5 : 3 } });
      }
      if (p.endsWith('/isbn-matches') && outcome === 'autofill') {
        return route.fulfill({ json: { listingId: id(10), status: 'NotFound', isbns: [], catalog: null, serverTime: new Date().toISOString() } });
      }
      if (p.endsWith('/autofill-suggestions') && outcome === 'autofill') {
        return route.fulfill({ json: { id: id(20), status: 'Suggested', cached: false, matches: [], missing: [],
          fields: { title: 'Sách QA', authors: [], isbn: null, publisher: null, publicationYear: null, language: null, edition: null } } });
      }
      if (p.endsWith('/catalog-matches') && outcome === 'autofill') {
        return route.fulfill({ json: { items: [], truncated: false, serverTime: new Date().toISOString() } });
      }
      if (p === '/api/v1/catalog/requests' && request.method() === 'POST') { commandCounts.catalog++; outgoingTitle = request.postDataJSON().metadata.title; return route.fulfill({ json: { entityId: id(12), version: 1 } }); }
      if (p === '/api/v1/listings' && request.method() === 'POST') { commandCounts.draft++; return route.fulfill({ json: { entityId: id(10), version: 1 } }); }
      if (p === `/api/v1/listings/${id(10)}/media` && request.method() === 'POST') { commandCounts.media++; return route.fulfill({ json: { entityId: id(12 + commandCounts.media), version: 1 } }); }
      if (p.endsWith('/upload-ticket')) return route.fulfill({ json: { path: '/qa-upload', headers: {} } });
      if (p === '/api/v1/qa-upload' && request.method() === 'PUT') { commandCounts.bytes++; return route.fulfill({ json: null }); }
      if (p.endsWith('/finalize') && request.method() === 'POST') { commandCounts.finalize++; return route.fulfill({ json: { entityId: id(13), version: 2 } }); }
      if (p === `/api/v1/listings/${id(10)}/draft` && request.method() === 'PUT') {
        commandCounts.save++;
        const body = request.postDataJSON();
        content = body.content;
        saves.push({ key: request.headers()['idempotency-key'], body });
        return route.fulfill({ json: { entityId: id(10), version: commandCounts.save === 2 ? 4 : 2 } });
      }
      assert.equal(request.method(), 'GET', 'Only the existing publishing commands are permitted');
      if (p === `/api/v1/me/listings/${id(10)}` && outcome === 'revised') {
        draftReads++;
        return route.fulfill({ json: { id: id(10), version: 3, state: { moderation: 'Draft' } } });
      }
      if (p === `/api/v1/me/listings/${id(10)}` && outcome === 'autofill' && submitted) return route.fulfill({ json: currentListing() });
      if (p === '/api/v1/me/listings') { shelfReads++; return route.fulfill({ json: { items: submitted ? [currentListing()] : [], nextCursor: null } }); }
      if (p.includes(`/api/v1/me/listings/${id(10)}/media/`) && p.endsWith('/read')) return route.fulfill({ json: { id: id(13), width: 80, height: 120,
        url: origin + '/qa-cover.svg', expiresAt: new Date(Date.now() + 120000).toISOString() } });
      if (p.startsWith(`/api/v1/me/listings/${id(10)}/media/`)) return route.fulfill({ json: { id: p.split('/').at(-1), version: 1, status: 'Ready' } });
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
    const titleInput = page.getByLabel('Tên sách', { exact: true });
    if (outcome === 'autofill') {
      const panel = page.locator('section[aria-labelledby="photo-autofill-title"]');
      const bytes = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 120; return c.toDataURL('image/png').split(',')[1]; }), 'base64');
      await panel.locator('input[type=file]').setInputFiles({ name: 'qa-reading.png', mimeType: 'image/png', buffer: bytes });
      await panel.getByRole('button', { name: 'Đọc thông tin', exact: true }).click();
      await panel.getByText(/Chưa tìm thấy đầu sách phù hợp/).waitFor();
      await panel.getByLabel('Tên sách từ ảnh', { exact: true }).fill(title);
      await panel.getByRole('button', { name: 'Dùng tất cả thông tin đã rà soát' }).click();
      await expect(titleInput).toHaveValue(title);
    } else {
      await titleInput.fill(title);
    }
    const authorInput = page.getByLabel('Tác giả', { exact: true });
    await authorInput.pressSequentially('Tác giả QA');
    await page.getByRole('combobox', { name: 'Danh mục sách', exact: true }).selectOption({ label: 'Sách khác' });
    await expect(authorInput).toHaveValue('Tác giả QA');
    await step(/Ảnh bản sách/).click();
    const png = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 120; return c.toDataURL('image/png').split(',')[1]; }), 'base64');
    await page.locator('#cover-file').setInputFiles({ name: 'qa-cover.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByRole('img', { name: /^Ảnh bìa (?:bản sách|gốc đã chọn)$/ })).toBeVisible();
    if (outcome === 'autofill') {
      const panel = page.locator('section[aria-labelledby="photo-autofill-title"]');
      await expect(panel).toBeHidden();
      await page.getByRole('button', { name: 'Quay lại', exact: true }).click();
      await expect(panel.getByRole('img', { name: 'Ảnh để đọc 1' })).toBeVisible();
      await expect(panel.getByLabel('Tên sách từ ảnh', { exact: true })).toHaveValue(title);
      await expect(panel.getByRole('button', { name: 'Đã dùng Tên sách' })).toBeVisible();
      await expect(titleInput).toHaveValue(title);
      await expect(authorInput).toHaveValue('Tác giả QA');
      await expect(page.getByRole('combobox', { name: 'Danh mục sách', exact: true }).locator('option:checked')).toHaveText('Sách khác');
      await page.getByRole('button', { name: 'Tiếp tục', exact: true }).click();
      await expect(page.getByRole('img', { name: /^Ảnh bìa (?:bản sách|gốc đã chọn)$/ })).toBeVisible();
    }
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
    await expect.poll(() => submissions.length, { message: `Submit request at ${width}px, ${outcome}` }).toBe(1);
    if (outcome !== 'success' && outcome !== 'autofill') {
      await expect(page.getByRole('alert')).toBeVisible();
      assert.equal(shelfReads, 1, 'Unknown/refused command does not report refreshed success');
      if (outcome === 'lost-ack') {
        await expect(page.getByRole('button', { name: 'Tải bản nháp để sửa', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Thử gửi lại', exact: true }).click();
        await expect.poll(() => submissions.length).toBe(2);
        assert.equal(JSON.stringify(submissions[0]) === JSON.stringify(submissions[1]), true, 'Submit retry keeps its original key/body/version');
      }
    }
    if (outcome === 'revised') {
      const recovery = page.getByRole('button', { name: 'Tải bản nháp để sửa', exact: true });
      await expect(recovery).toBeVisible();
      await recovery.click();
      await expect(page.getByLabel('Tên sách', { exact: true })).toHaveValue(title);
      await step(/Tình trạng/).click();
      const revisedPages = 'Nội dung đã sửa sau khi tải lại bản nháp';
      await page.getByLabel('Ruột sách', { exact: true }).fill(revisedPages);
      await step(/Kiểm tra/).click();
      await page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
      await expect.poll(() => submissions.length).toBe(2);
      assert.equal(draftReads, 1);
      assert.equal(saves[1].body.expectedVersion, 3);
      assert.equal(saves[1].body.content.pages, revisedPages);
      assert.notEqual(saves[1].key, saves[0].key);
      assert.notEqual(submissions[1].key, submissions[0].key);
      assert.equal(JSON.parse(submissions[1].body).expectedVersion, 4);
    }
    if (outcome !== 'refused') {
      await expect(page.getByRole('heading', { name: 'Đã gửi duyệt', exact: true })).toBeVisible();
      if (!baseline) await expect(page.getByRole('link', { name: 'Xem bài vừa gửi' })).toHaveAttribute('href', `/my-books/${id(10)}/edit`);
      if (outcome === 'autofill') {
        assert.equal(outgoingTitle, title, 'The corrected title is persisted to the catalog request');
        await page.getByRole('link', { name: 'Xem bài vừa gửi' }).click();
        await expect(page.getByText('Bài đang chờ duyệt. Hãy chờ kết quả rồi sửa tiếp.', { exact: true })).toBeVisible();
        assert.equal(commandCounts.media, 2, 'Reading image and listing cover are separate uploads');
        assert.equal(commandCounts.draft, 1);
        assert.deepEqual(errors, []);
        checks.push({ width, outcome, exactOwnerDetail: true, correctedTitleSent: true, stageCommands: commandCounts });
        await context.close();
        continue;
      }
    }
    if (width === 390) await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
    else await page.getByRole('button', { name: /^Tài khoản của / }).click();
    await page.getByRole('link', { name: 'Kệ sách của tôi', exact: true }).click();
    if (outcome === 'refused') await page.getByRole('dialog', { name: 'Rời bàn đăng sách?', exact: true }).getByRole('button', { name: 'Rời trang', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Kệ sách của tôi', exact: true })).toBeVisible();
    const visible = !baseline && outcome !== 'refused';
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(visible ? 1 : 0);
    assert.equal(shelfReads, visible ? 2 : 1);
    assert.deepEqual(commandCounts, { catalog: 1, draft: 1, media: 1, bytes: 1, finalize: 1, save: outcome === 'revised' ? 2 : 1 },
      'A revised submission reuses the draft and acknowledged upload; a lost ACK also reuses the save');
    assert.deepEqual(errors, []);
    await page.locator('main').screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${outcome}-${width}.png`) });
    checks.push({ width, outcome, shelfReads, freshShelfUpdated: visible, stageCommands: commandCounts, submitRequests: submissions.length });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
