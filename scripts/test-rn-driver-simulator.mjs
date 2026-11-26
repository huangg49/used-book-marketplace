// RN Driver Simulator QA (Expo web export, Chromium 390px). Disposable *_test DB
// on rs-test through the admin-web harness; fake storage and simulated funding.
// Exchange: real API/Mongo from the exchange card entry to both parcels
// delivered. Auction: UI against contract-shaped responses (the in-transit point
// order needs a pinned server clock; the real endpoints are covered by
// apps/api/test/auctions.e2e-spec.ts "ADR 0044").
//
// Prereq: EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:3009/api/v1 and
// EXPO_PUBLIC_DRIVER_SIMULATOR=1 when running the RN export:web; API built.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer as createHttp } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTestApi, root, password } from "../apps/admin-web/tests/test-api.mjs";
import { requireQaMongo } from "./test-journey-gate.mjs";

requireQaMongo(process.env.MONGO_TEST_URL);
// The carrier simulator and demo commands are local-dev/test only.
process.env.PAYMENT_SIMULATOR_SECRET ||= randomBytes(24).toString("hex");
process.env.DEMO_SKIP_ENABLED = "true";
const out = path.join(root, ".tmp/rn-driver-simulator");
await mkdir(out, { recursive: true });
const result = { storage: "fake", native: "NOT RUN", checks: [] };
const pass = (name) => { result.checks.push(name); result.authLog?.push(`${new Date().toISOString().slice(11, 23)} -- ${name}`); console.log("✓", name); };
let fixture, browser, staticServer, rn;
try {
  fixture = await createTestApi({ corsOrigin: "http://127.0.0.1:8087", listingCount: 3 });
  const api = fixture.api, b = fixture.member;
  const { chromium, expect } = createRequire(path.join(root, "apps/admin-web/package.json"))("playwright/test");

  // ---- Real exchange up to two registered carrier labels (same steps as test-exchange-recovery).
  const a = await api("/auth/login", null, { email: "admin@operations.test", password });
  const staff = await api("/auth/login", null, { email: "staff@operations.test", password });
  const cat = await api("/operations/catalog-requests/" + fixture.catalogId, a.accessToken);
  await api("/operations/catalog-requests/" + fixture.catalogId + "/decision", a.accessToken, {
    expectedVersion: cat.version, revisionId: cat.currentRevision.id, decision: "Confirm",
  });
  const approve = async (id) => {
    const listing = await api("/operations/listings/" + id, staff.accessToken);
    await api("/operations/listings/" + id + "/decision", staff.accessToken, {
      expectedVersion: listing.version, revisionId: listing.currentRevision.id, decision: "Approve",
      checklist: { catalogMatches: true, photosClear: true, conditionDisclosed: true, readable: true, pricingValid: true, contentAppropriate: true },
    });
  };
  for (const id of fixture.listings) await approve(id);
  const template = await api("/me/listings/" + fixture.listings[0], b.accessToken);
  const content = { ...template.currentRevision.content, exchangeValue: 100000, mediaIds: [] };
  const draft = await api("/listings", a.accessToken, { content });
  const media = await api("/listings/" + draft.entityId + "/media", a.accessToken, {
    expectedVersion: draft.version, mimeType: "image/png", byteSize: fixture.photo.length,
    sha256: createHash("sha256").update(fixture.photo).digest("hex"),
  });
  const ticket = await api(`/listings/${draft.entityId}/media/${media.entityId}/upload-ticket`, a.accessToken);
  await api(ticket.path, a.accessToken, fixture.photo, "PUT", ticket.headers);
  const uploaded = await api(`/me/listings/${draft.entityId}/media/${media.entityId}`, a.accessToken);
  await api(`/listings/${draft.entityId}/media/${media.entityId}/finalize`, a.accessToken, { expectedVersion: uploaded.version });
  await fixture.processMedia();
  const fresh = await api("/me/listings/" + draft.entityId, a.accessToken);
  const saved = await api("/listings/" + draft.entityId + "/draft", a.accessToken,
    { expectedVersion: fresh.version, content: { ...content, mediaIds: [media.entityId] } }, "PUT");
  await api("/listings/" + draft.entityId + "/submit", a.accessToken, { expectedVersion: saved.version, ownershipDeclared: true });
  await approve(draft.entityId);

  const templateUser = await fixture.db.collection("users").findOne({ _id: b.user.id });
  const operatorId = randomUUID();
  await fixture.db.collection("users").insertOne({
    ...templateUser, _id: operatorId, emailNormalized: "operator@rn-driver.test",
    roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
  });
  const operator = await api("/auth/login", null, { email: "operator@rn-driver.test", password });
  const topup = async (actor) => {
    const amount = 2000000;
    const intent = await api("/me/topups", actor.accessToken, { amount });
    const wallet = await api("/me/wallet", actor.accessToken);
    await api("/operations/simulator/topup-events", operator.accessToken, {
      eventId: randomUUID(), intentId: intent.entityId, recipientId: actor.user.id, amount,
      currency: "VND", outcome: "Succeeded", occurredAt: wallet.serverTime,
    });
  };
  await topup(a);
  await topup(b);
  for (const actor of [a, b]) {
    const book = await api("/me/addresses", actor.accessToken);
    await api("/me/addresses", actor.accessToken, {
      expectedBookVersion: book.version, makeDefault: true,
      address: { recipientName: "Người nhận QA", phone: "0900000000", detail: "Địa chỉ tổng hợp kiểm thử",
        serviceAreaCode: "HCM-DEMO-v1", localityCode: "DEMO-A" },
    });
  }
  const proposal = await api("/exchanges", a.accessToken, {
    initiatorListingId: draft.entityId, recipientListingId: fixture.listings[0],
  });
  await api(`/exchanges/${proposal.id}/accept`, b.accessToken, { revision: proposal.revision });
  await api(`/exchanges/${proposal.id}/funding`, a.accessToken, {});
  let ex = await api(`/exchanges/${proposal.id}/funding`, b.accessToken, {});
  const codeA = "QA-RN-" + randomUUID().slice(0, 8).toUpperCase();
  const codeB = "QA-RN-" + randomUUID().slice(0, 8).toUpperCase();
  ex = await api(`/exchanges/${ex.id}/ship`, a.accessToken, {
    expectedVersion: ex.revision, method: "carrier", carrierCode: "SIMULATOR", carrierName: "Lật Lại Express", trackingCode: codeA,
  });
  ex = await api(`/exchanges/${ex.id}/ship`, b.accessToken, {
    expectedVersion: ex.revision, method: "carrier", carrierCode: "SIMULATOR", carrierName: "Lật Lại Express", trackingCode: codeB,
  });
  pass(`fixture exchange ${ex.status} with two carrier labels`);

  // ---- Static RN export on 8087.
  const dist = path.join(root, "apps/mobile-react-native/dist");
  staticServer = createHttp(async (q, s) => {
    try {
      const url = new URL(q.url, "http://127.0.0.1:8087");
      let file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
      if (file !== dist && !file.startsWith(dist + path.sep)) return s.writeHead(403).end();
      file = file === dist ? path.join(dist, "index.html") : path.extname(file) ? file : file + ".html";
      const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
        ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".webp": "image/webp" };
      s.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" })
        .end(await readFile(file));
    } catch { s.writeHead(404).end(); }
  });
  await new Promise((resolve) => staticServer.listen(8087, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  rn = await browser.newPage({ viewport: { width: 390, height: 900 } });
  rn.setDefaultTimeout(15000);
  const errors = [];
  rn.on("pageerror", (e) => errors.push(e.message));
  const authLog = [];
  rn.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.includes("/auth/") || r.status() === 401 || u.pathname.includes("/socket.io"))
      authLog.push(`${new Date().toISOString().slice(11, 23)} ${r.request().method()} ${u.pathname} ${r.status()}`);
  });
  result.authLog = authLog;
  const button = (name) => rn.getByRole("button", { name, exact: true });
  const shot = (name) => rn.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
  // A history jump makes RN web restore the session (one token refresh). Let it
  // settle before the next jump: two overlapping refreshes of one rotating
  // refresh token lose one to 401 and sign the page out.
  const spa = async (url) => {
    const refreshed = rn.waitForResponse((r) => r.url().endsWith("/auth/refresh"), { timeout: 5000 }).catch(() => null);
    await rn.evaluate((url) => { history.pushState({}, "", url); dispatchEvent(new PopStateEvent("popstate")); }, url);
    const response = await refreshed;
    if (response) assert.equal(response.status(), 200, "session refresh after navigation");
  };

  await rn.goto("http://127.0.0.1:8087/account");
  await rn.getByLabel("Email", { exact: true }).last().fill("admin@operations.test");
  await rn.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await button("Đăng nhập").click();
  await rn.getByText("admin@operations.test", { exact: true }).filter({ visible: true }).first().waitFor();
  await spa("/exchange?id=" + ex.id);

  // Entry from the exchange shipping card, for the parcel I send.
  const entry = rn.getByRole("button", { name: "Mở Driver Simulator · Demo cho kiện bạn gửi" });
  await entry.scrollIntoViewIfNeeded();
  await expect(rn.getByRole("button", { name: "Mở Driver Simulator · Demo cho kiện bạn nhận" })).toBeVisible();
  await entry.click();
  await rn.getByText("Mô phỏng Bưu tá", { exact: true }).filter({ visible: true }).first().waitFor();
  await expect(rn.getByText(codeA, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  assert.match(rn.url(), new RegExp(`kind=exchange.*exchangeId=${ex.id}.*leg=initiator`));
  await expect(rn.getByRole("tab")).toHaveCount(2);
  await shot("exchange-initial");
  pass("exchange card entry opens the initiator parcel with both legs");

  const steps = [
    ["1. Lấy kiện từ người gửi · Demo", "Đã ghi nhận: Lấy kiện từ người gửi."],
    ["2. Nhập kho trung chuyển · Demo", "Đã ghi nhận: Nhập kho trung chuyển."],
    ["3. Bắt đầu đi giao · Demo", "Đã ghi nhận: Bắt đầu đi giao."],
    ["4. Giao thành công · Demo", "Đã giao kiện thành công."],
  ];
  for (const [label, done] of steps) {
    await button(label).click();
    await button("Ghi nhận mốc giao hàng").click();
    await expect(rn.getByText(done).filter({ visible: true }).first()).toBeVisible();
  }
  const row = await fixture.db.collection("exchanges").findOne({ _id: ex.id });
  assert.ok(row.initiatorShipment?.shippedAt || row.initiatorShippedAt, "initiator parcel picked up");
  assert.ok(row.initiatorDeliveredAt || row.recipientReceivedAt || row.initiatorShipment?.deliveredAt,
    "initiator parcel delivered: " + JSON.stringify({ status: row.status, s: row.initiatorShipment }));
  await expect(rn.getByText("Kiện này đã giao thành công.", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await shot("exchange-leg1-delivered");
  pass("four carrier steps on the initiator parcel reach Delivered in Mongo");

  // Switch to the other parcel and use the all-parcels shortcut.
  await rn.getByRole("tab").filter({ hasNotText: "Đã giao" }).first().click();
  await expect(rn.getByText(codeB, { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await button("Giao nhanh cả hai kiện · Demo").click();
  await button("Giao cả hai kiện").click();
  await expect(rn.getByText("Đã mô phỏng giao xong cả hai kiện.", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  const both = await fixture.db.collection("exchanges").findOne({ _id: ex.id });
  pass(`auto-simulate delivers both parcels (exchange ${both.status})`);
  await shot("exchange-both-delivered");

  // Back returns to the exchange detail, which no longer offers the simulator.
  await rn.getByRole("button", { name: "Quay lại trao đổi" }).first().click();
  await expect(rn.getByRole("button", { name: /Mở Driver Simulator/ })).toHaveCount(0);
  pass("Back returns to the exchange; delivered parcels hide the entry");

  // Server local-demo gate (404) is explained instead of a blank screen.
  await rn.route("**/shipments/carrier/orders/active**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "NOT_FOUND", message: "Không tìm thấy." }) }));
  await spa(`/driver?kind=exchange&exchangeId=${ex.id}&leg=recipient`);
  await expect(rn.getByText("Simulator chưa mở cho thiết bị này").filter({ visible: true }).first()).toBeVisible();
  await expect(rn.getByText(/DEMO_ALLOW_REMOTE_HOST=true/).filter({ visible: true }).first()).toBeVisible();
  await rn.unroute("**/shipments/carrier/orders/active**");
  pass("local-demo 404 shows the remote-host guidance");

  // ---- Auction screen against contract-shaped responses.
  const auctionCode = "LL-QAAUCTION01";
  const orderId = randomUUID(), auctionId = randomUUID();
  let state = { version: 4, demoOutForDeliveryAt: null, status: "InTransit", outcomeAt: null };
  const now = () => new Date().toISOString();
  await rn.route("**/point-orders/delivery-tracking/**", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({
      orderId, auctionId, title: "Sách đấu giá QA", pointName: "Điểm demo A", trackingCode: auctionCode,
      dispatchedAt: new Date(Date.now() - 3600000).toISOString(), deliveryDeadline: new Date(Date.now() + 86400000).toISOString(),
      viewer: "Buyer", canReport: false, serverTime: now(), canDemoControl: true, ...state,
    }),
  }));
  const commands = [];
  let dropFirst = true;
  const receipt = (v, st) => ({ id: randomUUID(), entityType: "PointOrder", entityId: orderId, auctionId, orderId,
    version: v, state: st, currentPrice: null, minimumBid: null, leading: null, serverTime: now() });
  await rn.route(`**/point-orders/${orderId}/demo-*`, async (route) => {
    const r = route.request();
    commands.push({ url: r.url(), key: r.headers()["idempotency-key"], body: r.postData() });
    if (r.url().endsWith("demo-start-delivery") && dropFirst) { dropFirst = false; return route.abort("connectionreset"); }
    if (r.url().endsWith("demo-start-delivery")) state = { ...state, version: 5, demoOutForDeliveryAt: now() };
    else state = { ...state, version: 6, status: "Delivered", outcomeAt: now() };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(receipt(state.version, "InTransit")) });
  });
  await spa(`/driver?kind=auction&trackingCode=${auctionCode}`);
  await expect(rn.getByText("Vận đơn " + auctionCode + " · Đấu giá").filter({ visible: true }).first()).toBeVisible();
  await expect(rn.getByText("Hãng đã nhận sách", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await shot("auction-initial");
  await button("Bắt đầu đi giao · Demo").click();
  await button("Ghi nhận").click();
  await expect(rn.getByText("Chưa rõ hệ thống đã ghi nhận. Hãy thử lại đúng thao tác này.").filter({ visible: true }).first()).toBeVisible();
  await button("Bắt đầu đi giao · Demo").click();
  await button("Ghi nhận").click();
  await expect(rn.getByText("Bưu tá đã bắt đầu đi giao.").filter({ visible: true }).first()).toBeVisible();
  assert.equal(commands.length, 2);
  assert.equal(commands[0].key, commands[1].key, "lost response retries with the same Idempotency-Key");
  assert.equal(commands[0].body, commands[1].body, "and the same body");
  assert.deepEqual(JSON.parse(commands[0].body), { expectedVersion: 4 });
  pass("auction start: lost response replays the same key/body");
  await button("Giao thành công · Demo").click();
  await button("Ghi nhận").click();
  await expect(rn.getByText("Đã ghi nhận giao thành công.", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  assert.deepEqual(JSON.parse(commands[2].body), { expectedVersion: 5 });
  assert.notEqual(commands[2].key, commands[0].key);
  await expect(rn.getByText("Sách đã giao. Quay lại đơn đấu giá", { exact: false }).filter({ visible: true }).first()).toBeVisible();
  await shot("auction-delivered");
  pass("auction deliver uses the new version and a new key; delivered state shown");

  for (const width of [320, 390]) {
    await rn.setViewportSize({ width, height: 900 });
    assert.equal(await rn.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `no overflow at ${width}px`);
  }
  pass("no horizontal overflow at 320/390px");
  assert.deepEqual(errors, [], "no page errors");
  result.status = "PASS";
  console.log("PASS: RN driver simulator exchange (real API/Mongo) and auction (contract-shaped) at 390px.");
} catch (error) {
  result.status = "FAIL";
  result.error = String(error?.stack ?? error);
  await rn?.screenshot({ path: path.join(out, "failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2));
  await browser?.close();
  await new Promise((resolve) => (staticServer ? staticServer.close(resolve) : resolve()));
  await fixture?.close();
}
