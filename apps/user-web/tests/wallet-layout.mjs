import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-wallet-layout');
await mkdir(out, { recursive: true });
const build = process.env.WALLET_LAYOUT_BUILD
  ? path.resolve(root, process.env.WALLET_LAYOUT_BUILD) : path.join(app, 'dist');
const port = 4209;
const origin = 'http://127.0.0.1:' + port;
const server = await preview({
  configFile: false,
  root: app,
  build: { outDir: build },
  preview: { host: '127.0.0.1', port, strictPort: true },
});
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-03T03:00:00.000Z';
const currency = { demoOnly: true, label: 'Mô phỏng đồ án', currency: 'VND' };
const available = 75_000_000;
const summary = {
  ...currency, available, transactionHeld: 25_000_000, withdrawalHeld: 0, total: 100_000_000,
  serverTime: now, topupEnabled: true, paymentsEnabled: true, withdrawalsEnabled: false, vnpayEnabled: true,
};
const journal = {
  ...currency, journalId: uuid(3), topupId: uuid(4), orderId: null, type: 'Topup',
  amount: available, balanceAfter: available, postedAt: now,
};

async function installFixture(page) {
  const filters = [];
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === '/api/v1/auth/login' && method === 'POST') {
      return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'x'.repeat(43), expiresIn: 900,
        user: { id: uuid(1), displayName: 'Bạn đọc QA với tên dài để kiểm tra thẻ', email: 'reader@example.test', status: 'ACTIVE', roles: ['MEMBER'] },
      } });
    }
    assert.equal(method, 'GET', 'The wallet layout fixture does not submit commands');
    if (url.pathname === '/api/v1/me/wallet') return route.fulfill({ json: summary });
    if (url.pathname === '/api/v1/me/wallet/history') {
      const type = url.searchParams.get('type');
      filters.push(type);
      return route.fulfill({ json: { items: !type || type === 'Topup' ? [journal] : [], nextCursor: null } });
    }
    if (url.pathname === '/api/v1/me/topups') return route.fulfill({ json: { items: [], nextCursor: null } });
    if (url.pathname === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
    return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
  });
  return filters;
}

async function assertInside(outer, inner, label, vertical = false) {
  const [frame, item] = await Promise.all([outer.boundingBox(), inner.boundingBox()]);
  assert(frame && item && item.x >= frame.x - 1 && item.x + item.width <= frame.x + frame.width + 1, label);
  if (vertical) assert(item.y >= frame.y - 1 && item.y + item.height <= frame.y + frame.height + 1, label);
}

let browser;
const reports = [];
try {
  browser = await chromium.launch();
  for (const { width, fontPercent } of [
    { width: 390, fontPercent: 100 },
    { width: 320, fontPercent: 100 },
    { width: 390, fontPercent: 125 },
    { width: 768, fontPercent: 100 },
    { width: 1440, fontPercent: 100 },
  ]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 }, reducedMotion: 'reduce', timezoneId: 'Asia/Ho_Chi_Minh',
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const filters = await installFixture(page);
    await page.addInitScript(percent => {
      if (percent !== 100) document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.fontSize = percent + '%';
      }, { once: true });
    }, fontPercent);
    await page.goto(origin + '/wallet');
    await expect(page).toHaveURL(origin + '/login?returnUrl=%2Fwallet');
    await page.getByLabel(/^Email/).fill('reader@example.test');
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page).toHaveURL(origin + '/wallet');
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    await page.evaluate(() => document.fonts.ready);
    const title = page.getByRole('heading', { name: 'Ví & Ký Quỹ Thư Quán', exact: true });
    const wallet = title.locator('xpath=ancestor::section[1]');
    const card = page.getByRole('region', { name: /^Thẻ ví thành viên/ });
    const sandbox = page.getByRole('region', { name: /^Thông tin thẻ ATM/ });
    const history = page.getByRole('region', { name: 'Lịch sử giao dịch', exact: true });
    await expect(card.getByText(/75\.000\.000/)).toBeVisible();
    await expect(history.getByText(/75\.000\.000/).first()).toBeVisible();
    const geometry = await wallet.evaluate(el => ({
      content: el.scrollWidth, frame: el.clientWidth,
      doc: document.documentElement.scrollWidth, viewport: innerWidth,
    }));
    assert(geometry.content <= geometry.frame + 1 && geometry.doc <= geometry.viewport,
      'Wallet content must fit: ' + JSON.stringify({ width, fontPercent, ...geometry }));
    await assertInside(wallet, title, 'Wallet heading fits');
    await assertInside(wallet, card, 'Wallet card fits');
    await assertInside(card, card.getByText(/75\.000\.000/), 'Available balance is not clipped', true);
    await assertInside(card, card.getByText(/25\.000\.000/), 'Held balance is not clipped', true);
    await assertInside(wallet, history, 'Wallet history fits');
    const trigger = page.getByRole('button', { name: 'Nạp tiền VNPay', exact: true });
    const withdraw = page.getByRole('button', { name: /^Rút tiền/ });
    const refresh = page.getByRole('button', { name: 'Làm mới số dư ví', exact: true });
    for (const action of [trigger, withdraw, refresh]) await assertInside(wallet, action, 'Wallet action fits');
    const copy = sandbox.getByRole('button', { name: 'Sao chép', exact: true });
    await assertInside(sandbox, copy, 'Sandbox copy button fits');
    await assertInside(sandbox, sandbox.locator('code'), 'Sandbox card number fits');
    await assertInside(history, history.getByText(/Số dư sau:/), 'Ledger amount fits');

    const motion = await card.locator('[class*="passCardSheen"]').evaluate(el => {
      const animation = el.getAnimations()[0];
      return { duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes().map(frame => frame.offset) };
    });
    assert.deepEqual(motion, { duration: 8000, frames: [0, 0.8, 1] });

    await page.waitForFunction(() => document.querySelector('[data-paper-breeze]').hidden);
    await wallet.screenshot({ path: path.join(out, 'wallet-' + width + '-' + fontPercent + '.png') });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Nạp tiền vào ví', exact: true });
    await expect(dialog.getByRole('heading')).toBeFocused();
    await dialog.getByRole('textbox', { name: /Hoặc nhập số tiền/ }).fill('125000');
    const dialogGeometry = await dialog.evaluate(el => ({ client: el.clientWidth, content: el.scrollWidth }));
    assert(dialogGeometry.content <= dialogGeometry.client + 1, 'Wallet dialog fits: ' + JSON.stringify({ width, fontPercent, ...dialogGeometry }));
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    const tablist = history.getByRole('tablist');
    const lastTab = tablist.getByRole('tab').last();
    await lastTab.focus();
    await lastTab.press('Enter');
    await expect(lastTab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => filters.some(filter => filter !== null)).toBe(true);
    await assertInside(wallet, tablist, 'The horizontal filter strip stays inside the wallet');
    assert.equal(await page.evaluate(() => scrollX), 0);
    assert.deepEqual(errors, []);
    reports.push({ width, fontPercent, geometry, motion, walletActions: true, historyFilter: true, dialogFocus: true });
    await page.close();
  }
  await writeFile(path.join(out, 'result.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ status: 'PASS', reports }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
