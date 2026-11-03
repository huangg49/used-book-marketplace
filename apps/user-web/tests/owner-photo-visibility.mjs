// Production Member UI, signed media and identity from synthetic HTTP only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-owner-photo-visibility');
await mkdir(out, { recursive: true });
const build = process.env.OWNER_PHOTO_BUILD ? path.resolve(root, process.env.OWNER_PHOTO_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.OWNER_PHOTO_BASELINE === '1';
const origin = 'http://127.0.0.1:4205';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4205, strictPort: true } });
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const items = Array.from({ length: 20 }, (_, i) => ({ id: uuid(100 + i), version: 1, catalogStatus: 'Confirmed',
  state: { moderation: 'Approved', visibility: 'Visible', trade: 'Available' },
  currentRevision: { id: uuid(200 + i), bookId: uuid(300 + i), content: {
    bookId: uuid(300 + i), title: `Kệ QA ${i + 1}`, author: 'Tác giả QA',
    mediaIds: [uuid(400 + i)], mode: 'Sale', condition: 'Good', salePrice: 50000,
  } }, updatedAt: '2026-11-03T03:00:00.000Z' }));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=','base64');
async function login(page, route) {
  await page.goto(origin + route);
  await page.getByLabel(/^Email/).fill('reader@example.test');
  await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('#account-content h1').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
}
let browser;
const reports = [];
try {
  browser = await chromium.launch();
  const profiles = baseline ? [{ width: 390 }, { width: 1440 }, { width: 390, failure: 'image' }] :
    [{ width: 390 }, { width: 1440 }, { width: 1440, grid: true }, { width: 390, noObserver: true },
      { width: 390, failure: 'sign' }, { width: 390, failure: 'image' }];
  for (const profile of profiles) {
    const { width, grid = false, noObserver = false, failure } = profile;
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const reads = [], errors = [];
    let recovered = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ grid, noObserver }) => {
      if (grid) localStorage.setItem('latlai_mybooks_view', 'grid');
      if (noObserver) window.IntersectionObserver = undefined;
    }, { grid, noObserver });
    await page.route('**/qa-owner-image/**', route => failure === 'image' && !recovered
      ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: 'image/png', body: png }));
    await page.route('**/api/v1/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/auth/login') return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
        user: { id: uuid(1), email: 'reader@example.test', displayName: 'Bạn đọc QA', status: 'ACTIVE', roles: ['MEMBER'] },
      } });
      assert.equal(route.request().method(), 'GET', 'Only synthetic login may submit a command');
      if (url.pathname === '/api/v1/me/listings') return route.fulfill({ json: {
        items: items.slice(0, Number(url.searchParams.get('limit')) || 20), nextCursor: null,
      } });
      const photo = url.pathname.match(/^\/api\/v1\/me\/listings\/([^/]+)\/media\/([^/]+)\/read$/);
      if (photo) {
        reads.push(photo[1]);
        if (failure === 'sign' && !recovered) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
        return route.fulfill({ json: { id: photo[2], width: 1, height: 1, url: `${origin}/qa-owner-image/${photo[2]}-${reads.length}.png`,
          expiresAt: new Date(Date.now() + 120_000).toISOString() } });
      }
      const book = url.pathname.match(/^\/api\/v1\/catalog\/books\/([^/]+)$/);
      if (book) {
        const item = items.find(item => item.currentRevision.bookId === book[1]);
        return route.fulfill({ json: { title: item.currentRevision.content.title, authors: ['Tác giả QA'], category: 'Văn học' } });
      }
      if (url.pathname === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await login(page, '/my-books');
    await expect(page.getByRole('heading', { name: 'Kệ QA 20', exact: true })).toBeAttached();
    await page.waitForTimeout(200);
    const initial = reads.length;
    if (baseline || noObserver) assert.equal(initial, 20);
    else assert(initial > 0 && initial < 20, 'Only covers near the viewport should be signed');
    if (failure) {
      // Find the card through the stable li boundary for both existing layouts.
      const card = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Kệ QA 1', exact: true }) });
      await expect(card.getByRole('button', { name: 'Tải lại ảnh', exact: true })).toBeVisible();
      recovered = true;
      await card.getByRole('button', { name: 'Tải lại ảnh', exact: true }).click();
      await expect.poll(() => card.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      recovered = false;
      await login(page, '/account');
      const firstOverview = page.locator('#overview-books-section .group').first();
      await firstOverview.scrollIntoViewIfNeeded();
      if (baseline && failure === 'image') {
        await expect.poll(() => firstOverview.locator('img').evaluate(img => img.complete && img.naturalWidth === 0)).toBe(true);
        await expect(firstOverview.getByRole('button', { name: 'Tải lại ảnh', exact: true })).toHaveCount(0);
      } else {
        await expect(firstOverview.getByRole('button', { name: 'Tải lại ảnh', exact: true })).toBeVisible();
        recovered = true;
        await firstOverview.getByRole('button', { name: 'Tải lại ảnh', exact: true }).click();
        await expect.poll(() => firstOverview.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      }
    } else if (!baseline) {
      const last = page.getByRole('heading', { name: 'Kệ QA 20', exact: true });
      await last.scrollIntoViewIfNeeded();
      const lastImage = page.locator('img[alt="Ảnh bản sách Kệ QA 20"]');
      await expect.poll(() => lastImage.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(200);
      const readsAfterScroll = reads.length;
      await page.waitForTimeout(300);
      assert.equal(reads.length, readsAfterScroll, 'Returning to seen rows must not re-sign their photos');
      if (width === 1440 && !grid && !noObserver) {
        await page.waitForTimeout(16_000);
        const seenReads = reads.length;
        await last.scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        assert.equal(reads.length, seenReads, 'Seen rows stay enabled after the normal cache stale time');
        await page.evaluate(() => scrollTo(0, 0));
      }
      const card = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Kệ QA 1', exact: true }) });
      await card.hover();
      await page.waitForTimeout(350);
      const transform = await card.locator('img').evaluate(img => getComputedStyle(img).transform);
      assert.equal(transform, grid ? 'matrix(1.06, 0, 0, 1.06, 0, 0)' : 'matrix(1.04, 0, 0, 1.04, 0, 0)');
      await page.screenshot({ path: path.join(out, `shelf-${width}${grid ? '-grid' : ''}${noObserver ? '-fallback' : ''}.png`) });
    }
    // Account route is a separate cold document; its below-fold shelf must defer photos too.
    let overviewInitial;
    if (!grid && !noObserver && !failure) {
      reads.length = 0;
      await login(page, '/account');
      await page.locator('#overview-books-section h3').first().waitFor({ state: 'attached' });
      await page.waitForTimeout(200);
      overviewInitial = reads.length;
      assert.equal(overviewInitial, baseline ? 8 : 0);
      if (!baseline) {
        await page.locator('#overview-books-section').scrollIntoViewIfNeeded();
        await expect.poll(() => reads.length).toBeGreaterThan(0);
        await expect.poll(() => page.locator('#overview-books-section img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
        await page.locator('#overview-books-section .group').first().hover();
        await page.waitForTimeout(350);
        assert.equal(await page.locator('#overview-books-section img').first().evaluate(img => getComputedStyle(img).transform), 'matrix(1.05, 0, 0, 1.05, 0, 0)');
        await page.screenshot({ path: path.join(out, `overview-${width}.png`) });
        const seen = new Set(reads);
        await page.evaluate(() => scrollTo(0, 0));
        if (width === 390) await page.getByRole('button', { name: /^Menu:/ }).click();
        await page.getByRole('navigation', { name: 'Không gian cá nhân', exact: true }).locator('a[href="/my-books"]').click();
        await page.getByRole('heading', { name: 'Kệ QA 20', exact: true }).waitFor({ state: 'attached' });
        await page.waitForTimeout(250);
        for (const id of seen) assert.equal(reads.filter(read => read === id).length, 1, 'Overview photos are reused on the full shelf');
        await page.goBack();
        await page.locator('#overview-books-section').waitFor({ state: 'attached' });
      }
    }
    assert.deepEqual(errors, []);
    reports.push({ ...profile, initial, overviewInitial, reads: reads.length, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, reports }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
