// Production draft editor, synthetic HTTP and media only. No DB or storage writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-listing-draft-recovery');
await mkdir(out, { recursive: true });
const baseline = process.env.DRAFT_RECOVERY_BASELINE === '1';
const origin = 'http://127.0.0.1:4222';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.DRAFT_RECOVERY_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4222, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const scenario of ['duplicate', 'lost-ack', 'conflict', 'reload-error', ...baseline ? [] : ['submit', 'timeout', 'rate-limit']]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), writes = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let readStatus = 200;
    const submitting = scenario === 'submit';
    let listing = { id: id(10), version: 4, catalogStatus: 'Confirmed', channel: 'Marketplace',
      state: { moderation: 'Draft', visibility: 'Visible', trade: 'Available' },
      currentRevision: { id: id(11), bookId: id(12), content: { bookId: id(12), mode: 'Exchange', condition: 'Good',
        pages: 'Ruột sách QA ban đầu', coverNote: 'Bìa nguyên', notes: 'Không có', accessories: 'Không có',
        description: 'Mô tả QA đủ dài cho bản nháp trao đổi, chưa gửi duyệt.', readable: true,
        hasMissingPages: false, missingEssentialContent: false, salePrice: null, exchangeValue: 50000, mediaIds: [id(13)] } } };
    const receipt = { entityId: id(10), version: 5 };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === `/api/v1/listings/${id(10)}/draft` && request.method() === 'PUT') {
        writes.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (['timeout', 'rate-limit'].includes(scenario) && writes.length === 1) {
          listing = { ...listing, version: 5, currentRevision: { ...listing.currentRevision, content: JSON.parse(request.postData()).content } };
          return route.fulfill({ status: scenario === 'timeout' ? 408 : 429, json: { code: 'QA_UNCERTAIN' } });
        }
        if (scenario === 'duplicate') return route.abort('failed');
        if (['conflict', 'reload-error'].includes(scenario) || writes.length > 1 && writes.at(-1).key !== writes[0].key)
          return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'Bản nháp QA đã đổi phiên bản.' } });
        if (writes.length === 1 && !submitting) {
          listing = { ...listing, version: 5, currentRevision: { ...listing.currentRevision, content: JSON.parse(request.postData()).content } };
          return route.abort('failed');
        }
        return route.fulfill({ json: receipt });
      }
      if (submitting && p === `/api/v1/listings/${id(10)}/submit` && request.method() === 'POST') {
        assert.equal(JSON.parse(request.postData()).expectedVersion, 5, 'Submit uses the acknowledged draft version');
        writes.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (writes.length === 2) return route.abort('failed');
        return route.fulfill({ json: { ...receipt, version: 6 } });
      }
      assert.equal(request.method(), 'GET', 'Save-only must never submit for review or mutate other resources');
      if (p === `/api/v1/me/listings/${id(10)}`) return readStatus === 200 ? route.fulfill({ json: listing })
        : route.fulfill({ status: readStatus, json: { code: 'QA_UNAVAILABLE' } });
      if (p === `/api/v1/catalog/books/${id(12)}`) return route.fulfill({ json: { title: 'Sách QA bản nháp', authors: ['Tác giả QA'], category: 'Văn học' } });
      if (p === '/api/v1/me/addresses') return route.fulfill({ json: { version: 0, items: [] } });
      if (p === '/api/v1/me/listings') return route.fulfill({ json: { items: [], nextCursor: null } });
      if (p === `/api/v1/me/listings/${id(10)}/media/${id(13)}/read`) return route.fulfill({ json: { id: id(13), width: 100, height: 160,
        url: origin + '/qa-cover.svg', expiresAt: new Date(Date.now() + 60000).toISOString() } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin && p === '/qa-cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="160"><rect width="100" height="160" fill="#5c0202"/></svg>' });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    const target = `/my-books/${id(10)}/edit`;
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(target));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const pages = page.locator('#field-pages');
    await expect(pages).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    const draft = 'Ruột sách QA đã bổ sung thông tin';
    await pages.fill(draft);
    await expect(pages).toHaveValue(draft);
    const save = page.getByRole('button', { name: 'Lưu bản nháp', exact: true });
    if (submitting) {
      await page.getByRole('checkbox', { name: /Tôi cam kết/ }).check();
      await page.getByRole('button', { name: 'Gửi duyệt cho Admin', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: 'Gửi bài đăng cho Admin duyệt?', exact: true });
      await confirm.getByRole('button', { name: 'Xác nhận gửi duyệt', exact: true }).click();
      const retry = page.getByRole('button', { name: 'Thử lại cùng nội dung này', exact: true });
      await expect(retry).toBeVisible();
      await retry.click();
      await expect(page).toHaveURL(new RegExp('/my-books\\?moderation=PendingReview$'));
      assert.equal(writes.length, 3);
      assert.equal(JSON.stringify(writes[1]) === JSON.stringify(writes[2]), true, 'Submit retry reuses its acknowledged save and original submit intent');
      checks.push({ width, scenario, requests: 3, saveStageNotRepeated: true, exactSubmitReplay: true });
      await context.close();
      continue;
    }
    if (scenario === 'duplicate') await save.evaluate(button => { button.click(); button.click(); });
    else await save.click();
    await expect.poll(() => writes.length).toBe(scenario === 'duplicate' && baseline ? 2 : 1);
    if (['conflict', 'reload-error'].includes(scenario)) {
      await expect(pages).toBeEnabled();
      await expect(pages).toHaveValue(draft);
      await expect(page.getByRole('button', { name: 'Thử lại cùng nội dung này', exact: true })).toHaveCount(0);
      if (scenario === 'reload-error') {
        await page.getByText('Bản nháp QA đã đổi phiên bản.', { exact: true }).waitFor();
        readStatus = 503;
        await page.getByRole('button', { name: 'Tải lại bài', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Không mở được bài đăng', exact: true })).toBeVisible();
        readStatus = 200;
        await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
        await expect(pages).toHaveValue(baseline ? 'Ruột sách QA ban đầu' : draft);
      }
    } else if (baseline) {
      await expect(save).toBeEnabled();
      if (scenario === 'lost-ack') {
        await save.click();
        await expect.poll(() => writes.length).toBe(2);
        assert.equal(writes[0].key !== writes[1].key, true, 'Baseline allocates a fresh key after unknown save');
        await expect(page.getByText('Bản nháp QA đã đổi phiên bản.', { exact: true })).toBeVisible();
      } else assert.equal(writes[0].key !== writes[1].key, true, 'Concurrent saves create different intents before the fix');
    } else {
      const retry = page.getByRole('button', { name: 'Thử lại cùng nội dung này', exact: true });
      await expect(retry).toBeVisible();
      await expect(pages).toBeDisabled();
      await expect(save).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Gửi duyệt cho Admin', exact: true })).toBeDisabled();
      await page.getByRole('link', { name: 'Quay về kệ sách', exact: true }).click();
      const leave = page.getByRole('alertdialog', { name: 'Rời trang khi chưa lưu?', exact: true });
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Ở lại tiếp tục', exact: true }).click();
      if (['lost-ack', 'timeout', 'rate-limit'].includes(scenario)) {
        await retry.click();
        await expect(retry).toHaveCount(0);
        await expect(page.getByText('Đã lưu bản nháp thành công!', { exact: false })).toBeVisible();
        await expect(page).toHaveURL(origin + target);
        await expect(pages).toHaveValue(draft);
        await expect(pages).toBeEnabled();
        assert.equal(writes.length, 2);
        assert.equal(JSON.stringify(writes[0]) === JSON.stringify(writes[1]), true, 'Save-only recovery keeps the exact request and never submits for review');
      }
    }
    assert.deepEqual(errors, []);
    checks.push({ width, scenario, requests: writes.length, sameIntentRecovery: scenario === 'lost-ack' ? !baseline : undefined,
      uncertainSaveFreezesOtherActions: ['duplicate', 'lost-ack'].includes(scenario) ? !baseline : undefined,
      failedReloadKeepsDraft: scenario === 'reload-error' ? !baseline : undefined, noSubmitCommand: true });
    if (scenario === 'lost-ack') await page.locator('main').last().screenshot({ path: path.join(out, `draft-${width}-${baseline ? 'before' : 'after'}.png`) });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
