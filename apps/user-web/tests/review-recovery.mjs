// Production Member review journey. All HTTP is synthetic; no DB or provider.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const { chromium, expect } = require('playwright/test');
const { preview } = await import(pathToFileURL(require.resolve('vite')).href);
const out = path.join(root, '.tmp/member-web-review-recovery');
await mkdir(out, { recursive: true });
const build = path.resolve(root, process.env.REVIEW_RECOVERY_BUILD ?? 'apps/user-web/dist');
const baseline = process.env.REVIEW_RECOVERY_BASELINE === '1';
const origin = 'http://127.0.0.1:4218';
const server = await preview({ configFile: false, root: path.join(root, 'apps/user-web'), build: { outDir: build },
  preview: { host: '127.0.0.1', port: 4218, strictPort: true } });
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const now = '2026-11-04T03:00:00.000Z';
const user = { id: id(1), displayName: 'Bạn đọc QA', email: 'reader@example.test', roles: ['MEMBER'], status: 'ACTIVE' };
const checks = [];
let browser;
try {
  browser = await chromium.launch();
  for (const [type, width] of [['Exchange', 390], ['Exchange', 1440], ['DirectOrder', 390], ['PointOrder', 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    const review = (author, extra = {}) => ({ id: id(100 + author), transactionType: type, transactionId: id(10),
      authorId: id(author), authorName: 'Bạn đọc QA ' + author, targetUserId: id(author === 1 ? 2 : 1),
      bookRating: type === 'Exchange' ? 4 : null, partnerRating: 5, tags: [], comment: 'Nhận xét QA ban đầu',
      version: 1, status: 'Pending', createdAt: now, updatedAt: now, editDeadline: '2026-11-06T03:00:00Z',
      publishedAt: null, evidenceHeld: false, legacyDisclosed: false, reply: null, ...extra });
    let data = { partnerId: id(2), canReview: false, canEdit: true, canDelete: true, canReply: false,
      bookRatingRequired: type === 'Exchange', deadline: '2026-11-11T03:00:00Z', serverTime: now,
      myReview: review(1), partnerReview: null };
    let readStatus = 503, writeMode = 'conflict', reads = 0;
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), p = url.pathname;
      if (p === '/api/v1/auth/login') return route.fulfill({ json: { accessToken: 'fixture-access', refreshToken: 'f'.repeat(43), expiresIn: 900, user } });
      if (request.method() === 'POST') {
        assert.ok(p === `/api/v1/transaction-reviews/${id(101)}/edit` || p === `/api/v1/transaction-reviews/${id(102)}/reply`, 'Only fixture review commands are allowed');
        // Keep replay evidence in memory; never print keys or request bodies.
        writes.push({ path: p, key: request.headers()['idempotency-key'], body: request.postData() });
        if (writeMode === 'conflict') {
          data = { ...data, myReview: review(1, { version: 2, comment: 'Bản cập nhật QA từ nơi khác' }) };
          return route.fulfill({ status: 409, json: { code: 'VERSION_CONFLICT', message: 'Phiên bản đã thay đổi.' } });
        }
        if (writeMode === 'lost') {
          data = { ...data, canEdit: false, canDelete: false,
            myReview: review(1, { version: 3, comment: JSON.parse(request.postData()).comment, evidenceHeld: true }) };
          writeMode = 'replay';
          return route.abort('failed');
        }
        if (writeMode === 'replay') return route.fulfill({ json: data.myReview });
        if (writeMode === 'reply') {
          data = { ...data, canReply: false, partnerReview: { ...data.partnerReview,
            version: 2, reply: { text: JSON.parse(request.postData()).text, status: 'Pending', createdAt: now } } };
          return route.fulfill({ json: data.partnerReview });
        }
        return route.fulfill({ status: 403, json: { code: 'NOT_ALLOWED', message: 'Thao tác không còn được phép.' } });
      }
      assert.equal(request.method(), 'GET');
      if (p === `/api/v1/transactions/${type}/${id(10)}/reviews`) {
        reads++;
        return readStatus === 200 ? route.fulfill({ json: data })
          : route.fulfill({ status: readStatus, json: { code: 'QA_UNAVAILABLE', message: 'Chưa đọc được dữ liệu QA.' } });
      }
      if (p === '/api/v1/me/review-transactions') return route.fulfill({ json: { items: [], nextCursor: null, serverTime: now } });
      if (p === `/api/v1/members/${id(1)}/reputation`) return route.fulfill({ json: { userId: id(1), displayName: user.displayName,
        completedTransactions: 0, verifiedViolations: 0, reviewCount: 0, partnerRatingCount: 0, bookRatingCount: 0,
        partnerRating: null, bookRating: null, items: [], nextCursor: null, serverTime: now } });
      if (p === '/api/v1/me/notifications') return route.fulfill({ json: { items: [], nextCursor: null, unreadCount: 0 } });
      if (p.startsWith('/api/v1/')) return route.fulfill({ status: 503, json: { code: 'QA_UNAVAILABLE' } });
      if (url.origin === origin) return route.continue();
      return route.abort();
    });
    await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(`/reviews?type=${type}&transaction=${id(10)}`));
    await page.getByLabel(/^Email/).fill(user.email);
    await page.getByLabel(/^Mật khẩu/).fill('fixture-password');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chưa tải được đánh giá', exact: true })).toBeVisible();
    readStatus = 200;
    await page.getByRole('button', { name: 'Tải lại đánh giá', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Đánh giá giao dịch', exact: true });
    await expect(panel).toBeVisible();
    const refresh = async () => {
      const previous = reads;
      await panel.getByRole('button', { name: 'Tải lại', exact: true }).click();
      await expect.poll(() => reads).toBeGreaterThan(previous);
      await expect(panel.getByRole('button', { name: 'Tải lại', exact: true })).toBeEnabled();
      const readError = panel.getByText('Chưa cập nhật được đánh giá.', { exact: false });
      if (readStatus !== 200) await expect(readError).toBeVisible();
      else {
        await expect(readError).toHaveCount(0);
        await expect(panel.getByRole('heading', { name: 'Đánh giá của bạn', exact: true })).toHaveCount(data.myReview ? 1 : 0);
        for (const [flag, name] of [['canReview', 'Viết đánh giá'], ['canEdit', 'Sửa đánh giá'], ['canDelete', 'Xóa đánh giá công khai'], ['canReply', 'Phản hồi đánh giá']])
          await expect(panel.getByRole('button', { name, exact: true })).toHaveCount(data[flag] ? 1 : 0);
      }
    };
    await panel.getByRole('button', { name: 'Sửa đánh giá', exact: true }).click();
    let form = panel.getByRole('form', { name: 'Soạn đánh giá', exact: true });
    const draft = 'Bản nháp QA được giữ qua lỗi mạng và xung đột phiên bản.';
    await form.getByRole('textbox').fill(draft);
    readStatus = 503;
    await refresh();
    await expect(form.getByRole('textbox')).toHaveValue(draft);
    assert.equal(await form.getByRole('button', { name: 'Lưu đánh giá', exact: true }).isDisabled(), !baseline);
    readStatus = 200;
    await refresh();
    await form.getByRole('button', { name: 'Lưu đánh giá', exact: true }).click();
    await expect(form.getByRole('button', { name: 'Dùng phiên bản hiện tại, giữ bản nháp', exact: true })).toBeVisible();
    await expect(form.getByRole('textbox')).toHaveValue(draft);
    await form.getByRole('button', { name: 'Dùng phiên bản hiện tại, giữ bản nháp', exact: true }).click();
    writeMode = 'lost';
    await form.getByRole('button', { name: 'Lưu đánh giá', exact: true }).evaluate(button => { button.click(); button.click(); });
    const retry = panel.getByRole('button', { name: 'Thử lại yêu cầu đã gửi', exact: true });
    await expect(retry).toBeVisible();
    assert.equal(writes.length, 2, 'Repeated clicks send one new request');
    const beforePoll = reads;
    await page.clock.fastForward(61000);
    await expect.poll(() => reads).toBeGreaterThan(beforePoll);
    await retry.click();
    await expect(retry).toHaveCount(0);
    assert.equal(writes.length, 3);
    assert.deepEqual(writes[1], writes[2], 'Uncertain ACK retries exact path, body and key despite changed eligibility');
    assert.notEqual(writes[0].key, writes[1].key, 'Definitive 409 permits an explicit new intent');
    await expect(panel).toContainText(draft);

    data = { ...data, myReview: review(1, { status: 'Published', publishedAt: now }),
      partnerReview: review(2, { status: 'Published', publishedAt: now }), canReply: true };
    await refresh();
    const reports = panel.getByRole('link', { name: 'Báo cáo nội dung', exact: true });
    await expect(reports).toHaveCount(baseline ? 4 : 2);
    await panel.getByRole('button', { name: 'Phản hồi đánh giá', exact: true }).click();
    form = panel.getByRole('form', { name: 'Phản hồi đánh giá', exact: true });
    const replyDraft = 'Phản hồi QA vẫn được giữ khi đánh giá đối tác bị ẩn.';
    await form.getByRole('textbox').fill(replyDraft);
    data = { ...data, partnerReview: null, canReply: false };
    await refresh();
    await expect(form.getByRole('textbox')).toHaveValue(replyDraft);
    const beforeHidden = writes.length;
    const replyButton = form.getByRole('button', { name: 'Gửi phản hồi', exact: true });
    if (baseline) {
      await replyButton.click();
      await expect.poll(() => errors.length).toBeGreaterThan(0);
      assert.ok(errors.some(error => /null|undefined/.test(error)));
    } else {
      await expect(replyButton).toBeDisabled();
      await form.evaluate(node => node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await expect(panel.getByText('Chưa thể gửi theo trạng thái hiện tại.', { exact: false })).toBeVisible();
    }
    assert.equal(writes.length, beforeHidden);
    data = { ...data, partnerReview: review(2, { status: 'Published', publishedAt: now }), canReply: true };
    await refresh();
    await expect(form.getByRole('textbox')).toHaveValue(replyDraft);
    writeMode = 'reply';
    await form.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(panel).toContainText(replyDraft);

    // A review created elsewhere must not silently erase the open create draft.
    data = { ...data, myReview: null, partnerReview: null, canReview: true, canEdit: false, canReply: false };
    await refresh();
    await panel.getByRole('button', { name: 'Viết đánh giá', exact: true }).click();
    form = panel.getByRole('form', { name: 'Soạn đánh giá', exact: true });
    await form.getByRole('textbox').fill(draft);
    data = { ...data, myReview: review(1), canReview: false };
    await refresh();
    const createDraftPreserved = await form.getByRole('textbox').inputValue() === draft;
    assert.equal(createDraftPreserved, !baseline);
    assert.equal(await form.getByRole('button', { name: 'Lưu đánh giá', exact: true }).isDisabled(), !baseline);
    await form.getByRole('button', { name: 'Đóng bản nháp', exact: true }).click();
    data = { ...data, canEdit: true, canDelete: true };
    await refresh();
    for (const action of ['edit', 'delete']) {
      await panel.getByRole('button', { name: action === 'edit' ? 'Sửa đánh giá' : 'Xóa đánh giá công khai', exact: true }).click();
      form = panel.getByRole('form', { name: 'Soạn đánh giá', exact: true });
      if (action === 'edit') await form.getByRole('textbox').fill(draft);
      data = { ...data, canEdit: false, canDelete: false, myReview: { ...data.myReview, evidenceHeld: true } };
      await refresh();
      if (action === 'edit') await expect(form.getByRole('textbox')).toHaveValue(draft);
      assert.equal(await form.getByRole('button', { name: action === 'edit' ? 'Lưu đánh giá' : 'Xác nhận xóa', exact: true }).isDisabled(), !baseline);
      if (action === 'edit') await form.screenshot({ path: path.join(out, `editor-${type}-${width}-${baseline ? 'before' : 'after'}.png`) });
      await form.getByRole('button', { name: 'Đóng bản nháp', exact: true }).click();
      data = { ...data, canEdit: true, canDelete: true };
      await refresh();
    }
    if (!baseline) assert.deepEqual(errors, []);
    checks.push({ type, width, initialReadRetry: true, readErrorPreservesDraft: true, conflictKeepsDraft: true,
      repeatedClickOneRequest: true, exactReplayAfterEligibilityChange: true, hiddenPeerNoException: !baseline,
      createDraftPreserved, revokedActionsDisabled: !baseline, reportLinks: baseline ? 4 : 2 });
    await context.close();
  }
  await writeFile(path.join(out, baseline ? 'before.json' : 'after.json'), JSON.stringify({ checks }, null, 2));
  console.log(JSON.stringify({ baseline, checks }));
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
