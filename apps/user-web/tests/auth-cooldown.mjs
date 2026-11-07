// Production account forms; synthetic auth HTTP only, no email or account writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-auth-cooldown');
await mkdir(out, { recursive: true });
const build = process.env.AUTH_COOLDOWN_BUILD ? path.resolve(root, process.env.AUTH_COOLDOWN_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.AUTH_COOLDOWN_BASELINE === '1';
const origin = 'http://127.0.0.1:4214';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4214, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const epoch = Date.parse('2026-11-04T03:00:00.000Z');
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const routeName of ['register', 'forgot-password']) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    let requests = 0, failNext = false, holdNext = false, release;
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(epoch) });
    await page.clock.pauseAt(new Date(epoch + 1000));
    await page.addInitScript(() => {
      window.qaCooldown = { active: new Set(), calls: 0 };
      const interval = window.setInterval.bind(window), clear = window.clearInterval.bind(window);
      window.setInterval = (fn, delay, ...args) => {
        const token = interval(delay === 1000 ? (...values) => { window.qaCooldown.calls++; fn(...values); } : fn, delay, ...args);
        if (delay === 1000) window.qaCooldown.active.add(token);
        return token;
      };
      window.clearInterval = token => { window.qaCooldown.active.delete(token); return clear(token); };
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p.startsWith('/api/v1/')) {
        if (p === '/api/v1/auth/otp/register' || p === '/api/v1/auth/otp/request') {
          assert.equal(request.method(), 'POST'); requests++;
          if (holdNext) { holdNext = false; await new Promise(resolve => { release = resolve; }); }
          if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } }); }
          return route.fulfill({ json: { message: 'QA acknowledgement', challengeId: id(requests), expiresIn: 300, resendAfter: 60 } });
        }
        assert.equal(request.method(), 'GET', 'No verification/reset command is allowed');
        return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      }
      if (url.origin === origin) return route.continue();
      throw new Error('Unexpected external traffic');
    });
    await page.goto(origin + '/' + routeName);
    await expect.poll(async () => { await page.clock.runFor(1); return page.locator(routeName === 'register' ? '#register-email' : '#recovery-email').count(); }).toBe(1);
    const active = () => page.evaluate(() => window.qaCooldown.active.size);
    assert.equal(await active(), 0);
    if (routeName === 'register') {
      await page.locator('#register-name').fill('Bạn đọc QA');
      await page.locator('#register-email').fill('reader@example.test');
      await page.locator('#register-password').fill('fixture-password');
      await page.locator('#register-confirmation').fill('fixture-password');
      await page.locator('#accepted-rules').check();
      await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    } else {
      await page.locator('#recovery-email').fill('reader@example.test');
      await page.getByRole('button', { name: 'Gửi mã khôi phục', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Gửi lại sau 60 giây', exact: true })).toBeDisabled();
    assert.equal(await active(), 1);
    const otp = page.getByLabel('Mã xác nhận email', { exact: true });
    await otp.fill('123456');
    await page.clock.runFor(59000);
    await expect(page.getByRole('button', { name: 'Gửi lại sau 1 giây', exact: true })).toBeDisabled();
    assert.equal(requests, 1, 'Cooldown never sends a request automatically');
    await page.clock.runFor(1000);
    const resend = page.getByRole('button', { name: 'Gửi lại mã', exact: true });
    await expect(resend).toBeEnabled();
    assert.equal(await active(), baseline ? 1 : 0);
    await page.evaluate(() => { window.qaCooldown.calls = 0; });
    await page.clock.runFor(5000);
    const expiredCalls = await page.evaluate(() => window.qaCooldown.calls);
    assert.equal(expiredCalls, baseline ? 5 : 0);
    await page.screenshot({ path: path.join(out, `${routeName}-${width}${baseline ? '-before' : ''}.png`) });
    failNext = true; await resend.click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(otp).toHaveValue('123456');
    await expect(resend).toBeEnabled();
    assert.equal(requests, 2);
    assert.equal(await active(), baseline ? 1 : 0, 'A failed resend starts no new cooldown');
    await resend.click();
    await expect(page.getByRole('button', { name: 'Gửi lại sau 60 giây', exact: true })).toBeDisabled();
    await expect(otp).toHaveValue('');
    assert.equal(await active(), 1);
    await page.clock.runFor(60000);
    await expect(resend).toBeEnabled();
    assert.equal(await active(), baseline ? 1 : 0);
    holdNext = true; await resend.click();
    await expect.poll(() => requests).toBe(4);
    await page.getByRole('link', { name: routeName === 'register' ? 'Đăng nhập' : 'Quay lại đăng nhập', exact: true }).click();
    await page.clock.runFor(2500);
    await expect.poll(async () => { await page.clock.runFor(100); return new URL(page.url()).pathname; }).toBe('/login');
    await expect(page.locator('#email')).toBeVisible();
    assert.equal(await active(), 0);
    release();
    await page.waitForTimeout(100);
    assert.equal(await active(), 0, 'A late response cannot start a hidden countdown');
    assert.deepEqual(errors, []);
    checks.push({ width, route: routeName, expiredCallsIn5Seconds: expiredCalls, requests, retry: true, cleanup: true, pageErrors: 0 });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
