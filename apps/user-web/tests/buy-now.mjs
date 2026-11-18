// Real HTTP/Mongo and two browser sessions; QA-only accounts/storage/funding.
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
const { values: { "checkout-only": checkoutOnly, "demo-completion": demoCompletion, "receipt-review": receiptReview, "listed-confirm": listedConfirm, "direct-journey": directJourney, "direct-journey-issue": directJourneyIssue, "direct-journey-race": directJourneyRace } } = parseArgs({
  options: {
    "checkout-only": { type: "boolean", default: false },
    "demo-completion": { type: "boolean", default: false },
    "receipt-review": { type: "boolean", default: false },
    "listed-confirm": { type: "boolean", default: false },
    "direct-journey": { type: "boolean", default: false },
    "direct-journey-issue": { type: "boolean", default: false },
    "direct-journey-race": { type: "boolean", default: false },
  },
});
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
  LOCAL_DEMO_COMPLETION_ENABLED: 'false',
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
const evidenceObjects = new Map();
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 1, ...(directJourneyIssue ? {
    evidenceStorageAdapter: {
      async check() {},
      async put(key, bytes) { evidenceObjects.set(key, bytes); },
      async attachment(key) {
        assert(evidenceObjects.has(key), "A private attachment must be pinned before reading");
        return { url: "https://storage.qa.invalid/attachment", expiresAt: new Date(Date.now() + 120000).toISOString() };
      },
    },
  } : {}) });
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
  if (!listedConfirm) await fundBuyer(50000);
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
  const go = (page, url) => page.evaluate(async (target) => {
    const { router } = await import("/src/app/router.tsx");
    await router.navigate(target);
  }, url);
  await login(buyerPage, "admin@operations.test");
  await buyerPage.locator(`a[href="/books/${listingId}"]`).first().click();
  if (listedConfirm || directJourney || directJourneyIssue || directJourneyRace) {
    const listedBook = await fixture.api(`/listings/${listingId}`, buyer.accessToken);
    await buyerPage.getByRole("button", { name: "Chat với người bán", exact: true }).click();
    await buyerPage.waitForURL(/\/chat\/[a-f0-9-]{36}\?openChat=1$/);
    const roomPath = new URL(buyerPage.url()).pathname;
    await buyerPage.locator("dialog[open] #chat-message").waitFor();
    await buyerPage.keyboard.press("Escape");
    await buyerPage.getByText("Giá mua ngay", { exact: true }).waitFor();

    await login(sellerPage, seller.user.email);
    await go(sellerPage, roomPath);
    await sellerPage.getByText("Chờ người mua xác nhận giá", { exact: true }).waitFor();
    const createOrder = sellerPage.getByRole("button", { name: "Tạo đơn cho người mua này", exact: true });
    assert.equal(await createOrder.count(), 0);

    await go(buyerPage, `/books/${listingId}`);
    await buyerPage.getByRole("link", { name: "Mua ngay", exact: true }).click();
    await buyerPage.waitForURL(`${origin}${roomPath}?buyNow=1`);
    const delivery = buyerPage.getByRole("dialog", { name: "Địa chỉ nhận sách" });
    await delivery.getByLabel("Họ tên", { exact: true }).fill("QA buyer");
    await delivery.getByLabel("Số điện thoại", { exact: true }).fill("0900654321");
    await delivery.getByLabel(/Khu vực luân chuyển sách/).selectOption("DEMO-C");
    await delivery.getByLabel("Địa chỉ chi tiết", { exact: true }).fill("QA destination, simulated only");
    const quoteWrites = [];
    await buyerPage.route("**/api/v1/me/purchase-conversations/*/quote", async (route) => {
      const request = route.request();
      const response = await route.fetch();
      quoteWrites.push({ key: request.headers()["idempotency-key"], body: request.postDataJSON() });
      if (quoteWrites.length === 1) return route.fulfill({ status: 503, json: {} });
      await route.fulfill({ response });
    });
    await delivery.getByRole("button", { name: "Xác nhận giá & đính kèm báo giá", exact: true }).click();
    await delivery.getByRole("button", { name: "Thử lại gửi báo giá", exact: true }).click();
    await delivery.waitFor({ state: "hidden" });
    assert.equal(quoteWrites.length, 2);
    assert.deepEqual(quoteWrites[0], quoteWrites[1]);
    assert.equal(quoteWrites[0].body.acceptedListedPrice, listedBook.salePrice);
    await createOrder.waitFor();
    assert.equal(await buyerPage.locator("summary").filter({ hasText: /đề nghị giá|đề nghị mức giá/i }).count(), 0);
    assert.equal(await sellerPage.locator("summary").filter({ hasText: /đề nghị giá|đề nghị mức giá/i }).count(), 0);
    await createOrder.click();
    const orderDialog = sellerPage.getByRole("dialog", { name: "Tạo đơn cho người mua" });
    const price = orderDialog.getByLabel("Giá sách đã thỏa thuận (₫)");
    assert.equal(await price.inputValue(), String(listedBook.salePrice));
    assert.equal(await price.getAttribute("readonly") !== null, true);
    await orderDialog.getByRole("button", { name: "Tạo đơn cho người mua này", exact: true }).click();
    await orderDialog.waitFor({ state: "hidden" });
    const savedRoom = await fixture.api(`/me/purchase-conversations/${roomPath.split("/").at(-1)}`, seller.accessToken);
    const order = await fixture.api(`/me/orders/${savedRoom.orderId}`, buyer.accessToken);
    assert.equal(order.state, "AwaitingPayment");
    assert.equal(order.amounts.bookPrice, listedBook.salePrice);
    assert.equal(order.purchaseMode, "BuyNow");
    if (directJourney || directJourneyIssue || directJourneyRace) {
      await fundBuyer(order.amounts.buyerTotal);
      const orderUrl = `/me/orders/${order.id}`;
      const currentOrder = (token = buyer.accessToken) => fixture.api(orderUrl, token);
      const walletAtStart = await fixture.api("/me/wallet", seller.accessToken);
      const advance = (token, action, expectedVersion, key = randomUUID(), description) =>
        fetch(`${base}/orders/${order.id}/delivery-journey`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
          body: JSON.stringify({ action, expectedVersion, ...(description ? { description } : {}) }),
        });
      await buyerPage.getByRole("button", { name: /^Thanh toán ngay/ }).click();
      await sellerPage.getByText("Chờ người mua thanh toán", { exact: true }).waitFor({ state: "hidden" });
      assert.equal((await currentOrder()).state, "Preparing");
      assert.equal((await currentOrder(seller.accessToken)).sellerAcceptanceEnabled, false);
      await sellerPage.getByRole("button", { name: "Xác nhận gửi sách", exact: true }).click();
      const shipmentDialog = sellerPage.getByRole("dialog", { name: "Xác nhận gửi sách" });
      await shipmentDialog.getByRole("button", { name: "Xác nhận gửi sách", exact: true }).click();
      await shipmentDialog.waitFor({ state: "hidden" });
      assert.equal((await advance(buyer.accessToken, "Pickup", 3)).status, 403);
      fixture.setDirectOrderJourneyDemo(true);
      assert.equal((await advance(seller.accessToken, "Pickup", 3)).status, 404);
      assert.equal((await advance(buyer.accessToken, "Deliver", 3)).status, 409);
      await buyerPage.getByRole("link", { name: "Mở Driver Simulator · Demo" }).click();
      for (const action of ["Xác nhận lấy kiện", "Bắt đầu đi giao", "Giao thành công"]) {
        await buyerPage.getByRole("button", { name: action, exact: true }).click();
        await buyerPage.getByRole("button", { name: "Ghi nhận mốc giao hàng", exact: true }).click();
        await buyerPage.getByRole("dialog").waitFor({ state: "hidden" });
        if (action === "Bắt đầu đi giao") {
          await buyerPage.getByRole("button", { name: "Giao thành công", exact: true }).waitFor();
          assert(await buyerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          await buyerPage.screenshot({ path: path.join(artifacts, "direct-order-driver-mobile.png"), fullPage: true });
        }
      }
      await buyerPage.getByRole("link", { name: "Quay lại đơn mua" }).click();
      const inspection = await currentOrder();
      assert.equal(inspection.state, "Inspection");
      assert.equal(inspection.moneyHeld, order.amounts.buyerTotal);
      assert.equal(new Date(inspection.inspectionDeadline) - new Date(inspection.deliveredAt), 72 * 3600000);
      if (directJourneyRace) {
        await buyerPage.getByRole("button", { name: "Tôi đã nhận được sách", exact: true }).click();
        await buyerPage.getByRole("button", { name: "Sách có vấn đề", exact: true }).waitFor();
        const [report, release] = await Promise.all([
          advance(buyer.accessToken, "ReportCondition", inspection.version, randomUUID(), "QA nhận được sách bị thiếu trang."),
          advance(buyer.accessToken, "SkipInspection", inspection.version),
        ]);
        assert.deepEqual([report.status, release.status].sort(), [200, 409]);
        const outcome = await currentOrder();
        const settlements = await fixture.db.collection("ledger_journals").countDocuments({ orderId: order.id, type: "OrderSettlement" });
        const sellerWallet = await fixture.api("/me/wallet", seller.accessToken);
        if (report.ok) {
          assert.equal(outcome.state, "ResolutionPending");
          assert.equal(outcome.deliveryJourney.issue.kind, "ReportCondition");
          assert.equal(outcome.moneyHeld, order.amounts.buyerTotal);
          assert.equal(settlements, 0);
          assert.equal(sellerWallet.available, walletAtStart.available);
        } else {
          assert.equal(outcome.state, "Completed");
          assert.equal(outcome.deliveryJourney.issue, null);
          assert.equal(settlements, 1);
          assert.equal(sellerWallet.available - walletAtStart.available, order.amounts.sellerProceedsOnCompletion);
        }
        console.log("PASS: A quality claim racing inspection skip produces exactly one permitted outcome.");
      } else if (directJourneyIssue) {
        await buyerPage.getByRole("button", { name: "Chưa nhận được sách", exact: true }).click();
        const complaint = buyerPage.getByRole("dialog", { name: "Chưa nhận được sách" });
        await complaint.getByLabel("Mô tả sự cố").fill("QA chưa nhận được kiện dù trạng thái đã giao.");
        await complaint.getByRole("button", { name: "Gửi báo cáo", exact: true }).click();
        await buyerPage.getByRole("heading", { name: "Đang xử lý sự cố" }).waitFor();
        const reported = await currentOrder();
        assert.equal(reported.state, "ResolutionPending");
        assert.equal(reported.deliveryJourney.issue.kind, "ReportNonReceipt");
        assert.equal(reported.moneyHeld, order.amounts.buyerTotal);
        assert.equal((await advance(buyer.accessToken, "SkipInspection", reported.version)).status, 409);
        assert.equal((await fixture.api("/me/wallet", seller.accessToken)).available, walletAtStart.available);
        await buyerPage.getByRole("link", { name: "Mở hồ sơ hỗ trợ" }).click();
        await buyerPage.waitForURL(`**/support/${reported.deliveryJourney.issue.supportCaseId}`);
        const sourceImage = createRequire(new URL("../../api/package.json", import.meta.url))("sharp");
        const proof = await sourceImage({ create: { width: 40, height: 40, channels: 3, background: "#d4bc9e" } }).png().toBuffer();
        await buyerPage.getByLabel("Chọn ảnh hoặc video").setInputFiles({ name: "qa-mo-kien.png", mimeType: "image/png", buffer: proof });
        await buyerPage.getByRole("button", { name: "Gửi bằng chứng", exact: true }).click();
        await buyerPage.getByText("Đã lưu bằng chứng vào hồ sơ.", { exact: true }).waitFor();
        const caseId = reported.deliveryJourney.issue.supportCaseId;
        const proofPath = `/support-cases/${caseId}/order-evidence`;
        const stored = await fixture.api(proofPath, buyer.accessToken);
        assert.equal(stored.items[0].status, "Ready");
        assert.equal(stored.packagingEvidenceIds.length, 1);
        assert(evidenceObjects.values().next().value.equals(proof));
        assert.equal((await fetch(base + proofPath, { headers: { Authorization: `Bearer ${seller.accessToken}` } })).status, 404);

        const reviewerId = randomUUID();
        await fixture.db.collection("users").insertOne({
          ...sellerDoc, _id: reviewerId, emailNormalized: "independent-order-reviewer@operations.test",
          roles: [{ role: "ADMIN", grantedAt: new Date() }],
        });
        const reviewer = await fixture.api("/auth/login", null, { email: "independent-order-reviewer@operations.test", password });
        assert.equal((await fetch(base + proofPath, { headers: { Authorization: `Bearer ${reviewer.accessToken}` } })).status, 404);
        const adminCase = await fixture.api(`/operations/support-cases/${caseId}`, reviewer.accessToken);
        await fixture.api(`/operations/support-cases/${caseId}/actions`, reviewer.accessToken,
          { action: "Assign", expectedVersion: adminCase.case.version, text: "Nhận phụ trách hồ sơ QA." });
        const adminEvidence = await fixture.api(proofPath, reviewer.accessToken);
        for (const id of [adminEvidence.items[0].id, adminEvidence.packagingEvidenceIds[0]]) {
          await fixture.api(`${proofPath}/${id}/read`, reviewer.accessToken, { reason: "Đối soát hồ sơ QA" });
        }
        assert.equal(await fixture.db.collection("audit_events").countDocuments({
          actorId: reviewerId, action: "readDirectOrderIssueEvidence", "after.caseId": caseId,
        }), 2);
        console.log("PASS: Delivered claim retains the full hold, blocks payout, uploads a private photo, and restricts evidence to the reporter and assigned admin.");
      } else {
        assert.equal((await advance(buyer.accessToken, "SkipInspection", inspection.version)).status, 409);
        await buyerPage.getByRole("button", { name: "Tôi đã nhận được sách", exact: true }).click();
        await buyerPage.getByRole("button", { name: "Tua hạn kiểm tra và giải ngân · Demo" }).click();
        let settledReplies = [];
        await buyerPage.route(`**/api/v1/orders/${order.id}/delivery-journey`, async route => {
          if (route.request().postDataJSON().action !== "SkipInspection") return route.continue();
          const responses = await Promise.all([route.fetch(), route.fetch()]);
          settledReplies = responses.map(response => [response.status(), response.headers()["idempotency-replayed"]]);
          await route.fulfill({ response: responses[0] });
        });
        await buyerPage.getByRole("button", { name: "Hoàn tất đơn demo", exact: true }).click();
        await buyerPage.getByRole("heading", { name: "Đơn hàng đã hoàn tất thành công" }).waitFor();
        assert.deepEqual(settledReplies.sort(), [[200, "false"], [200, "true"]]);
        await sellerPage.getByRole("link", { name: "Đối chiếu tiền bán trong ví" }).waitFor();
        assert(await sellerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await sellerPage.screenshot({ path: path.join(artifacts, "direct-order-completed-desktop.png"), fullPage: true });
        const completed = await currentOrder();
        assert.equal(completed.state, "Completed");
        assert.equal(completed.inspectionDeadline, inspection.inspectionDeadline);
        assert.equal(completed.moneyHeld, 0);
        assert.equal((await advance(buyer.accessToken, "SkipInspection", completed.version)).status, 409);
        assert.equal((await fixture.api("/me/wallet", seller.accessToken)).available - walletAtStart.available,
          order.amounts.sellerProceedsOnCompletion);
        assert.equal(await fixture.db.collection("ledger_journals").countDocuments({ orderId: order.id, type: "OrderSettlement" }), 1);
        console.log("PASS: Direct Driver records all three steps, acknowledgement gates inspection skip, and seller is credited once.");
      }
    }
    assert.deepEqual(errors, []);
    console.log("PASS: Chat opens the drawer, Mua ngay opens address, listed-price confirmation replays, seller creates one order at the confirmed price.");
  } else {
  await go(buyerPage, `/buy-now/${listingId}?legacy=1`);
  await buyerPage
    .getByRole("button", { name: "Chọn địa chỉ nhận sách", exact: true })
    .click();
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
  // A real wheel gesture must scroll the modal while global Lenis is active.
  // Programmatic scrollTo alone would miss Lenis swallowing the wheel event.
  await buyerPage.setViewportSize({ width: 390, height: 600 });
  const addressDialog = buyerPage.locator("dialog[open]");
  await addressDialog.evaluate(async (node) => {
    await Promise.all(node.getAnimations().map((animation) => animation.finished));
    node.scrollTop = 0;
  });
  assert(await addressDialog.evaluate((node) => node.scrollHeight > node.clientHeight));
  const backgroundScroll = await buyerPage.evaluate(() => window.scrollY);
  const dialogBounds = await addressDialog.boundingBox();
  await buyerPage.mouse.move(dialogBounds.x + 40, dialogBounds.y + 100);
  await buyerPage.mouse.wheel(0, 10000);
  await buyerPage.waitForFunction(() => {
    const dialog = document.querySelector("dialog[open]");
    return dialog.scrollTop > 0 && dialog.scrollTop + dialog.clientHeight >= dialog.scrollHeight - 2;
  });
  assert.equal(await buyerPage.evaluate(() => window.scrollY), backgroundScroll);
  assert(await buyerPage.getByRole("button", { name: "Xem tổng thanh toán", exact: true }).evaluate((node) => {
    const button = node.getBoundingClientRect();
    const dialog = node.closest("dialog").getBoundingClientRect();
    return button.top >= dialog.top && button.bottom <= dialog.bottom;
  }));
  await buyerPage.setViewportSize({ width: 390, height: 844 });
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
    .getByRole("button", { name: "Thử lại bước xác nhận địa chỉ", exact: true })
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
    .getByRole("button", { name: "Thử lại bước xác nhận địa chỉ", exact: true })
    .click();
  assert.equal(addressAttempts.length, 2);
  assert.deepEqual(addressAttempts[0], addressAttempts[1]);
  await buyerPage
    .getByRole("button", { name: "Đặt mua và đến thanh toán", exact: true })
    .waitFor();
  assert.equal(await buyerPage.locator("dialog[open]").count(), 0);
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
  await buyerPage.setViewportSize({ width: 1440, height: 900 });
  await buyerPage.screenshot({
    path: path.join(artifacts, "summary-desktop.png"),
    fullPage: true,
  });
  await buyerPage.setViewportSize({ width: 390, height: 844 });
  await buyerPage.screenshot({
    path: path.join(artifacts, "summary-mobile.png"),
    fullPage: true,
  });
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
    name: "Nội dung đơn hàng",
    exact: true,
  });
  await buyerOrderDetails.getByRole("heading", { name: "Phiếu đặt mua sách", exact: true }).waitFor();
  await buyerOrderDetails.getByText(order.item.metadata.title, { exact: true }).waitFor();
  await buyerOrderDetails.getByText("Chờ thanh toán", { exact: true }).waitFor();
  await buyerOrderDetails.locator('[aria-current="step"]')
    .filter({ hasText: "Thanh toán" }).waitFor();
  const captureProgress = async (state) => {
    const viewport = buyerPage.viewportSize();
    for (const width of [1440, 390]) {
      await buyerPage.setViewportSize({ width, height: 900 });
      await buyerOrderDetails.getByRole("navigation", { name: "Các bước mua sách" })
        .screenshot({ path: path.join(artifacts, `progress-${state}-${width}.png`) });
    }
    await buyerPage.setViewportSize(viewport);
  };
  await captureProgress("payment");
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
  assert.equal(order.amounts.shippingFee, 0);
  await buyerOrderDetails.getByText("Miễn phí", { exact: true }).waitFor();
  assert.equal(order.amounts.buyerTotal, 125000);
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
  await buyerOrderDetails.getByRole("button", { name: /^Thanh toán ngay 125\.000\s*₫$/ }).click();
  await buyerOrderDetails.getByRole("alert").filter({ hasText: "số dư ví" }).waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", buyer.accessToken)).transactionHeld,
    0,
  );
  await assertPublicState("Chờ thanh toán", "AwaitingPayment");
  assert.equal(await buyerOrderDetails.locator('[aria-current="step"]').innerText(), "2\nThanh toán");
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
  await buyerOrderDetails.getByRole("button", { name: /^Thanh toán ngay 125\.000\s*₫$/ }).click();
  await buyerOrderDetails
    .getByRole("button", { name: "Thử lại thanh toán", exact: true })
    .waitFor();
  await buyerOrderDetails
    .getByRole("button", { name: "Thử lại thanh toán", exact: true })
    .click();
  await buyerOrderDetails
    .getByRole("heading", { name: "Người bán đang chuẩn bị sách", exact: true })
    .waitFor();
  assert.equal(await buyerOrderDetails.locator('[aria-current="step"]').innerText(), "3\nGiao nhận");
  await captureProgress("preparing");
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
    .getByRole("heading", { name: "Người bán đang chuẩn bị sách", exact: true })
    .waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", buyer.accessToken)).transactionHeld,
    125000,
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
  // The scoped RN/session regression stops before any shipping/carrier command.
  // Full CI keeps the original fulfillment assertions when this flag is absent.
  if (!checkoutOnly) {
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
    name: "Nội dung đơn hàng",
    exact: true,
  });
  await sellerOrderDetails.getByText("Chuẩn bị và bàn giao sách", { exact: true }).waitFor();
  assert.equal(await sellerOrderDetails.locator('[aria-current="step"]').innerText(), "3\nGiao nhận");
  const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
  const bytes = await apiRequire("sharp")({
    create: { width: 300, height: 300, channels: 3, background: "#58685E" },
  })
    .png()
    .toBuffer();
  await sellerOrderDetails.getByRole("button", { name: "Xác nhận gửi sách", exact: true }).click();
  const shipmentDialog = sellerPage.getByRole("dialog");
  const photo = shipmentDialog.locator('input[type="file"]');
  const tracking = shipmentDialog.getByLabel("Mã vận đơn mô phỏng");
  await photo.waitFor({ state: "attached" });
  const originalInput = await photo.elementHandle();
  const nextShipmentRead = (status) =>
    sellerPage.waitForResponse(
      (response) =>
        response.url().endsWith(`/me/orders/${orderId}/shipment`) &&
        response.status() === status,
    );
  const [picker] = await Promise.all([
    sellerPage.waitForEvent("filechooser"),
    shipmentDialog.getByText("Đổi ảnh khác…", { exact: true }).click(),
  ]);
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
  await shipmentDialog.getByRole("button", { name: "Xác nhận gửi sách", exact: true }).click();
  await sellerOrderDetails.getByRole("heading", { name: "Đã đăng ký vận đơn giao sách" }).waitFor();
  await buyerOrderDetails.getByText(/Người bán đã đăng ký vận đơn/).waitFor();
  for (const details of [sellerOrderDetails, buyerOrderDetails]) {
    assert.equal(await details.locator('[aria-current="step"]').innerText(), "3\nGiao nhận");
  }
  await captureProgress("registered");
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
  if (demoCompletion) {
    const endpoint = `/orders/${orderId}/demo-completion`;
    const post = async (token, expectedVersion, key = randomUUID()) => fetch(base + endpoint, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ expectedVersion }),
    });
    assert.equal((await post(seller.accessToken, 3)).status, 403);
    assert.equal(await sellerOrderDetails.getByRole('button', { name: 'Hoàn tất và giải ngân sau 5 giây', exact: true }).count(), 0);
    fixture.setLocalDemoCompletion(true);
    assert.equal((await post(buyer.accessToken, 3)).status, 403);
    assert.equal((await post(operator.accessToken, 3)).status, 403);
    assert.equal((await post(seller.accessToken, 2)).status, 409);
    assert.equal((await fixture.api(`/me/orders/${orderId}`, seller.accessToken)).demoCompletionEnabled, true);
    // One server switch exposes the control on the ordinary URL, without UUID/query settings.
    await sellerPage.locator('a[href="/"]').first().click();
    const authorizedView = sellerPage.waitForResponse(response =>
      new URL(response.url()).pathname === `/api/v1/me/orders/${orderId}` &&
      response.request().method() === 'GET' && response.ok());
    await sellerPage.goBack();
    assert.equal((await (await authorizedView).json()).demoCompletionEnabled, true);
    await sellerOrderDetails.getByRole('heading', { name: 'Chờ bàn giao vận chuyển', exact: true }).waitFor();
    await sellerOrderDetails.getByRole('button', { name: 'Hoàn tất và giải ngân sau 5 giây', exact: true }).waitFor();
    const buyerBefore = await fixture.api('/me/wallet', buyer.accessToken);
    const sellerBefore = await fixture.api('/me/wallet', seller.accessToken);
    const posts = [];
    await sellerPage.route(`**/api/v1${endpoint}`, async route => {
      posts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      if (posts.length === 1) { await route.fetch(); await route.abort('failed'); }
      else await route.continue();
    });
    const urlBefore = sellerPage.url();
    await sellerOrderDetails.getByRole('button', { name: 'Hoàn tất và giải ngân sau 5 giây', exact: true }).click();
    await sellerOrderDetails.getByRole('button', { name: 'Thử lại hoàn tất demo', exact: true }).waitFor();
    // Another command key racing the durable job cannot schedule or settle twice.
    const raced = await Promise.all([post(seller.accessToken, 3), post(seller.accessToken, 4)]);
    assert.deepEqual(raced.map(r => r.status), [409, 409]);
    assert.equal((await post(seller.accessToken, 4, posts[0].key)).status, 409);
    await sellerOrderDetails.getByRole('button', { name: 'Thử lại hoàn tất demo', exact: true }).click();
    assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
    await sellerOrderDetails.locator('[aria-current="step"]').filter({ hasText: 'Hoàn tất' }).waitFor({ timeout: 20000 });
    await buyerOrderDetails.locator('[aria-current="step"]').filter({ hasText: 'Hoàn tất' }).waitFor({ timeout: 10000 });
    assert.equal(sellerPage.url(), urlBefore);
    const stored = await fixture.db.collection('direct_orders').findOne({ _id: orderId });
    const job = await fixture.db.collection('local_demo_order_completions').findOne({ _id: orderId });
    assert.equal(stored.state, 'Completed'); assert.equal(stored.version, 5);
    assert.equal(job.status, 'Completed'); assert.equal(job.dueAt - job.createdAt, 5000); assert(job.completedAt >= job.dueAt);
    const buyerAfter = await fixture.api('/me/wallet', buyer.accessToken);
    const sellerAfter = await fixture.api('/me/wallet', seller.accessToken);
    const completed = await fixture.api(`/me/orders/${orderId}`, seller.accessToken);
    assert.equal(buyerBefore.transactionHeld - buyerAfter.transactionHeld, completed.amounts.buyerTotal);
    assert.equal(completed.moneyHeld, 0);
    assert.equal(sellerAfter.available - sellerBefore.available, completed.amounts.sellerProceedsOnCompletion);
    assert.equal((await post(seller.accessToken, 3, posts[0].key)).status, 200);
    assert.equal(await fixture.db.collection('ledger_journals').countDocuments({ orderId, type: 'OrderSettlement' }), 1);
    assert.equal(await fixture.db.collection('local_demo_order_completions').countDocuments({ _id: orderId }), 1);
    for (const width of [1440, 390]) {
      await sellerPage.setViewportSize({ width, height: 900 });
      await sellerOrderDetails.locator('[aria-label="Tiến trình thủ tục đơn hàng"]')
        .screenshot({ path: path.join(artifacts, `settled-demo-${width}.png`) });
    }
    const sellerSession = JSON.parse(Buffer.from(seller.accessToken.split('.')[1], 'base64url').toString()).sid;
    await fixture.db.collection('auth_sessions').updateOne({ _id: sellerSession }, { $set: { revokedAt: new Date() } });
    assert.equal((await post(seller.accessToken, 3, posts[0].key)).status, 401);
    // The fixture uses real immutable ledger entries; inspect all affected postings.
    const settlement = await fixture.db.collection('ledger_journals').findOne({ orderId, type: 'OrderSettlement' });
    const entries = await fixture.db.collection('ledger_entries').find({ journalId: settlement._id }).toArray();
    assert.equal(entries.reduce((n, e) => n + e.debit - e.credit, 0), 0);
    assert.equal(entries.length, 3);
    console.log('PASS local demo completion: real shared Completed Order, exact 5s due time, hold released, seller frozen proceeds credited, balanced one settlement; disabled/wrong owner/stale/replay/conflict/revoked and lost ACK recovery; 390/1440px.');
  } else {
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
  await buyerOrderDetails.getByRole("heading", { name: "Kiện hàng đang được giao", exact: true }).waitFor();
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
  if (receiptReview) {
    const before = await fixture.api('/me/wallet', buyer.accessToken);
    const endpoint = `/orders/${orderId}/confirm-receipt`;
    const posts = [];
    await buyerPage.route(`**/api/v1${endpoint}`, async route => {
      posts.push({ key: route.request().headers()['idempotency-key'], body: route.request().postData() });
      if (posts.length === 1) { await route.fetch(); await route.abort('failed'); }
      else await route.continue();
    });
    await buyerOrderDetails.getByRole('button', { name: 'Tôi đã nhận được sách', exact: true }).click();
    await buyerPage.getByRole('button', { name: 'Xác nhận đã nhận sách', exact: true }).click();
    await buyerOrderDetails.getByRole('button', { name: 'Thử lại xác nhận nhận sách', exact: true }).click();
    assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
    const read = await fixture.api(`/me/orders/${orderId}`, buyer.accessToken);
    assert.equal(read.state, 'Inspection'); assert.equal(read.moneyHeld, before.transactionHeld);
    assert.equal(await fixture.db.collection('direct_delivery_events').countDocuments({ orderId, source: 'BuyerReceived' }), 1);
    await buyerOrderDetails.getByRole('link', { name: 'Viết đánh giá', exact: true }).click();
    await buyerPage.waitForURL(url => url.pathname === '/reviews' && url.searchParams.get('transaction') === orderId);
    assert.equal(new URL(buyerPage.url()).searchParams.get('transaction'), orderId);
    await buyerPage.getByRole('button', { name: 'Viết đánh giá', exact: true }).click();
    await buyerPage.getByLabel('Nhận xét chi tiết (không bắt buộc)').fill('QA: đã nhận sách, đánh giá riêng trong thời gian kiểm tra.');
    await buyerPage.getByRole('button', { name: 'Lưu đánh giá', exact: true }).click();
    await buyerPage.getByText('QA: đã nhận sách, đánh giá riêng trong thời gian kiểm tra.', { exact: true }).waitFor();
    await buyerPage.getByText('Chờ công bố', { exact: true }).waitFor();
    const ownReview = await fixture.api(`/transactions/DirectOrder/${orderId}/reviews`, buyer.accessToken);
    const peerReview = await fixture.api(`/transactions/DirectOrder/${orderId}/reviews`, seller.accessToken);
    assert.equal(ownReview.awaitingCompletion, true); assert.equal(peerReview.partnerReview, null);
    assert.equal((await fixture.api('/me/wallet', buyer.accessToken)).transactionHeld, before.transactionHeld);
    for (const width of [1440, 390, 320]) {
      await buyerPage.setViewportSize({ width, height: 900 });
      assert(await buyerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await buyerPage.screenshot({ path: path.join(artifacts, `receipt-review-${width}.png`), fullPage: true });
    }
    console.log('PASS received → private review from ordinary order UI; lost ACK exact key/body, one receipt event, 72h Inspection and funds retained, partner blind; 1440/390/320, real API/Mongo with QA storage/funding/carrier.');
  }
  }
  }
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
  if (checkoutOnly) console.log("PASS buy-now checkout-only: quote/address/create/pay, lost ACK pinned key/body, single ledger hold/Order/notification, public state, chat focus after Back; no shipping/carrier commands.");
  else if (!demoCompletion) console.log(
    "PASS buy-now browser: listed price, quote does not reserve or open chat, create/pay lost ACK same-key/body replay, one OrderCreated room shared by buyer/seller with no negotiation/quote, underfunded no hold, paid Preparing without seller approval, durable notifications, file chooser/input/focus/draft retained across shipment polling and transient 503, real image upload/registration, independent simulated pickup InTransit; 390/1440. API/Mongo real, QA storage/payment/carrier only.",
  );
  }
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
