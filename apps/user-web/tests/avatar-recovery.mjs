// Real Header/Sidebar and signed-avatar hook in production; synthetic HTTP only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-avatar-recovery');
await mkdir(out, { recursive: true });
const build = process.env.AVATAR_RECOVERY_BUILD ? path.resolve(root, process.env.AVATAR_RECOVERY_BUILD) : path.join(root, 'apps/user-web/dist');
const baseline = process.env.AVATAR_RECOVERY_BASELINE === '1';
const origin = 'http://127.0.0.1:4206';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4206, strictPort: true } });
const id = '00000000-0000-4000-8000-000000000001';
const avatarId = '00000000-0000-4000-8000-000000000002';
const user = { id, email: 'reader@example.test', displayName: 'Bạn đọc QA', status: 'ACTIVE', roles: ['MEMBER'] };
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.clock.install();
    let good = false, avatarReads = 0, badImages = 0;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/qa-avatar/**', route => {
      if (route.request().url().endsWith('/bad.svg')) { badImages++; return route.fulfill({ status: 404 }); }
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#5c0202"/></svg>' });
    });
    await page.route('**/api/v1/**', route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/api/v1/auth/login') return route.fulfill({ json: {
        accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user,
      } });
      assert.equal(route.request().method(), 'GET', 'No other fixture command is allowed');
      if (pathname === '/api/v1/auth/me') return route.fulfill({ json: user });
      if (pathname === '/api/v1/me/profile') return route.fulfill({ json: {
        id, version: 1, email: user.email, displayName: user.displayName, contactPhone: null, avatarId, pendingEmailChange: null,
      } });
      if (pathname === `/api/v1/me/profile/avatar-uploads/${avatarId}/read`) {
        avatarReads++;
        return route.fulfill({ json: { url: origin + '/qa-avatar/' + (good ? 'good' : 'bad') + '.svg',
          expiresAt: new Date(Date.now() + 300_000).toISOString() } });
      }
      if (pathname === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
    });
    await page.goto(origin + '/account');
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.locator('#overview-greeting').waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    await expect.poll(() => badImages).toBeGreaterThan(0);
    await expect(page.locator('img[src$="/qa-avatar/bad.svg"]')).toHaveCount(0);
    assert.equal(avatarReads, 1, 'Header and Sidebar share the issued URL');
    const originalBadImages = badImages;
    // Refetch the same failed URL: keep the fallback, without an image error loop.
    await page.clock.fastForward(61_000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
    await expect.poll(() => avatarReads).toBe(2);
    await page.waitForTimeout(100);
    assert.equal(badImages, originalBadImages);
    // The avatar ID stays fixed, but the next server response supplies a new URL.
    good = true;
    await page.clock.fastForward(61_000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
    await expect.poll(() => avatarReads).toBe(3);
    const images = page.locator('img[src$="/qa-avatar/good.svg"]');
    if (baseline) {
      await expect(images).toHaveCount(0);
    } else {
      await expect(images).toHaveCount(2);
      await expect.poll(() => images.evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
      if (width === 390) await page.getByRole('button', { name: /^Menu:/ }).click();
      await expect(page.locator('aside img[src$="/qa-avatar/good.svg"]')).toBeVisible();
      await page.screenshot({ path: path.join(out, `avatar-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    checks.push({ width, avatarReads, sameUrlRetried: false, sameIdNewUrlRecovered: !baseline, pageErrors: 0 });
    await page.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ status: 'PASS', checks }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', baseline, checks }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
