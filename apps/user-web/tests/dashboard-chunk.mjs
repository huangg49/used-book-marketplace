// Production route loading and real login UI with synthetic HTTP only; no database.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = process.env.DASHBOARD_BUILD
  ? path.resolve(root, process.env.DASHBOARD_BUILD)
  : path.join(app, 'dist');
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/dashboard-chunk');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4202';
const server = await preview({
  root: app, build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4202, strictPort: true },
});
const assets = await readdir(path.join(build, 'assets'));
const dashboardJs = assets.find(file => /^DashboardLayout-.*\.js$/.test(file));
const dashboardCss = assets.find(file => /^DashboardLayout-.*\.css$/.test(file));
assert(dashboardJs && dashboardCss, 'Build must produce separate dashboard JS and CSS');
const walletCss = assets.find(file => /^WalletPage-.*\.css$/.test(file));
assert(walletCss, 'Wallet-specific styles must be in a separate asset');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
async function fixture(page) {
  const calls = [];
  await page.route('**/api/v1/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    calls.push({ method: route.request().method(), pathname });
    if (pathname === '/api/v1/auth/login') return route.fulfill({ json: {
      accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900,
      user: { id: uuid(1), email: 'reader@qa.invalid', displayName: 'Bạn đọc QA', status: 'ACTIVE', roles: ['MEMBER'] },
    } });
    if (pathname === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
    if (pathname === '/api/v1/listings') return route.fulfill({ json: { items: [], nextCursor: null, serverTime: new Date().toISOString() } });
    return route.fulfill({ status: 503, json: { code: 'QA_NOT_AVAILABLE' } });
  });
  return calls;
}
async function login(page) {
  await page.getByLabel(/^Email/).fill('reader@qa.invalid');
  await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.locator('#account-content h1').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
}
let browser;
const checks = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const calls = await fixture(page), files = [], errors = [];
    page.on('request', request => files.push(new URL(request.url()).pathname));
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.locator('#latest-title').waitFor();
    assert(!files.some(file => file.includes('/DashboardLayout-')), 'Home must defer dashboard JS and CSS');
    assert(!files.includes('/assets/' + walletCss), 'Home must defer wallet-specific styles');
    assert(!calls.some(call => call.pathname.startsWith('/api/v1/me/')), 'Guest Home must not read private dashboard data');
    await page.goto(origin + '/account/notifications?source=qa');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Faccount%2Fnotifications%3Fsource%3Dqa/);
    assert.equal(await page.locator('#account-content').count(), 0, 'Guest still goes through the existing login guard');
    await login(page);
    await expect(page).toHaveURL(origin + '/account/notifications?source=qa');
    const heading = page.locator('#account-content h1');
    await expect(heading).toHaveText('Thông Báo');
    assert(files.includes('/assets/' + dashboardJs));
    assert(files.includes('/assets/' + dashboardCss));
    assert(!files.includes('/assets/' + walletCss), 'Notifications must defer wallet-specific styles');
    if (width === 1440) {
      await page.getByRole('button', { name: 'Thu gọn thanh điều hướng', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Mở rộng thanh điều hướng', exact: true })).toBeVisible();
      await expect.poll(() => page.locator('aside[data-collapsed]').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(68);
      await page.getByRole('button', { name: 'Mở rộng thanh điều hướng', exact: true }).click();
      await expect.poll(() => page.locator('aside[data-collapsed]').evaluate(el => Math.round(el.getBoundingClientRect().width))).toBe(240);
    } else {
      await page.getByRole('button', { name: /^Menu:/ }).click();
      await expect(page.getByRole('navigation', { name: 'Không gian cá nhân', exact: true })).toBeVisible();
    }
    const accountFiles = files.filter(file => file.includes('/DashboardLayout-')).length;
    await page.getByRole('navigation', { name: 'Không gian cá nhân', exact: true }).getByRole('link', { name: /Tổng quan/ }).click();
    await expect(page).toHaveURL(origin + '/account');
    await page.goBack();
    await expect(heading).toHaveText('Thông Báo');
    assert.equal(files.filter(file => file.includes('/DashboardLayout-')).length, accountFiles, 'Sibling navigation reuses the layout module');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `dashboard-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    assert(calls.filter(call => call.method !== 'GET').every(call => call.pathname === '/api/v1/auth/login'), 'Only synthetic login is allowed to mutate');
    checks.push({ width, homeDefersLayout: true, guestReturnUrl: true, login: true, sidebar: true, back: true, pageErrors: errors.length });
    await page.close();
  }
  {
    const page = await browser.newPage();
    const calls = await fixture(page);
    await page.goto(origin + '/wallet?vnp_TxnRef=' + uuid(8) + '&vnp_BankCode=QA&vnp_SecureHash=fixture');
    await expect(page.getByRole('heading', { name: 'Quay lại ví của bạn', exact: true })).toBeVisible();
    await expect(page).toHaveURL(origin + '/wallet?payment-return=1&topup=' + uuid(8));
    assert(!calls.some(call => call.pathname.startsWith('/api/v1/me/')), 'The credential-free payment return must bypass the dashboard guard');
    assert.equal(await page.locator('#account-content').count(), 0);
    checks.push({ paymentReturn: true, sanitizedUrl: true, privateReads: 0 });
    await page.close();
  }
  for (const failedAsset of [dashboardJs, dashboardCss, walletCss]) {
    const routePath = failedAsset === walletCss ? '/wallet' : '/notifications';
    const page = await browser.newPage();
    await fixture(page);
    let failed = false;
    await page.route('**/assets/' + failedAsset, route => {
      failed = true;
      return route.fulfill({ status: 503, body: '', headers: { 'cache-control': 'no-store' } });
    });
    await page.goto(origin + routePath);
    await expect(page.getByRole('heading', { name: 'Chưa mở được trang', exact: true })).toBeVisible();
    assert(failed);
    await page.unroute('**/assets/' + failedAsset);
    await page.getByRole('button', { name: 'Tải lại trang', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lại gặp nhau rồi.', exact: true })).toBeVisible();
    await expect(page).toHaveURL(origin + '/login?returnUrl=' + encodeURIComponent(routePath));
    checks.push({ routePath, failure: failedAsset.endsWith('.css') ? 'stylesheet' : 'script', routeError: true, reloadRecovered: true });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', checks }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
