// Real HTTP/Mongo review transitions; local storage/wallet/carrier simulators.
// Historical Inspection rendering below uses an explicit response fixture only.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
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

const qa = new URL(process.env.MONGO_TEST_URL ?? "");
assert(
  qa.hostname === "127.0.0.1" &&
    qa.port === "57017" &&
    qa.pathname.endsWith("_test") &&
    qa.searchParams.get("replicaSet") === "rs-test",
);
const require = createRequire(
  new URL("../../admin-web/package.json", import.meta.url),
);
const webRequire = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:5184";
const artifacts = path.join(root, "apps/user-web/test-results/order-review");
Object.assign(process.env, {
  VITE_API_BASE_URL: base,
  AUTH_MAIL_PROVIDER: "local",
  PAYMENT_SIMULATOR_SECRET: "qa-only-order-review-funding-00000000000",
});
let fixture, browser, server;
const errors = [];
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 2 });
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
  const address = (actor, localityCode) =>
    api("/me/addresses", actor.accessToken, {
      expectedBookVersion: 0,
      makeDefault: true,
      address: {
        recipientName: "Synthetic QA",
        phone: "0900123456",
        serviceAreaCode: "HCM-DEMO-v1",
        localityCode,
        detail: "Synthetic QA only",
      },
    });
  const source = await address(seller, "DEMO-A"),
    destination = await address(buyer, "DEMO-B");
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
  const template = await fixture.db
    .collection("users")
    .findOne({ _id: seller.user.id });
  await fixture.db.collection("users").insertOne({
    ...template,
    _id: randomUUID(),
    emailNormalized: "operator@order-review.test",
    roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
  });
  const operator = await api("/auth/login", null, {
    email: "operator@order-review.test",
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
  const createOrder = async (id) => {
    const l = await api(`/listings/${id}`, buyer.accessToken);
    const q = await api(`/listings/${id}/quotes`, buyer.accessToken, {
      expectedListingVersion: l.version,
      expectedListingRevisionId: l.revisionId,
      destinationAddressId: destination.addressId,
      expectedDestinationAddressVersion: 1,
      method: "DirectDelivery",
    });
    const order = await api("/orders/buy-now", buyer.accessToken, {
      quoteId: q.entityId,
      expectedQuoteVersion: 1,
      expectedListingVersion: l.version,
      expectedListingRevisionId: l.revisionId,
    });
    await api(`/orders/${order.entityId}/pay`, buyer.accessToken, {
      expectedVersion: 1,
    });
    return order.entityId;
  };
  const pickupId = await createOrder(fixture.listings[0]),
    deliveryId = await createOrder(fixture.listings[1]);
  const evidence = await api(
    `/orders/${deliveryId}/packaging-evidence`,
    seller.accessToken,
    {
      expectedVersion: 3,
      mimeType: "image/png",
      byteSize: fixture.photo.length,
      sha256: createHash("sha256").update(fixture.photo).digest("hex"),
    },
  );
  await api(
    `/orders/${deliveryId}/packaging-evidence/${evidence.entityId}/content`,
    seller.accessToken,
    fixture.photo,
    "PUT",
    { "Content-Type": "image/png" },
  );
  const trackingCode = "LL-ORDERREVIEW20261102";
  const shipment = await api(
    `/orders/${deliveryId}/shipment`,
    seller.accessToken,
    {
      expectedOrderVersion: 3,
      carrier: "LatLaiSimulator",
      trackingCode,
      packagingEvidenceIds: [evidence.entityId],
    },
  );
  const eventId = randomUUID();
  await api(
    "/operations/simulator/pickup-events",
    operator.accessToken,
    {
      eventId,
      shipmentId: shipment.entityId,
      orderId: deliveryId,
      carrier: "LatLaiSimulator",
      trackingCode,
      type: "PickedUp",
      occurredAt: new Date().toISOString(),
    },
    "POST",
    { "Idempotency-Key": eventId },
  );
  await fixture.openDirectOrderReview(pickupId, "pickup");
  await fixture.openDirectOrderReview(deliveryId, "delivery");
  const pickup = await api(`/me/orders/${pickupId}`, buyer.accessToken),
    delivery = await api(`/me/orders/${deliveryId}`, buyer.accessToken);
  assert.equal(pickup.state, "ResolutionPending");
  assert.equal(
    pickup.preparation.pickupReview.reason,
    "PickupDeadlineExceeded",
  );
  assert.equal(pickup.carrierReview, null);
  assert.equal(pickup.deliveredAt, null);
  assert.equal(pickup.inspectionDeadline, null);
  assert.equal(delivery.state, "ResolutionPending");
  assert.equal(delivery.deliveryReview.reason, "DeliveryDeadlineExceeded");
  assert.equal(delivery.deliveredAt, null);
  assert.equal(delivery.inspectionDeadline, null);
  const walletBefore = await api("/me/wallet", buyer.accessToken);
  const { createServer } = await import(
    pathToFileURL(webRequire.resolve("vite")).href
  );
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5184, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    origin + "/login?returnUrl=" + encodeURIComponent(`/orders/${pickupId}`),
  );
  await page.getByLabel(/^Email/).fill("admin@operations.test");
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const navigate = async (id) =>
    page.evaluate(async (value) => {
      const { router } = await import("/src/app/router.tsx");
      await router.navigate(`/orders/${value}`);
    }, id);
  const region = page.getByRole("region", {
    name: "Chi tiết đơn hàng",
    exact: true,
  });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await navigate(pickupId);
    const pickupHeading = region.getByRole("heading", {
      name: "Đang xác minh bàn giao vận chuyển",
      exact: true,
    });
    await pickupHeading.waitFor();
    await pickupHeading.scrollIntoViewIfNeeded();
    assert.equal(
      await region
        .getByText(
          /Sách đã được giao đến nơi|Chính sách 72h|quy trình kiểm định hàng trong 72h/,
        )
        .count(),
      0,
    );
    await region
      .getByText(/Chưa có đủ xác nhận sách đã đến người mua/)
      .waitFor();
    await page.screenshot({
      path: path.join(artifacts, `pickup-review-${width}.png`),
      fullPage: true,
    });
    await navigate(deliveryId);
    const deliveryHeading = region.getByRole("heading", {
      name: "Đang xác minh giao hàng quá hạn",
      exact: true,
    });
    await deliveryHeading.waitFor();
    await deliveryHeading.scrollIntoViewIfNeeded();
    assert.equal(
      await deliveryHeading.locator("..").evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          node.scrollWidth <= node.clientWidth + 1
        );
      }),
      true,
      "Review copy must fit its visible panel, not merely the document",
    );
    await region.getByText(/Hạn giao hàng đã ghi nhận:/).waitFor();
    assert.equal(
      await region
        .getByText(/Sách đã được giao đến nơi|Chính sách 72h/)
        .count(),
      0,
    );
    assert.equal(
      await region.getByRole("button", { name: /Xác nhận.*nhận sách/ }).count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "No document horizontal overflow",
    );
    await page.screenshot({
      path: path.join(artifacts, `delivery-review-${width}.png`),
      fullPage: true,
    });
  }
  // A recorded historical state is display evidence, never gate/fulfillment PASS.
  await page.route(`**/api/v1/me/orders/${pickupId}`, (route) =>
    route.fulfill({
      json: {
        ...pickup,
        state: "Inspection",
        carrierReview: null,
        deliveredAt: pickup.serverTime,
        inspectionDeadline: pickup.serverTime,
      },
    }),
  );
  await navigate(pickupId);
  await region
    .getByRole("heading", {
      name: "Đã ghi nhận giao sách, chờ xử lý tiếp",
      exact: true,
    })
    .waitFor();
  await region
    .getByRole("heading", {
      name: "Đã ghi nhận giao sách, chờ xử lý tiếp",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await region
    .getByText(/Đơn chưa tự động giải ngân khi hết hạn kiểm tra/)
    .waitFor();
  await page.screenshot({
    path: path.join(artifacts, "historical-inspection-fixture-320.png"),
    fullPage: true,
  });
  assert.equal(
    (await api("/me/wallet", buyer.accessToken)).transactionHeld,
    walletBefore.transactionHeld,
  );
  assert.equal(
    await fixture.db
      .collection("ledger_journals")
      .countDocuments({ type: "OrderSettlement" }),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS web Order review: actual overdue pickup/delivery, API reasons/deadline preserved, honest next-step/hold copy, 1440/390/320, no completion controls or payout. Inspection rendering uses response fixture; no fulfillment/human acceptance.",
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages())
      await page
        .screenshot({
          path: path.join(artifacts, "failure.png"),
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
