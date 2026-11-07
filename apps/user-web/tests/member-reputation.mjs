// Presentation-only HTTP fixtures. No database writes or provider calls.
// The running primary local app is also checked separately against real public API data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../admin-web/package.json', import.meta.url));
const webRequire = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const origin = 'http://127.0.0.1:5184', id = randomUUID(), peerId = randomUUID();
const artifacts = path.join(root, 'apps/user-web/test-results/member-reputation');
const capture = !process.argv.includes('--no-captures');
const now = new Date();
const rows = Array.from({ length: 12 }, (_, i) => ({
  id: randomUUID(), transactionType: i === 2 ? 'DirectOrder' : 'Exchange', transactionId: randomUUID(),
  authorId: peerId, authorName: i === 2 ? 'Người đọc QA có tên dài để kiểm tra cách xuống dòng trên điện thoại' : 'Bạn đọc QA',
  targetUserId: id, partnerRating: i % 2 ? 2 : 5, bookRating: i === 2 ? null : i % 2 ? 3 : 5,
  tags: i === 0 ? ['Đóng gói cẩn thận'] : [], comment: i === 0 ? 'Sách được giữ cẩn thận, trao đổi rõ ràng. Nội dung QA giả lập cho kiểm tra giao diện.' : i === 1 ? 'Bìa có vết gấp chưa được mô tả rõ. Mong người đăng bổ sung ảnh chi tiết hơn. Nội dung QA giả lập.' : i === 2 ? 'Kiểm tra xuống dòng: '+ 'ChuỗiDàiKhôngCóKhoảngTrắng'.repeat(12) : '',
  version: 1, status: 'Published', createdAt: new Date(+now - i * 3600000).toISOString(), updatedAt: now.toISOString(),
  editDeadline: now.toISOString(), publishedAt: now.toISOString(), evidenceHeld: false, legacyDisclosed: false,
  reply: i === 0 ? { text: 'Cảm ơn bạn đã chia sẻ. Phản hồi QA đã được duyệt.', status: 'Approved', createdAt: now.toISOString() }
    : i === 1 ? { text: 'PRIVATE_PENDING_REPLY_MUST_NOT_BE_VISIBLE', status: 'Pending', createdAt: now.toISOString() } : null,
}));
const ratedBooks = rows.filter(r => r.bookRating !== null);
const profile = {
  userId: id, displayName: 'Người đọc QA', completedTransactions: 12, verifiedViolations: 0,
  reviewCount: rows.length, partnerRatingCount: rows.length, bookRatingCount: ratedBooks.length,
  partnerRating: rows.reduce((n, r) => n + r.partnerRating, 0) / rows.length,
  bookRating: ratedBooks.reduce((n, r) => n + r.bookRating, 0) / ratedBooks.length,
  items: rows.slice(0, 10), nextCursor: 'qa-page-two', serverTime: now.toISOString(),
};
const empty = { ...profile, userId: peerId, displayName: 'Đối tác QA chưa có đánh giá', reviewCount: 0, partnerRatingCount: 0, bookRatingCount: 0,
  completedTransactions: 0, partnerRating: null, bookRating: null, items: [], nextCursor: null };
let browser, server;
try {
  await mkdir(artifacts, { recursive: true });
  const { createServer } = await import(pathToFileURL(webRequire.resolve('vite')).href);
  process.chdir(path.join(root, 'apps/user-web'));
  server = await createServer({ root: path.join(root, 'apps/user-web'), server: { host: '127.0.0.1', port: 5184, strictPort: true }, logLevel: 'error' });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let release, first = true, failNext = true, mode = 'normal';
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/members/*/reputation?*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes(peerId)) return route.fulfill({ json: empty });
    if (mode === 'unavailable') return route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'QA unavailable profile' } });
    if (mode === 'offline') return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'QA network failure' } });
    if (first) { first = false; await pending; }
    if (url.searchParams.has('cursor')) {
      if (failNext) { failNext = false; return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'QA next-page failure' } }); }
      return route.fulfill({ json: { ...profile, items: rows.slice(10), nextCursor: null } });
    }
    return route.fulfill({ json: profile });
  });
  await page.goto(`${origin}/members/${id}`);
  await page.getByRole('status', { name: 'Đang tải hồ sơ uy tín' }).waitFor();
  release();
  await page.getByRole('heading', { name: profile.displayName, exact: true }).waitFor();
  const region = page.getByRole('region', { name: `Hồ sơ uy tín của ${profile.displayName}`, exact: true });
  assert.equal(await region.getByText('3.5', { exact: true }).count(), 1);
  assert.equal(await region.getByText('Từ 11 đánh giá đã công bố', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('article').count(), 10);
  assert.equal(await page.getByText('PRIVATE_PENDING_REPLY_MUST_NOT_BE_VISIBLE').count(), 0);
  await page.getByRole('heading', { name: `Phản hồi từ ${profile.displayName}`, exact: true }).waitFor();
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `No horizontal overflow at ${width}`);
    const fits = await region.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
    if (!fits) {
      await writeFile(path.join(artifacts, 'profile-overflow.json'), JSON.stringify(await region.evaluate(el => {
        const parent=el.getBoundingClientRect();return {width:innerWidth,region:{width:parent.width,scroll:el.scrollWidth},elements:[...el.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>parent.right+1).map(n=>({tag:n.tagName,classes:n.className,width:n.getBoundingClientRect().width,minWidth:getComputedStyle(n).minWidth,display:getComputedStyle(n).display}))};
      }), null, 2));
      await page.screenshot({path:path.join(artifacts,'profile-overflow.png'),fullPage:true});
    }
    assert.equal(fits, true, 'Profile summary fits without internal horizontal overflow');
    const layout = await page.getByRole('navigation', { name: 'Điều hướng hồ sơ' }).locator('..').evaluate(el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: innerWidth - r.right, internalScrollers: [...el.querySelectorAll('*')].filter(n => ['auto', 'scroll'].includes(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 1).length };
    });
    assert(layout.left >= 15 && layout.right >= 15);
    assert.equal(layout.internalScrollers, 0, 'Profile has only document scrolling');
    if (capture) await page.screenshot({ path: path.join(artifacts, `profile-${width}.png`), fullPage: false });
  }
  await page.evaluate(() => document.documentElement.style.fontSize = '130%');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  if (capture) await page.screenshot({ path: path.join(artifacts, 'profile-320-large-text.png'), fullPage: false });
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  await page.getByText('Quy chế tính điểm & minh bạch ✦', { exact: true }).click();
  await page.getByText(/Khiếu nại chưa kết luận không được tính là vi phạm/).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
  await page.getByRole('alert').filter({hasText:'Dữ liệu đang xem vẫn được giữ'}).waitFor();
  assert.equal(await page.getByRole('article').count(), 10);
  assert.equal(await region.getByText('3.5', { exact: true }).count(), 1);
  await page.getByRole('button', { name: 'Đến trang tiếp theo', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('article').length === 2);
  // The account summary uses a regular Query with this old key. Public paging
  // must use its own InfiniteQuery cache shape, including when viewing oneself.
  await page.evaluate(async ({ memberId, summary }) => {
    const { queryClient } = await import('/src/lib/session.ts');
    queryClient.setQueryData(['memberReputation', memberId], summary);
  }, { memberId: id, summary: profile });
  assert.equal(await page.getByRole('article').count(), 2);
  assert.equal(await page.evaluate(async memberId => { const {queryClient}=await import('/src/lib/session.ts'); return queryClient.getQueryData(['memberReputation','public',memberId]).pages.flatMap(p=>p.items).length; }, id), 12, 'All loaded reviews remain cached');
  const refresh = () => page.evaluate(async memberId => {
    const { queryClient } = await import('/src/lib/session.ts');
    await queryClient.invalidateQueries({ queryKey: ['memberReputation', 'public', memberId] });
  }, id);
  mode = 'offline';
  await refresh();
  await page.getByText('Chưa cập nhật được hồ sơ. Bạn đang xem thông tin đã tải trước đó.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('article').count(), 2, 'Network error preserves the current review page');
  mode = 'unavailable';
  await refresh();
  await page.getByRole('heading', { name: 'Chưa tìm thấy hồ sơ này', exact: true }).waitFor();
  assert.equal(await page.getByRole('article').count(), 0, 'An unavailable profile must not retain visible cached reviews');
  mode = 'normal';
  await refresh();
  await page.getByRole('heading', { name: profile.displayName, exact: true }).waitFor();
  const author = page.getByRole('link', { name: 'Bạn đọc QA', exact: true }).first();
  await author.click();
  await page.getByRole('heading', { name: empty.displayName, exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Chưa có nhận xét công khai', exact: true }).waitFor();
  assert.equal(await page.getByText('Chưa có điểm', { exact: true }).count(), 2);
  assert.equal(await page.getByRole('article').count(), 0, 'Changing member must not leak previous reviews');
  mode = 'offline';
  await page.goto(`${origin}/members/${id}`);
  await page.getByRole('heading', { name: 'Chưa tải được hồ sơ uy tín', exact: true }).waitFor();
  mode = 'normal';
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.getByRole('heading', { name: profile.displayName, exact: true }).waitFor();
  mode = 'unavailable';
  await page.goto(`${origin}/members/${id}`);
  await page.getByRole('heading', { name: 'Chưa tìm thấy hồ sơ này', exact: true }).waitFor();
  assert.equal(await page.getByRole('article').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS public reputation UI fixture: 1440/900/390/320 and130% text, page-only scroll, scores/sample counts, approved-only reply, paging failure/retry, empty/null scores, identity navigation, account-summary cache isolation, stale503 retention/404 concealment, loading/retry. No DB or provider used.');
} finally {
  await browser?.close();
  await server?.close();
}
