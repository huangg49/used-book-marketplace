// Live auction channel (ADR 0031) against a local Socket.IO server that refuses
// the WebSocket upgrade, as a proxy or carrier network can. Checks that the
// client falls back to long-polling and that out-of-order snapshots (an older
// push or a late REST read) never move the shown price backwards.
// It builds its own bundle with the local socket origin baked in; set
// AUCTION_LIVE_BUILD to reuse a build made with
//   VITE_API_BASE_URL=http://127.0.0.1:4311/api/v1
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const app = path.join(root, 'apps/user-web');
const build = path.resolve(root, process.env.AUCTION_LIVE_BUILD ?? '.tmp/auction-live-build');
const prebuilt = !!process.env.AUCTION_LIVE_BUILD;
const require = createRequire(path.join(root, 'apps/admin-web/package.json'));
const { chromium, expect } = require('playwright/test');
const vite = await import(pathToFileURL(require.resolve('vite')).href);
if (!prebuilt) {
  process.env.VITE_API_BASE_URL = 'http://127.0.0.1:4311/api/v1';
  await vite.build({ root: app, logLevel: 'warn', build: { outDir: build, emptyOutDir: true } });
}
const { preview } = vite;
const serverRequire = createRequire(realpathSync(path.join(root, 'apps/api/node_modules/@nestjs/platform-socket.io')) + '/index.js');
const { Server } = serverRequire('socket.io');
const { io: client } = createRequire(path.join(app, 'package.json'))('socket.io-client');
const { LIVE_SOCKET_OPTIONS } = await import(pathToFileURL(path.join(app, 'src/lib/auction-live.ts')).href).catch(() => ({
  // Node without TS stripping: keep in step with src/lib/auction-live.ts.
  LIVE_SOCKET_OPTIONS: { transports: ['websocket', 'polling'], tryAllTransports: true, timeout: 10_000 },
}));

/** A Socket.IO server that only speaks long-polling (WebSocket refused). */
function pollingOnly(port) {
  const http = createServer();
  const io = new Server(http, { transports: ['polling'], cors: { origin: true } });
  return new Promise((resolve) => http.listen(port, '127.0.0.1', () => resolve({ http, io })));
}
const close = ({ http, io }) => new Promise((resolve) => { io.close(); http.close(() => resolve()); });
const connects = (options, port) => new Promise((resolve) => {
  const s = client(`http://127.0.0.1:${port}/auctions`, { ...options, reconnectionAttempts: 2 });
  const done = (ok) => { s.close(); resolve(ok); };
  s.on('connect', () => done(true));
  setTimeout(() => done(false), 4000);
});

const checks = [];
// 1. Control: the old options never connect when WebSocket is refused; the new ones do.
{
  const srv = await pollingOnly(4312);
  srv.io.of('/auctions');
  try {
    assert.equal(await connects({ transports: ['websocket', 'polling'] }, 4312), false, 'old options must not connect (documents the bug)');
    assert.equal(await connects(LIVE_SOCKET_OPTIONS, 4312), true, 'live options fall back to long-polling');
    checks.push('transport fallback: old options stay offline, new options connect over polling');
  } finally { await close(srv); }
}

// 2. Browser: the detail page goes live over polling and never steps the price back.
const ID = '00000000-0000-4000-8000-000000000001';
const t0 = Date.now();
const iso = (ms) => new Date(t0 + ms).toISOString();
const snapshot = (price, at) => ({
  auction: {
    id: ID, listingId: '00000000-0000-4000-8000-000000000101', title: 'Phiên QA kênh sống',
    state: 'Active', phase: 'Live', startPrice: 50_000, step: 10_000, buyNowPrice: null,
    currentPrice: price, minimumBid: price + 10_000, bidderCount: 2,
    startAt: iso(-3_600_000), endAt: iso(3_600_000), pointName: 'Điểm QA', demoOnly: true,
    book: { revisionId: '00000000-0000-4000-8000-000000000201', authors: ['Tác giả QA'], condition: 'Good',
      pages: '', coverNote: '', notes: '', accessories: '', description: 'Dữ liệu giả', hasMissingPages: false, photos: [] },
  },
  leaderAlias: 1,
  history: [{ price, bidderAlias: 1, at: iso(at) }],
  serverTime: iso(at),
});

const srv = await pollingOnly(4311);
let ack = snapshot(100_000, 0);
srv.io.of('/auctions').on('connection', (socket) => {
  socket.on('auction:watch', (id, reply) => { socket.join(`auction:${id}`); reply({ ok: true, auction: ack }); });
  socket.on('auction:unwatch', (_id, reply) => reply?.({ ok: true }));
});
const push = (body) => srv.io.of('/auctions').to(`auction:${ID}`).emit('auction:update', body);
const web = await preview({ root: app, build: { outDir: build }, preview: { host: '127.0.0.1', port: 4205, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let rest = snapshot(100_000, 0);
  let reads = 0;
  await page.route('**/api/v1/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/v1/auctions/${ID}`) { reads++; return route.fulfill({ json: rest }); }
    if (url.pathname.startsWith('/api/v1/auth')) return route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  // The polling-only server refuses the WebSocket upgrade itself (HTTP 400),
  // as a proxy would; page.routeWebSocket would fake an open socket instead.
  let upgrades = 0;
  page.on('websocket', () => { upgrades++; });
  await page.goto(`http://127.0.0.1:4205/auctions/${ID}`);
  const price = page.locator('aside[aria-label="Trả giá"] p[aria-live="polite"]');
  await expect(price).toContainText('100.000', { timeout: 15_000 });
  await expect(page.getByText('Trực tiếp', { exact: true })).toBeVisible({ timeout: 15_000 });
  assert(upgrades > 0, 'the client tried WebSocket first');
  checks.push('detail page live over long-polling with WebSocket refused');

  push(snapshot(120_000, 2_000));
  await expect(price).toContainText('120.000', { timeout: 10_000 });
  push(snapshot(110_000, 1_000)); // older than what is shown
  await page.waitForTimeout(1_500);
  await expect(price).toContainText('120.000');
  checks.push('an older push does not move the price back');

  rest = snapshot(105_000, 1_500); // a REST read stamped before the last push
  const before = reads;
  await page.evaluate(() => { window.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => reads, { timeout: 10_000 }).toBeGreaterThan(before);
  await page.waitForTimeout(1_000);
  await expect(price).toContainText('120.000');
  checks.push('a late REST read does not move the price back');

  rest = snapshot(130_000, 4_000);
  const again = reads;
  await page.evaluate(() => { window.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => reads, { timeout: 10_000 }).toBeGreaterThan(again);
  await expect(price).toContainText('130.000', { timeout: 10_000 });
  checks.push('a newer REST read still applies');

  await page.evaluate(() => {
    const now = Date.now.bind(Date);
    Date.now = () => now() + 2 * 60 * 60 * 1000;
  });
  await page.waitForTimeout(1200);
  await expect(page.getByText(/đang chốt kết quả/i)).toHaveCount(0);
  checks.push('moving the device date past the deadline does not close the countdown');

  const beforeReconnect = reads;
  rest = ack = snapshot(140_000, 5_000);
  for (const socket of srv.io.of('/auctions').sockets.values()) socket.conn.close();
  await expect.poll(() => reads, { timeout: 10_000 }).toBeGreaterThan(beforeReconnect);
  await expect(price).toContainText('140.000', { timeout: 10_000 });
  await expect(page.getByText('Trực tiếp', { exact: true })).toBeVisible();
  checks.push('transport reconnect reads the latest timestamp and price');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => web.httpServer.close(resolve));
  await close(srv);
}
