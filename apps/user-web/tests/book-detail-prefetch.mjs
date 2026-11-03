// Production route assets and real DOM interactions, with synthetic HTTP only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.BOOK_DETAIL_PREFETCH_BUILD
  ? path.resolve(root, process.env.BOOK_DETAIL_PREFETCH_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/book-detail-prefetch');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4198';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4198, strictPort: true },
});
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const listing = {
  id: uuid(1), revisionId: uuid(2), version: 1,
  book: {
    id: uuid(3), title: 'Sách QA', authors: ['Tác giả QA'], publisher: null,
    publicationYear: null, language: 'vi', edition: null, category: 'Văn học', isbn: null,
  },
  mode: 'Sale', condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '',
  readable: true, hasMissingPages: false, missingEssentialContent: false,
  description: 'Sách kiểm thử', salePrice: 50000, exchangeValue: null,
  seller: { id: uuid(4), displayName: 'Bạn đọc QA' }, photos: [],
  publishedAt: '2026-11-03T00:00:00.000Z', fulfillment: null,
  purchaseAvailability: { status: 'Available', expiresAt: null },
};
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const mode of ['hover', 'keyboard', 'touch', 'hidden', 'failed-prefetch', 'missing-hint']) {
    const page = await browser.newPage({
      viewport: { width: mode === 'touch' ? 390 : 1440, height: 1000 },
      hasTouch: mode === 'touch', isMobile: mode === 'touch', reducedMotion: 'reduce',
    });
    const errors = [];
    const prefetched = [];
    let detailReads = 0;
    let failedPrefetch = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if ((request.headers()['sec-purpose'] ?? request.headers()['purpose'] ?? '').includes('prefetch'))
        prefetched.push(new URL(request.url()).pathname);
    });
    await page.route('**/api/v1/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/listings') return route.fulfill({ json: {
        items: [listing], nextCursor: null, serverTime: new Date().toISOString(),
      } });
      if (pathname === '/api/v1/listings/' + listing.id) {
        detailReads++;
        return route.fulfill({ json: {
          ...listing, version: 2,
          purchaseAvailability: { status: 'InTransaction', expiresAt: null },
        } });
      }
      return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
    });
    await page.goto(origin + '/books?data=live');
    const title = page.getByRole('link', { name: 'Sách QA', exact: true });
    await expect(title).toBeVisible();
    const assets = JSON.parse(await page.locator('meta[name="latlai-book-detail-assets"]').getAttribute('content'));
    const script = assets.find(asset => asset.includes('/BookDetailPage-') && asset.endsWith('.js'));
    assert(script, 'Build Home/Search first to produce the route asset hint');
    assert(assets.some(asset => asset.includes('/BookDetailPage-') && asset.endsWith('.css')));
    for (const asset of assets) await access(path.join(build, asset));
    assert.equal(prefetched.length, 0, 'Rendering cards does not prefetch detail files');
    await page.getByRole('button', { name: 'Đăng nhập để lưu Sách QA' }).focus();
    assert.equal(prefetched.length, 0, 'Wishlist focus does not prefetch a detail route');
    const stylesBefore = await page.evaluate(() => document.styleSheets.length);
    if (mode === 'missing-hint') await page.locator('meta[name="latlai-book-detail-assets"]').evaluate(node => node.remove());
    if (mode === 'hidden') await page.evaluate(() => Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: () => 'hidden',
    }));
    if (mode === 'failed-prefetch') await page.route('**' + script, route => {
      const purpose = route.request().headers()['sec-purpose'] ?? route.request().headers()['purpose'] ?? '';
      if (purpose.includes('prefetch')) {
        failedPrefetch = true;
        return route.fulfill({ status: 503, body: '', headers: { 'cache-control': 'no-store' } });
      }
      return route.continue();
    });
    if (mode === 'keyboard') {
      await page.keyboard.press('Tab');
      await title.focus();
      assert(await title.evaluate(node => node.matches(':focus-visible')));
    } else if (mode !== 'touch') await title.hover();
    if (['hover', 'keyboard', 'failed-prefetch'].includes(mode)) {
      await expect.poll(() => prefetched.includes(script)).toBe(true);
      await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
        .some(entry => entry.name.includes('/BookDetailPage-') && entry.name.endsWith('.js')))).toBe(true);
      assert.equal(await page.evaluate(() => document.styleSheets.length), stylesBefore, 'Prefetch does not apply detail CSS');
      const count = prefetched.length;
      await title.focus();
      await page.mouse.move(0, 0);
      if (mode !== 'failed-prefetch') {
        await title.hover();
        assert.equal(prefetched.length, count, 'Repeated intent reuses the prefetch links');
      }
    } else assert.equal(prefetched.length, 0);
    assert.equal(detailReads, 0, 'Prefetch never requests listing state');
    if (mode === 'hidden') await page.evaluate(() => { delete document.visibilityState; });
    if (mode === 'touch') {
      await title.scrollIntoViewIfNeeded();
      const rect = await title.boundingBox();
      await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
    } else await title.evaluate(node => node.click());
    await expect(page.getByRole('heading', { name: 'Sách QA', exact: true, level: 1 })).toBeVisible();
    await expect.poll(() => detailReads).toBe(1);
    await expect(page.getByText('Đang giao dịch', { exact: true }).first()).toBeVisible();
    if (mode === 'touch') assert.equal(prefetched.length, 0, 'Touch navigation does not start speculative downloads');
    if (mode === 'failed-prefetch') assert(failedPrefetch);
    await page.goBack();
    await expect(title).toBeVisible();
    assert.deepEqual(errors, []);
    checks.push({ mode, detailReads, failedPrefetch, pageErrors: errors.length });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
