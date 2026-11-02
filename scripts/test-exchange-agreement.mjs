// Isolated HTTP/Mongo + actual Member web/Expo web. No main DB/provider access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer as createHttp } from 'node:http';
import path from 'node:path';
import { createTestApi, root, base, password } from '../apps/admin-web/tests/test-api.mjs';

const qa = new URL(process.env.MONGO_TEST_URL ?? '');
assert(qa.hostname === '127.0.0.1' && qa.port === '57017' && qa.pathname.endsWith('_test') && qa.searchParams.get('replicaSet') === 'rs-test');
Object.assign(process.env, { AUTH_MAIL_PROVIDER: 'local', VITE_API_BASE_URL: base });
const out = path.join(root, '.tmp/exchange-agreement');
await mkdir(out, { recursive: true });
const result = { storage: 'fake', mail: 'local', native: 'NOT RUN', checks: [] };
let fixture, vite, browser, staticServer;
const save = () => writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
try {
  fixture = await createTestApi({ corsOrigin: 'http://127.0.0.1:5194,http://127.0.0.1:8087', listingCount: 3 });
  const api = fixture.api, b = fixture.member;
  const a = await api('/auth/login', null, { email: 'admin@operations.test', password });
  const staff = await api('/auth/login', null, { email: 'staff@operations.test', password });
  const cat = await api('/operations/catalog-requests/' + fixture.catalogId, a.accessToken);
  await api('/operations/catalog-requests/' + fixture.catalogId + '/decision', a.accessToken, { expectedVersion: cat.version, revisionId: cat.currentRevision.id, decision: 'Confirm' });
  const approve = async (id) => {
    const listing = await api('/operations/listings/' + id, staff.accessToken);
    await api('/operations/listings/' + id + '/decision', staff.accessToken, { expectedVersion: listing.version, revisionId: listing.currentRevision.id, decision: 'Approve', checklist: { catalogMatches: true, photosClear: true, conditionDisclosed: true, readable: true, pricingValid: true, contentAppropriate: true } });
  };
  for (const id of fixture.listings) await approve(id);
  const template = await api('/me/listings/' + fixture.listings[0], b.accessToken);
  const own = async (value) => {
    const content = { ...template.currentRevision.content, exchangeValue: value, mediaIds: [] };
    const draft = await api('/listings', a.accessToken, { content });
    const media = await api('/listings/' + draft.entityId + '/media', a.accessToken, { expectedVersion: draft.version, mimeType: 'image/png', byteSize: fixture.photo.length, sha256: createHash('sha256').update(fixture.photo).digest('hex') });
    const ticket = await api('/listings/' + draft.entityId + '/media/' + media.entityId + '/upload-ticket', a.accessToken);
    await api(ticket.path, a.accessToken, fixture.photo, 'PUT', ticket.headers);
    const uploaded = await api('/me/listings/' + draft.entityId + '/media/' + media.entityId, a.accessToken);
    await api('/listings/' + draft.entityId + '/media/' + media.entityId + '/finalize', a.accessToken, { expectedVersion: uploaded.version });
    await fixture.processMedia();
    const fresh = await api('/me/listings/' + draft.entityId, a.accessToken);
    const saved = await api('/listings/' + draft.entityId + '/draft', a.accessToken, { expectedVersion: fresh.version, content: { ...content, mediaIds: [media.entityId] } }, 'PUT');
    await api('/listings/' + draft.entityId + '/submit', a.accessToken, { expectedVersion: saved.version, ownershipDeclared: true });
    await approve(draft.entityId);
    return draft.entityId;
  };
  const [al, al2, al3] = [await own(100000), await own(200000), await own(100000)];
  const [bl, bl2, bl3] = fixture.listings;
  const propose = (recipientListingId, initiatorListingId) => api('/exchanges', a.accessToken, { initiatorListingId, recipientListingId });
  const stale = await propose(bl, al);
  const current = await api('/me/listings/' + bl, b.accessToken);
  await api('/listings/' + bl + '/revision', b.accessToken, { expectedVersion: current.version, ownershipDeclared: true, content: { ...current.currentRevision.content, exchangeValue: 600000 } });
  await approve(bl);
  // A controlled synthetic address makes the actual Accept dialog usable.
  const addresses = await api('/me/addresses', b.accessToken);
  await api('/me/addresses', b.accessToken, { expectedBookVersion: addresses.version, makeDefault: true,
    address: { recipientName: 'Người nhận QA', phone: '0900000000', detail: 'Địa chỉ tổng hợp kiểm thử', serviceAreaCode: 'HCM-DEMO-v1', localityCode: 'DEMO-A' } });
  const req = createRequire(path.join(root, 'apps/user-web/package.json'));
  const { chromium } = createRequire(path.join(root, 'apps/admin-web/package.json'))('playwright');
  const { createServer } = await import(pathToFileURL(req.resolve('vite')).href);
  vite = await createServer({ root: path.join(root, 'apps/user-web'), server: { host: '127.0.0.1', port: 5194, strictPort: true }, logLevel: 'error' });
  await vite.listen();
  const dist = path.join(root, 'apps/mobile-react-native/dist');
  staticServer = createHttp(async (q, s) => {
    try {
      const url = new URL(q.url, 'http://127.0.0.1:8087');
      let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
      if (file !== dist && !file.startsWith(dist + path.sep)) return s.writeHead(403).end();
      file = file === dist ? path.join(dist, 'index.html') : path.extname(file) ? file : file + '.html';
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webp': 'image/webp' };
      s.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(file));
    } catch { s.writeHead(404).end(); }
  });
  await new Promise((resolve) => staticServer.listen(8087, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  const web = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await web.goto('http://127.0.0.1:5194/login?returnUrl=' + encodeURIComponent('/exchange/' + stale.id));
  await web.getByLabel(/^Email/).fill('member@operations.test');
  await web.getByLabel(/^Mật khẩu/).fill(password);
  await web.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await web.getByRole('heading', { name: 'Phiếu đề nghị đổi sách', exact: true }).waitFor();
  assert.equal(await web.getByText(/600\.000/).count(), 0);
  await web.getByRole('button', { name: 'Chấp nhận đề nghị', exact: true }).click();
  const accept = web.getByRole('dialog', { name: 'Xác nhận hợp đồng trao đổi' });
  await accept.getByRole('button', { name: 'Đồng ý & Khóa giao dịch', exact: true }).click();
  await web.getByText(/Thỏa thuận không còn hợp lệ hoặc thiếu bản chụp sách gốc/).waitFor();
  const closed = await api('/exchanges/' + stale.id, b.accessToken);
  assert.equal(closed.status, 'Cancelled');
  assert.deepEqual(closed.agreement, stale.agreement);
  for (const id of [al, bl]) assert.equal((await fixture.db.collection('listings').findOne({ _id: id })).trade, 'Available');
  await web.screenshot({ path: path.join(out, 'web-stale-closed-1440.png'), fullPage: true });
  result.checks.push('web frozen terms and stale acceptance closes with no reservation');
  const webExchange = await propose(bl2, al2);
  await web.evaluate((id) => { history.pushState({}, '', '/exchange/' + id); dispatchEvent(new PopStateEvent('popstate')); }, webExchange.id);
  await web.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).click();
  const counter = web.getByRole('dialog', { name: 'Đề xuất sách thay thế' });
  await counter.locator('input[value="' + bl3 + '"]').check();
  await web.setViewportSize({ width: 768, height: 1000 });
  await web.screenshot({ path: path.join(out, 'web-counter-768.png') });
  await web.setViewportSize({ width: 390, height: 900 });
  await web.screenshot({ path: path.join(out, 'web-counter-390.png') });
  await counter.getByRole('button', { name: 'Gửi đề xuất sách mới', exact: true }).click();
  await counter.waitFor({ state: 'hidden' });
  const countered = await api('/exchanges/' + webExchange.id, a.accessToken);
  assert.equal(countered.revision, 2);
  assert.equal(countered.recipientListingId, bl3);
  assert.equal(countered.diffAmount, 50000);
  assert.equal(countered.diffPayerId, b.user.id);
  assert.equal(countered.recipientDeposit, 200000);
  assert.equal(countered.initiatorDeposit, countered.agreement.recipientBook.exchangeValue);
  await api('/exchanges/' + countered.id + '/accept', a.accessToken, { revision: countered.revision });
  result.checks.push('web book replacement computes reversed payer and requires partner acceptance');
  const rnExchange = await propose(bl2, al3);
  const rn = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await rn.goto('http://127.0.0.1:8087/account');
  await rn.getByLabel('Email', { exact: true }).last().fill('member@operations.test');
  await rn.getByLabel('Mật khẩu', { exact: true }).last().fill(password);
  await rn.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await rn.getByRole('heading', { name: 'Việc của tôi', exact: true }).waitFor();
  await rn.evaluate((id) => { history.pushState({}, '', '/exchange?id=' + id); dispatchEvent(new PopStateEvent('popstate')); }, rnExchange.id);
  await rn.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).click();
  await rn.getByRole('checkbox').first().click();
  // Keep the designed native fade; capture its settled state, not a mid-fade frame.
  await rn.waitForTimeout(350);
  await rn.screenshot({ path: path.join(out, 'rn-counter-390.png'), fullPage: true });
  await rn.getByRole('button', { name: 'Gửi đề xuất sách mới', exact: true }).click();
  await rn.getByRole('button', { name: 'Gửi đề xuất sách mới', exact: true }).waitFor({ state: 'hidden' });
  const rnCountered = await api('/exchanges/' + rnExchange.id, a.accessToken);
  assert.equal(rnCountered.revision, 2);
  assert.equal(rnCountered.recipientListingId, bl);
  assert.equal(rnCountered.diffAmount, 500000);
  assert.equal(rnCountered.initiatorDeposit, 600000);
  await api('/exchanges/' + rnCountered.id + '/accept', a.accessToken, { revision: 2 });
  const accepted = await api('/exchanges/' + rnCountered.id, a.accessToken);
  await api('/exchanges/' + rnCountered.id + '/cancel', a.accessToken, { expectedVersion: accepted.revision });
  // A cancelled agreement remains readable after the owner hides the now-free book.
  const hidden = await api('/me/listings/' + bl, b.accessToken);
  await api('/listings/' + bl + '/visibility', b.accessToken, { expectedVersion: hidden.version, visibility: 'Hidden' }, 'PUT');
  // Browser tokens are memory-only: a full reload requires a fresh login.
  await rn.goto('http://127.0.0.1:8087/account');
  await rn.getByLabel('Email', { exact: true }).last().fill('member@operations.test');
  await rn.getByLabel('Mật khẩu', { exact: true }).last().fill(password);
  await rn.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await rn.getByRole('heading', { name: 'Việc của tôi', exact: true }).waitFor();
  await rn.evaluate((id) => { history.pushState({}, '', '/exchange?id=' + id); dispatchEvent(new PopStateEvent('popstate')); }, rnCountered.id);
  await rn.getByText('600.000', { exact: false }).first().waitFor();
  const snapshot = await api('/exchanges/' + rnCountered.id, b.accessToken);
  const frozen = snapshot.agreement.recipientBook;
  const photo = await api('/exchanges/' + snapshot.id + '/books/' + frozen.listingId + '/photos/' + frozen.mediaIds[0], b.accessToken);
  assert(photo.url);
  await rn.screenshot({ path: path.join(out, 'rn-hidden-agreement-390.png'), fullPage: true });
  result.checks.push('RN Expo web book replacement, frozen hidden listing and private photo read');
  result.complete = true;
} catch (error) {
  let index = 0;
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) await page.screenshot({ path: path.join(out, 'failure-' + index++ + '.png'), fullPage: true }).catch(() => {});
  result.failure = { name: error.name, message: String(error.message).slice(0, 500) };
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (staticServer?.listening) await new Promise((resolve) => staticServer.close(resolve));
  await vite?.close();
  await fixture?.close();
  result.cleaned = true;
  await save();
}
console.log(JSON.stringify({ checks: result.checks, complete: result.complete ?? false, cleaned: result.cleaned }));
