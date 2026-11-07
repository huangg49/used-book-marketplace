// Production Member web with synthetic HTTP only. No API process or DB writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-notification-preview');
await mkdir(out, { recursive: true });
const build = process.env.NOTIFICATION_PREVIEW_BUILD
  ? path.resolve(root, process.env.NOTIFICATION_PREVIEW_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.NOTIFICATION_PREVIEW_BASELINE === '1';
const origin = 'http://127.0.0.1:4204';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: build }, preview: { host: '127.0.0.1', port: 4204, strictPort: true } });
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const kinds = ['SupportUpdated', 'OrderBuyNowPaid', 'ExchangeProposed', 'AuctionOutbid',
  'ReviewModerated', 'AuctionCancelled', 'AuctionWon', 'SupportUpdated'];
const types = ['SupportCase', 'Order', 'Exchange', 'Auction', 'TransactionReview', 'Auction', 'Auction', 'SupportCase'];
let browser;
const reports = [];
async function login(page, destination = '#overview-greeting') {
  await page.getByLabel(/^Email/).fill('reader@example.test');
  await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator(destination).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
}
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const reads = [], errors = [], commands = [];
    let owner = 1, unreadCount = 12, failRead = false, failCommand = false;
    const readIds = new Set();
    const notices = () => kinds.map((kind, i) => ({ id: uuid(owner * 100 + i), kind: owner === 2 && i === 3 ? 'AuctionWon' : kind,
      title: `QA ${owner} mục ${i + 1}` + (owner === 2 && i === 0 ? ' trả giá' : ''), body: `Nội dung tổng hợp ${i + 1}`, targetType: types[i],
      targetId: uuid(500 + i), createdAt: '2026-11-03T03:00:00.000Z',
      readAt: readIds.has(uuid(owner * 100 + i)) ? '2026-11-03T04:00:00.000Z' : null }));
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      if (url.pathname === '/api/v1/auth/login') return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
        user: { id: uuid(owner), email: 'reader@example.test', displayName: `Bạn đọc QA ${owner}`, status: 'ACTIVE', roles: ['MEMBER'] },
      } });
      if (url.pathname === '/api/v1/auth/logout') return route.fulfill({ status: 204 });
      if (url.pathname === '/api/v1/me/notifications/read') {
        const body = route.request().postDataJSON();
        commands.push(body.all ? 'all' : 'one');
        if (failCommand) { failCommand = false; return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } }); }
        if (body.all) { unreadCount = 0; notices().forEach(n => readIds.add(n.id)); }
        else { body.ids.forEach(id => readIds.add(id)); unreadCount--; }
        return route.fulfill({ json: { unreadCount } });
      }
      if (url.pathname === '/api/v1/me/notifications') {
        const limit = Number(url.searchParams.get('limit'));
        const data = { items: notices().slice(0, limit), unreadCount, nextCursor: 'qa-next' };
        reads.push({ owner, limit, bytes: Buffer.byteLength(JSON.stringify(data)), failed: failRead });
        if (failRead) { failRead = false; return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } }); }
        // Keep concurrent consumers in flight together, like a normal HTTP read.
        await new Promise(resolve => setTimeout(resolve, 30));
        return route.fulfill({ json: data });
      }
      if (url.pathname === '/api/v1/listings') return route.fulfill({ json: { items: [], nextCursor: null, serverTime: '2026-11-03T03:00:00.000Z' } });
      assert.equal(method, 'GET', 'No other fixture command is allowed');
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await page.goto(origin + '/account');
    assert.equal(reads.length, 0, 'Guests do not fetch private previews');
    await login(page);
    const activity = page.locator('#overview-activity');
    const greeting = page.locator('#overview-greeting');
    await expect(activity.getByText('QA 1 mục 1', { exact: true })).toBeVisible();
    await expect(greeting.getByText('12 thông báo mới', { exact: true })).toBeVisible();
    await page.waitForTimeout(150);
    const cold = reads.slice();
    assert.deepEqual(cold.map(r => r.limit).sort((a, b) => a - b), baseline ? [1, 4, 8] : [8]);
    const firstLink = activity.getByRole('link').filter({ hasText: 'QA 1 mục 1' });
    const firstHref = await firstLink.getAttribute('href');
    assert.equal(firstHref, `${baseline ? '/auctions/' : '/support/'}${uuid(500)}`);
    if (!baseline) {
      for (const [i, path] of [[1, '/orders/'], [2, '/exchange/']]) {
        await expect(activity.getByRole('link').filter({ hasText: `QA 1 mục ${i + 1}` })).toHaveAttribute('href', path + uuid(500 + i));
      }
      await expect(activity.getByText('QA 1 mục 5', { exact: true })).toHaveCount(0);
      await expect(activity.getByRole('link', { name: /Mở phiên đấu giá ngay/ })).toHaveAttribute('href', '/auctions/' + uuid(503));
      if (width === 1440) {
        const beforePoll = reads.length;
        await page.waitForTimeout(30_500);
        assert.equal(reads.length - beforePoll, 1, 'Only the existing bell interval polls the shared preview');
      }
      const beforeOne = reads.length;
      await firstLink.click();
      await expect(page).toHaveURL(origin + '/support/' + uuid(500));
      await page.goBack();
      await expect(greeting.getByText('11 thông báo mới', { exact: true })).toBeVisible();
      assert.equal(reads.length - beforeOne, 1, 'One-item read refreshes all previews once');
      await page.getByRole('button', { name: 'Thông báo, 11 chưa đọc', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Thông báo gần đây', exact: true });
      await expect(panel.locator('li')).toHaveCount(8);
      await page.waitForTimeout(100);
      const beforeMark = reads.length;
      failCommand = true;
      await panel.getByRole('button', { name: 'Đánh dấu tất cả đã đọc', exact: true }).click();
      await expect(panel.getByRole('alert')).toBeVisible();
      await expect(greeting.getByText('11 thông báo mới', { exact: true })).toBeVisible();
      assert.equal(reads.length, beforeMark, 'A failed read command must not fake success');
      await panel.getByRole('button', { name: 'Đánh dấu tất cả đã đọc', exact: true }).click();
      await expect(greeting.getByRole('link', { name: 'Thông báo', exact: true })).toBeVisible();
      assert.equal(reads.length - beforeMark, 1, 'One invalidated read updates all preview consumers');
      await page.keyboard.press('Escape');
      failRead = true;
      await page.getByRole('button', { name: 'Thông báo', exact: true }).click();
      await expect(panel.getByText('Chưa tải được danh sách thông báo.', { exact: true })).toBeVisible();
      await expect(activity.getByRole('alert')).toBeVisible();
      await panel.getByRole('button', { name: 'Thử lại', exact: true }).click();
      await expect(panel.locator('li')).toHaveCount(8);
      await expect(activity.getByRole('alert')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await activity.getByRole('link', { name: 'Xem thông báo', exact: true }).click();
      await expect(page).toHaveURL(origin + '/notifications');
      await expect(page.locator('#account-content h1')).toHaveText('Thông Báo');
      assert(reads.some(r => r.limit === 30), 'Paginated inbox keeps its independent query shape');
      await page.goBack();
      await expect(activity).toBeVisible();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: path.join(out, `overview-${width}.png`), fullPage: true });
      if (width === 390) await page.getByRole('button', { name: /^Menu:/ }).click();
      await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Lại gặp nhau rồi.', exact: true })).toBeVisible();
      owner = 2; unreadCount = 3; readIds.clear();
      await login(page, '#latest-title');
      if (width === 390) {
        await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
        await page.getByRole('navigation', { name: 'Điều hướng trên điện thoại', exact: true })
          .getByRole('link', { name: 'Tổng quan', exact: true }).click();
      } else {
        await page.getByRole('button', { name: /^Tài khoản của/ }).click();
        await page.getByRole('region', { name: 'Menu tài khoản', exact: true })
          .locator('a[href="/account"]').first().click();
      }
      await expect(activity.getByText('QA 2 mục 1 trả giá', { exact: true }).first()).toBeVisible();
      await expect(activity.getByRole('link', { name: 'Xem chi tiết', exact: true })).toHaveAttribute('href', '/support/' + uuid(500));
      await expect(activity.getByText('Cảnh báo: Bạn đã bị trả giá cao hơn!', { exact: true })).toHaveCount(0);
      await expect(greeting.getByText('3 thông báo mới', { exact: true })).toBeVisible();
      await expect(activity.getByText('QA 1 mục 1', { exact: true })).toHaveCount(0);
      assert(await activity.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Activity content fits');
      await activity.screenshot({ path: path.join(out, `activity-fallback-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    reports.push({ width, coldReads: cold.length, limits: cold.map(r => r.limit),
      coldBytes: cold.reduce((sum, r) => sum + r.bytes, 0), firstHref, commands, pageErrors: errors.length });
    await page.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, reports }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
