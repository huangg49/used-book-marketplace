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
  fixture = await createTestApi({ corsOrigin: 'http://127.0.0.1:5194,http://127.0.0.1:8087', listingCount: 5 });
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
  for (const member of [a, b]) {
    const addresses = await api('/me/addresses', member.accessToken);
    await api('/me/addresses', member.accessToken, { expectedBookVersion: addresses.version, makeDefault: true,
      address: { recipientName: 'Người nhận QA', phone: '0900000000', detail: 'Địa chỉ tổng hợp kiểm thử', serviceAreaCode: 'HCM-DEMO-v1', localityCode: 'DEMO-A' } });
  }
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
  await web.getByRole('heading', { name: 'Đề nghị đổi sách', exact: true }).waitFor();
  await web.screenshot({ path: path.join(out, 'web-proposal-1440.png') });
  await web.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).click();
  const counter = web.getByRole('dialog', { name: 'Đề xuất sách thay thế' });
  const sendCounter = counter.getByRole('button', { name: 'Gửi đề xuất sách mới', exact: true });
  assert(await sendCounter.isDisabled());
  assert.equal(await counter.locator('input[value="' + bl2 + '"]').count(), 0);
  await counter.getByRole('radio').last().waitFor();
  assert.equal(await counter.getByRole('radio').count(), 4);
  const replacement = counter.locator('input[value="' + bl3 + '"]');
  await replacement.focus();
  await web.keyboard.press('Space');
  assert(await replacement.isChecked());
  await web.keyboard.press('Escape');
  await counter.waitFor({ state: 'hidden' });
  assert(await web.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).evaluate(button => document.activeElement === button));
  await web.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).click();
  await replacement.check();
  const longTitle = webExchange.agreement.recipientBook.book.title;
  assert(longTitle.length > 60);
  for (const [width, height] of [[1440, 1000], [768, 1000], [390, 900], [320, 720]]) {
    await web.setViewportSize({ width, height });
    const books = counter.getByText(longTitle, { exact: true });
    const titles = await books.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      const long = {
        lineClamp: style.webkitLineClamp,
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
        clips: element.scrollHeight > element.clientHeight,
        fullTitle: element.closest('[title]')?.title,
      };
      const text = element.firstChild;
      const originalTitle = text.nodeValue;
      text.nodeValue = 'Sách';
      const shortHeight = element.getBoundingClientRect().height;
      text.nodeValue = originalTitle;
      return { ...long, shortHeight };
    }));
    assert(titles.length >= 5 && titles.some(title => title.clips));
    for (const title of titles) {
      assert.equal(title.lineClamp, '2');
      assert(Math.abs(title.height - title.lineHeight * 2) < 1);
      assert(Math.abs(title.shortHeight - title.lineHeight) < 1);
      assert.equal(title.fullTitle, longTitle);
    }
    if (width === 768) {
      await replacement.hover();
      assert.equal(await counter.locator('input:hover').evaluate(input => input.closest('label')?.title), longTitle);
    }
    const choices = counter.locator('[data-lenis-prevent]');
    assert(await choices.evaluate(list => list.scrollHeight > list.clientHeight));
    await web.screenshot({ path: path.join(out, `web-counter-${width}.png`) });
  }
  assert(await counter.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth));
  const sendBounds = await sendCounter.boundingBox();
  assert(sendBounds && sendBounds.y + sendBounds.height <= 720);
  const choices = counter.locator('[data-lenis-prevent]');
  await choices.hover();
  await choices.evaluate(list => { list.scrollTop = 0; });
  await web.mouse.wheel(0, 110);
  await web.waitForFunction(element => element.scrollTop > 0, await choices.elementHandle());
  await counter.getByRole('radio').last().focus();
  await web.keyboard.press('Space');
  assert(await counter.getByRole('radio').last().isChecked());
  await replacement.check();

  const counterRequests = [];
  const counterPath = '**/api/v1/exchanges/' + webExchange.id + '/counter';
  await web.route(counterPath, async route => {
    const request = route.request();
    counterRequests.push({ key: request.headers()['idempotency-key'], body: request.postData() });
    if (counterRequests.length === 1) {
      const response = await route.fetch();
      assert(response.ok());
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });
  await sendCounter.click();
  await counter.waitFor({ state: 'hidden' });
  await web.getByRole('button', { name: 'Thử lại thao tác trước', exact: true }).click();
  await web.getByRole('heading', { name: 'Đã gửi đề nghị mới', exact: true }).waitFor();
  assert.equal(counterRequests.length, 2);
  assert(counterRequests[0].key);
  assert.deepEqual(counterRequests[0], counterRequests[1]);
  const countered = await api('/exchanges/' + webExchange.id, a.accessToken);
  assert.equal(countered.revision, 2);
  assert.equal(countered.recipientListingId, bl3);
  assert.equal(countered.diffAmount, 50000);
  assert.equal(countered.diffPayerId, b.user.id);
  assert.equal(countered.recipientDeposit, 200000);
  assert.equal(countered.initiatorDeposit, countered.agreement.recipientBook.exchangeValue);
  assert.equal(countered.status, 'Proposed');
  for (const id of [al2, bl2, bl3]) assert.equal((await fixture.db.collection('listings').findOne({ _id: id })).trade, 'Available');
  const initiator = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await initiator.goto('http://127.0.0.1:5194/login?returnUrl=' + encodeURIComponent('/exchange/' + countered.id));
  await initiator.getByLabel(/^Email/).fill('admin@operations.test');
  await initiator.getByLabel(/^Mật khẩu/).fill(password);
  await initiator.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await initiator.getByRole('heading', { name: 'Đề nghị đã cập nhật', exact: true }).waitFor();
  assert(await initiator.getByRole('region', { name: 'Nếu hai bên đồng ý' }).getByText('Tiền bù bạn nhận').isVisible());
  await initiator.screenshot({ path: path.join(out, 'web-revised-1440.png') });
  await initiator.getByRole('button', { name: 'Chấp nhận đề nghị', exact: true }).click();
  await initiator.getByRole('button', { name: 'Đồng ý & Khóa giao dịch', exact: true }).click();
  await initiator.getByRole('heading', { name: 'Đặt cọc đổi sách', exact: true }).waitFor();
  assert.equal((await api('/exchanges/' + countered.id, a.accessToken)).status, 'AcceptedAwaitingFunding');
  result.checks.push('web replacement at 320/390/768/1440, keyboard and exact retry after lost response; partner accepts revised terms from the same sheet');
  const rnExchange = await propose(bl2, al3);
  // This isolated browser fixture exercises agreement state, not login throttling.
  await fixture.db.collection('login_attempts').deleteMany({});
  const rn = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await rn.goto('http://127.0.0.1:8087/account');
  await rn.getByLabel('Email', { exact: true }).last().fill('member@operations.test');
  await rn.getByLabel('Mật khẩu', { exact: true }).last().fill(password);
  await rn.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await rn.getByRole('heading', { name: 'Việc của tôi', exact: true }).waitFor();
  await rn.evaluate((id) => { history.pushState({}, '', '/exchange?id=' + id); dispatchEvent(new PopStateEvent('popstate')); }, rnExchange.id);
  await rn.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).click();
  await rn.getByRole('checkbox').filter({ hasText: /600\.000/ }).click();
  // Keep the designed native fade; capture its settled state, not a mid-fade frame.
  await rn.waitForTimeout(350);
  await rn.screenshot({ path: path.join(out, 'rn-counter-390.png'), fullPage: true });
  await Promise.all([
    rn.waitForResponse(response => response.url().endsWith('/exchanges/' + rnExchange.id + '/counter') && response.ok()),
    rn.getByRole('button', { name: 'Gửi đề xuất sách mới', exact: true }).click(),
  ]);
  await rn.getByRole('button', { name: 'Đề xuất sách thay thế', exact: true }).waitFor({ state: 'hidden' });
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
