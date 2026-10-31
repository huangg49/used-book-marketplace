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
  PAYMENT_SIMULATOR_SECRET: "qa-only-buy-now-order-funding-000000000000",
  AUTH_MAIL_PROVIDER: "local",
});
const artifacts = path.join(root, "apps/user-web/test-results/buy-now");
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
      localityCode: "DEMO-B",
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
  const login = async (page, email) => {
    await page.goto(origin + "/login");
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Mật khẩu/).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(origin + "/");
  };
  await login(buyerPage, "admin@operations.test");
  await buyerPage.locator(`a[href="/books/${listingId}"]`).first().click();
  await buyerPage.getByRole("link", { name: "Mua ngay", exact: true }).click();
  await buyerPage.getByLabel("Họ tên", { exact: true }).fill("QA buyer");
  await buyerPage
    .getByLabel("Số điện thoại", { exact: true })
    .fill("0900654321");
  await buyerPage.getByLabel(/Khu vực luân chuyển sách/).selectOption("DEMO-C");
  await buyerPage
    .getByLabel("Địa chỉ chi tiết", { exact: true })
    .fill("QA destination, simulated only");
  // Close/reopen preserves input; native dialog restores focus and contains Tab.
  await buyerPage.getByRole("dialog").waitFor();
  await buyerPage.keyboard.press("Escape");
  assert.equal(await buyerPage.locator("dialog[open]").count(), 0);
  await buyerPage
    .getByRole("button", { name: "Chọn địa chỉ nhận sách", exact: true })
    .click();
  assert.equal(
    await buyerPage.getByLabel("Họ tên", { exact: true }).inputValue(),
    "QA buyer",
  );
  await buyerPage
    .getByRole("button", { name: "Đóng popup", exact: true })
    .click();
  assert.equal(
    await buyerPage
      .getByRole("button", { name: "Chọn địa chỉ nhận sách", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await buyerPage
    .getByRole("button", { name: "Chọn địa chỉ nhận sách", exact: true })
    .click();
  await buyerPage.locator("dialog[open]").waitFor();
  for (let i = 0; i < 12; i++) {
    await buyerPage.keyboard.press("Tab");
    assert(
      await buyerPage.evaluate(
        () => document.activeElement.closest("dialog[open]") !== null,
      ),
    );
  }
  await buyerPage.emulateMedia({ reducedMotion: "reduce" });
  const duration = await buyerPage
    .getByRole("dialog")
    .evaluate((node) => getComputedStyle(node).animationDuration);
  assert.equal(duration, "0.26s");
  await captureDialog(buyerPage, "address-mobile.png");
  await buyerPage.setViewportSize({ width: 1440, height: 900 });
  await captureDialog(buyerPage, "address-desktop.png");
  await buyerPage.setViewportSize({ width: 390, height: 844 });
  // The address response can be lost after commit: keep fields locked and replay.
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
  await buyerPage
    .getByRole("button", { name: "Xem tổng thanh toán", exact: true })
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
    .getByRole("button", { name: "Chọn địa chỉ nhận sách", exact: true })
    .click();
  await buyerPage
    .getByRole("button", { name: "Thử lại bước tính phí", exact: true })
    .click();
  assert.equal(addressAttempts.length, 2);
  assert.deepEqual(addressAttempts[0], addressAttempts[1]);
  await buyerPage
    .getByRole("button", { name: "Đặt mua và đến thanh toán", exact: true })
    .waitFor();
  assert.equal(
    await fixture.db
      .collection("purchase_conversations")
      .countDocuments({ listingId }),
    0,
  );
  assert.equal(
    (await fixture.db.collection("listings").findOne({ _id: listingId })).trade,
    "Available",
  );
  await buyerPage.evaluate(() =>
    window.scrollTo({ top: 0, behavior: "instant" }),
  );
  assert(
    await buyerPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await captureDialog(buyerPage, "checkout-mobile.png");
  await buyerPage.setViewportSize({ width: 1440, height: 900 });
  await captureDialog(buyerPage, "checkout-desktop.png");
  await buyerPage
    .getByRole("button", { name: "Đóng popup", exact: true })
    .click();
  await buyerPage.screenshot({
    path: path.join(artifacts, "summary-desktop.png"),
    fullPage: true,
  });
  await buyerPage.setViewportSize({ width: 390, height: 844 });
  await buyerPage.screenshot({
    path: path.join(artifacts, "summary-mobile.png"),
    fullPage: true,
  });
  await buyerPage
    .getByRole("button", { name: "Tiếp tục đặt mua", exact: true })
    .click();
  const createAttempts = [];
  let lostCreate = false;
  await buyerPage.route("**/api/v1/orders/buy-now", async (route) => {
    createAttempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (!lostCreate) {
      lostCreate = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await buyerPage
    .getByRole("button", { name: "Đặt mua và đến thanh toán", exact: true })
    .click();
  await buyerPage
    .getByRole("alert")
    .filter({ hasText: "Chưa xác nhận được kết quả" })
    .waitFor();
  const replayedCreate = buyerPage.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/orders/buy-now" &&
      response.request().method() === "POST" && response.ok(),
  );
  await buyerPage
    .getByRole("button", { name: "Thử lại cùng đơn mua", exact: true })
    .click();
  const createReceipt = await (await replayedCreate).json();
  assert.equal(createReceipt.entityType, "Order");
  const orderId = createReceipt.entityId;
  assert.match(orderId, /^[0-9a-f-]{36}$/);
  await buyerPage.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  assert.equal(createAttempts.length, 2);
  assert.deepEqual(createAttempts[0], createAttempts[1]);
  const order = await fixture.api(`/me/orders/${orderId}`, buyer.accessToken);
  assert.equal(order.id, orderId);
  assert.equal(order.contextId, createReceipt.contextId);
  assert.ok(order.conversationId);
  const conversationId = order.conversationId;
  assert.equal(new URL(buyerPage.url()).pathname, `/chat/${conversationId}`);
  const buyerOrderDetails = buyerPage.getByRole("region", {
    name: "Chi tiết đơn hàng",
    exact: true,
  });
  await buyerOrderDetails.getByText("Mua ngay", { exact: true }).waitFor();
  await buyerOrderDetails.getByRole("heading", {
    name: order.item.metadata.title, exact: true,
  }).waitFor();
  await buyerOrderDetails.getByText("Chờ thanh toán", { exact: true }).waitFor();
  const room = await fixture.api(`/me/purchase-conversations/${conversationId}`, buyer.accessToken);
  assert.equal(room.orderId, orderId);
  assert.equal(room.listingId, listingId);
  assert.equal(room.buyer.id, buyer.user.id);
  assert.equal(room.seller.id, seller.user.id);
  assert.equal(room.status, "OrderCreated");
  assert.equal(room.hasQuote, false);
  assert.equal(room.quotePreview, null);
  assert.equal(room.terms, null);
  assert.equal(order.purchaseMode, "BuyNow");
  assert.equal(order.amounts.bookPrice, 125000);
  assert.equal(order.amounts.buyerTotal, 155000);
  assert.equal(order.state, "AwaitingPayment");
  const observer = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const assertPublicState = async (label, status, screenshot) => {
    assert.equal(
      (await fixture.api(`/listings/${listingId}`)).purchaseAvailability.status,
      status,
    );
    await observer.goto(origin + "/");
    const card = observer
      .locator("article")
      .filter({ has: observer.locator(`a[href="/books/${listingId}"]`) })
      .first();
    await card.getByText(label, { exact: true }).waitFor();
    await card.locator(`a[href="/books/${listingId}"]`).first().click();
    await observer.getByText(label, { exact: true }).first().waitFor();
    if (status === "AwaitingPayment")
      assert.equal(
        await observer.getByText("Đang giao dịch", { exact: true }).count(),
        0,
      );
    if (screenshot)
      await observer.screenshot({
        path: path.join(artifacts, screenshot),
        fullPage: true,
      });
  };
  await assertPublicState(
    "Chờ thanh toán",
    "AwaitingPayment",
    "listing-unpaid-desktop.png",
  );
  assert.equal(
    await fixture.db
      .collection("direct_orders")
      .countDocuments({ buyerId: buyer.user.id }),
    1,
  );
  await buyerOrderDetails.getByRole("button", { name: /^Thanh toán ngay 155\.000\s*₫$/ }).click();
  await buyerOrderDetails.getByRole("alert").filter({ hasText: "số dư ví" }).waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", buyer.accessToken)).transactionHeld,
    0,
  );
  await assertPublicState("Chờ thanh toán", "AwaitingPayment");
  await fundBuyer(150000);
  const paymentAttempts = [];
  let lostPay = false;
  await buyerPage.route(`**/api/v1/orders/${orderId}/pay`, async (route) => {
    paymentAttempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (!lostPay) {
      lostPay = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await buyerOrderDetails.getByRole("button", { name: /^Thanh toán ngay 155\.000\s*₫$/ }).click();
  await buyerOrderDetails
    .getByRole("button", { name: "Thử lại thanh toán", exact: true })
    .waitFor();
  await buyerOrderDetails
    .getByRole("button", { name: "Thử lại thanh toán", exact: true })
    .click();
  await buyerOrderDetails
    .getByText("Người bán đang chuẩn bị gửi", { exact: true })
    .waitFor();
  assert.equal(paymentAttempts.length, 2);
  assert.deepEqual(paymentAttempts[0], paymentAttempts[1]);
  await assertPublicState(
    "Đang giao dịch",
    "InTransaction",
    "listing-paid-desktop.png",
  );
  await buyerPage.locator('a[href="/"]').first().click();
  await buyerPage
    .locator("article")
    .filter({ has: buyerPage.locator(`a[href="/books/${listingId}"]`) })
    .first()
    .getByText("Đang giao dịch", { exact: true })
    .waitFor();
  await buyerPage.goBack();
  await buyerPage.waitForURL(`**/chat/${conversationId}`);
  await buyerOrderDetails
    .getByText("Người bán đang chuẩn bị gửi", { exact: true })
    .waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", buyer.accessToken)).transactionHeld,
    155000,
  );
  assert.equal(
    await fixture.db
      .collection("ledger_journals")
      .countDocuments({ orderId, type: "OrderPayment" }),
    1,
  );
  assert.equal(
    await fixture.db
      .collection("member_notifications")
      .countDocuments({ targetId: orderId, kind: "OrderBuyNowPaid" }),
    2,
  );
  await login(sellerPage, "member@operations.test");
  await sellerPage
    .getByRole("button", { name: /^Tài khoản của .+$/, exact: true })
    .click();
  await sellerPage
    .getByRole("link", { name: "Đơn trực tiếp", exact: true })
    .click();
  const shipmentUrl = `**/api/v1/me/orders/${orderId}/shipment`;
  let shipmentUnavailable = false;
  await sellerPage.route(shipmentUrl, async (route) => {
    if (shipmentUnavailable) {
      shipmentUnavailable = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    } else {
      // Make each background read observable while the file chooser is open.
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({ response });
    }
  });
  await sellerPage.locator(`a[href="/chat/orders/${orderId}"]`).click();
  await sellerPage.waitForURL(`**/chat/${conversationId}`);
  const sellerOrderDetails = sellerPage.getByRole("region", {
    name: "Chi tiết đơn hàng",
    exact: true,
  });
  await sellerOrderDetails.getByText("Mua ngay", { exact: true }).waitFor();
  await sellerOrderDetails
    .getByText("Người bán đang chuẩn bị gửi", { exact: true })
    .waitFor();
  const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
  const bytes = await apiRequire("sharp")({
    create: { width: 300, height: 300, channels: 3, background: "#58685E" },
  })
    .png()
    .toBuffer();
  const photo = sellerPage.getByLabel("Ảnh đóng gói", { exact: true });
  const tracking = sellerPage.getByLabel("Mã vận đơn mô phỏng", {
    exact: true,
  });
  await photo.waitFor();
  const originalInput = await photo.elementHandle();
  const nextShipmentRead = (status) =>
    sellerPage.waitForResponse(
      (response) =>
        response.url().endsWith(`/me/orders/${orderId}/shipment`) &&
        response.status() === status,
    );
  const pickerOpened = sellerPage.waitForEvent("filechooser");
  await photo.click();
  const picker = await pickerOpened;
  await nextShipmentRead(404);
  assert(
    await originalInput.evaluate((input) => input.isConnected),
    "Polling must preserve the input while choosing a file",
  );
  await picker.setFiles({
    name: "qa-packaging.png",
    mimeType: "image/png",
    buffer: bytes,
  });
  await tracking.fill("LL-BUYNOWQA123");
  shipmentUnavailable = true;
  await nextShipmentRead(503);
  await sellerPage
    .getByRole("alert")
    .filter({ hasText: "Chưa tải được vận đơn" })
    .waitFor();
  assert(
    await originalInput.evaluate((input) => input.isConnected),
    "A background read failure must preserve the form",
  );
  assert.equal(
    await photo.evaluate((input) => input.files[0]?.name),
    "qa-packaging.png",
  );
  assert.equal(await tracking.inputValue(), "LL-BUYNOWQA123");
  assert(
    await tracking.evaluate((input) => document.activeElement === input),
    "Polling must preserve keyboard focus",
  );
  await nextShipmentRead(404);
  assert(await originalInput.evaluate((input) => input.isConnected));
  assert.equal(
    await photo.evaluate((input) => input.files[0]?.name),
    "qa-packaging.png",
  );
  await sellerPage
    .getByRole("button", { name: "Lưu ảnh đóng gói", exact: true })
    .click();
  await sellerPage
    .getByText("Ảnh đóng gói đã lưu: 1", { exact: true })
    .waitFor();
  await sellerPage
    .getByLabel("Mã vận đơn mô phỏng", { exact: true })
    .fill("LL-BUYNOWQA123");
  await sellerPage
    .getByRole("button", { name: "Đăng ký vận đơn", exact: true })
    .click();
  await sellerPage
    .getByText("Đã đăng ký vận đơn, đang chờ xác nhận bàn giao.")
    .waitFor();
  assert.equal(
    (await fixture.api(`/me/orders/${orderId}`, seller.accessToken)).state,
    "Preparing",
  );
  await sellerPage.evaluate(() =>
    window.scrollTo({ top: 0, behavior: "instant" }),
  );
  assert(
    await sellerPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await sellerPage.screenshot({
    path: path.join(artifacts, "seller-shipping-desktop.png"),
    fullPage: true,
  });
  const sellerTopup = await fixture.api("/me/topups", seller.accessToken, {
    amount: 50000,
  });
  await fixture.api(
    "/operations/simulator/topup-events",
    operator.accessToken,
    {
      eventId: randomUUID(),
      intentId: sellerTopup.entityId,
      recipientId: seller.user.id,
      amount: 50000,
      currency: "VND",
      outcome: "Succeeded",
      occurredAt: new Date().toISOString(),
    },
  );
  const shipment = await fixture.api(
    `/me/orders/${orderId}/shipment`,
    seller.accessToken,
  );
  const pickupEventId = randomUUID();
  await fixture.api(
    "/operations/simulator/pickup-events",
    operator.accessToken,
    {
      eventId: pickupEventId,
      shipmentId: shipment.id,
      orderId,
      type: "PickedUp",
      carrier: "LatLaiSimulator",
      trackingCode: shipment.trackingCode,
      occurredAt: new Date().toISOString(),
    },
    "POST",
    { "Idempotency-Key": pickupEventId },
  );
  await buyerOrderDetails.getByText("Đang giao", { exact: true }).waitFor();
  await buyerPage.evaluate(() =>
    window.scrollTo({ top: 0, behavior: "instant" }),
  );
  assert(
    await buyerPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await buyerPage.screenshot({
    path: path.join(artifacts, "buyer-in-transit-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await fixture.db
      .collection("purchase_conversations")
      .countDocuments({ listingId }),
    1,
  );
  assert.equal(
    (await fixture.db.collection("purchase_conversations").findOne({ orderId }))._id,
    conversationId,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS buy-now browser: listed price, quote does not reserve or open chat, create/pay lost ACK same-key/body replay, one OrderCreated room shared by buyer/seller with no negotiation/quote, underfunded no hold, paid Preparing without seller approval, durable notifications, file chooser/input/focus/draft retained across shipment polling and transient 503, real image upload/registration, independent simulated pickup InTransit; 390/1440. API/Mongo real, QA storage/payment/carrier only.",
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
