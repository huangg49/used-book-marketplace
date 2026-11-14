// UI-only labelled queue fixtures; real QA login/API. Financial invariants are
// verified separately by exchanges.e2e-spec.ts, never by these HTTP responses.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { chromium, expect } from 'playwright/test';
import { createTestApi, root, base, origin, password } from './test-api.mjs';

const require = createRequire(import.meta.url);
const qa = new URL(process.env.MONGO_TEST_URL ?? '');
assert.equal(qa.hostname, '127.0.0.1');
assert.equal(qa.port, '57017');
assert.equal(qa.searchParams.get('replicaSet'), 'rs-test');
process.env.AUTOFILL_ENABLED = 'false';
process.env.PRICE_ASSIST_ENABLED = 'false';
let fixture, server, browser;
try {
  fixture = await createTestApi();
  server = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), '--host', '127.0.0.1', '--port', new URL(origin).port, '--strictPort'], {
    cwd: path.join(root, 'apps/admin-web'), windowsHide: true,
    env: { ...process.env, VITE_API_BASE_URL: base }, stdio: 'ignore',
  });
  const until = Date.now() + 20000;
  while (true) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (server.exitCode !== null || Date.now() > until) throw new Error('Admin preview unavailable');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const now = new Date().toISOString();
  const item = {
    id: randomUUID(), initiatorId: randomUUID(), recipientId: randomUUID(),
    initiatorListingId: randomUUID(), recipientListingId: randomUUID(),
    status: 'ResolutionPending', revision: 8, initiatorDeposit: 300000,
    recipientDeposit: 200000, diffAmount: 100000, createdAt: now, updatedAt: now,
    initiatorFundedAt: now, recipientFundedAt: now, diffPayerId: null,
    initiatorShippedAt: now, recipientShippedAt: now, disputedAt: now,
    participants: { initiator: { displayName: 'An QA', avatarId: randomUUID() }, recipient: { displayName: 'Bình QA', avatarId: null } },
    disputedBy: 'System', disputeReason: 'QA giao diện: sách đang được đối chiếu tình trạng và nơi giữ. '.repeat(5),
  };
  const snapshot = (listingId, ownerId, ownerDisplayName, title) => ({
    listingId, ownerId, ownerDisplayName, listingVersion: 1,
    revisionId: randomUUID(), bookId: randomUUID(), catalogRevisionId: randomUUID(),
    book: { title, authors: [], isbn: null, edition: null, publisher: null,
      publicationYear: null, language: 'Tiếng Việt', category: 'Văn học' },
    condition: 'Good', description: '', pages: '', coverNote: '', notes: '', accessories: '',
    readable: true, hasMissingPages: false, missingEssentialContent: false,
    exchangeValue: 100000, mediaIds: [randomUUID()],
  });
  const longTitle = 'Những lá thư mùa đông và các ghi chép từ một chuyến đi rất dài';
  item.agreement = {
    initiatorBooks: [
      snapshot(item.initiatorListingId, item.initiatorId, 'An QA', longTitle),
      ...['Đồi gió hú', 'Truyện Kiều', 'Bên kia sông', 'Ánh trăng cuối mùa'].map(title =>
        snapshot(randomUUID(), item.initiatorId, 'An QA', title)),
    ],
    recipientBook: snapshot(item.recipientListingId, item.recipientId, 'Bình QA', 'Dế Mèn phiêu lưu ký'),
  };
  const dense = Array.from({ length: 24 }, (_, index) => ({
    ...item, id: index.toString(16).padStart(8, '0') + item.id.slice(8),
  }));
  dense.splice(10, 0, item);
  let mode = 'populated', mutations = 0, attempts = 0;
  const commands = [];
  let responseLost = true;
  let current = item;
  let eligible = false;
  let canVerify = false;
  let assigned = false;
  const evidenceId = randomUUID();
  const ownerId = item.initiatorId;
  const holderId = item.recipientId;
  await page.route('**/operations/listings/*/media/*/read', route =>
    route.fulfill({ json: { id: new URL(route.request().url()).pathname.split('/').at(-2),
      url: origin + '/qa-avatar.png', expiresAt: new Date(Date.now() + 600000).toISOString(), width: 1, height: 1 } }));
  await page.route('**/operations/users/*/avatar/read', route =>
    route.fulfill({ json: { url: origin + '/qa-avatar.png', expiresAt: new Date(Date.now() + 600000).toISOString() } }));
  await page.route('**/qa-avatar.png', route =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r50AAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/operations/exchanges/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') {
      mutations++;
      if (url.pathname.endsWith('/evidence-access')) {
        assigned = true;
        return route.fulfill({ json: { entityId: item.id, state: 'Assigned' } });
      }
      assert(url.pathname.endsWith('/return-resolution'));
      const command = { body: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] };
      if (command.body.action === 'VerifyOutboundDelivery') {
        assert.equal(command.body.evidenceId, evidenceId);
        canVerify = false;
        eligible = true;
        current = { ...current, revision: current.revision + 1, canStartReturnResolution: true,
          outboundDeliveryVerification: { verifiedAt: now, note: command.body.note } };
        return route.fulfill({ json: current });
      }
      attempts++;
      commands.push(command);
      if (responseLost) {
        responseLost = false;
        current = { ...current, revision: current.revision + 1, returnResolution: {
          phase: 'Evidence', ownerId, holderId, listingId: item.initiatorListingId,
          note: command.body.note, evidenceDueAt: new Date(Date.now() + 48 * 3600000).toISOString(),
          appealDueAt: null, effectiveAt: null, appeals: [], returnDueAt: null,
          trackingCode: null, returnedAt: null, checkDueAt: null, outcome: null,
          compensation: 0, ownerDeposit: 300000, holderDeposit: 200000,
          differenceAmount: 100000, differencePayerId: ownerId,
        } };
        return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'QA: mất phản hồi.' } });
      }
      return route.fulfill({ json: current });
    }
    if (url.pathname.endsWith('/evidence-access')) {
      const me = await fixture.db.collection('users').findOne({ emailNormalized: 'admin@operations.test' });
      return route.fulfill({ json: { assigneeId: assigned ? me._id : null, version: assigned ? 1 : 0 } });
    }
    if (url.pathname.endsWith('/evidence')) {
      const items = [{ id: evidenceId, exchangeId: item.id, uploaderId: ownerId,
        fileName: 'bien-nhan-qa.png', mimeType: 'image/png', byteSize: 42, sha256: 'a'.repeat(64),
        status: 'Ready', createdAt: now, uploadedAt: now }];
      return route.fulfill({ json: { items, nextCursor: null, totalBytes: 42, maxTotalBytes: 150000000 } });
    }
    if (url.pathname.endsWith('/dispute')) {
      return route.fulfill({ json: { ...current, canStartReturnResolution: eligible, canVerifyOutboundDelivery: canVerify,
        ...(assigned && current.returnResolution ? { statements: [
          { id: evidenceId, senderId: ownerId, note: 'Tôi đã bàn giao sách tại điểm hẹn.', sentAt: now },
        ] } : {}),
      } });
    }
    return route.fulfill(mode === 'error'
      ? { status: 503, json: { code: 'UNAVAILABLE', message: 'QA: cần thử lại.' } }
      : { json: mode === 'empty' ? [] : mode === 'dense' ? dense : [item] });
  });
  await page.goto(origin + '/operations/exchange-disputes');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@operations.test');
  await page.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Khiếu nại trao đổi sách', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'An QA ↔ Bình QA', exact: true })).toBeVisible();
  await expect(page.locator('img[src$="/qa-avatar.png"]')).toHaveCount(1);
  await expect(page.getByText('Chờ xử lý · Giữ tiền và sách', { exact: true })).toBeVisible();
  await expect(page.getByText(/Giữ tiền và sách trong lúc đối chiếu/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Phân xử', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  const artifacts = path.join(root, 'apps/admin-web/test-results/exchange-resolution-safety');
  await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const textZoom = width === 320 ? await page.addStyleTag({ content: ':root { font-size: 130%; }' }) : null;
    await page.screenshot({ path: path.join(artifacts, `queue-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
      .map(el => ({ tag: el.tagName, class: el.className, right: Math.round(el.getBoundingClientRect().right) })).slice(0, 12));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify({ width, overflow }));
    await textZoom?.evaluate((style) => style.remove());
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  mode = 'dense';
  await page.getByRole('button', { name: 'Cập nhật danh sách', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Tìm hồ sơ', exact: true });
  await expect(page.getByText('Hồ sơ 1–10 / 25 · Trang 1/3')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở hồ sơ', exact: true })).toHaveCount(10);
  await expect(page.getByText('+4 cuốn', { exact: true })).toHaveCount(10);
  await page.screenshot({ path: path.join(artifacts, 'queue-dense-1440.png') });
  await search.fill('anh trang cuoi mua');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=anh\+trang\+cuoi\+mua/);
  await expect(page.getByText('Hồ sơ 1–10 / 25 · Trang 1/3')).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page).toHaveURL(/q=anh\+trang\+cuoi\+mua&page=2/);
  const caseCode = 'Trao đổi #' + item.id.slice(0, 8).toUpperCase();
  const caseRow = page.getByRole('listitem').filter({ has: page.getByText(caseCode, { exact: true }) });
  await caseRow.getByRole('link', { name: 'Mở hồ sơ', exact: true }).click();
  const books = page.getByRole('region', { name: 'Hai chiều giao sách' }).getByRole('list', { name: 'Sách gửi', exact: true }).first();
  await expect(books.getByRole('listitem')).toHaveCount(5);
  await expect(books.locator('img[src$="/qa-avatar.png"]')).toHaveCount(5);
  await expect(books.getByText('Ánh trăng cuối mùa', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Danh sách khiếu nại' }).click();
  await expect(page).toHaveURL(/q=anh\+trang\+cuoi\+mua&page=2/);
  await expect(search).toHaveValue('anh trang cuoi mua');
  await search.fill('khong co sach nay');
  await search.press('Enter');
  await expect(page.getByText('Không tìm thấy hồ sơ phù hợp.')).toBeVisible();
  await page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
  await expect(page.getByText('Hồ sơ 1–10 / 25 · Trang 1/3')).toBeVisible();
  mode = 'populated';
  await page.getByRole('button', { name: 'Cập nhật danh sách', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Mở hồ sơ', exact: true })).toHaveCount(1);
  await page.setViewportSize({ width: 320, height: 1000 });
  mode = 'error';
  await page.getByRole('button', { name: 'Cập nhật danh sách', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Máy chủ chưa hoàn tất yêu cầu. Vui lòng thử lại.');
  await expect(page.getByText(/Đang giữ danh sách lần tải trước/)).toBeVisible();
  mode = 'empty';
  await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có khiếu nại nào.' })).toBeVisible();
  await expect(page.getByText('Chưa có giao dịch chờ xử lý trong danh sách bạn được xem.')).toBeVisible();
  assert.equal(mutations, 0);
  mode = 'populated';
  await page.getByRole('button', { name: 'Cập nhật danh sách', exact: true }).click();
  await page.getByRole('link', { name: 'Mở hồ sơ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hai chiều giao sách' })).toBeVisible();
  const handover = page.getByRole('region', { name: 'Hai chiều giao sách' });
  await expect(handover.getByText('An QA', { exact: true })).toHaveCount(2);
  await expect(handover.getByText('Bình QA', { exact: true })).toHaveCount(2);
  await expect(handover.locator('span[data-side="initiator"] img[src$="/qa-avatar.png"]')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Nội dung báo sự cố' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đối chiếu khoản tiền' })).toBeVisible();
  await expect(page.getByText('Đang giữ', { exact: true })).toBeVisible();
  await expect(page.getByText(/600[.]000/)).toBeVisible();
  await expect(page.getByText(/Chưa đủ điều kiện chạy quy trình trả sách một chiều/)).toBeVisible();
  current = { ...current, recipientShippedAt: null };
  canVerify = true;
  await page.getByRole('button', { name: 'Tải lại hồ sơ' }).click();
  await page.getByRole('textbox', { name: 'Lý do tiếp nhận / xem tệp' }).fill('Tiếp nhận để đối chiếu hai chiều.');
  await page.getByRole('button', { name: 'Nhận phụ trách bằng chứng' }).click();
  await page.getByRole('button', { name: 'Xác minh đã giao sách', exact: true }).click();
  await page.getByRole('textbox', { name: 'Căn cứ xác minh bàn giao' }).fill('Đã đối chiếu đúng kiện và người nhận.');
  await page.getByLabel('Tệp bằng chứng đã đối chiếu').selectOption(evidenceId);
  await page.getByRole('button', { name: 'Xác minh đã giao sách', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText('Admin đã xác minh giao đến', { exact: true })).toBeVisible();
  await expect(page.getByText(/Đã xác minh giao sách\. Có thể yêu cầu/)).toBeVisible();
  await page.getByLabel('Thao tác với hồ sơ').selectOption('RequestEvidence');
  await page.getByRole('textbox', { name: 'Căn cứ hoặc yêu cầu gửi hai bên' }).fill('Vui lòng bổ sung bằng chứng đã nhận hoặc đã gửi sách.');
  await page.getByRole('button', { name: 'Yêu cầu bổ sung bằng chứng', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText(/Chưa biết máy chủ đã nhận thao tác/)).toBeVisible();
  await page.getByRole('button', { name: /Thử lại thao tác vừa gửi/ }).click();
  await expect(page.getByRole('heading', { name: 'Đang bổ sung bằng chứng' })).toBeVisible();
  const statements = page.getByRole('region', { name: 'Giải trình của hai bên', exact: true });
  await expect(statements.getByText('An QA', { exact: true })).toBeVisible();
  await expect(statements.getByText('Tôi đã bàn giao sách tại điểm hẹn.', { exact: true })).toBeVisible();
  assert.equal(attempts, 2);
  assert.deepEqual(commands[0], commands[1]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 320) await page.addStyleTag({ content: ':root { font-size: 130%; }' });
    await page.evaluate(() => { window.scrollTo(0, 0); return document.fonts.ready; });
    await page.screenshot({ path: path.join(artifacts, `return-detail-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Detail overflow at ${width}px`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: held queue, read-only out-of-scope case, assignment, return evidence request, same key/body after lost ACK, error/retry/empty, 1440/390/320 + 130% text. UI HTTP fixtures.');
} finally {
  await browser?.close();
  server?.kill();
  await fixture?.close();
}
