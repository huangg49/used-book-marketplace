// Native browser transitions on the production build; all HTTP data is synthetic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.BOOK_TRANSITION_BUILD
  ? path.resolve(root, process.env.BOOK_TRANSITION_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/book-transition');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4199';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4199, strictPort: true },
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
  for (const profile of [
    { width: 320, motion: 'no-preference' },
    { width: 390, motion: 'reduce' },
    { width: 768, motion: 'reduce' },
    { width: 1440, motion: 'reduce' },
    { width: 390, motion: 'reduce', unsupported: true },
  ]) {
    const touch = profile.width < 1000;
    const page = await browser.newPage({
      viewport: { width: profile.width, height: 844 }, deviceScaleFactor: touch ? 2 : 1,
      hasTouch: touch, isMobile: touch, reducedMotion: profile.motion,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ unsupported }) => {
      window.transitionChecks = [];
      if (unsupported) { document.startViewTransition = undefined; return; }
      const start = document.startViewTransition.bind(document);
      const viewport = () => ({ width: innerWidth, height: innerHeight });
      document.startViewTransition = (...args) => {
        const check = { before: viewport(), ready: false, finished: false };
        window.transitionChecks.push(check);
        const transition = start(...args);
        transition.updateCallbackDone.then(() => {
          check.after = viewport();
          const article = document.querySelector('[data-book-detail] article');
          check.contentTransform = article ? getComputedStyle(article).transform : null;
        });
        transition.ready.then(() => {
          check.ready = true;
          check.duration = getComputedStyle(document.documentElement,
            '::view-transition-group(book-cover)').animationDuration;
        }, error => { check.error = error.name; });
        transition.finished.then(() => { check.finished = true; });
        return transition;
      };
    }, { unsupported: Boolean(profile.unsupported) });
    await page.route('**/api/v1/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/listings') return route.fulfill({ json: {
        items: [listing], nextCursor: null, serverTime: new Date().toISOString(),
      } });
      if (pathname === '/api/v1/listings/' + listing.id) return route.fulfill({ json: listing });
      return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
    });
    await page.goto(origin + '/books?data=live');
    const title = page.getByRole('link', { name: 'Sách QA', exact: true });
    await expect(title).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Wait for the existing card entrance before starting the next animation.
    await page.waitForTimeout(600);
    if (touch) await title.tap();
    else {
      await title.focus();
      await page.keyboard.press('Enter');
    }
    await page.locator('[data-book-detail] h1').waitFor({ state: 'attached' });
    if (!profile.unsupported) {
      await expect.poll(() => page.evaluate(() => window.transitionChecks[0]?.finished)).toBe(true);
      const forward = await page.evaluate(() => window.transitionChecks[0]);
      assert.equal(forward.ready, true, JSON.stringify({ profile, forward }));
      assert.deepEqual(forward.after, forward.before, 'The snapshot viewport must stay stable');
      assert.equal(forward.duration, '0.44s', 'Preserve the authored cover duration under reduced motion');
      assert.equal(forward.contentTransform, 'matrix(1, 0, 0, 1, 24, 0)', 'Keep the full article entrance');
    }
    await expect.poll(() => page.locator('[data-book-detail] article').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    const geometry = await page.evaluate(() => ({
      inner: innerWidth, client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.equal(geometry.inner, profile.width);
    assert(geometry.scroll <= geometry.client, JSON.stringify(geometry));
    await page.screenshot({ path: path.join(out, `detail-${profile.width}-${profile.motion}${profile.unsupported ? '-fallback' : ''}.png`) });
    await page.getByRole('link', { name: 'Về kệ sách' }).click();
    await expect(title).toBeVisible();
    if (!profile.unsupported) {
      await expect.poll(() => page.evaluate(() => window.transitionChecks[1]?.finished)).toBe(true);
      const back = await page.evaluate(() => window.transitionChecks[1]);
      assert.equal(back.ready, true, JSON.stringify({ profile, back }));
      assert.deepEqual(back.after, back.before);
      assert.equal(back.duration, '0.44s');
    } else {
      assert.deepEqual(await page.evaluate(() => window.transitionChecks), []);
    }
    assert.deepEqual(errors, []);
    checks.push({ ...profile, geometry, transitions: await page.evaluate(() => window.transitionChecks), pageErrors: errors.length });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
