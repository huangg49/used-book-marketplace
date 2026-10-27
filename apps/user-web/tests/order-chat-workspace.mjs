// Browser-only fixtures: no application database, storage or real messages.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer as createHttpServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const requireBrowser = createRequire(path.join(root, "apps/admin-web/package.json"));
const requireWeb = createRequire(path.join(root, "apps/user-web/package.json"));
const requireApi = createRequire(path.join(root, "apps/api/package.json"));
const { chromium } = requireBrowser("playwright");
const { Server } = createRequire(requireApi.resolve("@nestjs/platform-socket.io"))("socket.io");
const { createServer } = await import(pathToFileURL(requireWeb.resolve("vite")).href);
const origin = "http://127.0.0.1:5196";
const apiOrigin = "http://127.0.0.1:5197";
const out = path.join(root, ".tmp/order-chat-workspace-qa");
await mkdir(out, { recursive: true });
const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = () => new Date().toISOString();
const future = () => new Date(Date.now() + 3600_000).toISOString();
const buyer = { id: id(1), displayName: "Bạn đọc QA" };
const seller = { id: id(2), displayName: "Người bán QA" };
const contact = (role) => ({
  recipientName: role === "Buyer" ? "Người nhận mô phỏng QA" : "Người gửi mô phỏng QA",
  phone: "0900000000", localityCode: "DEMO-A", detail: role === "Buyer" ? "Địa chỉ nhận riêng của đơn QA" : "Địa chỉ gửi riêng của đơn QA",
});
const makeOrder = (n, mode, state, linked) => ({
  id: id(n), conversationId: linked ? id(n + 10) : null, role: "Buyer", version: 1,
  state, purchaseMode: mode, paymentDeadline: future(), serverTime: now(), createdAt: now(),
  paymentEnabled: state === "AwaitingPayment", canCancel: state === "AwaitingPayment",
  amounts: { bookPrice: 75000, shippingFee: 20000, buyerTotal: 95000 },
  paidAt: state === "Preparing" ? now() : null, moneyHeld: state === "Preparing" ? 95000 : 0,
  shipmentRegistrationEnabled: state === "Preparing",
  preparation: state === "Preparing" ? { acceptedAt: now(), pickupDeadline: future() } : null,
  ownAddress: contact("Buyer"), shippingAddress: null,
  item: { listingId: id(n + 20), metadata: { title: `[QA] ${mode === "BuyNow" ? "Mua ngay — Bản sách đã ẩn khỏi kệ" : n === 12 ? "Cuốn sách thử hủy đơn" : "Đơn thương lượng đã thống nhất"}` }, condition: "Good", description: "Mô tả bản sách được lưu tại thời điểm đặt đơn QA.", coverNote: "Bìa có nếp gấp nhỏ — snapshot QA", pages: "Đủ trang — snapshot QA" },
});
const negotiated = makeOrder(10, "Negotiated", "AwaitingPayment", true);
const buyNow = makeOrder(11, "BuyNow", "Preparing", false);
const cancellable = makeOrder(12, "Negotiated", "AwaitingPayment", true);
const orders = new Map([negotiated, buyNow, cancellable].map((order) => [order.id, order]));
const makeRoom = (order) => ({
  id: id(Number(order.id.slice(-12)) + 10), listingId: order.item.listingId, buyer, seller,
  version: 3, status: "OrderCreated", expiresAt: null, hasQuote: false, quotePreview: null,
  orderId: order.id, createdAt: now(), closedAt: now(),
  terms: { mode: "Negotiation", pendingProposal: null, agreedPrice: order.amounts.bookPrice,
    agreedListingRevisionId: id(190), activeExchangeId: null, exchangeIds: [], locked: true },
});
const rooms = new Map([negotiated, cancellable].map((order) => {
  const room = makeRoom(order); return [room.id, room];
}));
const oldMessage = { id: id(301), conversationId: negotiated.conversationId, senderId: seller.id,
  body: "[QA] Tin nhắn cũ vẫn thuộc đúng đơn thương lượng.", sentAt: now() };
const messages = new Map([[negotiated.conversationId, [oldMessage]]]);
const events = new Map([[negotiated.conversationId, [{ id: id(302), conversationId: negotiated.conversationId,
  actorId: buyer.id, kind: "PriceAccepted", mode: null, amount: 75000, exchangeId: null, createdAt: now() }]]]);
const commands = { ensure: [], pay: [], cancel: [], shipment: [], message: [] };
const denied = new Set();
const detailFailures = new Map();
const shipmentFailures = new Map();
const historyFailures = new Set();
const evidence = new Map();
const shipments = new Map();
const issues = [];
let ensureLost = true, payLost = true, cancelLost = true, shipmentLost = true, messageLost = true;
let browser, vite, http, io;

const detail = (order, role) => ({ ...order, role,
  paymentEnabled: role === "Buyer" && order.state === "AwaitingPayment",
  canCancel: role === "Buyer" && order.state === "AwaitingPayment",
  shipmentRegistrationEnabled: role === "Seller" && order.state === "Preparing",
  ownAddress: contact(role), shippingAddress: role === "Seller" && order.preparation ? contact("Buyer") : null,
});
const receipt = (order) => ({ id: id(400), entityType: "Order", entityId: order.id, contextId: id(401),
  version: order.version, state: order.state, paymentDeadline: order.paymentDeadline, serverTime: now(),
  affectedListings: [{ id: order.item.listingId, version: order.version }] });
const record = (request) => ({ key: request.headers()["idempotency-key"], body: request.postData() });
const goto = (page, url) => page.evaluate(async (url) => {
  const { router } = await import("/src/app/router.tsx"); await router.navigate(url);
}, url);
const refresh = (page, key) => page.evaluate(async (key) => {
  const { queryClient } = await import("/src/lib/session.ts");
  await queryClient.invalidateQueries({ queryKey: [key] });
}, key);
const orderRegion = (page) => page.getByRole("region", { name: "Chi tiết đơn hàng", exact: true });
const paymentButton = (page) => orderRegion(page).getByRole("button", { name: "Thanh toán 95.000 ₫", exact: true });

try {
  http = createHttpServer();
  io = new Server(http, { cors: { origin: true } });
  io.of("/purchase-chat").on("connection", (socket) => {
    const actor = socket.handshake.auth.token === "fixture-seller" ? seller : buyer;
    socket.on("purchase:join", (roomId, ack) => { socket.join(roomId); ack({ ok: rooms.has(roomId) }); });
    socket.on("purchase:send", (input, ack) => {
      commands.message.push(structuredClone(input));
      const stored = messages.get(input.conversationId) ?? [];
      let message = stored.find((item) => item.id === input.messageId);
      if (!message) {
        message = { id: input.messageId, conversationId: input.conversationId,
          senderId: actor.id, body: input.body, sentAt: now() };
        stored.push(message); messages.set(input.conversationId, stored);
      }
      // The server committed the message, but the first response is unusable.
      if (messageLost) { messageLost = false; ack({}); return; }
      ack(message); io.of("/purchase-chat").to(input.conversationId).emit("purchase:message", message);
    });
  });
  await new Promise((resolve) => http.listen(5197, "127.0.0.1", resolve));
  vite = await createServer({ root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5196, strictPort: true },
    define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiOrigin + "/api/v1") } });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const makePage = async (actor) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) => issues.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("Maximum update depth exceeded"))
        issues.push(message.text());
    });
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request(), method = request.method();
      const url = new URL(request.url()), routePath = url.pathname.replace("/api/v1", "");
      const role = actor === "seller" ? "Seller" : "Buyer";
      const send = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (routePath === "/auth/login") return send({ accessToken: "fixture-" + actor,
        refreshToken: "q".repeat(43), expiresIn: 900,
        user: { ...(role === "Buyer" ? buyer : seller), email: actor + "@example.test", roles: ["MEMBER"], status: "ACTIVE" } });
      if (routePath === "/me/orders") return send({ items: [...orders.values()].map((order) => ({
        id: order.id, title: order.item.metadata.title, listingId: order.item.listingId,
        version: order.version, state: order.state, role, createdAt: order.createdAt,
      })), nextCursor: null });
      const match = routePath.match(/^\/me\/orders\/([^/]+)$/);
      if (match && orders.has(match[1])) {
        if (denied.has(actor + match[1])) return send({ code: "Forbidden", message: "QA access denied" }, 403);
        if (detailFailures.get(actor + match[1])) {
          detailFailures.set(actor + match[1], detailFailures.get(actor + match[1]) - 1);
          return send({ code: "Unavailable", message: "QA detail unavailable" }, 503);
        }
        return send(detail(orders.get(match[1]), role));
      }
      const ensure = routePath.match(/^\/orders\/([^/]+)\/conversation$/);
      if (ensure && orders.has(ensure[1])) {
        assert.equal(method, "POST"); commands.ensure.push(record(request));
        const order = orders.get(ensure[1]), room = makeRoom(order);
        rooms.set(room.id, room); order.conversationId = room.id;
        if (ensureLost) { ensureLost = false; return send({ code: "Unavailable", message: "QA committed ensure lost response" }, 503); }
        return send({ entityId: room.id }, 201);
      }
      const payment = routePath.match(/^\/orders\/([^/]+)\/pay$/);
      if (payment) {
        commands.pay.push(record(request)); const order = orders.get(payment[1]);
        order.state = "Preparing"; order.version = 2; order.paidAt ??= now(); order.moneyHeld = 95000;
        order.preparation ??= { acceptedAt: now(), pickupDeadline: future() };
        if (payLost) { payLost = false; return send({ code: "Unavailable", message: "QA committed payment lost response" }, 503); }
        return send(receipt(order));
      }
      const cancellation = routePath.match(/^\/orders\/([^/]+)\/cancel$/);
      if (cancellation) {
        commands.cancel.push(record(request)); const order = orders.get(cancellation[1]);
        order.state = "Cancelled"; order.version = 2;
        if (cancelLost) { cancelLost = false; return send({ code: "Unavailable", message: "QA committed cancel lost response" }, 503); }
        return send(receipt(order));
      }
      const shipment = routePath.match(/^\/(me\/)?orders\/([^/]+)\/shipment$/);
      if (shipment) {
        const orderId = shipment[2];
        if (method === "GET") {
          if (shipmentFailures.get(orderId)) { shipmentFailures.set(orderId, shipmentFailures.get(orderId) - 1); return send({ code: "Unavailable", message: "QA transient shipping outage" }, 503); }
          return shipments.has(orderId) ? send(shipments.get(orderId)) : send({ code: "NotFound", message: "QA no shipment" }, 404);
        }
        commands.shipment.push(record(request));
        const body = JSON.parse(request.postData());
        shipments.set(orderId, { trackingCode: body.trackingCode, pickupConfirmed: false, state: "Registered" });
        if (shipmentLost) { shipmentLost = false; return send({ code: "Unavailable", message: "QA committed shipment lost response" }, 503); }
        return send({ entityId: id(600) });
      }
      const packing = routePath.match(/^\/(me\/)?orders\/([^/]+)\/packaging-evidence(?:\/([^/]+)\/content)?$/);
      if (packing) {
        if (method === "GET") return send({ items: evidence.get(packing[2]) ?? [] });
        evidence.set(packing[2], [{ id: id(601), status: method === "PUT" ? "Ready" : "Pending" }]);
        return send({ entityId: id(601) });
      }
      if (routePath === "/me/purchase-conversations") return send([...rooms.values()]);
      const roomMatch = routePath.match(/^\/me\/purchase-conversations\/([^/]+)(?:\/(messages|events))?$/);
      if (roomMatch && rooms.has(roomMatch[1])) {
        if (roomMatch[2] === "messages") return historyFailures.has(roomMatch[1])
          ? send({ code: "Unavailable", message: "QA history unavailable" }, 503)
          : send(messages.get(roomMatch[1]) ?? []);
        if (roomMatch[2] === "events") return send(events.get(roomMatch[1]) ?? []);
        return send(rooms.get(roomMatch[1]));
      }
      if (routePath.startsWith("/listings/")) {
        const order = [...orders.values()].find((item) => item.item.listingId === routePath.split("/")[2]);
        if (order?.id === buyNow.id) return send({ code: "NotFound", message: "QA archived public listing" }, 404);
        if (order) return send({ id: order.item.listingId, revisionId: id(190), version: 2,
          book: { id: id(191), title: "[QA] Tên bài đăng đã đổi sau khi đặt đơn", authors: ["Tác giả QA"], publisher: null, publicationYear: null,
            language: "vi", edition: null, category: "Văn học", isbn: null },
          mode: "Both", condition: "Good", pages: "Đủ trang", coverNote: "Bìa tốt", notes: "Không", accessories: "Không",
          readable: true, hasMissingPages: false, missingEssentialContent: false,
          description: "Bài đăng mô phỏng QA", salePrice: 75000, exchangeValue: 75000,
          seller, photos: [], publishedAt: now(), fulfillment: { serviceAreaCode: "HCM-DEMO-v1", name: "TP.HCM", demoOnly: true, method: "DirectDelivery" },
          purchaseAvailability: { status: "Available", expiresAt: null } });
      }
      if (routePath === "/exchanges") return send({ items: [], nextCursor: null });
      if (routePath.includes("notifications")) return send({ items: [], nextCursor: null, unreadCount: 0 });
      if (routePath === "/service-areas") return send({ code: "HCM-DEMO-v1", localities: [{ code: "DEMO-A", label: "TP.HCM" }] });
      issues.push(`Unexpected fixture route ${method} ${routePath}`);
      return send({ code: "NotFound", message: "QA unhandled route" }, 404);
    });
    await page.goto(origin + "/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.evaluate(async (actor) => {
      const { session } = await import("/src/lib/session.ts");
      await session.login({ email: actor + "@example.test", password: "fixture-only" });
    }, actor);
    await page.evaluate(() => {
      const label = document.createElement("div"); label.textContent = "QA • DỮ LIỆU MÔ PHỎNG";
      Object.assign(label.style, { position: "fixed", left: "8px", bottom: "8px", zIndex: "99999", pointerEvents: "none",
        background: "#fffcf5", color: "#5c0202", padding: "4px 8px", border: "1px solid #5c0202", font: "11px sans-serif" });
      document.body.append(label);
    });
    return page;
  };

  const b = await makePage("buyer");
  await goto(b, "/orders");
  await b.getByRole("heading", { name: "Đơn hàng của tôi", exact: true }).waitFor();
  await b.locator(`a[href="/chat/orders/${negotiated.id}"]`).click();
  await b.waitForURL(`**/chat/${negotiated.conversationId}`);
  const br = orderRegion(b);
  await br.getByText("Địa chỉ nhận riêng của đơn QA", { exact: false }).waitFor();
  assert.equal(commands.ensure.length, 0, "linked order skips creation and selects its exact room");
  await b.getByRole("heading", { name: negotiated.item.metadata.title, level: 1, exact: true }).waitFor();
  assert.equal(await b.getByRole("heading", { name: "[QA] Tên bài đăng đã đổi sau khi đặt đơn", level: 1 }).count(), 0, "private order snapshot wins over edited public listing");
  await b.getByText(oldMessage.body, { exact: true }).waitFor();
  await b.getByRole("region", { name: "Lịch sử thỏa thuận", exact: true }).getByText("chấp nhận giá 75.000 ₫.", { exact: false }).waitFor();
  assert.equal(await br.getByRole("button", { name: "Đăng ký vận đơn", exact: true }).count(), 0);
  await b.screenshot({ path: path.join(out, "buyer-negotiated-desktop.png"), fullPage: true });

  await b.locator("#chat-message").fill("[QA] Tin nhắn chỉ gửi đúng một lần.");
  await b.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
  await b.getByRole("button", { name: "Thử gửi lại", exact: true }).waitFor();
  assert.equal(await b.locator("#chat-message").inputValue(), "[QA] Tin nhắn chỉ gửi đúng một lần.");
  await b.getByRole("button", { name: "Thử gửi lại", exact: true }).click();
  await b.waitForFunction(() => document.getElementById("chat-message").value === "");
  assert.deepEqual(commands.message[0], commands.message[1]);
  assert.equal(messages.get(negotiated.conversationId).length, 2, "message id dedupes committed retry");

  await paymentButton(b).click();
  await br.getByRole("button", { name: "Thử lại cùng thanh toán", exact: true }).waitFor();
  await refresh(b, "direct-order");
  await b.setViewportSize({ width: 390, height: 844 });
  await b.evaluate(() => document.documentElement.style.fontSize = "130%");
  await b.getByRole("button", { name: "Hội thoại", exact: true }).click();
  await b.locator("#chat-message").fill("[QA] Bản nháp giữ khi đổi tab đơn hàng.");
  await b.getByRole("button", { name: "Đơn hàng", exact: true }).click();
  await br.getByRole("button", { name: "Thử lại cùng thanh toán", exact: true }).click();
  assert.deepEqual(commands.pay[0], commands.pay[1], "payment keeps original version/key/body after committed lost reply and mobile tabs");
  await b.getByRole("button", { name: "Hội thoại", exact: true }).click();
  assert.equal(await b.locator("#chat-message").inputValue(), "[QA] Bản nháp giữ khi đổi tab đơn hàng.");
  await b.getByRole("button", { name: "Đơn hàng", exact: true }).click();
  await b.screenshot({ path: path.join(out, "buyer-order-mobile390-130.png"), fullPage: true });
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "390px large text has no horizontal overflow");
  await b.setViewportSize({ width: 320, height: 844 });
  await b.screenshot({ path: path.join(out, "buyer-order-mobile320-130.png"), fullPage: true });
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "320px large text has no horizontal overflow");

  await b.setViewportSize({ width: 1440, height: 1100 });
  await b.evaluate(() => document.documentElement.style.fontSize = "100%");
  historyFailures.add(negotiated.conversationId); await refresh(b, "purchase-messages");
  await b.getByText("Chưa tải được lịch sử tin nhắn.", { exact: true }).waitFor();
  await b.getByText(oldMessage.body, { exact: true }).waitFor();
  historyFailures.clear(); await b.getByRole("button", { name: "Tải lại tin nhắn", exact: true }).click();
  detailFailures.set("buyer" + negotiated.id, 1); await refresh(b, "direct-order");
  await br.getByText("Chưa cập nhật được trạng thái mới.", { exact: false }).waitFor();
  await br.getByText("Địa chỉ nhận riêng của đơn QA", { exact: false }).waitFor();
  await br.getByRole("button", { name: "Thử lại", exact: true }).click();
  denied.add("buyer" + negotiated.id); await refresh(b, "direct-order");
  await br.getByText("Chưa tải được đơn.", { exact: false }).waitFor();
  assert.equal(await br.getByText("Địa chỉ nhận riêng của đơn QA", { exact: false }).count(), 0, "cached private address hidden on403");
  assert.equal(await br.getByRole("button", { name: /Thanh toán|Hủy đơn/ }).count(), 0, "403 hides private actions");
  denied.clear(); await br.getByRole("button", { name: "Thử lại", exact: true }).click();
  await br.getByText("Địa chỉ nhận riêng của đơn QA", { exact: false }).waitFor();
  await b.getByRole("link", { name: "Về đơn hàng của tôi", exact: true }).click();
  await b.waitForURL("**/orders");

  await b.locator(`a[href="/chat/orders/${buyNow.id}"]`).click();
  await b.getByRole("button", { name: "Thử mở hội thoại", exact: true }).waitFor();
  await b.getByRole("button", { name: "Thử mở hội thoại", exact: true }).click();
  await b.waitForURL(`**/chat/${buyNow.conversationId}`);
  assert.equal(commands.ensure.length, 2); assert.deepEqual(commands.ensure[0], commands.ensure[1], "ensure retry preserves key/body after committed lost response");
  assert.equal(commands.ensure[0].body, "{}"); assert.ok(commands.ensure[0].key);
  await b.getByRole("heading", { name: buyNow.item.metadata.title, level: 1, exact: true }).waitFor();
  await orderRegion(b).getByText("Mô tả bản sách được lưu tại thời điểm đặt đơn QA.", { exact: true }).waitFor();
  await goto(b, `/orders/${buyNow.id}`); await b.waitForURL(`**/chat/${buyNow.conversationId}`);
  assert.equal(commands.ensure.length, 2, "legacy URL reuses linked order room");

  const s = await makePage("seller");
  await goto(s, "/orders"); await s.locator(`a[href="/chat/orders/${buyNow.id}"]`).click();
  await s.waitForURL(`**/chat/${buyNow.conversationId}`);
  const sr = orderRegion(s);
  await sr.getByText("Địa chỉ gửi riêng của đơn QA", { exact: false }).waitFor();
  await sr.getByText("Địa chỉ nhận riêng của đơn QA", { exact: false }).waitFor();
  assert.equal(await sr.getByRole("button", { name: /Thanh toán|Hủy đơn/ }).count(), 0, "seller never gets buyer payment/cancel actions");
  const tracking = sr.getByLabel("Mã vận đơn mô phỏng", { exact: true });
  await tracking.fill("LL-QA123456");
  await s.setViewportSize({ width: 320, height: 844 });
  await s.evaluate(() => document.documentElement.style.fontSize = "130%");
  await s.getByRole("button", { name: "Hội thoại", exact: true }).click();
  await s.locator("#chat-message").fill("[QA] Bản nháp của người bán.");
  await s.getByRole("button", { name: "Đơn hàng", exact: true }).click();
  assert.equal(await tracking.inputValue(), "LL-QA123456", "tracking draft survives mobile tab");
  shipmentFailures.set(buyNow.id, 1); await refresh(s, "order-shipment");
  await sr.getByText("Chưa tải được vận đơn.", { exact: false }).waitFor();
  assert.equal(await tracking.inputValue(), "LL-QA123456", "tracking draft survives transient shipment failure");
  await sr.getByRole("button", { name: "Thử lại", exact: true }).click();
  await sr.getByLabel("Ảnh đóng gói", { exact: true }).setInputFiles({ name: "qa-packing.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh2cAAAAASUVORK5CYII=", "base64") });
  await sr.getByRole("button", { name: "Lưu ảnh đóng gói", exact: true }).click();
  await sr.getByText("Ảnh đóng gói đã lưu: 1", { exact: true }).waitFor();
  await s.screenshot({ path: path.join(out, "seller-order-mobile320-130.png"), fullPage: true });
  assert.ok(await s.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "seller320px large text has no overflow");
  await s.setViewportSize({ width: 1440, height: 1100 });
  await s.evaluate(() => document.documentElement.style.fontSize = "100%");
  await s.screenshot({ path: path.join(out, "seller-order-desktop.png"), fullPage: true });
  await sr.getByRole("button", { name: "Đăng ký vận đơn", exact: true }).click();
  await sr.getByRole("button", { name: "Thử lại đăng ký vận đơn", exact: true }).waitFor();
  await sr.getByRole("button", { name: "Thử lại đăng ký vận đơn", exact: true }).click();
  assert.deepEqual(commands.shipment[0], commands.shipment[1], "shipment retry pins same version/key/tracking/evidence");
  await sr.getByText("LL-QA123456", { exact: true }).waitFor();
  await s.getByText("Đã đăng ký vận đơn, đang chờ xác nhận bàn giao.", { exact: false }).waitFor();

  await goto(b, `/chat/orders/${cancellable.id}`); await b.waitForURL(`**/chat/${cancellable.conversationId}`);
  await orderRegion(b).getByRole("button", { name: "Hủy đơn chưa thanh toán", exact: true }).click();
  await orderRegion(b).getByRole("button", { name: "Thử lại hủy đơn", exact: true }).waitFor();
  await refresh(b, "direct-order");
  await orderRegion(b).getByRole("button", { name: "Thử lại hủy đơn", exact: true }).click();
  assert.deepEqual(commands.cancel[0], commands.cancel[1], "cancel retry pins original version and key even after state poll");
  await orderRegion(b).getByText("Đã hủy", { exact: true }).waitFor();
  assert.deepEqual(issues, []);
  await writeFile(path.join(out, "result.json"), JSON.stringify({ result: "PASS", api: "All isolated HTTP fixtures", socket: "Isolated Socket.IO5197",
    cases: ["order list to exact existing room", "existing history and agreement events", "snapshot title over edited or archived listing", "BuyNow ensure committed lost reply same key/body", "legacy order URL", "buyer/seller fields and command eligibility", "payment and cancellation committed retry", "shipping draft and registration retry", "message committed retry dedupe", "cached detail503 retains snapshot and403 hides it", "history error retains messages", "mobile320/390px130% no overflow", "mobile tabs preserve payment/chat/shipping state"] }, null, 2));
  console.log("PASS order-chat workspace: exact order room, full private details, participant roles, committed retries, messages/history, shipping and mobile320/390px130%. Isolated fixtures only.");
  console.log(out);
} catch (error) {
  for (const context of browser?.contexts() ?? []) for (const page of context.pages()) {
    await writeFile(path.join(out, `failure-${browser.contexts().indexOf(context)}.txt`),
      JSON.stringify({ url: page.url(), text: await page.locator("body").innerText(), issues }, null, 2)).catch(() => {});
    await page.screenshot({ path: path.join(out, `failure-${browser.contexts().indexOf(context)}.png`), fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  await browser?.close(); await vite?.close(); await io?.close();
  await new Promise((resolve) => http?.listening ? http.close(resolve) : resolve());
}
