// Production auction list with a controlled browser clock and synthetic REST only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.AUCTION_COUNTDOWN_BUILD
  ? path.resolve(root, process.env.AUCTION_COUNTDOWN_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/auction-countdown');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4203';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4203, strictPort: true },
});
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const epoch = Date.parse('2026-11-03T10:00:00.000Z');
const iso = ms => new Date(epoch + ms).toISOString();
const auction = (i, scheduled = false) => ({
  id: uuid(i), listingId: uuid(100 + i), title: 'Phiên QA ' + i,
  state: 'Active', phase: scheduled ? 'Scheduled' : 'Live', startPrice: 50000,
  step: 10000, buyNowPrice: 200000, currentPrice: 70000, minimumBid: 80000,
  bidderCount: 2, startAt: iso(scheduled ? 2500 : -3600000),
  endAt: iso(i === 1 ? 3601000 : i === 2 ? 2500 : 7200000 + i * 1000),
  pointName: 'Điểm QA', demoOnly: true,
  book: { revisionId: uuid(200 + i), authors: ['Tác giả QA'], condition: 'Good',
    pages: '', coverNote: '', notes: '', accessories: '', description: 'Dữ liệu giả', hasMissingPages: false, photos: [] },
});
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    let live = Array.from({ length: 10 }, (_, i) => auction(i + 1));
    let scheduled = Array.from({ length: 10 }, (_, i) => auction(i + 21, true));
    let serverTime = iso(0);
    const reads = { live: 0, upcoming: 0 };
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // A deliberately wrong device date must still use the server clock offset.
    const deviceTime = epoch + 10 * 86400000;
    await page.clock.install({ time: new Date(deviceTime) });
    await page.clock.pauseAt(new Date(deviceTime + 1000));
    await page.addInitScript(() => {
      window.qa = { formats: 0, animations: [], intervals: new Set() };
      const format = Date.prototype.toLocaleString;
      Date.prototype.toLocaleString = function(...args) { window.qa.formats++; return format.apply(this, args); };
      const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
      window.setInterval = (fn, delay, ...args) => {
        const id = interval(fn, delay, ...args);
        if (delay === 1000) window.qa.intervals.add(id);
        return id;
      };
      window.clearInterval = id => { window.qa.intervals.delete(id); return clear(id); };
      const animate = Element.prototype.animate;
      Element.prototype.animate = function(frames, options) {
        const card = this.closest('[data-auction-id]');
        if (card) window.qa.animations.push({ id: card.dataset.auctionId, frames, options });
        return animate.call(this, frames, options);
      };
    });
    await page.route('**/api/v1/**', route => {
      const url = new URL(route.request().url());
      assert.equal(route.request().method(), 'GET', 'No auction command is allowed in this fixture');
      if (url.pathname === '/api/v1/auctions') {
        const upcoming = url.searchParams.get('phase') === 'upcoming';
        reads[upcoming ? 'upcoming' : 'live']++;
        return route.fulfill({ json: { items: upcoming ? scheduled : live, serverTime } });
      }
      if (url.pathname === '/api/v1/listings') return route.fulfill({ json: { items: [], nextCursor: null, serverTime } });
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await page.route('**/socket.io/**', route => route.fulfill({ status: 503, body: '' }));
    await page.routeWebSocket('**/socket.io/**', socket => socket.close());
    const card = id => page.locator(`[data-auction-id="${uuid(id)}"]`);
    const timer = id => card(id).locator('span[class*="timer"]').first();
    await page.goto(origin + '/auctions');
    await expect.poll(async () => {
      await page.clock.runFor(1);
      return page.locator('[data-auction-id]').count();
    }).toBe(16);
    await expect(timer(1)).toHaveText('1:00:01');
    assert(!(await timer(1).getAttribute('class')).includes('timerSoon'));
    await expect(timer(21)).toHaveText(/^Mở sau 00:02$/);
    await page.evaluate(() => { window.qa.formats = 0; });
    const idleReads = { ...reads };
    await page.clock.runFor(2000);
    await expect(timer(1)).toHaveText('59:59');
    assert((await timer(1).getAttribute('class')).includes('timerSoon'));
    await expect(timer(2)).toHaveText('00:00');
    await expect(timer(21)).toHaveText('Mở sau 00:00');
    assert(!(await timer(21).getAttribute('class')).includes('timerSoon'));
    assert.equal(await page.evaluate(() => window.qa.formats), 0, 'Clock ticks must not rebuild date facts');
    assert.deepEqual(reads, idleReads, 'Clock ticks do not fetch auction state');
    await page.clock.runFor(1000);
    await expect(timer(2)).toHaveText('Đã hết giờ');
    await expect(timer(21)).toHaveText('Mở sau Đã hết giờ');
    // Only a new server response changes phase/state; zero does not open a session locally.
    await expect(card(21)).toContainText('Mở lúc');
    await card(1).scrollIntoViewIfNeeded();
    await page.clock.runFor(50);
    const updated = { ...live[0], currentPrice: 90000, bidderCount: 3, endAt: iso(603000), pointName: 'Điểm QA cập nhật' };
    live = [updated, ...live.slice(1)];
    serverTime = iso(3000);
    const previousReads = reads.live;
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(30);
    await expect.poll(async () => { await page.clock.runFor(1); return reads.live; }).toBeGreaterThan(previousReads);
    await page.clock.runFor(30);
    await expect(card(1)).toContainText('90.000');
    await expect(card(1)).toContainText('3 người trả giá');
    await expect(card(1)).toContainText('Điểm QA cập nhật');
    await expect(timer(1)).toHaveText(/^(10:00|09:59)$/);
    const animations = await page.evaluate(() => window.qa.animations);
    assert(animations.some(a => a.id === uuid(1) && a.options.duration === 500 &&
      a.frames.some(frame => frame.backgroundColor === 'var(--shop-yellow)')), 'Fresh prices keep the authored feedback under reduced motion');
    await page.clock.runFor(600);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(550);
    await card(1).screenshot({ path: path.join(out, `auction-card-${width}.png`) });
    const pager = page.getByRole('navigation', { name: 'Phân trang đấu giá đang mở' });
    await pager.getByRole('button', { name: 'Trang 2', exact: true }).click();
    await page.clock.runFor(100);
    await expect(card(9)).toBeAttached();
    await expect(card(1)).toHaveCount(0);
    await expect(timer(9)).toHaveText(/\d+:\d{2}:\d{2}/);
    await page.locator('header a[href="/"]').first().evaluate(link => link.click());
    await page.clock.runFor(50);
    await page.locator('#latest-title').waitFor();
    assert.equal(await page.evaluate(() => window.qa.intervals.size), 0);
    assert.deepEqual(errors, []);
    checks.push({ width, serverClockOffset: true, timerOnly: true, hourBoundary: true, zero: true, scheduled: true,
      freshPriceAndEnd: true, priceMotion: true, pagination: true, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
