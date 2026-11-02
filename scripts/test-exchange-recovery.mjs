// Isolated HTTP/Mongo + actual Member web/Expo web. No main DB/provider access.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createHttp } from "node:http";
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
const out = path.join(root, ".tmp/exchange-recovery");
await mkdir(out, { recursive: true });
const result = {
  storage: "fake",
  mail: "local",
  native: "NOT RUN",
  checks: [],
};
let fixture, vite, browser, staticServer;
const save = () =>
  writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2));
try {
  fixture = await createTestApi({
    corsOrigin: "http://127.0.0.1:5194,http://127.0.0.1:8087",
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
  const dist = path.join(root, "apps/mobile-react-native/dist");
  staticServer = createHttp(async (q, s) => {
    try {
      const url = new URL(q.url, "http://127.0.0.1:8087");
      let file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
      if (file !== dist && !file.startsWith(dist + path.sep))
        return s.writeHead(403).end();
      file =
        file === dist
          ? path.join(dist, "index.html")
          : path.extname(file)
            ? file
            : file + ".html";
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
        ".webp": "image/webp",
      };
      s.writeHead(200, {
        "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      }).end(await readFile(file));
    } catch {
      s.writeHead(404).end();
    }
  });
  await new Promise((resolve) =>
    staticServer.listen(8087, "127.0.0.1", resolve),
  );
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
    await own(100000),
    await own(100000),
  ];
  const [bl, bl2, bl3] = fixture.listings;
  const propose = (recipientListingId, initiatorListingId) =>
    api("/exchanges", a.accessToken, {
      initiatorListingId,
      recipientListingId,
    });

  const templateUser = await fixture.db
    .collection("users")
    .findOne({ _id: b.user.id });
  const operatorId = "99999999-9999-4999-8999-999999999999";
  await fixture.db.collection("users").insertOne({
    ...templateUser,
    _id: operatorId,
    emailNormalized: "operator@exchange-recovery.test",
    roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
  });
  const operator = await api("/auth/login", null, {
    email: "operator@exchange-recovery.test",
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
  const accepted = async (target, own) => {
    const proposal = await propose(target, own);
    return api("/exchanges/" + proposal.id + "/accept", b.accessToken, {
      revision: proposal.revision,
    });
  };
  const webExchange = await accepted(bl, al),
    rnExchange = await accepted(bl2, al2);
  const addresses = await api("/me/addresses", a.accessToken);
  await api("/me/addresses", a.accessToken, {
    expectedBookVersion: addresses.version,
    makeDefault: true,
    address: {
      recipientName: "Người nhận QA",
      phone: "0900000000",
      detail: "Địa chỉ tổng hợp kiểm thử",
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: "DEMO-A",
    },
  });
  await spa(web, "/exchange/" + webExchange.id);
  await web
    .getByRole("heading", { name: "Phiếu đề nghị đổi sách", exact: true })
    .waitFor();

  async function funding(page, exchange, native) {
    let mode = "stale",
      calls = 0,
      replay = false,
      oppositeCalls = 0;
    const requests = [];
    result.step = (native ? "rn" : "web") + ":fund";
    await page.route("**/api/v1/exchanges/" + exchange.id, async (route) => {
      if (!calls || mode === "live") return route.continue();
      if (mode === "failed")
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "Synthetic QA read failure" },
        });
      return route.fulfill({ json: exchange });
    });
    await page.route(
      "**/api/v1/exchanges/" + exchange.id + "/cancel",
      (route) => {
        oppositeCalls++;
        return route.continue();
      },
    );
    await page.route(
      "**/api/v1/exchanges/" + exchange.id + "/funding",
      async (route) => {
        calls++;
        requests.push({
          key: route.request().headers()["idempotency-key"],
          body: route.request().postData(),
        });
        if (calls === 2)
          return route.fulfill({
            status: 429,
            json: { code: "RATE_LIMITED", message: "Synthetic QA rate limit" },
          });
        const response = await route.fetch();
        if (calls === 1) return route.abort("failed");
        replay = response.headers()["idempotency-replayed"] === "true";
        mode = "failed";
        return route.fulfill({ response });
      },
    );
    const fund = page.getByRole("button", {
      name: native ? /Đặt cọc bảo chứng ngay/ : "Đặt cọc mô phỏng",
      exact: !native,
    });
    await fund.click();
    if (!native)
      await page
        .getByRole("dialog", { name: "Đặt cọc mô phỏng", exact: true })
        .getByRole("button", { name: "Đặt cọc mô phỏng", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Thử lại thao tác trước", exact: true })
      .waitFor();
    assert.equal(await fund.count(), 0);
    result.step = (native ? "rn" : "web") + ":back";
    if (native)
      await page.getByRole("tab", { name: "Tài khoản", exact: true }).click();
    else await spa(page, "/account");
    if (native)
      await page
        .getByRole("heading", { name: "Việc của tôi", exact: true })
        .waitFor();
    else await page.waitForURL("**/account");
    if (native) await page.goBack();
    else await spa(page, "/exchange/" + exchange.id);
    result.step = (native ? "rn" : "web") + ":retry-" + calls;
    await page
      .getByRole("button", { name: "Thử lại thao tác trước", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Thử lại thao tác trước", exact: true })
      .waitFor({ state: "visible" });
    assert.equal(calls, 2);
    assert.equal(await fund.count(), 0);
    if (!native) {
      const blocked = await page.evaluate(async (id) => {
        const { cancelExchange } =
          await import("/src/services/exchangeDetail.ts");
        try {
          await cancelExchange(id, 999);
          return false;
        } catch {
          return true;
        }
      }, exchange.id);
      assert(blocked);
    }
    await page.screenshot({
      path: path.join(
        out,
        native ? "rn-429-pending.png" : "web-429-pending.png",
      ),
      fullPage: !native,
    });
    await page
      .getByRole("button", { name: "Thử lại thao tác trước", exact: true })
      .click();
    await page
      .getByText("Máy chủ đã ghi nhận khoản nộp của bạn. Không cần nộp lại.", {
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "Tải lại trạng thái", exact: true })
      .waitFor();
    assert.equal(calls, 3);
    assert(replay);
    assert.equal(oppositeCalls, 0);
    assert(
      requests.every(
        (request) =>
          request.key === requests[0].key && request.body === requests[0].body,
      ),
    );
    await page.screenshot({
      path: path.join(
        out,
        native ? "rn-ack-read-failed.png" : "web-ack-read-failed.png",
      ),
      fullPage: !native,
    });
    mode = "stale";
    await page
      .getByRole("button", { name: "Tải lại trạng thái", exact: true })
      .click();
    await page
      .getByText(
        "Dữ liệu đọc lại chưa theo kịp kết quả đã xác nhận. Hãy tải lại sau một lát.",
        { exact: true },
      )
      .waitFor();
    assert.equal(await fund.count(), 0);
    mode = "live";
    await page
      .getByRole("button", { name: "Tải lại trạng thái", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Tải lại trạng thái", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(await fund.count(), 0);
    const row = await fixture.db
      .collection("exchanges")
      .findOne({ _id: exchange.id });
    assert(row.initiatorFundedAt);
    assert.equal(
      await fixture.db.collection("ledger_journals").countDocuments({
        orderId: row.initiatorOrderId,
        type: "OrderPayment",
      }),
      1,
    );
    mode = "stale";
    if (native) {
      const staleRead = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/v1/exchanges/" + exchange.id) &&
          r.request().method() === "GET",
      );
      await page.getByRole("tab", { name: "Tài khoản", exact: true }).click();
      await page
        .getByRole("heading", { name: "Việc của tôi", exact: true })
        .waitFor();
      await page.goBack();
      await staleRead;
      await page
        .getByRole("button", { name: "Quay lại", exact: true })
        .waitFor();
    } else
      await page.evaluate(async () => {
        const { queryClient } = await import("/src/lib/session.ts");
        await queryClient.refetchQueries({ queryKey: ["exchangeDetail"] });
      });
    assert.equal(await fund.count(), 0);
    mode = "live";
    result.checks.push({
      client: native ? "RN Expo web" : "Member web",
      scenario:
        "funding loss + Back + 429 + exact replay + failed/stale/fresh GET",
      calls,
      sameIntent: true,
      replay,
      paymentJournals: 1,
      oppositeCalls,
    });
  }
  await funding(web, webExchange, false);
  const rn = await browser.newPage({ viewport: { width: 390, height: 900 } });
  rn.setDefaultTimeout(12000);
  await rn.goto("http://127.0.0.1:8087/account");
  await rn
    .getByLabel("Email", { exact: true })
    .last()
    .fill("admin@operations.test");
  await rn.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await rn.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await rn
    .getByRole("heading", { name: "Việc của tôi", exact: true })
    .waitFor();
  await rn
    .getByRole("button", { name: "Trao đổi của tôi", exact: true })
    .click();
  await rn
    .getByRole("button", {
      name: "Mở đơn trao đổi #" + rnExchange.id.slice(0, 8),
      exact: true,
    })
    .click();
  await funding(rn, rnExchange, true);

  // Actual web entry: ExchangeOffer inside the structured conversation workspace.
  const target = await api("/listings/" + bl3, a.accessToken);
  const opened = await api(
    "/listings/" + bl3 + "/purchase-conversations",
    a.accessToken,
    { expectedVersion: target.version, intent: "Exchange" },
  );
  let room = await api(
    "/me/purchase-conversations/" + opened.entityId,
    a.accessToken,
  );
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
  let creates = 0,
    roomReadLive = false;
  const createRequests = [];
  await web.route("**/api/v1/me/purchase-conversations/" + room.id, (route) =>
    !roomReadLive && creates ? route.fulfill({ json: room }) : route.continue(),
  );
  await web.route("**/api/v1/exchanges", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    creates++;
    createRequests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (creates === 2)
      return route.fulfill({
        status: 429,
        json: { code: "RATE_LIMITED", message: "Synthetic QA create limit" },
      });
    const response = await route.fetch();
    if (creates === 1) return route.abort("failed");
    return route.fulfill({ response });
  });
  await spa(web, "/chat/" + room.id);
  result.step = "web:proposal";
  await web
    .locator("label")
    .filter({ has: web.getByRole("checkbox") })
    .first()
    .click();
  await web.getByRole("checkbox").first().waitFor({ state: "attached" });
  assert(await web.getByRole("checkbox").first().isChecked());
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
  assert.equal(creates, 2);
  await web
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .click();
  await web
    .getByRole("link", { name: "Xem đề nghị đã tạo", exact: true })
    .waitFor();
  assert.equal(creates, 3);
  assert(
    createRequests.every(
      (request) =>
        request.key === createRequests[0].key &&
        request.body === createRequests[0].body,
    ),
  );
  const created = await fixture.db
    .collection("exchanges")
    .find({ initiatorId: a.user.id, recipientListingId: bl3 })
    .toArray();
  assert.equal(created.length, 1);
  await web.setViewportSize({ width: 390, height: 900 });
  await web.screenshot({
    path: path.join(out, "web-negotiation-exchange-sale-summary.png"),
  });
  await web
    .getByRole("link", { name: "Xem đề nghị đã tạo", exact: true })
    .scrollIntoViewIfNeeded();
  await web.screenshot({
    path: path.join(out, "web-created-room-read-behind.png"),
  });
  result.checks.push({
    client: "Member web",
    scenario:
      "conversation create loss + Back + 429 + ACK with room GET behind",
    creates,
    proposals: 1,
    sameIntent: true,
  });
  roomReadLive = true;
  const createdState = await api("/exchanges/" + created[0]._id, a.accessToken);
  await api("/exchanges/" + created[0]._id + "/cancel", a.accessToken, {
    expectedVersion: createdState.revision,
  });

  // RN's legacy composer uses the same cross-screen proposal store.
  let rnCreates = 0;
  const rnCreateRequests = [];
  await rn.route("**/api/v1/exchanges", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    rnCreates++;
    rnCreateRequests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (rnCreates === 2)
      return route.fulfill({
        status: 429,
        json: { code: "RATE_LIMITED", message: "Synthetic QA create limit" },
      });
    const response = await route.fetch();
    if (rnCreates === 1) return route.abort("failed");
    return route.fulfill({ response });
  });
  result.step = "rn:proposal";
  await rn.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  await rn
    .getByRole("heading", { name: "Việc của tôi", exact: true })
    .waitFor();
  await spa(rn, "/book?id=" + bl3);
  await rn
    .getByRole("button", { name: "Gửi đề nghị đổi sách", exact: true })
    .click();
  await rn
    .getByRole("button", { name: "Chọn cuốn sách này", exact: true })
    .first()
    .click();
  await rn
    .getByRole("button", { name: /Gửi đề xuất đổi/ })
    .last()
    .click();
  await rn
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .waitFor();
  await rn.getByRole("button", { name: "Quay lại", exact: true }).click();
  await rn
    .getByRole("button", { name: "Gửi đề nghị đổi sách", exact: true })
    .click();
  await rn
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .click();
  await rn
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(rnCreates, 2);
  await rn
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .click();
  await rn
    .getByRole("button", { name: "Thử lại đề nghị trước", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(rnCreates, 3);
  assert(
    rnCreateRequests.every(
      (request) =>
        request.key === rnCreateRequests[0].key &&
        request.body === rnCreateRequests[0].body,
    ),
  );
  assert.equal(
    await fixture.db.collection("exchanges").countDocuments({
      initiatorId: a.user.id,
      recipientListingId: bl3,
      status: "Proposed",
    }),
    1,
  );
  result.checks.push({
    client: "RN Expo web",
    scenario: "proposal loss + Back + 429 + exact replay",
    creates: rnCreates,
    proposals: 1,
    sameIntent: true,
  });
  // A committed response from the old session must not reach the next account.
  result.step = "web:late-ack-session-switch";
  const pendingProposalRow = await fixture.db.collection("exchanges").findOne({
    initiatorId: a.user.id,
    recipientListingId: bl3,
    status: "Proposed",
  });
  let releaseAck, commandCommitted;
  const heldAck = new Promise((resolve) => {
    releaseAck = resolve;
  });
  const committed = new Promise((resolve) => {
    commandCommitted = resolve;
  });
  let oldHeaders;
  await web.route(
    "**/api/v1/exchanges/" + pendingProposalRow._id + "/cancel",
    async (route) => {
      oldHeaders = route.request().headers();
      const response = await route.fetch();
      assert(response.ok());
      commandCommitted();
      await heldAck;
      await route.fulfill({ response });
    },
  );
  await spa(web, "/exchange/" + pendingProposalRow._id);
  await web.getByRole("button", { name: "Hủy đề nghị", exact: true }).click();
  await web
    .getByRole("alertdialog")
    .getByRole("button", { name: /Hủy đề nghị|Xác nhận/ })
    .click();
  await committed;
  await web.evaluate(async () => {
    const { session } = await import("/src/services/api.ts");
    await session.logout();
  });
  await spa(web, "/login?returnUrl=" + encodeURIComponent("/account"));
  await web.getByLabel(/^Email/).fill("member@operations.test");
  await web.getByLabel(/^Mật khẩu/).fill(password);
  const nextLogin = web.waitForResponse(
    (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
  );
  await web.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  assert.equal(
    (await nextLogin).status(),
    200,
    "The second account must authenticate before the late ACK",
  );
  await web.waitForURL("**/account");
  const lateResponse = web.waitForResponse((r) =>
    r.url().endsWith("/exchanges/" + pendingProposalRow._id + "/cancel"),
  );
  releaseAck();
  await lateResponse;
  const isolated = await web.evaluate(async (id) => {
    const { session } = await import("/src/services/api.ts");
    const { pendingExchange, exchangeAcknowledged } =
      await import("/src/services/exchange.ts");
    return {
      owner: session.getSnapshot().user?.id,
      pending: Boolean(pendingExchange(id)),
      ack: Boolean(exchangeAcknowledged(id)),
    };
  }, pendingProposalRow._id);
  assert.equal(isolated.owner, b.user.id);
  assert.equal(isolated.pending, false);
  assert.equal(isolated.ack, false);
  const deniedReplay = await fetch(
    base + "/exchanges/" + pendingProposalRow._id + "/cancel",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: oldHeaders.authorization,
        "Idempotency-Key": oldHeaders["idempotency-key"],
      },
      body: JSON.stringify({ expectedVersion: pendingProposalRow.revision }),
    },
  );
  assert.equal(deniedReplay.status, 401);
  result.checks.push({
    client: "Member web + HTTP API",
    scenario:
      "logout + other account + late committed ACK + revoked-session replay",
    newAccountClean: true,
    revokedReplayStatus: 401,
  });
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
  if (staticServer?.listening)
    await new Promise((resolve) => staticServer.close(resolve));
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
