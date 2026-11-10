// Auction branches QA: Fail and NeedsEvidence inspection, the Admin auctions
// queue and cancel, sealed-bid and Dutch formats, the closed point, counter
// handover and settlement. Real HTTP/Mongo commands; the fixture server clock
// is moved forward (advanceClock) instead of waiting. Disposable *_test DB on
// rs-test; fake storage and simulator funding; no carrier.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
import { requireQaMongo, rnUsesQaApi } from "./test-journey-gate.mjs";

const require = createRequire(
  new URL("../apps/admin-web/package.json", import.meta.url),
);
const { chromium, expect } = require("playwright/test");
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
const web = "http://127.0.0.1:5184",
  ops = "http://127.0.0.1:5174",
  rn = "http://127.0.0.1:8087";
const output = path.join(root, ".tmp/auction-branches");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const button = (p, name) => p.getByRole("button", { name, exact: true });
const hash = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  status: "RUNNING",
  startedAt: new Date().toISOString(),
  sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  checks: [],
  limits: [
    "Chromium web and RN web export; not native",
    "Fake storage and simulator funding",
    "Fixture server clock moved forward; no direct auction/order state fixture",
    "No GHN/carrier delivery, claims or returns",
    "No human review or READINESS closure",
  ],
};
await mkdir(output, { recursive: true });
// Exclusive ownership of fixed QA ports and this result file. A crashed lock
// must be inspected locally, never silently removed while another run exists.
let runLock;
try {
  runLock = await open(path.join(output, "run.lock"), "wx");
} catch {
  console.error(
    "Auction QA already has a run lock. Verify that run has stopped before removing its local lock.",
  );
  process.exitCode = 1;
}
if (!runLock) process.exit(1);
await runLock.writeFile(
  JSON.stringify({ pid: process.pid, startedAt: report.startedAt }) + "\n",
);
const save = () =>
  writeFile(
    path.join(output, "result.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
await save();
let fixture,
  browser,
  nativeServer,
  phase = "QA preflight",
  closing = false,
  releasePaymentReads,
  cancelledQaReads = 0;
const servers = [],
  pageErrors = [],
  httpEvents = [],
  routeErrors = [];
function passed(name) {
  report.checks.push({ name, status: "PASS" });
  console.log("PASS: " + name);
}
async function serve(app, port) {
  const server = await createServer({
    root: path.join(root, "apps", app),
    server: { host: "127.0.0.1", port, strictPort: true },
    logLevel: "error",
  });
  servers.push(server);
  await server.listen();
}
// This suite signs in six roles plus one fresh session, more than the per-IP
// budget (5 per 15 min). Like the fixture's own start-up clear, it resets only
// this disposable DB's counters; throttling itself is covered by API E2E.
let beforeLogin = async () => {};
async function login(page, origin, route, email) {
  await beforeLogin();
  await page.goto(
    origin +
      (origin === web
        ? `/login?returnUrl=${encodeURIComponent(route)}`
        : route),
  );
  // A cold Vite server may reload once while optimizing dependencies; fill
  // the form only after the page settles so the submit is not lost.
  await page.waitForLoadState("networkidle");
  await page.getByRole("textbox", { name: /^Email(?:\s|$)/ }).fill(email);
  await page.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await button(page, "Đăng nhập").click();
  try {
    await expect(page.getByLabel(/^Mật khẩu(?:\s|$)/)).toHaveCount(0, {
      timeout: 15000,
    });
  } catch (error) {
    // Name the visible refusal (never the form values) in the failure.
    const alerts = await page.getByRole("alert").allInnerTexts();
    throw new Error(
      `Login did not finish on ${origin}${alerts.length ? `: ${alerts.join(" | ")}` : ""}`,
      { cause: error },
    );
  }
}
async function capture(page, name, width = 390) {
  // Never capture a credential form, even if a redirect raced the test.
  assert.equal(
    await page.locator('input[type="password"]').count(),
    0,
    "Credential form cannot be captured",
  );
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    name + " overflows",
  );
  await page.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
  });
}
async function navigate(page, url) {
  await page.evaluate((value) => {
    history.pushState({}, "", value);
    dispatchEvent(new PopStateEvent("popstate"));
  }, url);
}
async function reconnect(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
}
async function serveRn() {
  const dist = path.join(root, "apps/mobile-react-native/dist");
  await readFile(path.join(dist, "index.html"));
  nativeServer = createHttpServer(async (req, res) => {
    try {
      let file = path.resolve(
        dist,
        "." + decodeURIComponent(new URL(req.url, rn).pathname),
      );
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
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
        ".png": "image/png",
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
  await new Promise((resolve, reject) => {
    nativeServer.once("error", reject);
    nativeServer.listen(8087, "127.0.0.1", resolve);
  });
}
// Fetch the response first so the server really commits before losing the ACK.
// Retain only hashes/counts; never record credentials or command bodies.
async function loseFirstAck(page, pattern) {
  const attempts = [],
    inFlight = new Set();
  const handle = async (route) => {
    try {
      if (route.request().method() !== "POST") return await route.continue();
      const request = route.request();
      attempts.push({
        keyHash: hash(request.headers()["idempotency-key"] ?? ""),
        bodyHash: hash(request.postData() ?? ""),
      });
      const index = attempts.length;
      const response = await route.fetch();
      attempts[index - 1].status = response.status();
      if (index === 1) {
        assert.equal(
          response.status(),
          200,
          "Lost ACK must follow a successful server response",
        );
        return await route.abort("failed");
      }
      return await route.fulfill({ response });
    } catch {
      if (!closing)
        routeErrors.push({ phase, message: "QA response routing failed" });
      try {
        await route.abort("failed");
      } catch {
        /* Already cancelled/closed. */
      }
    }
  };
  const handler = (route) => {
    const work = handle(route);
    inFlight.add(work);
    void work.finally(() => inFlight.delete(work));
    return work;
  };
  await page.route(pattern, handler);
  return {
    attempts,
    async verify() {
      while (inFlight.size) await Promise.all([...inFlight]);
      assert.ok(attempts.length >= 2, "Expected a retry after lost ACK");
      assert.ok(
        attempts.every((a) => a.status === 200),
        "Every replay must have a successful server response: " +
          attempts.map((a) => a.status ?? "pending").join(","),
      );
      assert.ok(
        attempts.every(
          (a) =>
            a.keyHash === attempts[0].keyHash &&
            a.bodyHash === attempts[0].bodyHash,
        ),
        "Retry changed intent",
      );
      await page.unroute(pattern, handler);
    },
  };
}
try {
  requireQaMongo(process.env.MONGO_TEST_URL);
  if (!(await rnUsesQaApi(path.join(root, "apps/mobile-react-native/dist"))))
    throw new Error(
      "Export RN web with the QA API base on3009 before running this suite.",
    );
  Object.assign(process.env, {
    VITE_API_BASE_URL: base,
    AUTH_MAIL_PROVIDER: "local",
    PAYMENT_SIMULATOR_SECRET: "qa-only-auction-branches-funding-000000000",
  });
  fixture = await createTestApi({
    corsOrigin: `${web},${ops},${rn}`,
    listingCount: 5,
    onResponse: (entry) => httpEvents.push(entry),
  });
  report.qaDatabase = fixture.db.databaseName;
  const { api, db } = fixture;
  beforeLogin = () => db.collection("login_attempts").deleteMany({});
  const seller = fixture.member;
  // API setup actors use explicit identity/session fixtures; the four browser
  // participants still log in through UI. Do not disable or clear the limiter.
  const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
  const jwt = new (apiRequire("@nestjs/jwt").JwtService)({
    secret: process.env.JWT_ACCESS_SECRET,
  });
  async function setupSession(user) {
    const sessionId = randomUUID(),
      now = new Date();
    await db
      .collection("auth_sessions")
      .insertOne({
        _id: sessionId,
        userId: user._id,
        refreshTokenHash: randomBytes(32).toString("hex"),
        // Days of fixture clock moves must not expire setup sessions.
        expiresAt: new Date(now.getTime() + 30 * 24 * 3600_000),
        revokedAt: null,
        createdAt: now,
        lockSeq: 0,
      });
    return {
      user: { id: user._id },
      accessToken: await jwt.signAsync(
        { sub: user._id, sid: sessionId },
        {
          algorithm: "HS256",
          expiresIn: 900,
          issuer: "lat-lai-api",
          audience: "lat-lai-clients",
        },
      ),
    };
  }
  const admin = await setupSession(
    await db
      .collection("users")
      .findOne({ emailNormalized: "admin@operations.test" }),
  );
  const staff = await setupSession(
    await db
      .collection("users")
      .findOne({ emailNormalized: "staff@operations.test" }),
  );
  const template = await db
    .collection("users")
    .findOne({ _id: seller.user.id });
  async function actor(email, roles = ["MEMBER"]) {
    const now = new Date();
    const user = {
      ...template,
      _id: randomUUID(),
      emailNormalized: email,
      displayName: "Người dùng QA đấu giá",
      roles: roles.map((role) => ({ role, grantedAt: now })),
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("users").insertOne(user);
    return setupSession(user);
  }
  const buyer = await actor("auction-buyer@operations.test");
  const challenger = await actor("auction-challenger@operations.test");
  const operator = await actor("auction-operator@operations.test", [
    "TEST_OPERATOR",
  ]);
  const independent = await actor("auction-staff-2@operations.test", ["STAFF"]);
  // ADR 0077/0079: a registration auction needs four registered bidders.
  const reg3 = await actor("auction-bidder-3@operations.test");
  const reg4 = await actor("auction-bidder-4@operations.test");
  // Simulator funding only; ADR 0071 bids and deposits need real balances.
  async function fund(who, amount) {
    const topup = await api("/me/topups", who.accessToken, { amount });
    await api("/operations/simulator/topup-events", operator.accessToken, {
      eventId: randomUUID(),
      intentId: topup.entityId,
      recipientId: who.user.id,
      amount,
      currency: "VND",
      outcome: "Succeeded",
      occurredAt: fixture.serverNow().toISOString(),
    });
  }
  for (const who of [buyer, reg3, reg4]) await fund(who, 500000);
  // The rival starts short of the Buy Now price on purpose.
  await fund(challenger, 500000);
  async function refused(route, who, body, expected) {
    const response = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${who.accessToken}`,
        "Idempotency-Key": randomUUID(),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(response.status, expected, `Expected refusal on ${route}`);
  }
  const catalog = await api(
    `/operations/catalog-requests/${fixture.catalogId}`,
    admin.accessToken,
  );
  await api(
    `/operations/catalog-requests/${fixture.catalogId}/decision`,
    admin.accessToken,
    {
      expectedVersion: catalog.version,
      revisionId: catalog.currentRevision.id,
      decision: "Confirm",
    },
  );
  for (const id of fixture.listings) {
    const item = await api(`/operations/listings/${id}`, admin.accessToken);
    await api(`/operations/listings/${id}/decision`, admin.accessToken, {
      expectedVersion: item.version,
      revisionId: item.currentRevision.id,
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
  const points = await api("/operations/points", admin.accessToken);
  const pointId = points.items[0].id;
  for (const who of [staff, independent]) {
    const fresh = (
      await api("/operations/points", admin.accessToken)
    ).items.find((p) => p.id === pointId);
    await api(`/operations/points/${pointId}/assignments`, admin.accessToken, {
      expectedVersion: fresh.version,
      userId: who.user.id,
    });
  }
  const point = (await api("/operations/points", admin.accessToken)).items.find(
    (p) => p.id === pointId,
  );
  if (point.status !== "Active")
    await api(`/operations/points/${pointId}`, admin.accessToken, {
      expectedVersion: point.version,
      name: point.name,
      displayAddress: point.displayAddress,
      capacity: point.capacity,
      status: "Active",
      reason: "Mở điểm mô phỏng cho kiểm thử đấu giá QA.",
    });
  passed(
    "QA actors/catalog/listings/point assignments prepared; no transaction states seeded",
  );
  await serve("user-web", 5184);
  await serve("admin-web", 5174);
  await serveRn();
  browser = await chromium.launch({ headless: true });
  async function page() {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const p = await context.newPage();
    p.on("pageerror", () => pageErrors.push("Browser runtime error"));
    return p;
  }
  const desk = await page(),
    office = await page(),
    selling = await page(),
    buying = await page(),
    native = await page();
  const SLOT = 5 * 60_000;
  const nextOpen = () =>
    new Date(
      Math.ceil((fixture.serverNow().getTime() + 6 * 60_000) / SLOT) * SLOT,
    );
  const vnHour = () =>
    ((fixture.serverNow().getTime() / 3600000 + 7) % 24 + 24) % 24;
  async function intake(listingIndex, extra = {}) {
    const listing = await api(
      `/me/listings/${fixture.listings[listingIndex]}`,
      seller.accessToken,
    );
    const created = await api("/auction-intakes", seller.accessToken, {
      listingId: listing.id,
      expectedListingVersion: listing.version,
      pointId,
      startPrice: 100000,
      step: 10000,
      buyNowPrice: null,
      ...extra,
    });
    return created.entityId;
  }
  const mine = (id) => api(`/me/auction-intakes/${id}`, seller.accessToken);
  const receive = async (id) =>
    api(`/operations/auction-intakes/${id}/receive`, staff.accessToken, {
      expectedVersion: (await mine(id)).version,
      shelfCode: "QA-B01",
    });
  const allMatch = {
    titleEditionMatches: true,
    privateMarksMatch: true,
    coverPagesMatch: true,
    notesAccessoriesMatch: true,
    suspectedCopy: false,
  };
  const pass = async (id) =>
    api(`/operations/auction-intakes/${id}/inspect`, staff.accessToken, {
      expectedVersion: (await mine(id)).version,
      outcome: "Pass",
      checklist: allMatch,
      note: "DỮ LIỆU QA: khớp mô tả.",
    });
  async function publish(id, opensAt, durationSeconds = 3600) {
    await api(`/auction-intakes/${id}/publish`, seller.accessToken, {
      expectedVersion: (await mine(id)).version,
      startAt: opensAt.toISOString(),
      durationSeconds,
    });
    return (await mine(id)).auctionId;
  }
  const auction = async (id) => (await api(`/auctions/${id}`)).auction;
  const register = (id, who) =>
    api(`/auctions/${id}/registration`, who.accessToken, { deposit: 10000 });
  const wallet = (who) => api("/me/wallet", who.accessToken);
  const bidders = [buyer, challenger, reg3, reg4];
  // Browser tokens are memory-only, so re-read a queue by moving between
  // routes instead of reloading the page (which would sign out).
  const requeue = async (p, route) => {
    await navigate(p, "/operations/collections");
    await navigate(p, route);
  };
  const confirmDialog = (p) =>
    p
      .locator("dialog[open]")
      .getByRole("button", { name: /Xác nhận/ })
      .click();

  phase = "Staff fails an intake in the admin UI; seller reclaims it";
  const failId = await intake(0);
  await receive(failId);
  // Received before Staff opens the queue, so both rows are in its first read.
  const evidenceId = await intake(1);
  await receive(evidenceId);
  await login(desk, ops, "/operations/intakes", "staff@operations.test");
  let row = desk.locator(`[data-motion-key='${failId}']`);
  await row.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  let panel = row.getByRole("region", { name: "Kiểm tra tình trạng sách" });
  for (const label of [
    "Đúng đầu sách và ấn bản",
    "Bìa và trang khớp mô tả",
    "Ghi chú và phụ kiện khớp mô tả",
  ])
    await panel.getByRole("checkbox", { name: label, exact: true }).check();
  // A mismatch cannot be recorded as Pass.
  await expect(panel.getByRole("radio", { name: /^Đạt:/ })).toBeDisabled();
  await panel.getByRole("radio", { name: /^Không đạt:/ }).check();
  await panel
    .getByLabel("Ghi chú kiểm tra", { exact: true })
    .fill("DỮ LIỆU QA: dấu riêng không khớp ảnh đã đăng.");
  await capture(desk, "staff-inspect-fail-panel", 1440);
  await panel
    .getByRole("button", { name: "Ghi kết luận kiểm tra", exact: true })
    .click();
  await confirmDialog(desk);
  await expect
    .poll(async () => (await mine(failId)).state)
    .toBe("ReclaimRequired");
  await refused(
    `/auction-intakes/${failId}/publish`,
    seller,
    {
      expectedVersion: (await mine(failId)).version,
      startAt: nextOpen().toISOString(),
      durationSeconds: 3600,
    },
    409,
  );
  await login(selling, web, `/my-auctions?intakeId=${failId}`, "member@operations.test");
  await expect(
    selling.getByText("Mời bạn tới điểm nhận lại sách", { exact: true }),
  ).toBeVisible();
  await expect(
    selling.getByText(/Sách chưa khớp mô tả khi kiểm tra/).first(),
  ).toBeVisible();
  assert.equal(await button(selling, "Đăng phiên").count(), 0);
  await capture(selling, "seller-reclaim-after-fail");
  await requeue(desk, "/operations/intakes");
  row = desk.locator(`[data-motion-key='${failId}']`);
  await row.getByRole("button", { name: "Trả sách", exact: true }).click();
  await row
    .getByRole("button", { name: "Xác nhận đã trả sách", exact: true })
    .click();
  await confirmDialog(desk);
  await expect.poll(async () => (await mine(failId)).state).toBe("Reclaimed");
  assert.equal(
    await db.collection("exclusive_commitments").countDocuments({
      listingId: fixture.listings[0],
      status: "Active",
    }),
    0,
  );
  // An open page refreshes within its 20 s poll; a fresh session (the seller
  // opening the app later) must show the final state at once.
  const later = await page();
  await login(later, web, `/my-auctions?intakeId=${failId}`, "member@operations.test");
  await expect(
    later.getByText("Bạn đã nhận lại sách", { exact: true }),
  ).toBeVisible();
  await later.context().close();
  passed(
    "Fail inspection in admin UI (Pass blocked on a mismatch) -> seller told to reclaim, publish refused -> counter return -> Reclaimed, commitment released",
  );

  phase = "NeedsEvidence in admin UI; independent Staff decides Fail";
  await requeue(desk, "/operations/intakes");
  row = desk.locator(`[data-motion-key='${evidenceId}']`);
  await row.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  panel = row.getByRole("region", { name: "Kiểm tra tình trạng sách" });
  await panel.getByRole("radio", { name: /^Cần bằng chứng:/ }).check();
  await panel
    .getByLabel("Ghi chú kiểm tra", { exact: true })
    .fill("DỮ LIỆU QA: cần ảnh dấu riêng ở trang bìa lót.");
  await panel
    .getByRole("button", { name: "Ghi kết luận kiểm tra", exact: true })
    .click();
  await confirmDialog(desk);
  await expect
    .poll(async () => (await mine(evidenceId)).state)
    .toBe("NeedsEvidence");
  await api(`/me/auction-intakes/${evidenceId}/evidence`, seller.accessToken, {
    expectedVersion: (await mine(evidenceId)).version,
    note: "DỮ LIỆU QA: dấu riêng nằm ở trang bìa lót, góc dưới bên phải.",
  });
  // The Staff member who asked never decides; the row offers them nothing.
  await requeue(desk, "/operations/intakes");
  row = desk.locator(`[data-motion-key='${evidenceId}']`);
  await expect(row).toBeVisible();
  assert.equal(
    await row.getByRole("button", { name: "Xem bằng chứng", exact: true }).count(),
    0,
  );
  await login(office, ops, "/operations/intakes", "auction-staff-2@operations.test");
  row = office.locator(`[data-motion-key='${evidenceId}']`);
  await row.getByRole("button", { name: "Xem bằng chứng", exact: true }).click();
  panel = row.getByRole("region", {
    name: "Quyết định sau khi yêu cầu bằng chứng",
  });
  await expect(panel.getByText(/trang bìa lót, góc dưới/)).toBeVisible();
  await panel.getByRole("radio", { name: /^Không đạt:/ }).check();
  await panel
    .getByLabel("Lý do quyết định", { exact: true })
    .fill("DỮ LIỆU QA: bằng chứng không khớp ảnh lúc đăng sách.");
  await capture(office, "staff-evidence-decision-panel", 1440);
  await panel.getByRole("button", { name: "Ghi quyết định", exact: true }).click();
  await confirmDialog(office);
  await expect
    .poll(async () => (await mine(evidenceId)).state)
    .toBe("ReclaimRequired");
  passed(
    "NeedsEvidence via admin UI -> seller answers -> requester gets no decision action -> independent Staff records Fail in admin UI",
  );

  phase = "Seller creates a sealed-bid intake in the web UI";
  await navigate(selling, `/auctions/new?listing=${fixture.listings[3]}`);
  await expect(
    selling.getByRole("heading", { level: 1, name: /Đưa một cuốn sách/ }),
  ).toBeVisible();
  await selling.getByRole("radio", { name: new RegExp(point.name) }).check();
  await selling
    .getByRole("group", { name: "Hình thức đấu giá" })
    .getByRole("button", { name: /^Giá kín · giá thứ nhất/ })
    .click();
  await selling.getByLabel("Giá khởi điểm", { exact: true }).fill("100000");
  await button(selling, "Giữ chỗ đấu giá").click();
  await selling
    .getByRole("dialog")
    .getByRole("button", { name: "Giữ chỗ", exact: true })
    .click();
  await expect(
    selling.getByRole("heading", { name: /Mang .* tới điểm nhận sách/ }),
  ).toBeVisible();
  const sealedIntake = (await api("/me/auction-intakes", seller.accessToken)).items.find(
    (i) => i.listingId === fixture.listings[3] && i.state === "AwaitingDropoff",
  );
  assert.ok(sealedIntake, "Sealed intake created");
  passed("Create page records the sealed-bid format choice");

  phase = "Admin auctions queue shows the open time and registrations; Admin cancels";
  // ADR: a seller has at most two open intakes/auctions; hand the failed book
  // back first so the sealed intake and this one fit.
  await api(`/operations/auction-intakes/${evidenceId}/reclaim`, staff.accessToken, {
    expectedVersion: (await mine(evidenceId)).version,
  });
  const cancelIntake = await intake(2);
  await receive(cancelIntake);
  await pass(cancelIntake);
  const cancelId = await publish(
    cancelIntake,
    new Date(nextOpen().getTime() + 3600000),
  );
  await register(cancelId, buyer);
  await register(cancelId, challenger);
  await login(office, ops, "/operations/auctions", "admin@operations.test");
  row = office.locator(`[data-motion-key='${cancelId}']`);
  await expect(row.getByText(/^Chờ đủ người, mở /)).toBeVisible();
  await expect(row.getByText("2/4 người đăng ký", { exact: true })).toBeVisible();
  await capture(office, "admin-auctions-queue", 1440);
  const beforeCancel = await wallet(buyer);
  await row.getByRole("button", { name: "Hủy phiên", exact: true }).click();
  await row
    .getByLabel("Lý do hủy", { exact: true })
    .fill("DỮ LIỆU QA: người bán báo sách bị hư hại tại điểm.");
  await row.getByRole("button", { name: "Hủy phiên", exact: true }).last().click();
  await confirmDialog(office);
  await expect.poll(async () => (await auction(cancelId)).state).toBe("Cancelled");
  // Registrants' deposits come back when the Admin cancels.
  assert.equal((await wallet(buyer)).available, beforeCancel.available + 10000);
  await expect
    .poll(async () => (await mine(cancelIntake)).state)
    .toBe("ReclaimRequired");
  await api(`/operations/auction-intakes/${cancelIntake}/reclaim`, staff.accessToken, {
    expectedVersion: (await mine(cancelIntake)).version,
  });
  passed(
    "Admin queue names the open time and 2/4 registrations (not the 24 h deadline); Admin cancel with a reason refunds deposits; the book goes back to the seller",
  );

  phase = "Sealed and Dutch auctions published and registered";
  const dutchIntake = await intake(4, {
    auctionType: "Dutch",
    dutchTopPrice: 200000,
    dutchIntervalSeconds: 60,
  });
  for (const id of [sealedIntake.id, dutchIntake]) {
    await receive(id);
    await pass(id);
  }
  const opensAt = nextOpen();
  const sealedId = await publish(sealedIntake.id, opensAt);
  const dutchId = await publish(dutchIntake, opensAt);
  assert.equal((await auction(sealedId)).auctionType, "SealedFirst");
  assert.equal((await auction(dutchId)).auctionType, "Dutch");
  for (const who of bidders) {
    await register(sealedId, who);
    await register(dutchId, who);
  }
  // The Admin's queue copy stays fresh for 15 s; re-open the route until the
  // new rows are read (no extra login: the login limiter stays on).
  await expect
    .poll(
      async () => {
        await requeue(office, "/operations/auctions");
        return office.locator(`[data-motion-key='${dutchId}']`).count();
      },
      { timeout: 25000, intervals: [3000] },
    )
    .toBe(1);
  for (const [id, label] of [[sealedId, "Giá kín"], [dutchId, "Giá giảm dần"]]) {
    const r = office.locator(`[data-motion-key='${id}']`);
    await expect(r.getByText(label, { exact: true })).toBeVisible();
    await expect(r.getByText(/^Đủ người, mở /)).toBeVisible();
  }
  passed("Sealed and Dutch auctions full at 4/4; Admin queue names each format and the real open time");

  phase = "Sealed bids stay hidden; Dutch price falls and the first acceptance wins";
  await fixture.advanceClock(Math.max(0, opensAt.getTime() - fixture.serverNow().getTime()) + 2000);
  assert.equal((await auction(sealedId)).phase, "Live");
  await login(buying, web, `/auctions/${sealedId}`, "auction-buyer@operations.test");
  await expect(
    buying.getByText("Đấu giá kín · giá thứ nhất", { exact: true }),
  ).toBeVisible();
  // The field starts at the floor and is re-seeded when participation loads;
  // fill again until the typed amount holds.
  const sealedInput = buying.getByLabel("Giá kín của bạn", { exact: true });
  await expect(async () => {
    await sealedInput.fill("200000");
    await expect(sealedInput).toHaveValue("200.000", { timeout: 1000 });
  }).toPass({ timeout: 10000 });
  try {
    await buying.getByRole("button", { name: /^Gửi giá kín 200\.000/ }).click({ timeout: 5000 });
  } catch (error) {
    const names = await buying.locator("main button").allInnerTexts();
    const val = await buying.getByLabel("Giá kín của bạn", { exact: true }).inputValue().catch(() => "?");
    throw new Error(`Sealed buttons: ${names.join(" | ")}; input=${val}`, { cause: error });
  }
  await buying
    .getByRole("dialog")
    .getByRole("button", { name: "Gửi giá kín", exact: true })
    .click();
  await expect(buying.getByText(/^Giá kín của bạn: 200\.000/)).toBeVisible();
  await api(`/auctions/${sealedId}/sealed-bid`, challenger.accessToken, {
    amount: 150000,
    fulfillmentMethod: "SelfCollect",
  });
  // Raising only: a lower sealed bid is refused.
  const lower = await fetch(base + `/auctions/${sealedId}/sealed-bid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${buyer.accessToken}`,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({ amount: 190000, fulfillmentMethod: "SelfCollect" }),
  });
  assert.ok([409, 422].includes(lower.status), `Lower sealed bid refused (${lower.status})`);
  const sealedPublic = await auction(sealedId);
  assert.equal(sealedPublic.currentPrice, null, "Sealed price stays hidden");
  await capture(buying, "buyer-sealed-bid");
  await login(native, rn, "/account", "auction-challenger@operations.test");
  await navigate(native, `/auction?id=${sealedId}`);
  await expect(
    native
      .getByText("Đấu giá kín · giá thứ nhất", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  assert.equal(
    await native.getByText(/200\.000/).filter({ visible: true }).count(),
    0,
    "RN never shows another member's sealed bid",
  );
  await capture(native, "rn-sealed-rival");
  // Dutch: two intervals later the price is two steps lower.
  await fixture.advanceClock(125_000);
  const dutchNow = await auction(dutchId);
  assert.equal(dutchNow.dutchPrice, 180000);
  await navigate(native, `/auction?id=${dutchId}`);
  await expect(
    native
      .getByText(/Giá hiện tại 180\.000/)
      .filter({ visible: true }),
  ).toBeVisible();
  await capture(native, "rn-dutch-price");
  await navigate(buying, `/auctions/${dutchId}`);
  try {
    await expect(buying.getByText(/Giá hiện tại 180\.000/)).toBeVisible();
  } catch (error) {
    const t = (await buying.locator("main").innerText()).slice(0, 900);
    throw new Error(`Web Dutch page: ${t}`, { cause: error });
  }
  await buying.getByRole("button", { name: /^Chấp nhận 180\.000/ }).click();
  await buying
    .getByRole("dialog")
    .getByRole("button", { name: "Chấp nhận giá", exact: true })
    .click();
  await expect.poll(async () => (await auction(dutchId)).phase).toBe("Ended");
  const dutchEnded = await auction(dutchId);
  assert.equal(dutchEnded.currentPrice, 180000);
  await refused(
    `/auctions/${dutchId}/dutch-accept`,
    challenger,
    { price: 180000, fulfillmentMethod: "SelfCollect" },
    409,
  );
  passed(
    "Sealed bid in web UI, rival's RN view shows no amounts, lower bid refused; Dutch falls 2 steps in 2 intervals, first acceptance wins, a late one is refused",
  );

  phase = "Sealed auction closes at its end; winner pays own bid; losers refunded";
  const sealedLive = await auction(sealedId);
  await fixture.advanceClock(
    Math.max(0, Date.parse(sealedLive.endAt) - fixture.serverNow().getTime()) + 2000,
  );
  await fixture.processAuctions();
  await fixture.processAuctions();
  const sealedWon = await api(
    `/me/auctions/${sealedId}/participation`,
    buyer.accessToken,
  );
  assert.equal(sealedWon.won, true);
  const sealedOrder = await api(`/me/point-orders/${sealedWon.orderId}`, buyer.accessToken);
  assert.equal(sealedOrder.amounts.buyerTotal, 200000, "First price: the winner pays their bid");
  const dutchWon = await api(`/me/auctions/${dutchId}/participation`, buyer.accessToken);
  assert.equal(dutchWon.won, true);
  const dutchOrder = await api(`/me/point-orders/${dutchWon.orderId}`, buyer.accessToken);
  assert.equal(dutchOrder.amounts.buyerTotal, 180000);
  for (const who of [challenger, reg3, reg4]) {
    const w = await wallet(who);
    assert.equal(w.available, w.total, "Loser holds nothing after both closes");
  }
  // Pay both from the held amounts (payment UI is covered by the journey).
  for (const o of [sealedOrder, dutchOrder])
    await api(`/point-orders/${o.id}/pay`, buyer.accessToken, {
      expectedVersion: o.version,
      fulfillmentMethod: "SelfCollect",
    });
  passed("Sealed first-price closes by worker at endAt; winner orders at own bid; every loser fully released");

  phase = "Winner accepts the report in the web UI";
  await navigate(buying, "/my-auctions?view=payment");
  await navigate(buying, `/auctions/${sealedId}`);
  await button(buying, "Đồng ý biên bản").click();
  await buying
    .getByRole("dialog")
    .getByRole("button", { name: "Đồng ý", exact: true })
    .click();
  await expect
    .poll(async () => (await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken)).state)
    .toBe("ReadyForCollection");
  passed("Report acceptance in web UI -> ReadyForCollection");

  phase = "Pickup code refused while the point is closed";
  // Move the server to 19:00 Vietnam time if the point is open now.
  const hour = vnHour();
  if (hour >= 9 && hour < 18)
    await fixture.advanceClock(Math.ceil((19 - hour) * 3600000));
  // A session opened after the clock move reads the evening server time.
  const evening = await page();
  await login(evening, web, `/auctions/${sealedId}`, "auction-buyer@operations.test");
  await expect(evening.getByText(/^Điểm đang đóng cửa\. Quầy mở lại lúc/)).toBeVisible();
  await expect(button(evening, "Lấy mã nhận sách")).toBeDisabled();
  const ready = await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken);
  // The contract lets the buyer ask for a code at any time; what protects the
  // book is the counter: a handover outside 09:00-18:00 is refused.
  const offHours = await api(
    `/point-orders/${sealedOrder.id}/collection-code`,
    buyer.accessToken,
    { expectedVersion: ready.version },
  );
  assert.match(offHours.code, /^\d{6}$/);
  const afterCode = await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken);
  await refused(
    `/operations/point-orders/${sealedOrder.id}/handover`,
    staff,
    { expectedVersion: afterCode.version, code: offHours.code },
    409,
  );
  assert.equal(
    (await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken)).state,
    "ReadyForCollection",
  );
  await capture(evening, "buyer-point-closed");
  await evening.context().close();
  passed("Closed point: page names the reopening time and disables the code; the counter refuses a handover even with a valid code");

  phase = "Counter handover during opening hours";
  // Next 09:05 Vietnam time.
  const toMorning = ((24 + 9 + 1 / 12 - vnHour()) % 24) * 3600000;
  await fixture.advanceClock(Math.ceil(toMorning));
  assert.ok(vnHour() >= 9 && vnHour() < 18, "Point is open");
  // The open page still holds the 19:00 server time it last read (real time
  // would have run its countdown out); the buyer opens the app again.
  const morning = await page();
  await login(morning, web, `/auctions/${sealedId}`, "auction-buyer@operations.test");
  await button(morning, "Lấy mã nhận sách").click();
  await morning
    .getByRole("dialog")
    .getByRole("button", { name: "Lấy mã", exact: true })
    .click();
  const codeText = await morning
    .getByRole("region", { name: "Mã nhận sách" })
    .innerText();
  const code = codeText.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, "Six-digit pickup code shown");
  await login(desk, ops, "/operations/collections", "staff@operations.test");
  row = desk.locator(`[data-motion-key='${sealedOrder.id}']`);
  await row.getByRole("button", { name: "Giao sách", exact: true }).click();
  const wrong = code === "000000" ? "111111" : "000000";
  await row.getByLabel("Mã nhận sách", { exact: true }).fill(wrong);
  await row.getByRole("button", { name: "Kiểm tra mã và giao sách", exact: true }).click();
  await confirmDialog(desk);
  await expect(row.getByText(/^Mã chưa đúng, chưa giao sách\. Còn 4 lần thử/)).toBeVisible();
  assert.equal(
    (await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken)).state,
    "ReadyForCollection",
  );
  await row.getByLabel("Mã nhận sách", { exact: true }).fill(code);
  await row.getByRole("button", { name: "Kiểm tra mã và giao sách", exact: true }).click();
  await confirmDialog(desk);
  await expect
    .poll(async () => (await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken)).state)
    .toBe("Inspection");
  await capture(desk, "staff-handover-done", 1440);
  passed("Pickup code in web UI -> wrong code refused at the counter -> right code hands the book over -> Inspection");

  phase = "Inspection window ends; the worker settles to the seller";
  const sellerBefore = await wallet(seller);
  const inspecting = await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken);
  await fixture.advanceClock(
    Math.max(0, Date.parse(inspecting.inspectionDeadline ?? "") - fixture.serverNow().getTime() || 72 * 3600000) + 2000,
  );
  await fixture.processAuctions();
  await expect
    .poll(async () => (await api(`/me/point-orders/${sealedOrder.id}`, buyer.accessToken)).state)
    .toBe("Completed");
  const sellerAfter = await wallet(seller);
  // 5% commission (POINT_ORDER_COMMISSION_BPS) on the 200.000đ book price.
  assert.equal(sellerAfter.total - sellerBefore.total, 190000);
  passed("No claim in the inspection window -> worker settles; seller receives price minus 5% commission");

  assert.equal(pageErrors.length, 0, "Browser runtime errors occurred");
  assert.equal(routeErrors.length, 0, "QA response routing errors occurred");
  assert.equal(
    httpEvents.filter(
      (e) =>
        e.method !== "GET" &&
        /\/(?:shipments|carrier|ghn|driver|dispatch)(?:\/|$)/.test(e.path),
    ).length,
    0,
    "Out-of-scope command observed",
  );
  report.status = "PASS";
} catch (error) {
  report.status = phase === "QA preflight" ? "BLOCKED" : "FAIL";
  report.failedPhase = phase;
  // Playwright call logs can include filled credentials. Redact even local QA.
  const message = String(error?.message ?? "Unknown failure")
    .replaceAll(password, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "[redacted-token]");
  await writeFile(path.join(output, "failure.txt"), message + "\n");
  console.error(
    `Auction branches ${report.status}: ${phase}; sanitized detail in .tmp/auction-branches/failure.txt`,
  );
  process.exitCode = 1;
} finally {
  closing = true;
  releasePaymentReads?.();
  let cleanupFailures = 0;
  for (const cleanup of [
    () => browser?.close(),
    () =>
      nativeServer?.listening
        ? new Promise((resolve) => nativeServer.close(resolve))
        : undefined,
    ...servers.reverse().map((server) => () => server.close()),
    () => fixture?.close(),
  ]) {
    try {
      await cleanup();
    } catch {
      cleanupFailures++;
    }
  }
  report.cleanup = cleanupFailures ? "FAIL" : "PASS";
  if (cleanupFailures) {
    report.status = "FAIL";
    process.exitCode = 1;
    console.error(
      "QA cleanup failed; inspect only this run's disposable database and processes.",
    );
  }
  report.finishedAt = new Date().toISOString();
  report.browserRuntimeErrors = pageErrors.length;
  report.cancelledQaReads = cancelledQaReads;
  report.routeErrors = routeErrors;
  await save();
  await runLock.close();
  await unlink(path.join(output, "run.lock"));
}
