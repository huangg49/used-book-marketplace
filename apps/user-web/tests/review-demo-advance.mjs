// Real API + isolated Mongo; local/fake media. No provider, main DB or native claims.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTestApi, root, base, password } from '../../admin-web/tests/test-api.mjs';

const qa = new URL(process.env.MONGO_TEST_URL ?? '');
assert(qa.hostname === '127.0.0.1' && qa.port === '57017' && qa.pathname.endsWith('_test') && qa.searchParams.get('replicaSet') === 'rs-test');
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const webRequire = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const id = randomUUID(), ordinary = randomUUID(), origin = 'http://127.0.0.1:5184';
Object.assign(process.env, { VITE_API_BASE_URL: base, AUTH_MAIL_PROVIDER: 'local', LISTING_AUTO_REVIEW_ENABLED: 'false', DEMO_REVIEW_TIME_ENABLED: 'true', DEMO_REVIEW_EXCHANGE_IDS: id });
const artifacts = path.join(root, 'apps/user-web/test-results/review-demo-advance');
let fixture, browser, server;
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 0 });
  const { api, db, member: a } = fixture;
  const b = await api('/auth/login', null, { email: 'admin@operations.test', password });
  const now = new Date(), completedAt = new Date(+now - 60000), received = new Date(+completedAt - 72 * 3600000);
  const note = '[DỮ LIỆU DEMO] Lịch sử nhập mẫu để thử đánh giá; không xác nhận giao hàng thật.';
  for (const transactionId of [id, ordinary]) {
    await db.collection('exchanges').insertOne({
      _id: transactionId, initiatorId: a.user.id, recipientId: b.user.id, initiatorListingId: randomUUID(), recipientListingId: randomUUID(),
      initiatorOrderId: randomUUID(), recipientOrderId: randomUUID(), status: 'Completed', revision: 1, agreement: null,
      initiatorDeposit: 0, recipientDeposit: 0, diffAmount: 0, diffPayerId: null, fundingDeadline: null, initiatorFundedAt: null,
      recipientFundedAt: null, proposalExpiresAt: null, rejectionReason: null, cancelReason: null, cancelledBy: null, cancelledAt: null,
      initiatorShippedAt: null, recipientShippedAt: null, initiatorReceivedAt: received, recipientReceivedAt: received,
      initiatorShipment: { method: 'direct', notes: note }, recipientShipment: { method: 'direct', notes: note },
      inspectionDeadline: completedAt, completedAt, createdAt: received, updatedAt: completedAt, lockSeq: 0,
    });
    for (const actor of [a, b]) await api(`/transactions/Exchange/${transactionId}/reviews`, actor.accessToken, { partnerRating: 5, bookRating: 4, comment: 'Synthetic QA review; no real transaction.' });
  }
  const journalCount = await db.collection('ledger_journals').countDocuments({});
  const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
  process.chdir(path.join(root, 'apps/user-web'));
  server = await createServer({ root: path.join(root, 'apps/user-web'), server: { host: '127.0.0.1', port: 5184, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/login?returnUrl=' + encodeURIComponent(`/reviews?type=Exchange&transaction=${id}`));
  await page.getByLabel(/^Email/).fill('member@operations.test');
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const button = page.getByRole('button', { name: 'Bỏ chờ 48 giờ (demo)', exact: true });
  await button.waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await button.click();
    const dialog = page.getByRole('dialog', { name: 'Công bố hai đánh giá mẫu ngay?' });
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: path.join(artifacts, `confirmation-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Chưa công bố', exact: true }).click();
    assert.equal((await api(`/transactions/Exchange/${id}/reviews`, a.accessToken)).myReview.status, 'Pending');
  }
  const sent = [];
  let drop = true;
  await page.route('**/reviews/demo-advance', async route => {
    const request = route.request();
    sent.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    if (drop) { drop = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  await button.click();
  await page.getByRole('button', { name: 'Mô phỏng và công bố', exact: true }).click();
  const retry = page.getByRole('button', { name: 'Thử lại yêu cầu đã gửi', exact: true });
  await retry.waitFor();
  assert.equal((await api(`/transactions/Exchange/${id}/reviews`, a.accessToken)).myReview.status, 'Published');
  await retry.click();
  await page.getByRole('heading', { name: 'Đã mô phỏng hết thời gian chờ', exact: true }).waitFor();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1], 'Lost ACK retries the SAME body/key');
  assert.equal(await page.getByRole('button', { name: 'Sửa đánh giá', exact: true }).count(), 0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: path.join(artifacts, 'published.png'), fullPage: true });
  assert.equal((await api(`/transactions/Exchange/${id}/reviews`, b.accessToken)).partnerReview.status, 'Published');
  assert.equal(await db.collection('review_revisions').countDocuments({ action: 'DemoTimeAdvance' }), 2);
  assert.equal(await db.collection('ledger_journals').countDocuments({}), journalCount);
  for (const actor of [a, b]) assert.equal((await api(`/members/${actor.user.id}/reputation`, null)).reviewCount, 1);
  await page.getByRole('link', { name: 'Xem hồ sơ uy tín đối tác', exact: true }).click();
  await page.waitForURL(`**/members/${b.user.id}`);
  await page.evaluate(async value => { const { router } = await import('/src/app/router.tsx'); await router.navigate(`/reviews?type=Exchange&transaction=${value}`); }, ordinary);
  await page.getByRole('heading', { name: 'Đánh giá giao dịch', exact: true }).waitFor();
  assert.equal(await button.count(), 0);
  const normal = await api(`/transactions/Exchange/${ordinary}/reviews`, a.accessToken);
  assert.equal(normal.myReview.status, 'Pending');
  assert.equal(normal.canEdit, true);
  assert.deepEqual(errors, []);
  console.log('PASS review demo UI: confirmation/cancel at1440/390/320, actual HTTP lost-ACK/exact retry, both published/profile counted once, edit locked, profile link, ordinary flow unchanged; QA fake storage only.');
} finally {
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
