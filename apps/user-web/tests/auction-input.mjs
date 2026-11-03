// Real production input, sorting and server-prop updates with synthetic REST only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.AUCTION_INPUT_BUILD
  ? path.resolve(root, process.env.AUCTION_INPUT_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/auction-input');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4205';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4205, strictPort: true },
});
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const base = Date.parse('2026-11-03T10:00:00.000Z'), serverTime = new Date(base).toISOString();
const makeAuction = i => ({
  id: uuid(i), listingId: uuid(100 + i), title: 'Phiên QA ' + i, state: 'Active', phase: i <= 8 ? 'Live' : 'Scheduled',
  startPrice: 50000, step: 10000, buyNowPrice: 300000, currentPrice: 50000 + i * 10000, minimumBid: 60000 + i * 10000, bidderCount: 2,
  startAt: new Date(base + (i <= 8 ? -3600000 : 7200000)).toISOString(), endAt: new Date(base + 14400000 + i * 1000).toISOString(),
  pointName: 'Điểm QA', demoOnly: true,
  book: { revisionId: uuid(200 + i), authors: ['Tác giả QA'], condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '',
    description: 'Dữ liệu giả', hasMissingPages: false, photos: [] },
});
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    let rows = Array.from({ length: 16 }, (_, i) => makeAuction(i + 1)), reads = 0;
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.qa = { formats: 0, animations: [] };
      const format = Date.prototype.toLocaleString;
      Date.prototype.toLocaleString = function(...args) { window.qa.formats++; return format.apply(this, args); };
      const animate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        const card = this.closest('[data-auction-id]');
        if (card) window.qa.animations.push({ id: card.dataset.auctionId, frames, options });
        return animate.call(this, frames, options);
      };
    });
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    await page.route('**/socket.io/**', route => route.fulfill({ status: 503, body: '' }));
    await page.route('**/api/v1/**', route => {
      const url = new URL(route.request().url());
      assert.equal(route.request().method(), 'GET');
      if (url.pathname === '/api/v1/auctions') {
        reads++;
        return route.fulfill({ json: { items: rows.filter(a => (url.searchParams.get('phase') === 'upcoming') === (a.phase === 'Scheduled')), serverTime } });
      }
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    const active = page.locator('section[aria-labelledby="auction-list-title"] [data-auction-id]');
    const card = id => page.locator(`[data-auction-id="${uuid(id)}"]`);
    const input = page.getByRole('searchbox', { name: 'Tìm theo tên sách hoặc tác giả' });
    await page.goto(origin + '/auctions');
    await expect(page.locator('[data-auction-id]')).toHaveCount(16);
    await page.evaluate(() => document.fonts.ready);
    await input.click();
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.qa.formats = 0; });
    const readsBeforeTyping = reads;
    await input.pressSequentially('Phien QA', { delay: 15 });
    assert.equal(await page.evaluate(() => window.qa.formats), 0, 'Unchanged date facts must not render while typing');
    await expect(input).toHaveValue('Phien QA');
    await expect(page).toHaveURL(/q=Phien\+QA/);
    await expect(active).toHaveCount(8);
    assert.equal(reads, readsBeforeTyping, 'Client filtering keeps its existing REST behavior');
    await expect(input).toBeFocused();
    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(page).toHaveURL(origin + '/auctions');
    await input.fill('khong-co-phien-qa');
    await expect(page.getByRole('heading', { name: 'Chưa có phiên phù hợp', exact: true })).toBeVisible();
    await expect(active).toHaveCount(0);
    await page.getByRole('button', { name: 'Xóa nội dung tìm', exact: true }).click();
    await expect(active).toHaveCount(8);
    const sort = page.getByRole('combobox', { name: 'Sắp xếp', exact: true });
    if (width === 390) await sort.selectOption('priceDesc');
    else {
      await sort.click();
      await page.getByRole('option', { name: 'Giá cao đến thấp', exact: true }).click();
    }
    await expect(active.first()).toHaveAttribute('data-auction-id', uuid(8));
    await expect(page).toHaveURL(/sort=priceDesc/);
    await expect.poll(() => page.evaluate(() => window.qa.animations.some(a => a.options.duration === 220))).toBe(true);
    // Keep serverTime identical: a changed auction object alone must reach the card.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(300);
    rows = rows.map(a => a.id === uuid(1) ? {
      ...a, title: 'Phiên QA cập nhật', currentPrice: 180000, minimumBid: 190000, bidderCount: 4,
      pointName: 'Điểm QA mới', endAt: new Date(base + 3600000).toISOString(),
    } : a);
    const priorReads = reads;
    await page.evaluate(() => { window.qa.animations = []; window.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(() => reads).toBeGreaterThan(priorReads);
    await expect(active.first()).toHaveAttribute('data-auction-id', uuid(1));
    await expect(card(1)).toContainText('180.000');
    await expect(card(1)).toContainText('4 người trả giá');
    await expect(card(1)).toContainText('Điểm QA mới');
    await expect(card(1)).toContainText('Phiên QA cập nhật');
    await expect(card(1).locator('span[class*="timer"]').first()).toHaveText(/^(1:00:00|59:59)$/);
    const animations = await page.evaluate(() => window.qa.animations);
    assert(animations.some(a => a.id === uuid(1) && a.options.duration === 500 &&
      a.frames.some(frame => frame.backgroundColor === 'var(--shop-yellow)')), 'Fresh prices retain their authored feedback');
    assert(animations.some(a => a.options.duration === 220), 'Reordering retains the authored position animation');
    await page.waitForTimeout(600);
    await card(1).screenshot({ path: path.join(out, `updated-card-${width}.png`) });
    const timer = card(1).locator('span[class*="timer"]').first();
    const before = await timer.textContent();
    await expect.poll(() => timer.textContent(), { timeout: 2500 }).not.toBe(before);
    assert.deepEqual(errors, []);
    checks.push({ width, typingFormats: 0, debounceAndFocus: true, emptyRecovery: true, sort: true,
      serverTimeUnchanged: true, freshAuction: true, priceMotion: true, positionMotion: true, countdown: true, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
