// Production Member web with synthetic reads and login, no exchange commands.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-exchange-deadline');
await mkdir(out, { recursive: true });
const build = path.resolve(root, process.env.EXCHANGE_DEADLINE_BUILD ?? 'apps/user-web/dist');
const baseline = process.env.EXCHANGE_DEADLINE_BASELINE === '1';
const origin = 'http://127.0.0.1:4215';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4215, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const epoch = Date.parse('2026-11-04T03:00:00.000Z');
const iso = ms => new Date(ms).toISOString();
const actor = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] };
const listing = n => ({ id: id(n), revisionId: id(n + 100), version: 1,
  book: { id: id(n + 200), title: 'Sách trao đổi QA', authors: ['Tác giả QA'], publisher: null,
    publicationYear: null, language: 'vi', edition: null, category: 'Văn học', isbn: null },
  mode: 'Both', condition: 'Good', pages: '', coverNote: '', notes: '', accessories: '', readable: true,
  hasMissingPages: false, missingEssentialContent: false, description: 'Dữ liệu QA', salePrice: 50000, exchangeValue: 50000,
  seller: { id: id(n === 4 ? 1 : 2), displayName: 'Bạn đọc QA' }, photos: [], publishedAt: iso(epoch),
  fulfillment: null, purchaseAvailability: { status: 'Available', expiresAt: null } });

let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(epoch) });
    await page.addInitScript(() => {
      window.qaDeadlineTicks = 0;
      const interval = window.setInterval.bind(window);
      window.setInterval = (callback, delay, ...args) => interval(delay === 1000
        ? (...values) => { window.qaDeadlineTicks++; callback(...values); } : callback, delay, ...args);
    });
    let state = 'AcceptedAwaitingFunding', deadline = iso(epoch + 120000), fundingDeadline;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: actor,
      } });
      assert.equal(request.method(), 'GET', 'Only fixture login may submit');
      if (p === '/api/v1/auth/me') return route.fulfill({ json: actor });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p === '/api/v1/me/purchase-conversations' || p === `/api/v1/exchanges/${id(3)}/messages`) return route.fulfill({ json: [] });
      if (p === `/api/v1/exchanges/${id(3)}`) return route.fulfill({ json: {
        id: id(3), initiatorId: id(1), recipientId: id(2), initiatorListingId: id(4), recipientListingId: id(5),
        status: state, revision: 1, initiatorDeposit: 50000, recipientDeposit: 50000,
        diffAmount: 0, diffPayerId: null, createdAt: iso(epoch), updatedAt: iso(epoch),
        fundingDeadline: state === 'AcceptedAwaitingFunding' ? deadline : fundingDeadline,
        shippingDeadline: state === 'Preparing' ? deadline : undefined,
        inspectionDeadline: state === 'Delivered' ? deadline : undefined,
        initiatorReceivedAt: state === 'Delivered' ? iso(epoch) : undefined,
        recipientReceivedAt: state === 'Delivered' ? iso(epoch) : undefined,
      } });
      if (p === '/api/v1/listings/' + id(4)) return route.fulfill({ json: listing(4) });
      if (p === '/api/v1/listings/' + id(5)) return route.fulfill({ json: listing(5) });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    const exchangePath = '/exchange/' + id(3);
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(exchangePath));
    await page.getByLabel(/^Email/).fill(actor.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const card = page.locator('#exchange-actions');
    const fund = card.getByRole('button', { name: /^Đặt cọc (50\.000|mô phỏng)/ });
    await expect(fund).toBeVisible();
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
    const results = [];
    for (const [status, label] of [
      ['AcceptedAwaitingFunding', 'Hạn đặt cọc:'],
      ['Preparing', baseline ? 'Hạn gửi sách (72h):' : 'Hạn gửi sách'],
      ['Delivered', 'Hạn kiểm tra chung (72 giờ):'],
    ]) {
      state = status;
      deadline = iso(await page.evaluate(() => Date.now() + 15000));
      if (status === 'AcceptedAwaitingFunding') fundingDeadline = deadline;
      const row = card.locator('p').filter({ hasText: label });
      await expect.poll(async () => {
        await page.clock.runFor(1000);
        return row.locator('time').getAttribute('datetime', { timeout: 300 }).catch(() => null);
      }).toBe(deadline);
      await expect(row).not.toContainText('Đã hết hạn');
      await page.evaluate(() => { window.qaDeadlineTicks = 0; });
      await page.clock.runFor(2000);
      const before = await page.evaluate(() => window.qaDeadlineTicks);
      assert.equal(before, baseline ? 2 : 0);
      if (status === 'AcceptedAwaitingFunding') await expect(fund).toBeVisible();
      await page.clock.runFor(16000);
      await expect(row).toContainText('Đã hết hạn');
      if (status === 'AcceptedAwaitingFunding') await expect(fund).toHaveCount(0);
      await page.evaluate(() => { window.qaDeadlineTicks = 0; });
      await page.clock.runFor(2000);
      const after = await page.evaluate(() => window.qaDeadlineTicks);
      assert.equal(after, baseline ? 2 : 0);
      results.push({ status, beforeExpiryCallbacksIn2s: before, afterExpiryCallbacksIn2s: after });
    }
    await card.screenshot({ path: path.join(out, `card-${width}${baseline ? '-before' : ''}.png`) });
    assert.deepEqual(errors, []);
    checks.push({ width, results });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
