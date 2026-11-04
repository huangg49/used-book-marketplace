// Production auction intake journey. Every HTTP response is synthetic; no DB/provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-auction-intake-recovery');
await mkdir(out, { recursive: true });
const baseline = process.env.INTAKE_RECOVERY_BASELINE === '1';
const origin = 'http://127.0.0.1:4221';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'),
  build: { outDir: path.resolve(root, process.env.INTAKE_RECOVERY_BUILD ?? 'apps/user-web/dist') },
  preview: { host: '127.0.0.1', port: 4221, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T07:00:00.000Z';
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const listing = { id: id(10), version: 3, channel: 'Marketplace', catalogStatus: 'Confirmed',
  state: { moderation: 'Approved', visibility: 'Visible', trade: 'Available' },
  currentRevision: { id: id(11), bookId: id(12), content: { bookId: id(12), title: 'Sách đấu giá QA', author: 'Tác giả QA',
    mode: 'Both', salePrice: 100000, exchangeValue: 100000, condition: 'Good', mediaIds: [] } } };
const point = { id: id(20), code: 'QA-POINT', name: 'Điểm nhận QA', displayAddress: 'Địa chỉ mô phỏng QA',
  status: 'Active', capacity: 10, availableSlots: 5, demoOnly: true };
const intake = { id: id(30), auctionId: null, state: 'AwaitingDropoff', version: 1, listingId: id(10),
  title: 'Sách đấu giá QA', pointId: id(20), startPrice: 60000, step: 10000, buyNowPrice: null, protectiveValue: 100000,
  createdAt: now, dropoffDeadline: '2026-11-07T07:00:00.000Z', receivedAt: null, inspectedAt: null,
  inspectionOutcome: null, inspectionNote: null, reclaimReason: null, closedAt: null,
  evidenceDeadline: null, evidenceNote: null, evidenceSubmittedAt: null };
const receipt = { id: id(31), entityType: 'AuctionIntake', entityId: id(30), auctionId: null, orderId: null,
  version: 1, state: 'AwaitingDropoff', currentPrice: null, minimumBid: null, leading: null, serverTime: now };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const width of [390, 1440]) for (const scenario of ['duplicate', 'ack-read', 'unknown', 'wrong-receipt']) {
    if (scenario === 'wrong-receipt' && (baseline || width !== 390)) continue;
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    let failLists = true, failDetail = scenario === 'ack-read', detailReads = 0;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (p === '/api/v1/auction-intakes' && request.method() === 'POST') {
        writes.push({ key: request.headers()['idempotency-key'], body: request.postData() });
        if (scenario === 'duplicate') return route.abort('failed');
        if (scenario === 'unknown' && writes.length === 1) return route.fulfill({ status: 503, json: { code: 'QA_UNKNOWN' } });
        if (scenario === 'wrong-receipt' && writes.length === 1) return route.fulfill({ json: { ...receipt, entityType: 'PointOrder' } });
        if (scenario === 'ack-read') failLists = true;
        return route.fulfill({ json: receipt });
      }
      assert.equal(request.method(), 'GET', 'Only synthetic intake creation may submit');
      if (p === '/api/v1/me/listings' || p === '/api/v1/handover-points') return failLists
        ? route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } })
        : route.fulfill({ json: p.endsWith('/listings') ? { items: [listing], nextCursor: null } : { items: [point] } });
      if (p === `/api/v1/catalog/books/${id(12)}`) return route.fulfill({ json: { title: 'Sách đấu giá QA', authors: ['Tác giả QA'] } });
      if (p === `/api/v1/me/auction-intakes/${id(30)}`) {
        detailReads++;
        return failDetail ? route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } }) : route.fulfill({ json: intake });
      }
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent('/auctions/new?listing=' + id(10)));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByText('Chưa tải được sách trên kệ của bạn.', { exact: true })).toBeVisible();
    await expect(page.getByText('Chưa tải được điểm nhận sách.', { exact: true })).toBeVisible();
    await page.waitForFunction(() => !document.querySelector('[data-paper-storm]'));
    failLists = false;
    await page.getByRole('alert').filter({ hasText: 'Chưa tải được sách trên kệ của bạn.' }).getByRole('button', { name: 'Thử lại', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Chưa tải được điểm nhận sách.' }).getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByRole('radio', { name: /Sách đấu giá QA/ })).toBeChecked();
    const submit = page.getByRole('button', { name: 'Giữ chỗ đấu giá', exact: true });
    await submit.click();
    const dialog = page.getByRole('dialog', { name: 'Giữ chỗ đấu giá cho cuốn sách này?', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
    assert.equal(writes.length, 0, 'Cancel cannot create an intake');
    await submit.click();
    await dialog.getByRole('button', { name: 'Giữ chỗ', exact: true }).evaluate(button => { button.click(); button.click(); });
    if (scenario === 'duplicate') {
      await expect.poll(() => writes.length).toBe(baseline ? 2 : 1);
      await expect(page.getByRole('button', { name: 'Thử lại đúng yêu cầu này', exact: true })).toBeVisible();
      if (baseline) assert.equal(JSON.stringify(writes[0]) === JSON.stringify(writes[1]), true);
    } else if (scenario === 'unknown' || scenario === 'wrong-receipt') {
      // The first attempt is uncertain, and the explicit retry uses its exact key/body.
      if (baseline) {
        // Duplicate baseline calls can auto-replay; this case is exercised on the fixed build.
        await context.close();
        continue;
      }
      const retry = page.getByRole('button', { name: 'Thử lại đúng yêu cầu này', exact: true });
      await expect(retry).toBeVisible();
      await expect(page.getByRole('radio', { name: /Sách đấu giá QA/ })).toBeDisabled();
      await retry.click();
      await expect(page.getByRole('heading', { name: 'Mang “Sách đấu giá QA” tới điểm nhận sách', exact: true })).toBeVisible();
      assert.equal(writes.length, 2);
      assert.equal(JSON.stringify(writes[0]) === JSON.stringify(writes[1]), true, 'Unknown command retry retains key and body');
    } else {
      await expect.poll(() => detailReads).toBeGreaterThan(0);
      if (baseline) await expect(submit).toBeEnabled();
      else {
        await expect(submit).toHaveCount(0);
        const retry = page.getByRole('button', { name: 'Tải lại phiếu đã giữ chỗ', exact: true });
        await expect(retry).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Phiếu gửi sách đang chờ tải', exact: true })).toBeFocused();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.screenshot({ path: path.join(out, `ack-pending-${width}.png`), fullPage: true });
        await expect(page.getByRole('link', { name: 'Mở đúng phiếu trong Đấu giá của tôi', exact: true }))
          .toHaveAttribute('href', `/my-auctions?view=selling&intakeId=${id(30)}`);
        const previous = detailReads;
        await retry.click();
        await expect.poll(() => detailReads).toBeGreaterThan(previous);
        await expect(retry).toBeEnabled();
        assert.equal(writes.length, 1);
        failDetail = false;
        await retry.click();
        await expect(page.getByRole('heading', { name: 'Mang “Sách đấu giá QA” tới điểm nhận sách', exact: true })).toBeVisible();
        assert.equal(writes.length, 1, 'Confirmed intake recovery only reads; it never creates a new command');
      }
    }
    assert.deepEqual(errors, []);
    checks.push({ width, scenario, initialListsRetry: true, cancelNoWrite: true,
      repeatedClickRequests: scenario === 'duplicate' ? writes.length : undefined,
      confirmedReadRecovery: scenario === 'ack-read' ? !baseline : undefined,
      unknownExactReplay: scenario === 'unknown' || scenario === 'wrong-receipt' });
    await page.screenshot({ path: path.join(out, `${scenario}-${width}-${baseline ? 'before' : 'after'}.png`), fullPage: true });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
