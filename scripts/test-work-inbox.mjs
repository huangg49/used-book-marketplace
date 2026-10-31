// Real HTTP/Mongo browser QA in a disposable *_test DB; local fake storage.
// Negotiated Orders are formed/paid through APIs. Synthetic old intakes and
// extra order rows test paging/deep links only, not fulfillment or release gates.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
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
const vite = path.join(
  path.dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);
const web = "http://127.0.0.1:5184",
  ops = "http://127.0.0.1:5174",
  rn = "http://127.0.0.1:8087";
const artifacts = path.join(root, ".tmp/work-inbox-evidence");
const button = (p, name) => p.getByRole("button", { name, exact: true });
await mkdir(artifacts, { recursive: true });
Object.assign(process.env, {
  AUTH_MAIL_PROVIDER: "local",
  PAYMENT_SIMULATOR_SECRET: "qa-only-work-inbox-funding-0000000000000",
});
let fixture, browser, nativeServer;
const children = [],
  errors = [];
async function serve(app, port) {
  const child = spawn(
    process.execPath,
    [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: path.join(root, "apps", app),
      env: { ...process.env, VITE_API_BASE_URL: base },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  children.push(child);
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(`${app} exited during QA startup`);
    if (
      await fetch(`http://127.0.0.1:${port}`)
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error(`${app} QA startup timeout`);
}
async function capture(p, name, width) {
  await p.setViewportSize({ width, height: 900 });
  await p.evaluate(async () => {
    await document.fonts.ready;
  });
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    name + " horizontal overflow",
  );
  await p.screenshot({
    path: path.join(artifacts, name + ".png"),
    fullPage: true,
  });
}
async function navigate(p, pathname) {
  await p.evaluate((url) => {
    history.pushState({}, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
}
try {
  fixture = await createTestApi({
    corsOrigin: `${web},${ops},${rn}`,
    listingCount: 3,
  });
  console.log("QA fixture ready.");
  const seller = fixture.member,
    buyer = await fixture.api("/auth/login", null, {
      email: "admin@operations.test",
      password,
    });
  const api = fixture.api;
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
        phone: "0900123456",
        serviceAreaCode: "HCM-DEMO-v1",
        localityCode,
        detail: "QA simulated address",
      },
    });
  const origin = await address(seller, "DEMO-A"),
    destination = await address(buyer, "DEMO-B");
  const template = await fixture.db
      .collection("users")
      .findOne({ _id: seller.user.id }),
    operatorId = randomUUID();
  await fixture.db
    .collection("users")
    .insertOne({
      ...template,
      _id: operatorId,
      emailNormalized: "work-operator@operations.test",
      roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
    });
  const operator = await api("/auth/login", null, {
    email: "work-operator@operations.test",
    password,
  });
  const topup = await api("/me/topups", buyer.accessToken, { amount: 500000 });
  await api("/operations/simulator/topup-events", operator.accessToken, {
    eventId: randomUUID(),
    intentId: topup.entityId,
    recipientId: buyer.user.id,
    amount: 500000,
    currency: "VND",
    outcome: "Succeeded",
    occurredAt: new Date().toISOString(),
  });
  const orders = [];
  async function approve(id) {
    const pending = await api(`/operations/listings/${id}`, buyer.accessToken);
    await api(`/operations/listings/${id}/decision`, buyer.accessToken, {
      expectedVersion: pending.version,
      revisionId: pending.currentRevision.id,
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
  }
  for (const id of fixture.listings.slice(0, 2)) {
    await approve(id);
    const mine = await api(`/me/listings/${id}`, seller.accessToken);
    const saved = await api(`/listings/${id}/revision`, seller.accessToken, {
      expectedVersion: mine.version,
      ownershipDeclared: true,
      content: {
        ...mine.currentRevision.content,
        fulfillment: {
          method: "DirectDelivery",
          originAddressId: origin.addressId,
          originAddressVersion: 1,
        },
      },
    });
    await approve(id);
    const listing = await api(`/listings/${id}`);
    const room = await api(
      `/listings/${id}/purchase-conversations`,
      buyer.accessToken,
      { expectedVersion: listing.version },
    );
    const quote = await api(`/listings/${id}/quotes`, buyer.accessToken, {
      expectedListingVersion: listing.version,
      expectedListingRevisionId: listing.revisionId,
      destinationAddressId: destination.addressId,
      expectedDestinationAddressVersion: 1,
      method: "DirectDelivery",
    });
    const attached = await api(
      `/me/purchase-conversations/${room.entityId}/quote`,
      buyer.accessToken,
      {
        expectedVersion: room.version,
        quoteId: quote.entityId,
        expectedQuoteVersion: 1,
        expectedListingVersion: listing.version,
        expectedListingRevisionId: listing.revisionId,
      },
    );
    const order = await api("/orders", seller.accessToken, {
      conversationId: room.entityId,
      expectedVersion: attached.version,
      agreedBookPrice: 125000,
    });
    await api(`/orders/${order.entityId}/pay`, buyer.accessToken, {
      expectedVersion: order.version,
    });
    orders.push(order.entityId);
    assert.ok(saved);
  }
  // 50 newer terminal summaries put both real Orders beyond the first 50.
  // Seven overdue unpaid summaries exercise inbox pages and waiting copy.
  for (let i = 0; i < 57; i++) {
    const createdAt = new Date(Date.now() + (i < 50 ? 1000 + i : -3600000));
    await fixture.db
      .collection("direct_orders")
      .insertOne({
        _id: randomUUID(),
        buyerId: seller.user.id,
        sellerId: buyer.user.id,
        quoteId: randomUUID(),
        version: i < 50 ? 2 : 1,
        state: i < 50 ? "Cancelled" : "AwaitingPayment",
        createdAt,
        paymentDeadline: new Date(+createdAt + 15 * 60000),
        closedAt: i < 50 ? new Date(+createdAt + 500) : null,
        paidAt: null,
        sellerConfirmationDeadline: null,
        cancellationRequestedAt: null,
        cancellationReason: null,
        deliveredAt: null,
        inspectionDeadline: null,
        completedAt: null,
        lockSeq: 0,
      });
  }
  const { AUCTION_DROPOFF_MS } = await import(
    pathToFileURL(
      path.join(
        root,
        "apps/api/dist/database/mongo/migrations/0008-auctions.js",
      ),
    )
  );
  const intakeId = randomUUID(),
    contextId = randomUUID(),
    listingId = randomUUID(),
    createdAt = new Date(Date.now() - 60000);
  const intake = {
    _id: intakeId,
    contextId,
    listingId,
    listingRevisionId: randomUUID(),
    sellerId: seller.user.id,
    pointId: randomUUID(),
    slotId: randomUUID(),
    startPrice: 10000,
    step: 10000,
    buyNowPrice: null,
    protectiveValue: 10000,
    policyCode: "HCM-AUCTION-v1",
    state: "AwaitingDropoff",
    version: 1,
    createdAt,
    dropoffDeadline: new Date(+createdAt + AUCTION_DROPOFF_MS),
    receivedAt: null,
    receivedBy: null,
    shelfCode: null,
    inspectedAt: null,
    inspectorId: null,
    inspectionOutcome: null,
    inspectionNote: null,
    evidenceRequestedBy: null,
    evidenceDeadline: null,
    evidenceNote: null,
    evidenceSubmittedAt: null,
    reclaimRequiredAt: null,
    auctionId: null,
    reclaimReason: null,
    closedAt: null,
    updatedAt: createdAt,
    lockSeq: 0,
  };
  await fixture.db.collection("auction_intakes").insertOne(intake);
  await fixture.db
    .collection("workflow_contexts")
    .insertOne({
      _id: contextId,
      kind: "AuctionIntake",
      orderId: null,
      auctionIntakeId: intakeId,
      version: 1,
      ownershipPhase: "Holding",
      lockSeq: 0,
    });
  await fixture.db
    .collection("workflow_items")
    .insertOne({
      _id: `${contextId}:${listingId}`,
      contextId,
      listingId,
      listingRevisionId: intake.listingRevisionId,
      catalogRevisionId: randomUUID(),
      snapshot: { title: "QA lần gửi cũ ngoài trang đầu" },
    });
  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(Date.now() + i);
    await fixture.db
      .collection("auction_intakes")
      .insertOne({
        ...intake,
        _id: randomUUID(),
        contextId: randomUUID(),
        listingId: randomUUID(),
        slotId: randomUUID(),
        state: "Cancelled",
        version: 2,
        createdAt: timestamp,
        dropoffDeadline: new Date(+timestamp + AUCTION_DROPOFF_MS),
        updatedAt: timestamp,
        closedAt: timestamp,
      });
  }
  await fixture.db.collection("login_attempts").deleteMany({});
  console.log("QA real paid Orders and paging fixtures ready.");
  await serve("user-web", 5184);
  await serve("admin-web", 5174);
  const dist = path.join(root, "apps/mobile-react-native/dist");
  nativeServer = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, rn).pathname);
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
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] ?? "application/octet-stream",
        })
        .end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) =>
    nativeServer.listen(8087, "127.0.0.1", resolve),
  );
  browser = await chromium.launch({ headless: true });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", (e) => errors.push(e.message));
  p.setDefaultTimeout(15000);
  await p.goto(web + "/login?returnUrl=%2Faccount%2Fwork");
  await p.getByLabel(/^Email/).fill("member@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
  await p.waitForURL(web + "/account/work");
  await p.locator(`a[href="/orders/${orders[0]}"]`).waitFor();
  const inbox = p.getByRole("region", { name: "Việc đang chờ", exact: true });
  await inbox
    .getByText(/Người mua đã thanh toán/)
    .first()
    .waitFor();
  assert.equal(await inbox.getByRole("listitem").count(), 5);
  for (const width of [1440, 768, 390, 320])
    await capture(p, "web-inbox-" + width, width);
  await button(inbox, "Xem thêm việc trong nhóm").click();
  await inbox.getByRole("listitem").nth(8).waitFor();
  assert.equal(await inbox.getByRole("listitem").count(), 9);
  await p.route("**/api/v1/me/work-items?**", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "UNAVAILABLE", message: "QA offline" },
    }),
  );
  await button(inbox, "Cập nhật").click();
  await inbox.getByRole("alert").waitFor();
  assert.equal(
    await inbox.getByText(/^Chưa có việc trong nhóm này/).count(),
    0,
  );
  await p.unroute("**/api/v1/me/work-items?**");
  await button(inbox, "Thử lại").click();
  await p.locator(`a[href="/orders/${orders[0]}"]`).click();
  await button(p, "Xác nhận bán").waitFor();
  const attempts = [];
  await p.route(`**/api/v1/orders/${orders[0]}/accept`, async (route) => {
    attempts.push({
      body: route.request().postData(),
      key: route.request().headers()["idempotency-key"],
    });
    const response = await route.fetch();
    if (attempts.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await button(p, "Xác nhận bán").click();
  await button(p, "Ghi quyết định").click();
  await button(p, "Thử lại quyết định xác nhận").waitFor();
  assert.equal(await button(p, "Từ chối đơn").count(), 0);
  await navigate(p, "/account/work");
  await p.locator(`a[href="/orders/${orders[0]}"]`).click();
  await button(p, "Thử lại quyết định xác nhận").click();
  await p
    .getByRole("region", { name: "Chi tiết đơn hàng", exact: true })
    .getByText("Người bán đang chuẩn bị gửi", { exact: true })
    .waitFor();
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(
    (await api(`/me/orders/${orders[0]}`, seller.accessToken)).state,
    "Preparing",
  );
  await navigate(p, "/account/work");
  await button(p, "Sách gửi đấu giá").click();
  await p.locator(`a[href="/my-auctions?intakeId=${intakeId}"]`).click();
  await p
    .getByRole("heading", {
      name: "QA lần gửi cũ ngoài trang đầu",
      exact: true,
    })
    .waitFor();
  await navigate(p, "/account/work");
  await button(p, "Bài đăng sách").click();
  await p.locator(`a[href="/my-books/${fixture.listings[2]}/edit"]`).waitFor();
  await fixture.setUserStatus(seller.user.id, "LOCKED");
  await button(
    p.getByRole("region", { name: "Việc đang chờ" }),
    "Cập nhật",
  ).click();
  await p
    .getByRole("region", { name: "Việc đang chờ" })
    .getByRole("alert")
    .waitFor();
  assert.equal(
    await p.locator(`a[href="/my-books/${fixture.listings[2]}/edit"]`).count(),
    0,
  );
  await fixture.setUserStatus(seller.user.id, "ACTIVE");
  console.log(
    "PASS Member web inbox, exact links, lost ACK and current permission.",
  );
  const n = await browser.newPage({ viewport: { width: 390, height: 900 } });
  n.setDefaultTimeout(15000);
  n.on("pageerror", (e) => errors.push(e.message));
  await n.goto(rn + "/account");
  await n
    .getByLabel("Email", { exact: true })
    .last()
    .fill("member@operations.test");
  await n.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await button(n, "Đăng nhập").click();
  await button(n, new RegExp(orders[1].slice(0, 8))).waitFor();
  for (const width of [390, 320]) await capture(n, "rn-inbox-" + width, width);
  await button(n, new RegExp(orders[1].slice(0, 8))).click();
  await button(n, "Từ chối đơn").click();
  await button(n, "Ghi quyết định").click();
  await n.getByText(/Đang xử lý hoàn tiền/).waitFor();
  assert.equal(
    (await api(`/me/orders/${orders[1]}`, seller.accessToken)).state,
    "SettlementPending",
  );
  // A section highlighted on a child screen must still navigate to its root.
  await n.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  await n.getByRole("heading", { name: "Việc của tôi", exact: true }).waitFor();
  await button(n, new RegExp(orders[1].slice(0, 8))).click();
  await button(n, "Về danh sách đơn trực tiếp").click();
  await button(n, "Tải thêm đơn").click();
  await n.getByText(/Đã tải 40 đơn/).waitFor();
  await button(n, "Tải thêm đơn").click();
  await n.getByText(/Đã tải 59 đơn/).waitFor();
  assert.equal(
    await n
      .getByText("#" + orders[0].slice(0, 8).toUpperCase(), { exact: true })
      .count(),
    1,
  );
  await navigate(n, "/account");
  await button(n, "Sách gửi đấu giá").click();
  await button(n, new RegExp(intakeId.slice(0, 8))).click();
  await n.getByText("QA lần gửi cũ ngoài trang đầu", { exact: true }).waitFor();
  assert.equal(await button(n, "Xem lại và gửi sách đấu giá").count(), 0);
  await capture(n, "rn-intake-focus-320", 320);
  await n.evaluate(() => {
    for (const el of document.querySelectorAll('[dir="auto"]')) {
      const c = getComputedStyle(el);
      el.style.fontSize = `${parseFloat(c.fontSize) * 1.3}px`;
      el.style.lineHeight = `${parseFloat(c.lineHeight) * 1.3}px`;
    }
  });
  await capture(n, "rn-intake-large-320", 320);
  const staff = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  staff.setDefaultTimeout(15000);
  staff.on("pageerror", (e) => errors.push(e.message));
  await staff.goto(ops + "/dashboard");
  await staff
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("staff@operations.test");
  await staff.getByLabel(/^Mật khẩu/).fill(password);
  await button(staff, "Đăng nhập").click();
  const desk = staff.getByRole("region", {
    name: "Hồ sơ cần bạn xem",
    exact: true,
  });
  await desk
    .locator(`a[href="/review/listings/${fixture.listings[2]}"]`)
    .waitFor();
  assert.equal(await button(desk, "Đầu sách").count(), 0);
  for (const width of [1440, 390, 320])
    await capture(staff, "staff-inbox-" + width, width);
  await desk
    .locator(`a[href="/review/listings/${fixture.listings[2]}"]`)
    .click();
  await staff.waitForURL(`**/review/listings/${fixture.listings[2]}`);
  await fixture.db
    .collection("users")
    .updateOne(
      { _id: buyer.user.id },
      { $pull: { roles: { role: "STAFF" } }, $inc: { lockSeq: 1 } },
    );
  const admin = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  admin.on("pageerror", (e) => errors.push(e.message));
  await admin.goto(ops + "/dashboard");
  await admin
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@operations.test");
  await admin.getByLabel(/^Mật khẩu/).fill(password);
  await button(admin, "Đăng nhập").click();
  const adminDesk = admin.getByRole("region", {
    name: "Hồ sơ cần bạn xem",
    exact: true,
  });
  await button(adminDesk, "Đầu sách").click();
  await adminDesk
    .locator(`a[href="/review/catalog-requests/${fixture.extraId}"]`)
    .waitFor();
  await capture(admin, "admin-inbox-1440", 1440);
  assert.equal(
    await admin
      .getByRole("link", { name: "Nhận sách tại điểm", exact: true })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS work inbox: real Order responses/lost ACK, paging beyond 50, exact intake focus, errors/current permissions, Member web/RN web + Staff/Admin responsive. Native/human acceptance NOT RUN.",
  );
} catch (error) {
  let index = 0;
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages())
      await page.screenshot({ path: path.join(artifacts, `failure-${index++}.png`), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (nativeServer?.listening)
    await new Promise((resolve) => nativeServer.close(resolve));
  for (const child of children) child.kill();
  await fixture?.close();
}
