// Production cart/support routes; synthetic HTTP only, no DB/provider access.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-resource-recovery');
await mkdir(out, { recursive: true });
const origin = 'http://127.0.0.1:4219';
const baseline = process.env.RESOURCE_RECOVERY_BASELINE === '1';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.RESOURCE_RECOVERY_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4219, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z';
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const sameRequest = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const remember = request => ({ path: new URL(request.url()).pathname,
  key: request.headers()['idempotency-key'], body: request.postData() });
let browser;
const checks = [];
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const feature of ['cart', 'support']) {
    if (baseline && feature !== 'cart') continue;
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    let readStatus = 503, postMode = 'lost', receipt, supportReads = 0;
    let cart = { id: user.id, version: 1, serverTime: now, items: [20, 21].map(n => ({ listingId: id(n),
      quantity: 1, addedAt: now, priceAtAdd: 50000, listing: null, canBuy: false })) };
    let detail = { case: { id: id(30), kind: 'Feedback', title: 'Góp ý QA về trải nghiệm', reporterId: id(1),
      reporterName: user.displayName, target: null, assigneeId: null, state: 'Open', version: 1, createdAt: now, updatedAt: now },
      messages: [], canManage: false, canReply: true, relatedState: null, relatedAuctionId: null, review: null, serverTime: now };
    let created = false;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === '/api/v1/me/cart/remove' && feature === 'cart') {
        writes.push(remember(request));
        if (baseline) return route.abort('failed');
        if (postMode === 'replay') return route.fulfill({ json: receipt });
        assert.equal(JSON.parse(request.postData()).expectedVersion, cart.version, 'New cart command uses the read version');
        cart = { ...cart, version: cart.version + 1, items: cart.items.filter(item => item.listingId !== JSON.parse(request.postData()).listingId) };
        receipt = { id: id(300 + cart.version), entityType: 'Cart', entityId: cart.id, version: cart.version, state: 'Updated', serverTime: now };
        if (postMode === 'lost') { postMode = 'replay'; return route.abort('failed'); }
        readStatus = 503;
        return route.fulfill({ json: receipt });
      }
      if (p === '/api/v1/me/support-cases' && request.method() === 'POST' && feature === 'support') {
        writes.push(remember(request));
        if (postMode === 'validation') return route.fulfill({ status: 422, json: { code: 'INVALID_INPUT', message: 'Kiểm tra lại nội dung QA.' } });
        if (!created) {
          created = true;
          detail.messages.push({ id: id(40), authorId: id(1), authorName: user.displayName, role: 'Member', internal: false,
            text: JSON.parse(request.postData()).description, createdAt: now });
        }
        receipt = { id: id(31), entityType: 'SupportCase', entityId: id(30), version: 1, state: 'Open', serverTime: now };
        if (postMode === 'lost') { postMode = 'replay'; return route.abort('failed'); }
        return route.fulfill({ json: receipt });
      }
      if (p === `/api/v1/me/support-cases/${id(30)}/messages` && request.method() === 'POST' && feature === 'support') {
        writes.push(remember(request));
        if (postMode === 'conflict') {
          detail.case.version = 2;
          detail.messages.push({ id: id(42), authorId: id(2), authorName: 'Admin QA', role: 'Admin',
            internal: false, text: 'Admin QA vừa cập nhật hồ sơ.', createdAt: now });
          return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'Hồ sơ vừa được cập nhật.' } });
        }
        if (postMode === 'lost') {
          assert.equal(JSON.parse(request.postData()).expectedVersion, 2, 'New message reads the version after conflict');
          // Member append v3 is followed by a concurrent Admin closure v4.
          detail = { ...detail, case: { ...detail.case, version: 4, state: 'Closed' }, canReply: false,
            messages: [...detail.messages, { id: id(41), authorId: id(1), authorName: user.displayName,
              role: 'Member', internal: false, text: JSON.parse(request.postData()).text, createdAt: now }] };
          receipt = { id: id(32), entityType: 'SupportCase', entityId: id(30), version: 3, state: 'Open', serverTime: now };
          postMode = 'replay';
          return route.abort('failed');
        }
        return route.fulfill({ json: receipt });
      }
      assert.equal(request.method(), 'GET', 'Unexpected fixture mutation');
      if (p === '/api/v1/me/cart') return readStatus === 200 ? route.fulfill({ json: cart })
        : route.fulfill({ status: readStatus, json: { code: 'QA_UNAVAILABLE', message: 'Chưa tải được dữ liệu QA.' } });
      if (p === '/api/v1/me/support-cases') return route.fulfill({ json: { items: created ? [detail.case] : [], nextCursor: null, serverTime: now } });
      if (p === `/api/v1/me/support-cases/${id(30)}`) {
        if (readStatus === 200) await route.fulfill({ json: detail });
        else await route.fulfill({ status: readStatus, json: { code: 'QA_UNAVAILABLE', message: 'Chưa tải được hồ sơ QA.' } });
        supportReads++;
        return;
      }
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(feature === 'cart' ? '/cart' : '/support/new'));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    if (feature === 'cart') {
      const items = page.getByRole('list', { name: 'Danh sách sách trong giỏ', exact: true }).getByRole('listitem');
      const refresh = page.getByRole('button', { name: 'Cập nhật giỏ', exact: true });
      await expect(page.getByText('Chưa tải được giỏ.', { exact: false })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Giỏ sách đang trống', exact: true })).toHaveCount(0);
      readStatus = 200;
      await refresh.click();
      await expect(items).toHaveCount(2);
      await items.first().getByRole('button', { name: 'Bỏ khỏi giỏ', exact: true }).evaluate(button => { button.click(); button.click(); });
      if (baseline) {
        await expect.poll(() => writes.length).toBe(2);
        assert.equal(sameRequest(writes[0], writes[1]), true, 'Duplicate sends still share the pinned intent');
        checks.push({ feature, width, repeatedClickRequests: writes.length, duplicateUsesSameIntent: true });
        await context.close();
        continue;
      }
      const retry = page.getByRole('button', { name: 'Xác minh thao tác giỏ trước', exact: true });
      await expect(retry).toBeVisible();
      assert.equal(writes.length, 1);
      await expect(items.first().getByRole('button', { name: 'Bỏ khỏi giỏ', exact: true })).toBeDisabled();
      await refresh.click();
      await expect(items).toHaveCount(1);
      await expect(retry).toBeVisible();
      if (width === 390) await page.getByRole('button', { name: /^Menu:/ }).click();
      await page.getByRole('link', { name: 'Tổng quan', exact: true }).click();
      await expect(page).toHaveURL(origin + '/account');
      await page.goBack();
      await expect(page).toHaveURL(origin + '/cart');
      await expect(retry).toBeVisible();
      await retry.click();
      await expect(retry).toHaveCount(0);
      assert.equal(writes.length, 2);
      assert.equal(sameRequest(writes[0], writes[1]), true, 'Cart replay keeps exact request after remount/new version');
      postMode = 'success';
      await items.first().getByRole('button', { name: 'Bỏ khỏi giỏ', exact: true }).click();
      await expect(page.getByText('Lệnh đã ghi nhận.', { exact: false })).toBeVisible();
      await expect(items).toHaveCount(1);
      await expect(page.getByRole('heading', { name: 'Giỏ sách đang trống', exact: true })).toHaveCount(0);
      await expect(items.first().getByRole('button', { name: 'Bỏ khỏi giỏ', exact: true })).toBeDisabled();
      readStatus = 200;
      await refresh.click();
      await expect(page.getByRole('heading', { name: 'Giỏ sách đang trống', exact: true })).toBeVisible();
      checks.push({ feature, width, initialErrorNotEmpty: true, repeatedClickOneRequest: true,
        exactReplayAfterRemount: true, ackThenReadFailure: true, emptyAfterConfirmedRead: true });
    } else {
      await expect(page.getByRole('heading', { name: 'Gửi yêu cầu', exact: true })).toBeVisible();
      const title = page.getByLabel('Tiêu đề', { exact: true }), description = page.getByLabel('Nội dung', { exact: true });
      const draft = 'Nội dung QA được giữ qua lỗi kiểm tra và mất phản hồi.';
      await title.fill(detail.case.title);
      await description.fill(draft);
      postMode = 'validation';
      await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Kiểm tra lại nội dung QA.');
      await expect(description).toHaveValue(draft);
      await expect(description).toBeEnabled();
      postMode = 'lost';
      await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).evaluate(button => { button.click(); button.click(); });
      const retry = page.getByRole('button', { name: 'Thử lại yêu cầu đã gửi', exact: true });
      await expect(retry).toBeVisible();
      assert.equal(writes.length, 2);
      await expect(description).toHaveValue(draft);
      await expect(description).toBeDisabled();
      await page.getByRole('link', { name: '← Yêu cầu của tôi', exact: true }).click();
      await page.getByRole('link', { name: 'Gửi yêu cầu mới', exact: true }).click();
      await expect(title).toHaveValue(detail.case.title);
      await expect(description).toHaveValue(draft);
      await retry.click();
      await expect(page).toHaveURL(origin + '/support/' + id(30));
      assert.equal(writes.length, 3);
      assert.equal(sameRequest(writes[1], writes[2]), true, 'Support create replay retains exact request after remount');
      assert.equal(writes[0].key !== writes[1].key, true, 'Definitive validation refusal permits a new intent');
      await page.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).waitFor();
      readStatus = 200;
      await page.getByRole('button', { name: 'Tải lại hồ sơ', exact: true }).click();
      await expect(page.getByRole('heading', { name: detail.case.title, exact: true })).toBeVisible();
      const additional = page.getByLabel('Bổ sung thông tin', { exact: true });
      const message = 'Thông tin bổ sung QA vẫn được giữ khi xung đột phiên bản.';
      await additional.fill(message);
      postMode = 'conflict';
      await page.getByRole('button', { name: 'Gửi bổ sung', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Hồ sơ vừa được cập nhật.');
      await expect(page.getByText('Admin QA vừa cập nhật hồ sơ.', { exact: true })).toBeVisible();
      await expect(additional).toHaveValue(message);
      postMode = 'lost';
      await page.getByRole('button', { name: 'Gửi bổ sung', exact: true }).click();
      await expect(retry).toBeVisible();
      const lostIndex = writes.length - 1;
      await page.getByRole('link', { name: '← Yêu cầu của tôi', exact: true }).click();
      await page.getByRole('link', { name: detail.case.title, exact: true }).click();
      await expect(additional).toHaveCount(0);
      const readsBeforeReplay = supportReads;
      await retry.click();
      await expect(retry).toHaveCount(0);
      await expect.poll(() => supportReads).toBeGreaterThan(readsBeforeReplay);
      await expect(page.getByRole('button', { name: 'Cập nhật hồ sơ', exact: true })).toBeEnabled();
      assert.equal(sameRequest(writes[lostIndex], writes.at(-1)), true, 'Closed case still replays the pinned message, not a new body/version');
      await expect(page.getByText(message, { exact: true })).toHaveCount(1);
      await expect(page.getByText('Hồ sơ hỗ trợ đã đóng.', { exact: false })).toBeVisible();
      readStatus = 403;
      // A focus/visibility refetch can revoke access before a manual click.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
      await expect(page.getByRole('button', { name: 'Tải lại hồ sơ', exact: true })).toBeVisible();
      await expect(page.getByText(message, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: detail.case.title, exact: true })).toHaveCount(0);
      readStatus = 200;
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })));
      await expect(page.getByText(message, { exact: true })).toHaveCount(1);
      checks.push({ feature, width, validationKeepsDraft: true, repeatedClickOneRequest: true,
        exactCreateReplayAfterRemount: true, initialDetailRetry: true, conflictKeepsMessage: true,
        exactMessageReplayAfterClosure: true, deniedReadHidesCachedContent: true });
    }
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(out, `${feature}-${width}.png`), fullPage: true });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'result.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
