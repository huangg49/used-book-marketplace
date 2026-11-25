// Expo web regression against the real API and a disposable Mongo QA database.
// Export to .tmp/rn-commission-dist with EXPO_PUBLIC_API_BASE_URL_WEB=http://127.0.0.1:3009/api/v1 first.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createTestApi, password, root } from "../apps/admin-web/tests/test-api.mjs";

const require = createRequire(new URL("../apps/admin-web/package.json", import.meta.url));
const { chromium, expect } = require("playwright/test");
const origin = "http://127.0.0.1:8087";
const dist = path.join(root, ".tmp/rn-commission-dist");
const artifacts = path.join(root, "apps/mobile-react-native/test-results/seller-commission");
const button = (page, name) => page.getByRole("button", { name, exact: true });
const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
let fixture, server, browser;

try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 1 });
  const { api, member: seller, catalogId, listings: [listingId] } = fixture;
  const buyer = await api("/auth/login", null, { email: "admin@operations.test", password });
  const catalog = await api(`/operations/catalog-requests/${catalogId}`, buyer.accessToken);
  await api(`/operations/catalog-requests/${catalogId}/decision`, buyer.accessToken, {
    expectedVersion: catalog.version, revisionId: catalog.currentRevision.id, decision: "Confirm",
  });
  const approve = async () => {
    const listing = await api(`/operations/listings/${listingId}`, buyer.accessToken);
    await api(`/operations/listings/${listingId}/decision`, buyer.accessToken, {
      expectedVersion: listing.version, revisionId: listing.currentRevision.id, decision: "Approve",
      checklist: {
        catalogMatches: true, photosClear: true, conditionDisclosed: true,
        readable: true, pricingValid: true, contentAppropriate: true,
      },
    });
  };
  const addAddress = (actor, localityCode) => api("/me/addresses", actor.accessToken, {
    expectedBookVersion: 0, makeDefault: true,
    address: {
      recipientName: "QA", phone: "0900000000", serviceAreaCode: "HCM-DEMO-v1",
      localityCode, detail: "Địa chỉ QA",
    },
  });
  await approve();
  const source = await addAddress(seller, "DEMO-A");
  const destination = await addAddress(buyer, "DEMO-B");
  const own = await api(`/me/listings/${listingId}`, seller.accessToken);
  await api(`/listings/${listingId}/revision`, seller.accessToken, {
    expectedVersion: own.version, ownershipDeclared: true,
    content: {
      ...own.currentRevision.content, salePrice: 200_000,
      fulfillment: { method: "DirectDelivery", originAddressId: source.addressId, originAddressVersion: 1 },
    },
  });
  await approve();
  const listing = await api(`/listings/${listingId}`, buyer.accessToken);
  const conversation = await api(`/listings/${listingId}/purchase-conversations`, buyer.accessToken, {
    expectedVersion: listing.version, intent: "Negotiation",
  });
  const roomPath = `/me/purchase-conversations/${conversation.entityId}`;
  const proposal = await api(roomPath + "/terms", buyer.accessToken, {
    expectedVersion: conversation.version, kind: "Price", amount: 180_000,
  });
  const latest = await api(roomPath, seller.accessToken);
  const agreed = await api(roomPath + "/terms/respond", seller.accessToken, {
    expectedVersion: proposal.version, proposalId: latest.terms.pendingProposal.id, accept: true,
  });
  const revision = { expectedListingVersion: listing.version, expectedListingRevisionId: listing.revisionId };
  const quote = await api(`/listings/${listingId}/quotes`, buyer.accessToken, {
    ...revision, method: "DirectDelivery", destinationAddressId: destination.addressId,
    expectedDestinationAddressVersion: 1,
  });
  await api(roomPath + "/quote", buyer.accessToken, {
    ...revision, expectedVersion: agreed.version, quoteId: quote.entityId, expectedQuoteVersion: quote.version,
  });
  await fixture.db.collection("login_attempts").deleteMany({});

  server = createServer(async (req, res) => {
    try {
      const route = decodeURIComponent(new URL(req.url, origin).pathname);
      let file = path.resolve(dist, "." + route);
      if (file !== dist && !file.startsWith(dist + path.sep)) return res.writeHead(403).end();
      file = file === dist ? path.join(dist, "index.html") : path.extname(file) ? file : file + ".html";
      const bytes = await readFile(file);
      res.writeHead(200, { "Content-Type": contentType[path.extname(file)] ?? "application/octet-stream" }).end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8087, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const enter = async (page, email) => {
    await page.goto(origin + "/account");
    await page.getByLabel("Email", { exact: true }).last().fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
    await button(page, "Đăng nhập").click();
    await button(page, "Sách của tôi").waitFor();
    await page.getByRole("button", { name: /^Tin nhắn/ }).click();
    await page.getByRole("button", { name: /^Hội thoại .+ với / }).click();
    await page.waitForURL((url) => url.pathname === "/conversation" && url.searchParams.get("id") === conversation.entityId);
  };
  const sellerPage = await browser.newPage({ viewport: { width: 320, height: 800 } });
  const buyerPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await enter(sellerPage, "member@operations.test");
  await enter(buyerPage, "admin@operations.test");
  await expect(button(buyerPage, "Tạo đơn cho người mua này")).toHaveCount(0);
  await buyerPage.getByRole("tab", { name: "Xem Hội thoại chat" }).click();
  await expect(button(buyerPage, "Tạo đơn hàng giữ sách ngay")).toHaveCount(0);
  const attempts = [];
  let holdRoomRead = false;
  await sellerPage.route(`**/api/v1${roomPath}`, (route) => {
    if (holdRoomRead) return route.abort("failed");
    return route.continue();
  });
  await sellerPage.route("**/api/v1/orders", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
    if (attempts.length === 1) {
      holdRoomRead = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      return route.abort("failed");
    }
    const response = await route.fetch();
    assert.equal(response.headers()["idempotency-replayed"], "true");
    holdRoomRead = false;
    return route.fulfill({ response });
  });

  await button(sellerPage, "Tạo đơn cho người mua này").click();
  const consent = sellerPage.getByRole("checkbox", { name: /^Tôi đồng ý.+5%/ });
  await expect(consent).not.toBeChecked();
  await expect(button(sellerPage, "Xác nhận tạo đơn")).toBeDisabled();
  const prices = sellerPage.getByRole("heading", { name: "Giá sách và phí hoa hồng" }).locator("..");
  await expect(prices.getByText("Giá bài đăng", { exact: true })).toBeVisible();
  await expect(prices.getByText("180.000 ₫", { exact: true })).toBeVisible();
  await expect(prices.getByText("−9.000 ₫", { exact: true })).toBeVisible();
  await expect(prices.getByText("171.000 ₫", { exact: true })).toBeVisible();
  await consent.click();
  await expect(button(sellerPage, "Xác nhận tạo đơn")).toBeEnabled();
  await sellerPage.screenshot({ path: path.join(artifacts, "sheet-320.png") });
  await button(sellerPage, "Hủy").click();
  assert.equal(attempts.length, 0);

  await sellerPage.getByRole("tab", { name: "Xem Hội thoại chat" }).click();
  await button(sellerPage, "Tạo đơn hàng giữ sách ngay").click();
  await expect(consent).not.toBeChecked();
  await expect(button(sellerPage, "Xác nhận tạo đơn")).toBeDisabled();
  await consent.click();
  await button(sellerPage, "Xác nhận tạo đơn").click();
  await expect(sellerPage.getByText(/Chưa xác nhận được đơn đã tạo/)).toBeVisible();
  await button(sellerPage, "Hủy").click();
  await sellerPage.getByRole("tab", { name: "Xem Phiếu thỏa thuận" }).click();
  await button(sellerPage, "Tạo đơn cho người mua này").click();
  await expect(button(sellerPage, "Thử lại tạo đơn")).toBeDisabled();
  await consent.click();
  await button(sellerPage, "Thử lại tạo đơn").click();
  await expect(sellerPage.getByText(/Bạn đã tạo đơn cho người mua này/)).toBeVisible();
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(JSON.parse(attempts[0].body).agreedBookPrice, 180_000);
  const created = await api(roomPath, buyer.accessToken);
  assert.equal(created.status, "OrderCreated");
  const orders = fixture.db.collection("direct_orders");
  assert.equal(await orders.countDocuments({ buyerId: buyer.user.id }), 1);
  assert.equal((await orders.findOne({ buyerId: buyer.user.id }))._id, created.orderId);
  const order = await api(`/me/orders/${created.orderId}`, buyer.accessToken);
  assert.equal(order.amounts.bookPrice, 180_000);
  assert.equal(order.amounts.commission, 9_000);
  console.log("PASS Expo web 320/390: brokered seller order commission, both entries, buyer visibility and original command replay on Mongo QA.");
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await fixture?.close();
}
