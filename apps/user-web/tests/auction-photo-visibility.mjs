// Production auction image behavior with synthetic HTTP only; no DB or provider calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.AUCTION_PHOTO_BUILD
  ? path.resolve(root, process.env.AUCTION_PHOTO_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/auction-photo-visibility');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4204';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4204, strictPort: true },
});
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const base = Date.now();
const makeAuction = (i, scheduled) => ({
  id: uuid(i), listingId: uuid(100 + i), title: 'Phiên ảnh QA ' + i, state: 'Active', phase: scheduled ? 'Scheduled' : 'Live',
  startPrice: 50000, step: 10000, buyNowPrice: 200000, currentPrice: 70000, minimumBid: 80000, bidderCount: 2,
  startAt: new Date(base + (scheduled ? 7200000 : -3600000)).toISOString(), endAt: new Date(base + 14400000 + i * 1000).toISOString(),
  pointName: 'Điểm QA', demoOnly: true,
  book: { revisionId: uuid(200 + i), authors: ['Tác giả QA'], condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '',
    description: 'Dữ liệu giả', hasMissingPages: false, photos: [{ id: uuid(300 + i), width: 240, height: 360 }] },
});
const image = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="360"><rect width="240" height="360" fill="#f0e2ca"/><text x="40" y="100" fill="#5c0202" font-size="36">QA</text></svg>';
async function setup(page, mode = 'normal') {
  const state = {
    rows: Array.from({ length: 16 }, (_, i) => makeAuction(i + 1, i >= 8)),
    reads: new Map(), listReads: 0, failedLink: mode === 'link-error', failedImage: mode === 'image-error',
  };
  if (mode === 'no-photo') state.rows.forEach(a => { a.book.photos = []; });
  await page.routeWebSocket('**/socket.io/**', socket => socket.close());
  await page.route('**/socket.io/**', route => route.fulfill({ status: 503, body: '' }));
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url());
    assert.equal(route.request().method(), 'GET');
    if (url.pathname === '/api/v1/auctions') {
      state.listReads++;
      return route.fulfill({ json: { items: state.rows.filter(a => (url.searchParams.get('phase') === 'upcoming') === (a.phase === 'Scheduled')), serverTime: new Date().toISOString() } });
    }
    const photo = url.pathname.match(/^\/api\/v1\/auctions\/([^/]+)\/photos\/([^/]+)$/);
    if (photo) {
      state.reads.set(photo[1], (state.reads.get(photo[1]) ?? 0) + 1);
      if (state.failedLink) return route.fulfill({ status: 503, json: { code: 'QA_PHOTO_UNAVAILABLE' } });
      return route.fulfill({ json: { id: photo[2], url: origin + '/qa-cover/' + photo[1] + '?read=' + state.reads.get(photo[1]), expiresAt: '2030-01-01T00:00:00.000Z', width: 240, height: 360 } });
    }
    const detail = state.rows.find(a => url.pathname === '/api/v1/auctions/' + a.id);
    if (detail) return route.fulfill({ json: { auction: detail, leaderAlias: 1, history: [], serverTime: new Date().toISOString() } });
    return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
  });
  await page.route('**/qa-cover/**', route => state.failedImage
    ? route.fulfill({ status: 503, body: '', headers: { 'cache-control': 'no-store' } })
    : route.fulfill({ contentType: 'image/svg+xml', body: image }));
  return state;
}
const loaded = async img => {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
};
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const Native = window.IntersectionObserver;
      const counts = window.qaCoverObservers = { created: 0, disconnected: 0, targets: 0 };
      window.IntersectionObserver = class extends Native {
        constructor(callback, options) {
          super(callback, options);
          this.tracked = options?.rootMargin === '200px';
          this.targets = new Set();
          if (this.tracked) counts.created++;
        }
        observe(target) {
          if (this.tracked && !this.targets.has(target)) {
            this.targets.add(target);
            counts.targets++;
          }
          super.observe(target);
        }
        unobserve(target) {
          if (this.targets.delete(target)) counts.targets--;
          super.unobserve(target);
        }
        disconnect() {
          if (this.tracked) {
            counts.disconnected++;
            counts.targets -= this.targets.size;
            this.targets.clear();
          }
          super.disconnect();
        }
      };
    });
    const observerCounts = () => page.evaluate(() => window.qaCoverObservers);
    const state = await setup(page);
    const card = i => page.locator(`[data-auction-id="${uuid(i)}"]`);
    await page.goto(origin + '/auctions');
    await expect(page.locator('[data-auction-id]')).toHaveCount(16);
    await loaded(card(1).locator('img'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    assert.equal(state.reads.get(uuid(16)) ?? 0, 0, 'Distant scheduled covers must not request signed URLs');
    const initialReads = state.reads.size;
    assert(initialReads < 16);
    assert.deepEqual(await observerCounts(), { created: 1, disconnected: 0, targets: 16 },
      'All 16 covers use the same observer without losing any target');
    const cover = card(1).getByRole('link', { name: /^Xem phiên đấu giá/ });
    const geometry = await cover.boundingBox();
    assert.equal(await card(1).locator('a > img').count(), 1, 'Keep the original direct-child image styling');
    if (width === 1440) {
      await cover.hover();
      await expect.poll(() => card(1).locator('img').evaluate(img => getComputedStyle(img).transform)).toContain('-3');
    }
    await cover.screenshot({ path: path.join(out, `cover-${width}.png`) });
    await card(8).scrollIntoViewIfNeeded();
    await loaded(card(8).locator('img'));
    assert.equal(state.reads.get(uuid(8)), 1);
    await card(1).scrollIntoViewIfNeeded();
    await loaded(card(1).locator('img'));
    assert.equal(state.reads.get(uuid(1)), 1, 'Returning within staleTime reuses the signed-photo query');
    const firstHref = await card(1).locator('img').getAttribute('src');
    // A new revision while offscreen must wait for visibility, then use its own cache key.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(150); // Let IntersectionObserver deliver the exit before changing server data.
    assert((await card(8).boundingBox()).y > 1044, 'Revision target must really be outside the near-viewport band');
    const count = state.reads.get(uuid(8));
    state.rows = state.rows.map(a => a.id === uuid(8) ? { ...a, book: { ...a.book, revisionId: uuid(999) } } : a);
    const listReads = state.listReads;
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => state.listReads).toBeGreaterThan(listReads);
    await page.waitForTimeout(200);
    assert.equal(state.reads.get(uuid(8)), count);
    await card(8).scrollIntoViewIfNeeded();
    await loaded(card(8).locator('img'));
    await expect.poll(() => state.reads.get(uuid(8))).toBe(count + 1);
    await card(1).scrollIntoViewIfNeeded();
    assert.equal(await card(1).locator('img').getAttribute('src'), firstHref);
    const nextGeometry = await card(1).getByRole('link', { name: /^Xem phiên đấu giá/ }).boundingBox();
    assert.equal(nextGeometry.width, geometry.width);
    assert.equal(nextGeometry.height, geometry.height);
    await page.getByRole('banner').getByRole('link', { name: 'Trang chủ Lật lại' }).click();
    await expect(page).toHaveURL(origin + '/');
    await expect.poll(observerCounts).toEqual({ created: 1, disconnected: 1, targets: 0 });
    await page.goBack();
    await expect(page.locator('[data-auction-id]')).toHaveCount(16);
    await loaded(card(1).locator('img'));
    await expect.poll(observerCounts).toEqual({ created: 2, disconnected: 1, targets: 16 });
    assert.deepEqual(errors, []);
    checks.push({ width, initialReads, distantDeferred: true, scrollLoads: true, queryReuse: true, revision: true, geometry: true, observerCleanupAndBack: true, pageErrors: 0 });
    await page.close();
  }
  for (const mode of ['no-photo', 'no-observer', 'link-error', 'image-error']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const state = await setup(page, mode);
    if (mode === 'no-observer') await page.addInitScript(() => { window.IntersectionObserver = undefined; });
    await page.goto(origin + '/auctions');
    const first = page.locator(`[data-auction-id="${uuid(1)}"]`);
    await expect(page.locator('[data-auction-id]')).toHaveCount(16);
    if (mode === 'no-photo') {
      await expect(first).toContainText('Chưa có ảnh bản sách');
      assert.equal(state.reads.size, 0);
    } else if (mode === 'no-observer') {
      await loaded(first.locator('img'));
      await expect.poll(() => state.reads.size).toBe(16);
    } else {
      await expect(first).toContainText('Chưa tải được ảnh');
      await first.getByRole('link', { name: /^Xem phiên đấu giá/ }).click();
      const gallery = page.getByRole('region', { name: 'Ảnh bản sách đấu giá', exact: true });
      await expect(gallery).toBeVisible();
      const retry = gallery.getByRole('button', { name: 'Tải lại ảnh', exact: true });
      await expect(retry).toBeEnabled();
      state.failedLink = false; state.failedImage = false;
      await retry.click();
      await loaded(gallery.locator('img').first());
      const readsBeforeViewer = state.reads.get(uuid(1));
      await gallery.getByRole('button', { name: 'Xem ảnh lớn', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Ảnh lớn của Phiên ảnh QA 1', exact: true });
      await loaded(dialog.locator('img'));
      assert.equal(state.reads.get(uuid(1)), readsBeforeViewer, 'Eager viewer reuses the same query');
      await dialog.getByRole('button', { name: 'Đóng ảnh', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    checks.push({ mode, fallbackOrRecovery: true, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
