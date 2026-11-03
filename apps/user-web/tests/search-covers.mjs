// Real Search route with controlled HTTP/images. No application DB or provider calls.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/search-covers');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:5188';
const server = await createServer({
  root: path.join(root, 'apps/user-web'),
  cacheDir: path.join(out, 'vite'),
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(origin + '/api/v1') },
});
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const book = n => ({
  id: uuid(n), revisionId: uuid(n + 100), version: 1,
  book: {
    id: uuid(n + 200), title: 'Bìa QA ' + n, authors: ['Tác giả QA'],
    publisher: null, publicationYear: null, language: 'vi',
    edition: null, category: 'Văn học', isbn: null,
  },
  mode: 'Sale', condition: 'Good', pages: '', coverNote: '', notes: '',
  accessories: '', readable: true, hasMissingPages: false,
  missingEssentialContent: false, description: 'Sách kiểm thử',
  salePrice: 50000, exchangeValue: null,
  seller: { id: uuid(300), displayName: 'Bạn đọc QA' },
  photos: [{ id: uuid(n + 400), width: 320, height: 450 }],
  publishedAt: '2026-11-03T00:00:00.000Z', fulfillment: null,
  purchaseAvailability: { status: 'Available', expiresAt: null },
});
let browser;
const checks = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const mode of ['success', 'sign-failure', 'expired', 'image-failure', 'no-photos', 'hidden', 'hidden-during-sign', 'first-page']) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce',
    });
    const errors = [];
    const signs = [];
    const images = [];
    let recover = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(hidden => {
      // Hold the lazy photo observers to verify that only the opening pair warms.
      const NativeObserver = window.IntersectionObserver;
      window.IntersectionObserver = class extends NativeObserver {
        observe(target) {
          if (!target.closest('[data-book-cover]')) super.observe(target);
        }
      };
      if (hidden) Object.defineProperty(document, 'visibilityState', {
        configurable: true, get: () => 'hidden',
      });
    }, mode === 'hidden');
    page.on('request', request => {
      if (new URL(request.url()).searchParams.has('coverQA')) images.push(request.url());
    });
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/v1/listings') {
        const items = [book(1), book(2), book(3)];
        if (mode === 'no-photos') items.forEach(item => { item.photos = []; });
        return route.fulfill({ json: { items, nextCursor: null, serverTime: new Date().toISOString() } });
      }
      if (url.pathname.includes('/media/')) {
        signs.push(url.pathname);
        if (mode === 'hidden-during-sign') await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            configurable: true, get: () => 'hidden',
          });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        const failed = mode === 'sign-failure' && !recover;
        if (failed) return route.fulfill({ status: 503, json: { code: 'QA_IMAGE_UNAVAILABLE' } });
        const id = url.pathname.split('/').at(-2);
        return route.fulfill({ json: {
          id, width: 320, height: 450,
          expiresAt: new Date(Date.now() + (mode === 'expired' && !recover ? -1000 : 120000)).toISOString(),
          url: origin + '/illustrations/chua-nhan.webp?coverQA=' + id,
        } });
      }
      return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
    });
    if (mode === 'image-failure') await page.route('**/*coverQA=*', route =>
      recover ? route.continue() : route.fulfill({ status: 503, body: '' }));
    await page.goto(origin + '/books?data=live' + (mode === 'first-page' ? '' : '&cursor=qa-page-2'));
    const cards = page.locator('[aria-labelledby=catalog-results] article');
    await expect(cards).toHaveCount(3);
    const preloads = page.locator('head link[as="image"][rel="preload"][href*="coverQA"]');
    if (mode === 'no-photos' || mode === 'hidden' || mode === 'first-page') {
      await page.evaluate(() => document.fonts.ready);
      assert.equal(signs.length, 0);
      await expect(preloads).toHaveCount(0);
    } else {
      await expect.poll(() => signs.length).toBe(2);
      assert(signs.every(url => !url.includes(uuid(3))));
      if (mode === 'hidden-during-sign') {
        await expect(cards.first().locator('img')).toHaveCount(1);
        await expect(preloads).toHaveCount(0);
      } else if (mode === 'sign-failure' || mode === 'expired') {
        await expect(preloads).toHaveCount(0);
        await expect(cards.first().getByText('Chưa tải được ảnh', { exact: true })).toBeVisible();
        recover = true;
        await cards.first().getByRole('button', { name: 'Tải lại ảnh Bìa QA 1' }).click();
        await expect.poll(() => cards.first().locator('img').evaluate(img =>
          img.complete && img.naturalWidth > 0)).toBe(true);
        assert.equal(signs.filter(url => url.includes('/listings/' + uuid(1) + '/')).length, 2);
      } else {
        await expect(preloads).toHaveCount(2);
        if (mode === 'image-failure') {
          await expect(cards.first().getByText('Chưa tải được ảnh', { exact: true })).toBeVisible();
          recover = true;
          await cards.first().getByRole('button', { name: 'Tải lại ảnh Bìa QA 1' }).click();
        }
        await expect.poll(() => cards.first().locator('img').evaluate(img =>
          img.complete && img.naturalWidth > 0)).toBe(true);
        if (mode === 'success') {
          assert.equal(images.filter(url => url.includes(uuid(401))).length, 1, 'Reuse the preloaded pixels');
          assert.equal(signs.length, 2, 'The cards reuse the signing queries');
        }
      }
    }
    assert.deepEqual(errors, []);
    checks.push({ mode, signingRequests: signs.length, pageErrors: errors.length });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await server.close();
}
