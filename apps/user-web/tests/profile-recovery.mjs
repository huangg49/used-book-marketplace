// Production profile journey. All HTTP/WS isolated; no account or email provider writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-profile-recovery');
await mkdir(out, { recursive: true });
const baseline = process.env.PROFILE_RECOVERY_BASELINE === '1';
const origin = 'http://127.0.0.1:4220';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.PROFILE_RECOVERY_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4220, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z';
const oldEmail = 'reader@example.test', newEmail = 'new-reader@example.test';
const remember = request => ({ path: new URL(request.url()).pathname,
  key: request.headers()['idempotency-key'], body: request.postData() });
const sameRequest = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const scenario of ['save', 'draft', 'email']) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    let profile = { id: id(1), version: 1, displayName: 'Bạn đọc QA', email: oldEmail,
      contactPhone: null, avatarId: null, pendingEmailChange: null };
    const user = () => ({ id: id(1), displayName: profile.displayName, email: profile.email, roles: ['MEMBER'], status: 'ACTIVE' });
    let readStatus = scenario === 'draft' ? 503 : 200, reads = 0, mode = 'lost', receipt;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user: user() } });
      if (request.method() === 'POST') {
        assert.ok(['/api/v1/me/profile', '/api/v1/me/profile/email-changes', '/api/v1/me/profile/email-changes/confirm'].includes(p), 'Only fixture profile commands are allowed');
        writes.push(remember(request));
        if (mode === 'replay') return route.fulfill({ json: receipt });
        if (p === '/api/v1/me/profile') {
          if (baseline && scenario === 'save') return route.abort('failed');
          if (mode === 'conflict') return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'Hồ sơ đã thay đổi phiên bản.' } });
          profile = { ...profile, displayName: JSON.parse(request.postData()).displayName.trim(), version: 2 };
          receipt = { id: id(31), entityType: 'MemberProfile', entityId: id(1), version: 2, state: 'Updated', serverTime: now };
        } else if (p.endsWith('/confirm')) {
          profile = { ...profile, email: newEmail, pendingEmailChange: null, version: profile.version + 1 };
          receipt = { id: id(33), entityType: 'MemberEmailChange', entityId: id(20), version: 2, state: 'Confirmed', serverTime: now };
        } else {
          profile = { ...profile, version: profile.version + 1, pendingEmailChange: { id: id(20), email: newEmail,
            expiresAt: new Date(Date.now() + 300000).toISOString(), resendAt: new Date(Date.now() + 60000).toISOString() } };
          receipt = { id: id(32), entityType: 'MemberEmailChange', entityId: id(20), version: 1, state: 'Pending', serverTime: now };
        }
        if (mode === 'lost') { mode = 'replay'; return route.abort('failed'); }
        readStatus = 503;
        return route.fulfill({ json: receipt });
      }
      assert.equal(request.method(), 'GET');
      if (p === '/api/v1/auth/me') return route.fulfill({ json: user() });
      if (p === '/api/v1/me/profile') {
        if (readStatus === 200) await route.fulfill({ json: profile });
        else await route.fulfill({ status: readStatus, json: { code: 'QA_UNAVAILABLE', message: 'Chưa đọc được hồ sơ QA.' } });
        reads++;
        return;
      }
      if (p === `/api/v1/members/${id(1)}/reputation`) return route.fulfill({ json: { userId: id(1), displayName: profile.displayName,
        completedTransactions: 0, verifiedViolations: 0, reviewCount: 0, partnerRatingCount: 0, bookRatingCount: 0,
        partnerRating: null, bookRating: null, items: [], nextCursor: null, serverTime: now } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p === '/api/v1/me/review-transactions') return route.fulfill({ json: { items: [], nextCursor: null, serverTime: now } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin + '/login?returnUrl=%2Fprofile');
    await page.getByLabel(/^Email/).fill(oldEmail);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    const main = page.locator('#account-content'), name = main.locator('#profile-name');
    if (scenario === 'draft') {
      await expect(main.getByRole('heading', { name: 'Chưa tải được hồ sơ', exact: true })).toBeVisible();
      readStatus = 200;
      await main.getByRole('button', { name: 'Thử lại', exact: true }).click();
    }
    await expect(main.getByRole('heading', { name: 'Hồ sơ & Bảo mật', exact: true })).toBeVisible();
    await expect(name).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    await page.clock.install();
    const navigateAwayAndBack = async () => {
      if (width === 390) {
        const menu = page.getByRole('button', { name: /^Menu:/ });
        if (await menu.getAttribute('aria-expanded') !== 'true') await menu.click();
      }
      await page.getByRole('link', { name: 'Đánh giá của tôi', exact: true }).click();
      await expect(page).toHaveURL(origin + '/reviews');
      await expect(main.getByRole('heading', { name: 'Đánh giá của tôi', exact: true })).toBeVisible();
      await expect(name).toHaveCount(0);
      await page.goBack();
      await expect(page).toHaveURL(origin + '/profile');
    };
    const draft = 'Tên bạn đọc QA đang chỉnh';
    if (scenario === 'save') {
      await name.fill(draft);
      await expect(name).toHaveValue(draft);
      const save = main.getByRole('button', { name: 'Lưu thay đổi', exact: true });
      await expect(save).toBeEnabled();
      await save.evaluate(button => { button.click(); button.click(); });
      const retry = main.getByRole('button', { name: 'Xác minh lần lưu trước', exact: true });
      await expect(retry).toBeVisible();
      await expect.poll(() => writes.length).toBe(baseline ? 2 : 1);
      if (!baseline) {
        await navigateAwayAndBack();
        await retry.click();
        await expect(retry).toHaveCount(0);
        await expect(name).toHaveValue(draft);
        assert.equal(writes.length, 2);
        assert.equal(sameRequest(writes[0], writes[1]), true, 'Profile replay keeps the original request after remount');
        await name.fill('  ' + draft + ' mới  ');
        mode = 'success';
        await main.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect(main.getByRole('button', { name: 'Tải lại hồ sơ', exact: true })).toBeVisible();
        await expect(name).toBeDisabled();
        readStatus = 200;
        await main.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click();
        await expect(name).toHaveValue(draft + ' mới');
        await expect(name).toBeEnabled();
      }
      checks.push({ scenario, width, repeatedClickRequests: baseline ? 2 : 1,
        exactReplayAfterRemount: !baseline, ackThenReadFailure: !baseline });
    } else if (scenario === 'draft') {
      await name.fill(draft);
      readStatus = 503;
      await page.clock.fastForward(16000);
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
      const retry = main.getByRole('button', { name: 'Tải lại hồ sơ', exact: true });
      await expect(retry).toBeVisible();
      await expect(name).toHaveValue(draft);
      // A failed recovery read must not change the later draft policy.
      await retry.click();
      await expect(name).toBeDisabled();
      await expect(name).toHaveValue(draft);
      profile = { ...profile, version: 2, displayName: 'Tên QA cập nhật từ nơi khác' };
      readStatus = 200;
      const previous = reads;
      await retry.click();
      await expect.poll(() => reads).toBeGreaterThan(previous);
      await expect(retry).toHaveCount(0);
      await expect(name).toHaveValue(baseline ? profile.displayName : draft);
      if (!baseline) {
        mode = 'conflict';
        await main.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
        await expect.poll(() => writes.length).toBe(1);
        await expect(main.getByRole('alert').filter({ hasText: 'Thông tin đã thay đổi ở nơi' })).toBeVisible();
        assert.equal(JSON.parse(writes[0].body).expectedVersion, 1, 'Read recovery does not silently rebase the draft');
        await expect(name).toHaveValue(draft);
      }
      await main.getByRole('button', { name: 'Tải bản mới', exact: true }).click();
      await expect(name).toHaveValue(profile.displayName);
      assert.equal(await name.inputValue() === profile.displayName, true, 'Explicit replacement still loads the current version');
      checks.push({ scenario, width, initialReadRetry: true, backgroundErrorRetainsDraft: true,
        readRecoveryKeepsDraftAndVersion: !baseline, explicitReplacement: true });
    } else {
      const email = main.locator('#profile-new-email'), password = main.locator('#profile-current-password');
      await email.fill(newEmail);
      await expect(email).toHaveValue(newEmail);
      await password.fill('fixture-password');
      assert.equal(await password.inputValue() === 'fixture-password', true, 'The current password field is ready before submission');
      await main.getByRole('button', { name: 'Gửi mã xác nhận', exact: true }).click();
      const retry = main.getByRole('button', { name: 'Xác minh yêu cầu gửi mã', exact: true });
      await expect(retry).toBeVisible();
      await navigateAwayAndBack();
      await expect(retry).toBeVisible();
      await expect(email).toHaveValue(baseline ? '' : newEmail);
      await expect(password).toHaveValue('');
      await expect(email).toBeDisabled();
      await expect(password).toBeEnabled();
      await retry.click();
      assert.equal(writes.length, 1, 'Remount requires password re-entry before sending');
      await password.fill('fixture-password');
      await retry.click();
      await expect(retry).toHaveCount(0);
      assert.equal(writes.length, 2);
      assert.equal(sameRequest(writes[0], writes[1]), true, 'Email retry retains original key and business fields');
      await expect(password).toHaveValue('');
      await expect(main.getByText(oldEmail, { exact: true })).toBeVisible();
      const confirm = main.getByRole('button', { name: 'Xác minh & Đổi email', exact: true });
      await expect(confirm).toBeVisible();
      await main.getByLabel('Mã xác nhận', { exact: true }).fill('123456');
      mode = 'lost';
      await confirm.click();
      const confirmRetry = main.getByRole('button', { name: 'Xác minh kết quả trước', exact: true });
      await expect(confirmRetry).toBeVisible();
      await navigateAwayAndBack();
      await expect(main.getByLabel('Mã xác nhận', { exact: true })).toHaveValue('');
      await confirmRetry.click();
      await expect(confirmRetry).toHaveCount(0);
      assert.equal(writes.length, 4);
      assert.equal(sameRequest(writes[2], writes[3]), true, 'Confirmation replays the original code after remount');
      await expect(main.getByText(newEmail, { exact: true })).toBeVisible();
      checks.push({ scenario, width, pinnedEmailVisibleAfterRemount: !baseline, passwordNotRetained: true,
        explicitPasswordReentry: true, exactEmailReplay: true, oldEmailUntilConfirmation: true, exactConfirmReplay: true });
    }
    assert.deepEqual(errors, []);
    await main.screenshot({ path: path.join(out, `${scenario}-${width}-${baseline ? 'before' : 'after'}.png`) });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
