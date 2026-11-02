// Real Member web + HTTP/Mongo QA; no main DB or live providers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";

const qa = new URL(process.env.MONGO_TEST_URL ?? "");
assert(
  qa.hostname === "127.0.0.1" &&
    qa.port === "57017" &&
    qa.pathname.endsWith("_test") &&
    qa.searchParams.get("replicaSet") === "rs-test",
);
Object.assign(process.env, {
  AUTH_MAIL_PROVIDER: "local",
  VITE_API_BASE_URL: base,
  PAYMENT_SIMULATOR_SECRET: crypto.randomUUID() + crypto.randomUUID(),
});
const out = path.join(root, ".tmp/exchange-finance");
await mkdir(out, { recursive: true });
const result = {
  storage: "fake",
  mail: "local",
  native: "NOT RUN",
  checks: [],
};
let fixture, vite, browser;
const save = () =>
  writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2));
try {
  fixture = await createTestApi({
    corsOrigin: "http://127.0.0.1:5194",
    listingCount: 3,
  });
  const api = fixture.api,
    b = fixture.member;
  const req = createRequire(path.join(root, "apps/user-web/package.json"));
  const { chromium } = createRequire(
    path.join(root, "apps/admin-web/package.json"),
  )("playwright");
  const { createServer } = await import(
    pathToFileURL(req.resolve("vite")).href
  );
  vite = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5194, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });

  const spa = (page, url) =>
    page.evaluate((url) => {
      history.pushState({}, "", url);
      dispatchEvent(new PopStateEvent("popstate"));
    }, url);
  const web = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  web.setDefaultTimeout(12000);
  await web.goto(
    "http://127.0.0.1:5194/login?returnUrl=" + encodeURIComponent("/account"),
  );
  const initialLogin = web.waitForResponse(
    (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
  );
  await web.getByLabel(/^Email/).fill("admin@operations.test");
  await web.getByLabel(/^Mật khẩu/).fill(password);
  await web.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const initialAuth = await initialLogin;
  assert.equal(initialAuth.status(), 200);
  const a = await initialAuth.json();
  await web.waitForURL("**/account");
  const staff = await api("/auth/login", null, {
    email: "staff@operations.test",
    password,
  });
  const cat = await api(
    "/operations/catalog-requests/" + fixture.catalogId,
    a.accessToken,
  );
  await api(
    "/operations/catalog-requests/" + fixture.catalogId + "/decision",
    a.accessToken,
    {
      expectedVersion: cat.version,
      revisionId: cat.currentRevision.id,
      decision: "Confirm",
    },
  );
  const approve = async (id) => {
    const listing = await api("/operations/listings/" + id, staff.accessToken);
    await api("/operations/listings/" + id + "/decision", staff.accessToken, {
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
    });
  };
  for (const id of fixture.listings) await approve(id);
  const template = await api(
    "/me/listings/" + fixture.listings[0],
    b.accessToken,
  );
  const own = async (value) => {
    const content = {
      ...template.currentRevision.content,
      exchangeValue: value,
      mediaIds: [],
    };
    const draft = await api("/listings", a.accessToken, { content });
    const media = await api(
      "/listings/" + draft.entityId + "/media",
      a.accessToken,
      {
        expectedVersion: draft.version,
        mimeType: "image/png",
        byteSize: fixture.photo.length,
        sha256: createHash("sha256").update(fixture.photo).digest("hex"),
      },
    );
    const ticket = await api(
      "/listings/" +
        draft.entityId +
        "/media/" +
        media.entityId +
        "/upload-ticket",
      a.accessToken,
    );
    await api(ticket.path, a.accessToken, fixture.photo, "PUT", ticket.headers);
    const uploaded = await api(
      "/me/listings/" + draft.entityId + "/media/" + media.entityId,
      a.accessToken,
    );
    await api(
      "/listings/" + draft.entityId + "/media/" + media.entityId + "/finalize",
      a.accessToken,
      { expectedVersion: uploaded.version },
    );
    await fixture.processMedia();
    const fresh = await api("/me/listings/" + draft.entityId, a.accessToken);
    const saved = await api(
      "/listings/" + draft.entityId + "/draft",
      a.accessToken,
      {
        expectedVersion: fresh.version,
        content: { ...content, mediaIds: [media.entityId] },
      },
      "PUT",
    );
    await api("/listings/" + draft.entityId + "/submit", a.accessToken, {
      expectedVersion: saved.version,
      ownershipDeclared: true,
    });
    await approve(draft.entityId);
    return draft.entityId;
  };
  const [al, al2, al3] = [
    await own(100000),
    await own(150000),
    await own(250000),
  ];
  const [bl, bl2, bl3] = fixture.listings;

  const templateUser = await fixture.db
    .collection("users")
    .findOne({ _id: b.user.id });
  const operatorId = "99999999-9999-4999-8999-999999999999";
  await fixture.db.collection("users").insertOne({
    ...templateUser,
    _id: operatorId,
    emailNormalized: "operator@exchange-finance.test",
    roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
  });
  const operator = await api("/auth/login", null, {
    email: "operator@exchange-finance.test",
    password,
  });
  const topup = async (actor) => {
    const intent = await api("/me/topups", actor.accessToken, {
      amount: 2000000,
    });
    await api("/operations/simulator/topup-events", operator.accessToken, {
      eventId: crypto.randomUUID(),
      intentId: intent.entityId,
      recipientId: actor.user.id,
      amount: 2000000,
      currency: "VND",
      outcome: "Succeeded",
      occurredAt: new Date().toISOString(),
    });
  };
  await topup(a);
  await topup(b);
  const addresses = await api("/me/addresses", a.accessToken);
  await api("/me/addresses", a.accessToken, {
    expectedBookVersion: addresses.version,
    makeDefault: true,
    address: {
      recipientName: "Người nhận QA",
      phone: "0900000000",
      detail: "Địa chỉ tổng hợp QA",
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: "DEMO-A",
    },
  });
  const openRoom = async (target, intent = "Exchange") => {
    const listing = await api("/listings/" + target, a.accessToken);
    const receipt = await api(
      "/listings/" + target + "/purchase-conversations",
      a.accessToken,
      { expectedVersion: listing.version, intent },
    );
    let room = await api(
      "/me/purchase-conversations/" + receipt.entityId,
      a.accessToken,
    );
    if (room.terms.pendingProposal) {
      await api(
        "/me/purchase-conversations/" + room.id + "/terms/respond",
        b.accessToken,
        {
          expectedVersion: room.version,
          proposalId: room.terms.pendingProposal.id,
          accept: true,
        },
      );
      room = await api("/me/purchase-conversations/" + room.id, a.accessToken);
    }
    return room;
  };
  const room = await openRoom(bl);
  const seller = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  seller.setDefaultTimeout(12000);
  await seller.goto(
    "http://127.0.0.1:5194/login?returnUrl=" +
      encodeURIComponent("/chat/" + room.id),
  );
  await seller.getByLabel(/^Email/).fill("member@operations.test");
  await seller.getByLabel(/^Mật khẩu/).fill(password);
  await seller.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const summary = (page) =>
    page.getByRole("region", {
      name: "Tóm tắt tài chính đổi sách",
      exact: true,
    });
  const amount = async (page, label, value) => {
    const row = summary(page)
      .locator("div")
      .filter({ has: page.locator("dt", { hasText: label }) });
    await row.getByText(value, { exact: true }).waitFor();
  };
  await spa(web, "/chat/" + room.id);
  await amount(web, "Giá trị quy đổi đang đăng", "150.000 ₫");
  await summary(seller)
    .getByText("Chưa có thỏa thuận", { exact: true })
    .waitFor();
  assert.equal(
    await web.getByText("Tổng thanh toán", { exact: true }).count(),
    0,
  );
  assert.equal(await seller.getByText("Tiền sách", { exact: true }).count(), 0);
  await web
    .getByRole("link", { name: "Đến phần chọn sách / đề nghị", exact: true })
    .click();
  assert.equal(
    await web.evaluate(() => document.activeElement?.id),
    "exchange-sheet-" + room.id,
  );
  await web
    .locator("label")
    .filter({ has: web.locator('input[type="checkbox"]') })
    .filter({ hasText: "100.000" })
    .first()
    .click();
  const preview = web
    .locator("div")
    .filter({
      has: web.getByText("Khoản bạn nộp nếu chấp nhận", { exact: true }),
    })
    .last();
  await preview.getByText("200.000 ₫", { exact: true }).waitFor();
  await web.route("**/api/v1/listings/" + bl + "?*", async (route) => {
    const response = await route.fetch();
    const listing = await response.json();
    return route.fulfill({
      response,
      json: { ...listing, exchangeValue: null },
    });
  });
  const refreshBook = () =>
    web.evaluate(async () => {
      const { queryClient } = await import("/src/lib/session.ts");
      await queryClient.refetchQueries({ queryKey: ["public-listing"] });
    });
  await refreshBook();
  await summary(web).getByText("Chưa có dữ liệu", { exact: true }).waitFor();
  await web
    .getByText(
      "Chưa đủ giá trị quy đổi để tính cọc và tiền bù. Tải lại kệ sách trước khi gửi đề nghị.",
      { exact: true },
    )
    .waitFor();
  assert(
    await web
      .getByRole("button", { name: /Gửi đề nghị đổi sách/ })
      .isDisabled(),
  );
  await web.unroute("**/api/v1/listings/" + bl + "?*");
  await web
    .getByRole("button", { name: "Tải lại giá trị sách", exact: true })
    .click();
  await preview.getByText("200.000 ₫", { exact: true }).waitFor();
  let createCalls = 0,
    roomReadLive = false;
  const intents = [];
  await web.route("**/api/v1/me/purchase-conversations/" + room.id, (route) =>
    !roomReadLive && createCalls
      ? route.fulfill({ json: room })
      : route.continue(),
  );
  await web.route("**/api/v1/exchanges", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    createCalls++;
    intents.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (createCalls === 2)
      return route.fulfill({
        status: 429,
        json: { code: "RATE_LIMITED", message: "Synthetic QA create limit" },
      });
    const response = await route.fetch();
    if (createCalls === 1) return route.abort("failed");
    assert.equal(response.headers()["idempotency-replayed"], "true");
    return route.fulfill({ response });
  });
  await web.getByRole("button", { name: /Gửi đề nghị đổi sách/ }).click();
  await web
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .waitFor();
  await spa(web, "/account");
  await spa(web, "/chat/" + room.id);
  await web
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .click();
  await web
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(createCalls, 2);
  await web
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .click();
  await amount(web, "Cọc bảo chứng của bạn", "150.000 ₫");
  await amount(web, "Cọc bảo chứng của đối tác", "100.000 ₫");
  await amount(web, "Dự kiến nộp khi chấp nhận", "200.000 ₫");
  const current = await api(
    "/me/purchase-conversations/" + room.id,
    a.accessToken,
  );
  const exchangeId = current.terms.activeExchangeId;
  assert(exchangeId);
  assert.equal(createCalls, 3);
  assert(
    intents.every(
      (i) => i.key === intents[0].key && i.body === intents[0].body,
    ),
  );
  assert.equal(
    await fixture.db
      .collection("conversation_exchange_links")
      .countDocuments({ conversationId: room.id }),
    1,
  );
  roomReadLive = true;
  await web.unroute("**/api/v1/me/purchase-conversations/" + room.id);
  await web.unroute("**/api/v1/exchanges");
  await spa(web, "/account");
  await spa(web, "/chat/" + room.id);
  result.checks.push(
    "Missing exchange value is unknown/disabled; lost create ACK + Back + 429 preserves exact intent and one proposal; summary reads known ACK ID while room GET lags",
  );
  await spa(seller, "/account");
  await spa(seller, "/chat/" + room.id);
  await amount(seller, "Cọc bảo chứng của bạn", "100.000 ₫");
  await amount(seller, "Dự kiến nộp khi chấp nhận", "100.000 ₫");
  await amount(seller, "Tiền bù", "Đối tác bù 50.000 ₫");
  result.checks.push(
    "Both roles: frozen 100k/150k; own deposits 150k/100k; A funding 200k, B funding 100k; no sale/quote total",
  );

  const refresh = (page) =>
    page.evaluate(async () => {
      const { queryClient } = await import("/src/lib/session.ts");
      await queryClient.refetchQueries({ queryKey: ["exchangeDetail"] });
    });
  const counter = async (actor, listingIds) => {
    const row = await api("/exchanges/" + exchangeId, actor.accessToken);
    return api("/exchanges/" + exchangeId + "/counter", actor.accessToken, {
      expectedVersion: row.revision,
      listingIds,
    });
  };
  // Each responder replaces their own books; the second counter reverses payer.
  await counter(b, [bl2]);
  const changed = await counter(a, [al3]);
  assert.equal(changed.diffPayerId, b.user.id);
  assert.equal(changed.diffAmount, 100000);
  await refresh(web);
  await refresh(seller);
  await amount(web, "Tiền bù", "Đối tác bù 100.000 ₫");
  await amount(web, "Dự kiến nộp khi chấp nhận", "150.000 ₫");
  await amount(seller, "Tiền bù", "Bạn bù 100.000 ₫");
  await amount(seller, "Cọc bảo chứng của bạn", "250.000 ₫");
  await amount(seller, "Dự kiến nộp khi chấp nhận", "350.000 ₫");
  // Public values may change while a proposal is open; summary stays frozen.
  let publicPriceRead = false;
  await web.route("**/api/v1/listings/" + bl + "?*", async (route) => {
    publicPriceRead = true;
    const response = await route.fetch();
    const listing = await response.json();
    return route.fulfill({
      response,
      json: { ...listing, exchangeValue: 600000, salePrice: 625000 },
    });
  });
  await web.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.refetchQueries({
      predicate: (q) => q.queryKey.includes("public-listing"),
    });
  });
  assert(publicPriceRead);
  assert.equal(
    await web.evaluate(async (id) => {
      const { queryClient } = await import("/src/lib/session.ts");
      return queryClient.getQueryData(["public-listing", id]).exchangeValue;
    }, bl),
    600000,
  );
  await amount(web, "Sách bạn nhận (1 cuốn)", "150.000 ₫");
  result.checks.push(
    "Counter reverses payer: A150k, B350k; changing public price does not replace saved agreement",
  );

  await api("/exchanges/" + exchangeId + "/accept", b.accessToken, {
    revision: changed.revision,
  });
  await refresh(web);
  await refresh(seller);
  await amount(web, "Khoản cần nộp từ ví mô phỏng", "150.000 ₫");
  await amount(seller, "Khoản cần nộp từ ví mô phỏng", "350.000 ₫");
  await web
    .getByRole("button", { name: "Đặt cọc mô phỏng", exact: true })
    .click();
  await web
    .getByRole("dialog", { name: "Đặt cọc mô phỏng", exact: true })
    .getByRole("button", { name: "Đặt cọc mô phỏng", exact: true })
    .click();
  await summary(web)
    .getByText("Đã ghi nhận khoản nộp của bạn; đang chờ đối tác hoàn tất.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await summary(web)
      .getByText("Khoản cần nộp từ ví mô phỏng", { exact: true })
      .count(),
    0,
  );
  const funded = await fixture.db
    .collection("exchanges")
    .findOne({ _id: exchangeId });
  assert.equal(
    await fixture.db.collection("ledger_journals").countDocuments({
      orderId: funded.initiatorOrderId,
      type: "OrderPayment",
    }),
    1,
  );
  await web.waitForFunction(async (id) => {
    const { exchangeAcknowledged } = await import("/src/services/exchange.ts");
    return !exchangeAcknowledged(id);
  }, exchangeId);
  result.checks.push(
    "Actual web funding records one journal; summary stops prompting to fund after ACK",
  );

  // GET unavailable after a known state is not a zero balance or a new command.
  await web.route("**/api/v1/exchanges/" + exchangeId, (route) =>
    route.fulfill({
      status: 503,
      json: { code: "UNAVAILABLE", message: "Synthetic QA read failure" },
    }),
  );
  await refresh(web);
  await summary(web).getByRole("alert").waitFor();
  await amount(web, "Cọc bảo chứng của bạn", "150.000 ₫");
  await web.screenshot({
    path: path.join(out, "read-failed-retains-facts.png"),
    fullPage: true,
  });
  await web.unroute("**/api/v1/exchanges/" + exchangeId);
  await summary(web)
    .getByRole("button", { name: "Tải lại khoản trao đổi", exact: true })
    .click();
  await summary(web).getByRole("alert").waitFor({ state: "hidden" });

  for (const width of [1440, 768, 390, 320]) {
    await web.setViewportSize({ width, height: 1000 });
    await summary(web).scrollIntoViewIfNeeded();
    assert(
      await web.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await web.screenshot({
      path: path.join(out, "initiator-" + width + ".png"),
    });
  }
  await seller.setViewportSize({ width: 390, height: 1000 });
  await summary(seller).scrollIntoViewIfNeeded();
  await seller.screenshot({ path: path.join(out, "recipient-390.png") });
  result.checks.push(
    "GET error/retry retains facts; 1440/768/390/320 no horizontal overflow; two roles inspected",
  );

  // A second room proves equal value, terminal history and legacy honesty.
  const equalRoom = await openRoom(bl3);
  const equal = await api("/exchanges", a.accessToken, {
    conversationId: equalRoom.id,
    expectedConversationVersion: equalRoom.version,
    initiatorListingIds: [al2],
    recipientListingId: bl3,
  });
  await spa(web, "/chat/" + equalRoom.id);
  await amount(web, "Tiền bù", "Ngang giá — không bù");
  await amount(web, "Dự kiến nộp khi chấp nhận", "150.000 ₫");
  await api("/exchanges/" + equal.id + "/cancel", a.accessToken, {
    expectedVersion: equal.revision,
  });
  await web.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.refetchQueries({ queryKey: ["purchase-conversations"] });
  });
  await spa(web, "/account");
  await spa(web, "/chat/" + equalRoom.id);
  await web.getByText(/Lịch sử các đề nghị đổi sách/).click();
  await web
    .getByRole("button", { name: "Xem đề nghị lần 1", exact: true })
    .click();
  await summary(web)
    .getByText("Thỏa thuận trước đó", { exact: true })
    .waitFor();
  assert.equal(
    await summary(web)
      .getByText("Khoản cần nộp từ ví mô phỏng", { exact: true })
      .count(),
    0,
  );
  await web.route("**/api/v1/exchanges/" + equal.id, async (route) => {
    const response = await route.fetch();
    const row = await response.json();
    return route.fulfill({ response, json: { ...row, agreement: null } });
  });
  await refresh(web);
  await summary(web)
    .getByText(/Hồ sơ cũ thiếu bản chụp sách/)
    .waitFor();
  await amount(web, "Sách bạn giao (1 cuốn)", "Thiếu bản chụp");
  await amount(web, "Cọc bảo chứng của bạn", "150.000 ₫");
  result.checks.push(
    "Equal value, cancelled history and synthetic legacy GET do not invent missing values or ask to pay",
  );

  // Purchase negotiation remains the separate existing flow.
  // Reuse the closed equal room by the actual terms command; do not bypass
  // active obligations in the first room.
  let roomState = await api(
    "/me/purchase-conversations/" + equalRoom.id,
    b.accessToken,
  );
  await api(
    "/me/purchase-conversations/" + equalRoom.id + "/terms",
    b.accessToken,
    { expectedVersion: roomState.version, kind: "Mode", mode: "Negotiation" },
  );
  roomState = await api(
    "/me/purchase-conversations/" + equalRoom.id,
    a.accessToken,
  );
  await api(
    "/me/purchase-conversations/" + equalRoom.id + "/terms/respond",
    a.accessToken,
    {
      expectedVersion: roomState.version,
      proposalId: roomState.terms.pendingProposal.id,
      accept: true,
    },
  );
  await spa(web, "/account");
  await spa(web, "/chat/" + equalRoom.id);
  await web.getByText("Tiền sách", { exact: true }).waitFor();
  await web.getByText("Tổng thanh toán", { exact: true }).waitFor();
  assert.equal(await summary(web).count(), 0);
  result.checks.push(
    "Mode changes use server consent; purchase payment card remains present only in Negotiation",
  );
  result.complete = true;
} catch (error) {
  let index = 0;
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages())
      await page
        .screenshot({
          path: path.join(out, "failure-" + index++ + ".png"),
          fullPage: true,
        })
        .catch(() => {});
  result.failure = {
    name: error.name,
    message: String(error.message).slice(0, 500),
  };
  process.exitCode = 1;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close();
  result.cleaned = true;
  await save();
}
console.log(
  JSON.stringify({
    checks: result.checks,
    complete: result.complete ?? false,
    cleaned: result.cleaned,
  }),
);
