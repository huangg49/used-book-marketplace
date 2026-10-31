// Real HTTP/Mongo and two browser sessions; QA-only accounts/storage/funding.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  createTestApi,
  root,
  base,
  password,
} from "../../admin-web/tests/test-api.mjs";
const require = createRequire(
  new URL("../../admin-web/package.json", import.meta.url),
);
const webRequire = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const { createServer } = await import(
  pathToFileURL(webRequire.resolve("vite")).href
);
const origin = "http://127.0.0.1:5184";
Object.assign(process.env, {
  VITE_API_BASE_URL: base,
  PAYMENT_SIMULATOR_SECRET: "qa-only-seller-order-funding-000000000000",
  AUTH_MAIL_PROVIDER: "local",
});
const artifacts = path.join(root, "apps/user-web/test-results/seller-order");
await mkdir(artifacts, { recursive: true });
const captureDialog = async (page, filename) => {
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  await dialog.evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished),
    );
    node.querySelector("h2")?.focus();
    node.scrollTo({ top: 0 });
  });
  const inputBorders = await dialog
    .locator('input:not([type="radio"]):not([type="checkbox"])')
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderTopColor),
    );
  for (const border of inputBorders) assert.equal(border, "rgb(142, 117, 100)");
  await page.screenshot({
    path: path.join(artifacts, filename),
    fullPage: false,
  });
};
let fixture, server, browser;
const errors = [];
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 1 });
  const seller = fixture.member;
  const buyer = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const catalog = await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}`,
    buyer.accessToken,
  );
  await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}/decision`,
    buyer.accessToken,
    {
      expectedVersion: catalog.version,
      revisionId: catalog.currentRevision.id,
      decision: "Confirm",
    },
  );
  const listingId = fixture.listings[0];
  const approve = async () => {
    const listing = await fixture.api(
      `/operations/listings/${listingId}`,
      buyer.accessToken,
    );
    await fixture.api(
      `/operations/listings/${listingId}/decision`,
      buyer.accessToken,
      {
        expectedVersion: listing.version,
        revisionId: listing.currentRevision.id,
        decision: "Approve",
        checklist: {
          catalogMatches: true,
          photosClear: true,
          conditionDisclosed: true,
          readable: true,
          pricingValid: true,
          contentAppropriate: true,
        },
      },
    );
  };
  await approve();
  const address = await fixture.api("/me/addresses", seller.accessToken, {
    expectedBookVersion: 0,
    makeDefault: true,
    address: {
      recipientName: "QA seller",
      phone: "0900123456",
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: "DEMO-A",
      detail: "QA origin, simulated only",
    },
  });
  const mine = await fixture.api(
    `/me/listings/${listingId}`,
    seller.accessToken,
  );
  await fixture.api(`/listings/${listingId}/revision`, seller.accessToken, {
    expectedVersion: mine.version,
    ownershipDeclared: true,
    content: {
      ...mine.currentRevision.content,
      fulfillment: {
        method: "DirectDelivery",
        originAddressId: address.addressId,
        originAddressVersion: 1,
      },
    },
  });
  await approve();
  const operatorId = randomUUID(),
    now = new Date();
  const sellerDoc = await fixture.db
    .collection("users")
    .findOne({ _id: seller.user.id });
  await fixture.db.collection("users").insertOne({
    ...sellerDoc,
    _id: operatorId,
    emailNormalized: "operator@seller-order.test",
    roles: [{ role: "TEST_OPERATOR", grantedAt: now }],
  });
  const operator = await fixture.api("/auth/login", null, {
    email: "operator@seller-order.test",
    password,
  });
  const fundBuyer = async (amount) => {
    const topup = await fixture.api("/me/topups", buyer.accessToken, {
      amount,
    });
    await fixture.api(
      "/operations/simulator/topup-events",
      operator.accessToken,
      {
        eventId: randomUUID(),
        intentId: topup.entityId,
        recipientId: buyer.user.id,
        amount,
        currency: "VND",
        outcome: "Succeeded",
        occurredAt: new Date().toISOString(),
      },
    );
  };
  await fixture.api("/me/addresses", buyer.accessToken, {
    expectedBookVersion: 0,
    makeDefault: true,
    address: {
      recipientName: "QA saved address",
      phone: "0900654321",
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: "DEMO-A",
      detail: "QA previous address, simulated only",
    },
  });
  await fundBuyer(50000);
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5184, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const buyerPage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const sellerPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  for (const page of [buyerPage, sellerPage])
    page.on("pageerror", (error) => errors.push(error.message));
  const login = async (page, email, returnPath = "/") => {
    await page.goto(origin + "/login?returnUrl=" + encodeURIComponent(returnPath));
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Mật khẩu/).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(origin + returnPath);
  };
  await login(buyerPage, "admin@operations.test", `/books/${listingId}`);
  await buyerPage
    .getByRole("button", { name: "Chat với người bán", exact: true })
    .click();
  await buyerPage.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  const conversationId = new URL(buyerPage.url()).pathname.split("/").at(-1);
  assert.equal(
    (await fixture.db.collection("listings").findOne({ _id: listingId })).trade,
    "Available",
  );
  await buyerPage.getByLabel("Đề nghị giá sách mong muốn (₫):", { exact: true }).fill("90000");
  await buyerPage.getByRole("button", { name: "Gửi đề nghị", exact: true }).click();
  await buyerPage.getByRole("button", { name: "Rút đề nghị", exact: true }).waitFor();
  await buyerPage
    .getByRole("link", { name: "Gửi thông tin nhận sách", exact: true })
    .click();
  await buyerPage
    .getByRole("radio", { name: "Dùng địa chỉ mới", exact: true })
    .check();
  await buyerPage.getByLabel("Họ tên", { exact: true }).fill("QA buyer");
  await buyerPage
    .getByLabel("Số điện thoại", { exact: true })
    .fill("0900654321");
  await buyerPage.getByLabel(/Khu vực luân chuyển sách/).selectOption("DEMO-A");
  await buyerPage
    .getByLabel("Địa chỉ chi tiết", { exact: true })
    .fill("QA destination, simulated only");
  await buyerPage.keyboard.press("Escape");
  await buyerPage
    .getByRole("button", { name: "Gửi địa chỉ và báo giá", exact: true })
    .click();
  assert.equal(
    await buyerPage.getByLabel("Họ tên", { exact: true }).inputValue(),
    "QA buyer",
  );
  const addressAttempts = [];
  let lostAddress = false;
  await buyerPage.route("**/api/v1/me/addresses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    addressAttempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (!lostAddress) {
      lostAddress = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  let rejectedQuote = false;
  await buyerPage.route(
    `**/api/v1/listings/${listingId}/quotes`,
    async (route) => {
      if (!rejectedQuote) {
        rejectedQuote = true;
        await route.fulfill({
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "QA-only quote rejection",
          },
        });
      } else await route.continue();
    },
  );
  await buyerPage
    .getByRole("button", { name: "Xem phí giao nhận", exact: true })
    .click();
  await buyerPage
    .getByRole("button", { name: "Thử lại bước tính phí", exact: true })
    .waitFor();
  assert.equal(
    await buyerPage.getByLabel("Họ tên", { exact: true }).isDisabled(),
    true,
  );
  await buyerPage
    .getByRole("button", { name: "Đóng popup", exact: true })
    .click();
  await buyerPage
    .getByRole("button", { name: "Gửi địa chỉ và báo giá", exact: true })
    .click();
  await buyerPage
    .getByRole("button", { name: "Thử lại bước tính phí", exact: true })
    .click();
  assert.equal(addressAttempts.length, 2);
  assert.deepEqual(addressAttempts[0], addressAttempts[1]);
  await buyerPage
    .getByRole("alert")
    .filter({ hasText: "Chưa thể báo giá" })
    .waitFor();
  assert.equal(
    await buyerPage.getByRole("radio", { name: /QA buyer/ }).isChecked(),
    true,
  );
  assert.equal(
    await buyerPage.getByLabel("Họ tên", { exact: true }).count(),
    0,
  );
  await buyerPage
    .getByRole("button", { name: "Xem phí giao nhận", exact: true })
    .click();
  await buyerPage
    .getByRole("button", { name: "Gửi báo giá cho người bán", exact: true })
    .waitFor();
  assert.equal(
    addressAttempts.length,
    2,
    "Retry quotes the confirmed address without another save",
  );
  assert.equal(
    (await fixture.api("/me/addresses", buyer.accessToken)).items.length,
    2,
  );

  await buyerPage
    .getByRole("button", { name: "Gửi báo giá cho người bán", exact: true })
    .waitFor();
  await captureDialog(buyerPage, "quote-mobile.png");
  await buyerPage
    .getByRole("button", { name: "Gửi báo giá cho người bán", exact: true })
    .click();
  await buyerPage.waitForURL(`**/chat/${conversationId}`);
  await login(sellerPage, "member@operations.test");
  await sellerPage.locator('a[href="/chat"]').first().click();
  await sellerPage.locator(`a[href="/chat/${conversationId}"]`).first().click();
  await sellerPage.getByRole("button", { name: "Chấp nhận giá này", exact: true }).click();
  await sellerPage.getByRole("button", { name: "Tạo đơn cho người mua này", exact: true }).waitFor();
  let releaseAreas;
  const areasGate = new Promise((resolve) => { releaseAreas = resolve; });
  let failAreas = true;
  await sellerPage.route("**/api/v1/service-areas", async (route) => {
    if (failAreas) {
      await areasGate;
      failAreas = false;
      await route.fulfill({ status: 503, json: { message: "QA directory unavailable" } });
    } else await route.continue();
  });
  await sellerPage
    .getByRole("button", { name: "Tạo đơn cho người mua này", exact: true })
    .click();
  const price = sellerPage.getByLabel("Giá sách đã thỏa thuận (₫)", {
    exact: true,
  });
  await sellerPage.locator('dialog[open] input[name="agreedBookPrice"][value="90000"]').waitFor();
  assert.equal(await price.inputValue(), "90000");
  assert.equal(await price.getAttribute("readonly") !== null, true);
  const sellerDialog = sellerPage.getByRole("dialog");
  await sellerDialog.getByText("QA destination, simulated only, Đang tải khu vực…", { exact: true }).waitFor();
  releaseAreas();
  await sellerDialog.getByRole("alert").filter({ hasText: "Chưa tải được tên khu vực" }).waitFor();
  assert.equal(await sellerDialog.getByText(/DEMO-[ABC]/).count(), 0);
  await sellerDialog.getByRole("button", { name: "Thử lại", exact: true }).click();
  await sellerDialog.getByText("QA destination, simulated only, TP.HCM", { exact: true }).waitFor();
  assert.equal(await price.inputValue(), "90000");
  await sellerPage
    .getByRole("button", { name: "Đóng popup", exact: true })
    .click();
  await sellerPage
    .getByRole("button", { name: "Tạo đơn cho người mua này", exact: true })
    .click();
  assert.equal(await price.inputValue(), "90000");
  await sellerDialog.getByText("QA destination, simulated only, TP.HCM", { exact: true }).waitFor();
  assert.equal(await sellerDialog.getByText(/DEMO-[ABC]/).count(), 0);
  await captureDialog(sellerPage, "seller-create-desktop.png");
  await sellerPage.setViewportSize({ width: 390, height: 844 });
  await captureDialog(sellerPage, "seller-create-mobile.png");
  await sellerPage.setViewportSize({ width: 1440, height: 900 });
  // Lose the committed response and retry the exact same key/body, with editing locked.
  const createAttempts = [];
  const beforeRooms = await fixture.api(
    "/me/purchase-conversations",
    seller.accessToken,
  );
  let holdRooms = true;
  const beforeRoom = await fixture.api(`/me/purchase-conversations/${conversationId}`, seller.accessToken);
  await sellerPage.route(`**/api/v1/me/purchase-conversations/${conversationId}`, async route => {
    if (holdRooms) await route.fulfill({ json: beforeRoom }); else await route.continue();
  });
  await sellerPage.route(
    "**/api/v1/me/purchase-conversations",
    async (route) => {
      if (holdRooms) await route.fulfill({ json: beforeRooms });
      else await route.continue();
    },
  );
  let lost = false;
  await sellerPage.route("**/api/v1/orders", async (route) => {
    createAttempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else {
      holdRooms = false;
      await route.continue();
    }
  });
  await sellerDialog
    .getByRole("button", { name: "Tạo đơn cho người mua này", exact: true })
    .click();
  await sellerPage
    .getByRole("alert")
    .filter({ hasText: "Chưa xác nhận được đơn đã tạo" })
    .waitFor();
  assert.equal(await price.isDisabled(), true);
  const replayed = sellerPage.waitForResponse(
    (r) => r.url().endsWith("/api/v1/orders") && r.status() === 200,
  );
  await sellerDialog
    .getByRole("button", { name: "Tạo đơn cho người mua này", exact: true })
    .click();
  const createReceipt = await (await replayed).json();
  assert.equal(createReceipt.entityType, "Order");
  assert.equal(createAttempts.length, 2);
  assert.deepEqual(createAttempts[0], createAttempts[1]);
  const buyerOrderDetails = buyerPage.getByRole("region", {
    name: "Chi tiết đơn hàng",
    exact: true,
  });
  await buyerPage.waitForURL(`**/chat/${conversationId}`);
  await buyerOrderDetails.getByRole("heading", { name: "Thủ tục đơn hàng", exact: true }).waitFor();
  await buyerOrderDetails.getByText("Chờ thanh toán", {exact: true}).waitFor();
  const order = await fixture.db
    .collection("direct_orders")
    .findOne({ buyerId: buyer.user.id });
  assert(order);
  assert.equal(order._id, createReceipt.entityId);
  await buyerOrderDetails.getByRole("heading", {
    name: fixture.metadata.title, exact: true,
  }).waitFor();
  assert.equal(
    (await fixture.api(`/me/orders/${order._id}`, buyer.accessToken)).conversationId,
    conversationId,
  );
  assert.equal(
    await fixture.db
      .collection("direct_orders")
      .countDocuments({ buyerId: buyer.user.id }),
    1,
  );
  assert.equal(
    (await fixture.api(`/me/orders/${order._id}`, buyer.accessToken)).amounts
      .buyerTotal,
    120000,
  );
  assert.equal(
    (await fixture.api("/me/wallet", buyer.accessToken)).transactionHeld,
    0,
  );
  assert.equal(
    (await fixture.db.collection("listings").findOne({ _id: listingId })).trade,
    "Reserved",
  );
  assert.equal(
    (await fixture.api(`/listings/${listingId}`)).purchaseAvailability.status,
    "AwaitingPayment",
  );
  await buyerPage.screenshot({
    path: path.join(artifacts, "buyer-payment-mobile.png"),
    fullPage: true,
  });
  await buyerOrderDetails
    .getByRole("button", { name: /^Thanh toán ngay 120\.000\s*₫$/ })
    .click();
  await buyerOrderDetails
    .getByRole("alert")
    .filter({ hasText: "Kiểm tra số dư ví" })
    .waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", buyer.accessToken)).transactionHeld,
    0,
  );
  assert.equal(
    (await fixture.api(`/me/orders/${order._id}`, buyer.accessToken)).state,
    "AwaitingPayment",
  );
  await fundBuyer(150000);
  await buyerOrderDetails
    .getByRole("button", { name: /^Thanh toán ngay 120\.000\s*₫$/ })
    .click();
  await buyerOrderDetails
    .getByText("Chờ người bán xác nhận", {exact: true})
    .waitFor();
  const wallet = await fixture.api("/me/wallet", buyer.accessToken);
  assert.equal(wallet.transactionHeld, 120000);
  assert.equal(
    (await fixture.api(`/listings/${listingId}`)).purchaseAvailability.status,
    "InTransaction",
  );
  assert.equal(wallet.available, 80000);
  assert.equal(
    await fixture.db
      .collection("ledger_journals")
      .countDocuments({ orderId: order._id, type: "OrderPayment" }),
    1,
  );
  const listingTabReady = buyerPage.waitForEvent("popup");
  await buyerPage.locator(`a[href="/books/${listingId}"]`).first().click();
  const listingTab = await listingTabReady;
  await listingTab.getByRole("heading", { name: "Đang giao dịch", exact: true }).waitFor();
  await listingTab.close();
  // A new browser tab has no memory-only access token. Verify the authenticated
  // participant view in the existing session as well as the public popup above.
  await buyerPage.evaluate(async (id) => {
    const { router } = await import("/src/app/router.tsx");
    await router.navigate(`/books/${id}`);
  }, listingId);
  await buyerPage
    .getByText("Đang giao dịch với bạn", { exact: true })
    .waitFor();
  await buyerPage.screenshot({
    path: path.join(artifacts, "buyer-listing-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS seller-order browser: two sessions, non-exclusive chat, quote/address, negotiated 90000+30000, committed lost create response, one unpaid Order, underfunded Buyer payment rejected, explicit Buyer payment/one hold, public transaction state; mobile 390 and desktop 1440. QA funding/storage only.",
  );
} catch (error) {
  for (const [index, context] of (browser?.contexts() ?? []).entries())
    for (const page of context.pages())
      await page
        .screenshot({
          path: path.join(artifacts, `failure-${index}.png`),
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
