// RN web regression: real API/Mongo/ledger, local fake storage/funding.
// Faults discard or delay real ACKs; this does not replace Android/human checks.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
const require = createRequire(
  new URL("../apps/admin-web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8087";
const artifacts = path.join(
  root,
  "apps/mobile-react-native/test-results/buy-now",
);
const button = (page, name) => page.getByRole("button", { name, exact: true });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
Object.assign(process.env, {
  AUTH_MAIL_PROVIDER: "local",
  PAYMENT_SIMULATOR_SECRET: "qa-only-rn-buy-now-funding-000000000000",
});
let fixture, browser, server;
const errors = [];
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 3 });
  const api = fixture.api,
    seller = fixture.member;
  const buyer = await api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const catalog = await api(
    `/operations/catalog-requests/${fixture.catalogId}`,
    buyer.accessToken,
  );
  await api(
    `/operations/catalog-requests/${fixture.catalogId}/decision`,
    buyer.accessToken,
    {
      expectedVersion: catalog.version,
      revisionId: catalog.currentRevision.id,
      decision: "Confirm",
    },
  );
  const address = async (actor, localityCode) =>
    api("/me/addresses", actor.accessToken, {
      expectedBookVersion: 0,
      makeDefault: true,
      address: {
        recipientName: "QA only",
        phone: "0900000000",
        serviceAreaCode: "HCM-DEMO-v1",
        localityCode,
        detail: "QA simulated address",
      },
    });
  const source = await address(seller, "DEMO-A");
  await address(buyer, "DEMO-B");
  const approve = async (id) => {
    const l = await api(`/operations/listings/${id}`, buyer.accessToken);
    await api(`/operations/listings/${id}/decision`, buyer.accessToken, {
      expectedVersion: l.version,
      revisionId: l.currentRevision.id,
      decision: "Approve",
      checklist: {
        catalogMatches: true,
        photosClear: true,
        conditionDisclosed: true,
        readable: true,
        pricingValid: true,
        contentAppropriate: true,
      },
    });
  };
  for (const id of fixture.listings) {
    await approve(id);
    const l = await api(`/me/listings/${id}`, seller.accessToken);
    await api(`/listings/${id}/revision`, seller.accessToken, {
      expectedVersion: l.version,
      ownershipDeclared: true,
      content: {
        ...l.currentRevision.content,
        fulfillment: {
          method: "DirectDelivery",
          originAddressId: source.addressId,
          originAddressVersion: 1,
        },
      },
    });
    await approve(id);
  }
  const operatorId = randomUUID();
  const template = await fixture.db
    .collection("users")
    .findOne({ _id: seller.user.id });
  await fixture.db.collection("users").insertOne({
    ...template,
    _id: operatorId,
    emailNormalized: "operator@rn-checkout.test",
    roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
  });
  const operator = await api("/auth/login", null, {
    email: "operator@rn-checkout.test",
    password,
  });
  const topup = await api("/me/topups", buyer.accessToken, { amount: 1000000 });
  await api("/operations/simulator/topup-events", operator.accessToken, {
    eventId: randomUUID(),
    intentId: topup.entityId,
    recipientId: buyer.user.id,
    amount: 1000000,
    currency: "VND",
    outcome: "Succeeded",
    occurredAt: new Date().toISOString(),
  });
  // Fixture construction consumes logins. These browser sign-ins start a separate
  // QA counter baseline; this suite makes no claim about limiter acceptance.
  await fixture.db.collection("login_attempts").deleteMany({});
  const dist = path.join(root, "apps/mobile-react-native/dist");
  server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      let file = path.resolve(dist, "." + pathname);
      if (file !== dist && !file.startsWith(dist + path.sep))
        return res.writeHead(403).end();
      file =
        file === dist
          ? path.join(dist, "index.html")
          : !path.extname(file)
            ? file + ".html"
            : file;
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
      };
      const bytes = await readFile(file);
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] ?? "application/octet-stream",
        })
        .end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8087, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const p = await browser.newPage({ viewport: { width: 390, height: 900 } });
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  const intercept = (pattern, action) =>
    p.route(pattern, async (route) => {
      try {
        await action(route);
      } catch {
        errors.push("QA interception failed");
        await route.abort().catch(() => {});
      }
    });
  const navigate = (url) =>
    p.evaluate((value) => {
      history.pushState({}, "", value);
      dispatchEvent(new PopStateEvent("popstate"));
    }, url);
  const openNewestOrder = async (id) => {
    await button(p, "Về kệ sách").click();
    await p.getByRole("tab", { name: "Tài khoản", exact: true }).click();
    await p.getByRole("button", { name: /^Đơn mua\/bán trực tiếp/ }).click();
    await p
      .getByText("#" + id.slice(0, 8).toUpperCase(), { exact: true })
      .waitFor();
    await button(p, "Mở chi tiết đơn").first().click();
    await p.getByText("Đơn #" + id.slice(0, 8), { exact: true }).waitFor();
  };
  const login = async (page, email) => {
    await page.goto(origin + "/account");
    await page.getByLabel("Email", { exact: true }).last().fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
    await button(page, "Đăng nhập").click();
    await page
      .getByRole("heading", { name: "Việc của tôi", exact: true })
      .waitFor();
  };
  const openBook = async (id) => {
    console.log("QA: open book");
    await navigate("/book?id=" + id);
    await button(p, "Mua ngay cuốn sách này").click();
    await button(p, "Xác nhận đặt mua").waitFor({ state: "visible" });
    await p.waitForFunction(() =>
      [...document.querySelectorAll('[role="button"]')].some(
        (n) =>
          n.textContent === "Xác nhận đặt mua" &&
          n.getAttribute("aria-disabled") !== "true",
      ),
    );
  };
  await login(p, "admin@operations.test");
  // Real quote, lost POST ACK and failed GET: never mint a replacement intent.
  const quotePosts = [],
    quoteReads = [];
  let loseQuoteAck = true,
    loseQuoteRead = true;
  await intercept("**/api/v1/listings/*/quotes", async (route) => {
    quotePosts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (loseQuoteAck) {
      loseQuoteAck = false;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await intercept("**/api/v1/me/quotes/*", async (route) => {
    quoteReads.push(route.request().url());
    if (loseQuoteRead) {
      loseQuoteRead = false;
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "QA quote read failure" },
      });
    }
    await route.continue();
  });
  await navigate("/book?id=" + fixture.listings[0]);
  await button(p, "Mua ngay cuốn sách này").click();
  await button(p, "Thử lại báo giá đã yêu cầu").waitFor();
  assert.equal(
    await button(p, "Xác nhận đặt mua").getAttribute("aria-disabled"),
    "true",
  );
  await button(p, "Đóng modal mua ngay").click();
  await button(p, "Mua ngay cuốn sách này").click();
  await button(p, "Thử lại báo giá đã yêu cầu").waitFor();
  assert.deepEqual(quotePosts[0], quotePosts[1]);
  await button(p, "Thử lại báo giá đã yêu cầu").click();
  await p.waitForFunction(() =>
    [...document.querySelectorAll('[role="button"]')].some(
      (n) =>
        n.textContent === "Xác nhận đặt mua" &&
        n.getAttribute("aria-disabled") !== "true",
    ),
  );
  assert.equal(quotePosts.length, 2);
  assert.equal(quoteReads[0], quoteReads[1]);
  await fixture.setQuoteTimeOffset(16 * 60000);
  await button(p, "Đóng modal mua ngay").click();
  await button(p, "Mua ngay cuốn sách này").click();
  await button(p, "Lấy báo giá mới").waitFor();
  assert.equal(
    await button(p, "Xác nhận đặt mua").getAttribute("aria-disabled"),
    "true",
  );
  assert.equal(
    quotePosts.length,
    2,
    "Expired GET must not auto-create another quote",
  );
  assert.equal(quoteReads[2], quoteReads[1]);
  await p.screenshot({
    path: path.join(artifacts, "expired-quote-390.png"),
    fullPage: true,
  });
  await fixture.setQuoteTimeOffset(0);
  await button(p, "Lấy báo giá mới").click();
  await p.waitForFunction(() =>
    [...document.querySelectorAll('[role="button"]')].some(
      (n) =>
        n.textContent === "Xác nhận đặt mua" &&
        n.getAttribute("aria-disabled") !== "true",
    ),
  );
  assert.equal(quotePosts.length, 3);
  assert.notEqual(quotePosts[2].key, quotePosts[1].key);
  assert.equal(quotePosts[2].body, quotePosts[1].body);
  assert.notEqual(quoteReads[3], quoteReads[2]);
  assert.equal(
    await fixture.db
      .collection("direct_orders")
      .countDocuments({ buyerId: buyer.user.id }),
    0,
  );
  await p.screenshot({
    path: path.join(artifacts, "renewed-quote-390.png"),
    fullPage: true,
  });
  await p.unroute("**/api/v1/listings/*/quotes");
  await p.unroute("**/api/v1/me/quotes/*");
  await button(p, "Đóng modal mua ngay").click();
  await openBook(fixture.listings[0]);
  const creates = [],
    pays = [],
    cancels = [];
  let orderId;
  let readFault = true;
  await intercept("**/api/v1/me/orders/*", async (route) => {
    if (readFault && route.request().method() === "GET")
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "QA read unavailable" },
      });
    return route.continue();
  });
  await intercept("**/api/v1/orders/buy-now", async (route) => {
    const request = route.request();
    creates.push({
      key: request.headers()["idempotency-key"],
      body: request.postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    orderId = (await response.json()).entityId;
    if (creates.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await button(p, "Xác nhận đặt mua").click();
  await button(p, "Thử lại tạo đơn trước").waitFor();
  assert.equal(await button(p, "Xác nhận đặt mua").count(), 0);
  await button(p, "Đóng modal mua ngay").click();
  // The remount can now know the active Order, but still must replay the
  // original create intent before making any different financial decision.
  await button(p, "Thanh toán ngay đơn hàng đang giữ sách").click();
  await button(p, "Thử lại tạo đơn trước").click();
  await button(p, "Thử tải lại đơn đã tạo").waitFor();
  assert.equal(creates.length, 2);
  assert.ok(
    JSON.stringify(creates[0]) === JSON.stringify(creates[1]),
    "Create intent changed",
  );
  assert.equal(
    await fixture.db
      .collection("direct_orders")
      .countDocuments({ buyerId: buyer.user.id }),
    1,
  );
  readFault = false;
  await button(p, "Thử tải lại đơn đã tạo").click();
  await p.getByRole("button", { name: /^Thanh toán ngay \(/ }).waitFor();
  await intercept("**/api/v1/orders/*/pay", async (route) => {
    pays.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (pays.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await p.getByRole("button", { name: /^Thanh toán ngay \(/ }).click();
  await button(p, "Thử lại thanh toán trước").waitFor();
  assert.equal(await button(p, "Hủy đơn đặt mua").count(), 0);
  await button(p, "Đóng modal mua ngay").click();
  console.log("QA: resume through order list");
  await openNewestOrder(orderId);
  await button(p, "Thử lại: Thanh toán đơn").click();
  await button(p, "Thử lại: Thanh toán đơn").waitFor({ state: "hidden" });
  await p.getByText(/Bạn là người mua.*Người bán chuẩn bị sách/).waitFor();
  assert.ok(
    JSON.stringify(pays[0]) === JSON.stringify(pays[1]),
    "Pay intent changed",
  );
  assert.equal(pays.length, 2);
  const wallet = await api("/me/wallet", buyer.accessToken);
  const order = await api(`/me/orders/${orderId}`, buyer.accessToken);
  assert.equal(wallet.transactionHeld, order.amounts.buyerTotal);
  assert.equal(wallet.available, 1000000 - order.amounts.buyerTotal);
  await p.screenshot({
    path: path.join(artifacts, "buyer-paid-390.png"),
    fullPage: true,
  });
  const sellerPage = await browser.newPage({
    viewport: { width: 320, height: 900 },
  });
  sellerPage.setDefaultTimeout(15000);
  sellerPage.on("pageerror", (e) => errors.push(e.message));
  console.log("QA: seller continuation");
  await login(sellerPage, "member@operations.test");
  await button(sellerPage, new RegExp(orderId.slice(0, 8))).click();
  assert.equal(
    await button(sellerPage, "Xác nhận bán").count(),
    0,
    "BuyNow payment already enters Preparing",
  );
  await sellerPage
    .getByText(/Ảnh đóng gói và vận chuyển hiện thực hiện trên Member web/)
    .waitFor();
  await sellerPage.getByText("Mã đơn: " + orderId, { exact: true }).waitFor();
  assert.equal(
    (await api(`/me/orders/${orderId}`, seller.accessToken)).state,
    "Preparing",
  );
  await sellerPage.screenshot({
    path: path.join(artifacts, "seller-preparing-320.png"),
    fullPage: true,
  });
  // An ACK arriving after Back must never navigate the closed checkout. Its
  // Order ID remains addressable even before the list query catches up.
  await p.unroute("**/api/v1/orders/buy-now");
  const committed = deferred(),
    release = deferred(),
    delivered = deferred();
  await intercept("**/api/v1/orders/buy-now", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    orderId = (await response.json()).entityId;
    committed.resolve();
    await release.promise;
    await route.fulfill({ response });
    delivered.resolve();
  });
  await openBook(fixture.listings[1]);
  await button(p, "Xác nhận đặt mua").click();
  await committed.promise;
  const afterAckRead = p.waitForResponse(
    (r) => r.url().includes("/me/orders?") && r.status() === 200,
  );
  await button(p, "Đóng modal mua ngay").click();
  release.resolve();
  await delivered.promise;
  await afterAckRead;
  assert.ok(new URL(p.url()).pathname === "/book");
  assert.equal(await button(p, "Thanh toán ngay").count(), 0);
  await button(p, "Thanh toán ngay đơn hàng đang giữ sách").click();
  await p.getByRole("button", { name: /^Thanh toán ngay \(/ }).waitFor();
  await intercept("**/api/v1/orders/*/cancel", async (route) => {
    cancels.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (cancels.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await button(p, "Hủy đơn đặt mua").click();
  await button(p, "Thử lại hủy đơn trước").waitFor();
  assert.equal(
    await p.getByRole("button", { name: /^Thanh toán ngay \(/ }).count(),
    0,
  );
  await button(p, "Đóng modal mua ngay").click();
  console.log("QA: resume through order list");
  await openNewestOrder(orderId);
  await button(p, "Thử lại: Hủy đơn chưa thanh toán").click();
  await button(p, "Thử lại: Hủy đơn chưa thanh toán").waitFor({
    state: "hidden",
  });
  await p.getByText(/Bạn là người mua.*Đã hủy đơn/).waitFor();
  assert.ok(
    JSON.stringify(cancels[0]) === JSON.stringify(cancels[1]),
    "Cancel intent changed",
  );
  assert.equal(cancels.length, 2);
  assert.equal(
    (await api(`/me/orders/${orderId}`, buyer.accessToken)).state,
    "Cancelled",
  );
  assert.equal(
    (await api("/me/wallet", buyer.accessToken)).transactionHeld,
    wallet.transactionHeld,
  );
  // Changed listing: review the new source rather than substituting versions.
  await p.unroute("**/api/v1/orders/buy-now");
  await openBook(fixture.listings[2]);
  await button(p, "Đóng modal mua ngay").click();
  const beforeRevision = await api(
    `/me/listings/${fixture.listings[2]}`,
    seller.accessToken,
  );
  await api(`/listings/${fixture.listings[2]}/revision`, seller.accessToken, {
    expectedVersion: beforeRevision.version,
    ownershipDeclared: true,
    content: {
      ...beforeRevision.currentRevision.content,
      notes: "Synthetic changed listing for quote review",
    },
  });
  await approve(fixture.listings[2]);
  await button(p, "Mua ngay cuốn sách này").click();
  await button(p, "Xem lại bản sách").waitFor();
  assert.equal(
    await button(p, "Xác nhận đặt mua").getAttribute("aria-disabled"),
    "true",
  );
  assert.equal(
    await button(p, "Lấy báo giá mới").count(),
    0,
    "Changed is not expiry",
  );
  await p.screenshot({
    path: path.join(artifacts, "changed-quote-390.png"),
    fullPage: true,
  });
  const refreshed = p.waitForResponse(
    (r) =>
      r.url().includes(`/listings/${fixture.listings[2]}?`) &&
      r.status() === 200,
  );
  await button(p, "Xem lại bản sách").click();
  await refreshed;
  await button(p, "Mua ngay cuốn sách này").click();
  await p.waitForFunction(() =>
    [...document.querySelectorAll('[role="button"]')].some(
      (n) =>
        n.textContent === "Xác nhận đặt mua" &&
        n.getAttribute("aria-disabled") !== "true",
    ),
  );
  assert.equal(
    await fixture.db
      .collection("direct_orders")
      .countDocuments({ listingId: fixture.listings[2] }),
    0,
  );
  await button(p, "Đóng modal mua ngay").click();
  // Only the response TTL is shortened here: fake timing, actual quote/API.
  await intercept("**/api/v1/me/quotes/*", async (route) => {
    const response = await route.fetch(),
      value = await response.json();
    value.expiresAt = new Date(
      Date.parse(value.serverTime) + 200,
    ).toISOString();
    await route.fulfill({ response, json: value });
  });
  await button(p, "Mua ngay cuốn sách này").click();
  await button(p, "Lấy báo giá mới").waitFor();
  assert.equal(
    await button(p, "Xác nhận đặt mua").getAttribute("aria-disabled"),
    "true",
  );
  assert.equal(
    await fixture.db
      .collection("direct_orders")
      .countDocuments({ listingId: fixture.listings[2] }),
    0,
  );
  await p.unroute("**/api/v1/me/quotes/*");
  assert.deepEqual(errors, []);
  console.log(
    "PASS RN web buy-now: quote POST lost ACK/GET failure exact retry, server-confirmed expiry across Back, explicit new quote, actual Changed listing + review/reopen, local timer with shortened response TTL; real create/pay/cancel, lost ACK + remount pinned intents, failed follow-up read, late ACK after Back, exact Order, seller Preparing/web continuation. Native/human NOT COVERED here.",
  );
} catch (error) {
  let index = 0;
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages())
      await page
        .screenshot({
          path: path.join(artifacts, `failure-${index++}.png`),
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await fixture?.close();
}
