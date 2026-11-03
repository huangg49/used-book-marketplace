// Production DOM/font behavior; all listing HTTP data is synthetic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.CARD_TEXT_BUILD
  ? path.resolve(root, process.env.CARD_TEXT_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/card-text');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4201';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4201, strictPort: true },
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
const listings = Array.from({ length: 20 }, (_, i) => ({
  ...listing, id: uuid(100 + i), revisionId: uuid(200 + i),
  book: { ...listing.book, id: uuid(300 + i), title: 'Sách QA ' + (i + 1) },
  salePrice: [10000, 50000, 1000000][i % 3],
}));
const frameSelector = '[class*="fitFrame"]';
async function measurements(page) {
  return page.locator(frameSelector).evaluateAll(frames => frames.map(frame => {
    const content = frame.firstElementChild;
    return {
      text: frame.textContent, width: frame.clientWidth, height: frame.clientHeight,
      font: getComputedStyle(content).fontSize, maximum: getComputedStyle(frame).fontSize,
      fits: content.scrollWidth <= frame.clientWidth + 1 && content.scrollHeight <= frame.clientHeight + 1,
      clipped: frame.dataset.clipped === 'true',
    };
  }));
}
function readable(slots) {
  assert.equal(slots.length, 20);
  assert(slots.every(slot => slot.fits || slot.clipped), 'Every price must fit or use its bounded fallback');
  assert(slots.every(slot => parseFloat(slot.font) <= parseFloat(slot.maximum) + 0.01));
}
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 844 }, deviceScaleFactor: width === 390 ? 2 : 1,
      isMobile: width === 390, hasTouch: width === 390, reducedMotion: 'reduce',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.cardTextFits = 0;
      const remove = Element.prototype.removeAttribute;
      Element.prototype.removeAttribute = function(name) {
        if (name === 'data-clipped') window.cardTextFits++;
        return remove.call(this, name);
      };
    });
    await page.route('**/api/v1/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/listings') return route.fulfill({ json: {
        items: listings, nextCursor: null, serverTime: new Date().toISOString(),
      } });
      return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
    });
    await page.goto(origin + '/books?data=live');
    await expect(page.locator(frameSelector)).toHaveCount(20);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(width / 2, 450);
    await page.waitForTimeout(1000);
    const initial = await measurements(page);
    readable(initial);
    await page.evaluate(() => { window.cardTextFits = 0; });
    for (let step = 0; step < 2; step++) {
      await page.mouse.wheel(0, 450);
      await page.waitForTimeout(200);
      await page.waitForFunction(() => !document.documentElement.classList.contains('lenis-scrolling'));
    }
    assert(await page.evaluate(() => scrollY > 0), 'The wheel must actually scroll the page');
    assert.equal(await page.evaluate(() => window.cardTextFits), 0, 'Scroll states must not refit all prices');
    assert.deepEqual(await measurements(page), initial, 'Scrolling preserves text layout');
    await page.addStyleTag({ content: `html.qa-large ${frameSelector} { font-size: var(--qa-price-size, 40px); font-family: var(--qa-price-font, monospace); }` });
    await page.evaluate(() => {
      window.cardTextFits = 0;
      document.documentElement.classList.add('qa-large');
    });
    await expect.poll(() => page.evaluate(() => window.cardTextFits)).toBeGreaterThan(0);
    const large = await measurements(page);
    readable(large);
    assert.notDeepEqual(large.map(slot => slot.font), initial.map(slot => slot.font));
    await page.evaluate(() => {
      window.cardTextFits = 0;
      document.documentElement.style.setProperty('--qa-price-size', '14px');
    });
    await expect.poll(() => page.evaluate(() => window.cardTextFits)).toBeGreaterThan(0);
    readable(await measurements(page));
    // A real new font load must still notify the shared observer.
    await page.evaluate(() => {
      const font = new FontFace('CardTextQA', 'url(/fonts/BeVietnamPro-Regular.woff2)');
      document.fonts.add(font);
      window.cardTextFits = 0;
      window.cardTextFontLoaded = false;
      document.fonts.addEventListener('loadingdone', () => {
        window.cardTextFontLoaded = true;
        window.cardTextFits = 0;
      }, { once: true });
      document.documentElement.style.setProperty('--qa-price-font', 'CardTextQA, monospace');
    });
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => page.evaluate(() => document.fonts.check('14px CardTextQA'))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.cardTextFontLoaded)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.cardTextFits)).toBeGreaterThan(0);
    readable(await measurements(page));
    await page.evaluate(() => {
      document.documentElement.classList.remove('qa-large');
      document.documentElement.style.removeProperty('--qa-price-size');
      document.documentElement.style.removeProperty('--qa-price-font');
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.evaluate(() => { window.cardTextFits = 0; });
    await page.setViewportSize({ width: width === 390 ? 320 : 720, height: 844 });
    await expect.poll(() => page.evaluate(() => window.cardTextFits)).toBeGreaterThan(0);
    readable(await measurements(page));
    assert.deepEqual(errors, []);
    checks.push({ width, wheelRefits: 0, typographyClass: true, rootStyle: true, fontLoad: true, resize: true, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
