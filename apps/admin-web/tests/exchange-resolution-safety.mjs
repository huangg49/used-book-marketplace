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
  server = spawn(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], {
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
    initiatorShippedAt: now, recipientShippedAt: now, disputedAt: now,
    disputedBy: 'System', disputeReason: 'QA giao diện: sách đang được đối chiếu tình trạng và nơi giữ. '.repeat(5),
  };
  let mode = 'populated', mutations = 0;
  await page.route('**/operations/exchanges/**', async route => {
    if (route.request().method() !== 'GET') {
      mutations++;
      return route.fulfill({ status: 500, json: { code: 'UNAVAILABLE', message: 'UI must remain read-only' } });
    }
    return route.fulfill(mode === 'error'
      ? { status: 503, json: { code: 'UNAVAILABLE', message: 'QA: cần thử lại.' } }
      : { json: mode === 'empty' ? [] : [item] });
  });
  await page.goto(origin + '/operations/exchange-disputes');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('admin@operations.test');
  await page.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Khiếu nại trao đổi sách.' })).toBeVisible();
  await expect(page.getByText('Chờ xử lý · Giữ tiền và sách', { exact: true })).toBeVisible();
  await expect(page.getByText(/Chưa thể thực thi phán quyết hoàn tiền/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Phân xử', exact: true })).toHaveCount(0);
  await expect(page.getByRole('radio')).toHaveCount(0);
  const artifacts = path.join(root, 'apps/admin-web/test-results/exchange-resolution-safety');
  await mkdir(artifacts, { recursive: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 320) await page.addStyleTag({ content: ':root { font-size: 130%; }' });
    await page.screenshot({ path: path.join(artifacts, `queue-${width}.png`), fullPage: true });
    const overflow = await page.evaluate(() => [...document.querySelectorAll('*')]
      .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
      .map(el => ({ tag: el.tagName, class: el.className, right: Math.round(el.getBoundingClientRect().right) })).slice(0, 12));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, JSON.stringify({ width, overflow }));
  }
  mode = 'error';
  await page.getByRole('button', { name: 'Cập nhật danh sách', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Máy chủ chưa hoàn tất yêu cầu. Vui lòng thử lại.');
  await expect(page.getByText(/Đang giữ danh sách lần tải trước/)).toBeVisible();
  mode = 'empty';
  await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa có khiếu nại nào.' })).toBeVisible();
  await expect(page.getByText(/không xác nhận mọi giao dịch đều đã hoàn tất/)).toBeVisible();
  assert.equal(mutations, 0);
  assert.deepEqual(errors, []);
  console.log('PASS: independent triage UI, held-state notice, no decision command, error/retry/empty, 1440/390/320 + 130% text. Queue HTTP fixtures, not financial/native acceptance.');
} finally {
  await browser?.close();
  server?.kill();
  await fixture?.close();
}
