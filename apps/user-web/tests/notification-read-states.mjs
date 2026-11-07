// Production inbox read-state fixtures. All origins/WS intercepted; no writes except synthetic login.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-notification-read-states');
await mkdir(out, { recursive: true });
const baseline = process.env.NOTIFICATION_STATE_BASELINE === '1';
const origin = 'http://127.0.0.1:4227';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.NOTIFICATION_STATE_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4227, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T08:30:00.000Z';
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const notice = { id: id(10), kind: 'SupportUpdated', title: 'Thông báo QA cần đọc', body: 'Nội dung QA dùng kiểm dữ liệu cũ.',
  targetType: 'SupportCase', targetId: id(20), createdAt: now, readAt: null };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const mode of ['initial-error', 'empty', 'cached-503', 'cached-empty-503', 'cached-403', 'cached-404', ...baseline ? [] : ['next-403']]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let status = 200, reads = 0, hold = true, release;
    const empty = mode === 'empty' || mode === 'cached-empty-503';
    const paged = mode === 'next-403';
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      assert.equal(request.method(), 'GET', 'Read recovery never marks notifications or mutates another resource');
      if (p === '/api/v1/me/notifications') {
        if (url.searchParams.get('limit') !== '30') return route.fulfill({ json: { items: [], unreadCount: 0, nextCursor: null } });
        reads++;
        if (hold) await new Promise(resolve => { release = resolve; });
        const next = url.searchParams.has('cursor');
        const items = paged ? next ? [{ ...notice, id: id(30), title: 'Thông báo QA trang hai' }]
          : Array.from({ length: 10 }, (_, i) => ({ ...notice, id: id(10 + i), title: i ? `Thông báo QA mục ${i}` : notice.title })) : empty ? [] : [notice];
        return route.fulfill(status === 200 ? { json: { items, unreadCount: empty ? 0 : paged ? 11 : 1, nextCursor: paged && !next ? 'next' : null } }
          : { status, json: { code: status === 403 ? 'FORBIDDEN' : status === 404 ? 'NOT_FOUND' : 'QA_UNAVAILABLE' } });
      }
      if (p === '/api/v1/me/cart') return route.fulfill({ json: { id: user.id, version: 1, serverTime: now, items: [] } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      return url.origin === origin ? route.continue() : route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fnotifications');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const inbox = page.locator('section[aria-labelledby="notifications-title"]');
    await expect(inbox.getByRole('heading', { name: 'Thông Báo', exact: true })).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'), undefined, { timeout: 15000 });
    await expect.poll(() => typeof release).toBe('function');
    const allRead = inbox.getByText('Hộp thư thông báo của bạn đã được đọc hết.', { exact: true });
    await expect(allRead).toHaveCount(baseline ? 1 : 0);
    await expect(inbox.getByRole('tab', { name: 'Tất cả', exact: true })).toHaveCount(baseline ? 0 : 1);
    if (!baseline) await expect(inbox.getByText('Đang tải trạng thái thông báo…', { exact: true })).toBeVisible();
    status = mode === 'initial-error' ? 503 : 200;
    hold = false; release();
    if (mode === 'initial-error') {
      await expect(inbox.getByRole('heading', { name: 'Chưa tải được danh sách thông báo', exact: true })).toBeVisible();
      await expect(allRead).toHaveCount(baseline ? 1 : 0);
      if (!baseline) await expect(inbox.getByText('Chưa xác minh được trạng thái thông báo.', { exact: true })).toBeVisible();
    } else {
      if (empty) await expect(allRead).toBeVisible();
      else await expect(inbox.getByRole('heading', { name: notice.title, exact: true })).toBeVisible();
      if (paged) {
        status = 403;
        await inbox.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
        await expect(inbox.getByRole('heading', { name: 'Chưa tải được danh sách thông báo', exact: true })).toBeVisible();
        await expect(inbox.getByRole('heading', { name: notice.title, exact: true })).toHaveCount(0);
        await expect(inbox.getByRole('button', { name: 'Đánh dấu đã đọc hết', exact: true })).toHaveCount(0);
        await expect(inbox.locator('nav')).toHaveCount(0);
        status = 200;
        await inbox.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
        await expect(inbox.getByRole('heading', { name: notice.title, exact: true })).toBeVisible();
        await inbox.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
        await expect(inbox.getByRole('heading', { name: 'Thông báo QA trang hai', exact: true })).toBeVisible();
        assert.deepEqual(errors, []);
        checks.push({ width, mode, reads, truthfulLoading: true, laterPageDenialHidesCache: true, retryThenNextPage: true });
        await context.close();
        continue;
      }
      if (mode.startsWith('cached')) {
        if (width === 390) {
          const menu = page.getByRole('button', { name: /^Menu:/ });
          if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
        }
        await page.getByRole('link', { name: 'Giỏ sách', exact: true }).click();
        await expect(page).toHaveURL(origin + '/cart');
        await expect(inbox).toHaveCount(0);
        status = mode.endsWith('403') ? 403 : mode.endsWith('404') ? 404 : 503;
        await page.goBack();
        await expect(inbox.getByRole('heading', { name: 'Chưa tải được danh sách thông báo', exact: true })).toBeVisible();
        const denied = status === 403 || status === 404;
        await expect(inbox.getByRole('heading', { name: notice.title, exact: true })).toHaveCount(!empty && (baseline || !denied) ? 1 : 0);
        if (!baseline) {
          await expect(allRead).toHaveCount(0);
          await expect(inbox.getByText(denied ? 'Chưa xác minh được trạng thái thông báo.' : 'Chưa cập nhật được thông báo. Đang hiển thị dữ liệu của lần tải trước.', { exact: true })).toBeVisible();
          if (denied) {
            await expect(inbox.getByRole('button', { name: 'Đánh dấu đã đọc hết', exact: true })).toHaveCount(0);
            await expect(inbox.locator('nav')).toHaveCount(0);
          }
        } else if (empty) await expect(allRead).toBeVisible();
      }
    }
    if (mode !== 'empty') {
      // Wait for authored layout/entrance motion to settle; do not pause motion
      // or capture the intentional in-between frame when the error box enters.
      await page.waitForFunction(() => Array.from(document.querySelectorAll('#notification-results > li')).every(item => {
        const style = getComputedStyle(item);
        return style.opacity === '1' && (style.transform === 'none' || style.transform === 'matrix(1, 0, 0, 1, 0, 0)');
      }), undefined, { timeout: 5000 });
      await inbox.screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${mode}-${width}.png`) });
      status = 200;
      await inbox.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
      if (empty) await expect(allRead).toBeVisible();
      else await expect(inbox.getByRole('heading', { name: notice.title, exact: true })).toBeVisible();
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    checks.push({ width, mode, reads, truthfulLoading: !baseline, truthfulFailure: !baseline,
      cachedNoticeHiddenOnDenial: mode.endsWith('403') || mode.endsWith('404') ? !baseline : undefined, realEmptyStillRecognized: empty });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
