// Cross-role browser QA: real HTTP/Mongo commands and real server time.
// Disposable *_test DB on rs-test; fake storage/funding, no carrier/fulfillment.
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
const output = path.join(root, ".tmp/auction-journey");
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
    "Chromium web; not native",
    "Fake storage and simulator funding",
    "Real server time; no direct auction/order state fixture",
    "No GHN/carrier/Driver or fulfillment/settlement",
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
async function login(page, origin, route, email) {
  await page.goto(
    origin +
      (origin === web
        ? `/login?returnUrl=${encodeURIComponent(route)}`
        : route),
  );
  await page.getByRole("textbox", { name: /^Email(?:\s|$)/ }).fill(email);
  await page.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await button(page, "Đăng nhập").click();
  await expect(page.getByLabel(/^Mật khẩu(?:\s|$)/)).toHaveCount(0);
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
    PAYMENT_SIMULATOR_SECRET: "qa-only-auction-journey-funding-0000000000",
  });
  fixture = await createTestApi({
    corsOrigin: `${web},${ops},${rn}`,
    listingCount: 3,
    onResponse: (entry) => httpEvents.push(entry),
  });
  report.qaDatabase = fixture.db.databaseName;
  const { api, db } = fixture;
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
        expiresAt: new Date(now.getTime() + 30 * 60_000),
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
  const selling = await page(),
    desk = await page(),
    buying = await page(),
    competing = await page(),
    native = await page();
  phase = "Seller creates intake from real shelf";
  await login(selling, web, "/my-books", "member@operations.test");
  const entry = selling.locator(
    `a[href='/auctions/new?listing=${fixture.listings[0]}']`,
  );
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(
    selling.getByRole("heading", { level: 1, name: /Đưa một cuốn sách/ }),
  ).toBeVisible();
  await selling.getByRole("radio", { name: new RegExp(point.name) }).check();
  await selling.getByLabel("Giá khởi điểm", { exact: true }).fill("100000");
  await selling.getByRole("checkbox", { name: /Cho phép mua ngay/ }).check();
  await selling.getByLabel("Giá mua ngay", { exact: true }).fill("300000");
  const createAck = await loseFirstAck(selling, "**/api/v1/auction-intakes");
  await button(selling, "Giữ chỗ đấu giá").click();
  await selling
    .getByRole("dialog")
    .getByRole("button", { name: "Giữ chỗ", exact: true })
    .click();
  // Transport may retry automatically; otherwise the UI must keep the exact intent.
  await sleep(1500);
  if (await button(selling, "Thử lại đúng yêu cầu này").isVisible())
    await button(selling, "Thử lại đúng yêu cầu này").click();
  await expect(
    selling.getByRole("heading", { name: /Mang .* tới điểm nhận sách/ }),
  ).toBeVisible();
  await createAck.verify();
  const intake = (
    await api("/me/auction-intakes", seller.accessToken)
  ).items.find((i) => i.listingId === fixture.listings[0]);
  assert.ok(intake);
  assert.equal(
    await db
      .collection("auction_intakes")
      .countDocuments({ listingId: intake.listingId }),
    1,
  );
  await refused(`/me/auction-intakes/${intake.id}`, buyer, undefined, 404);
  await refused(
    `/operations/auction-intakes/${intake.id}/receive`,
    admin,
    { expectedVersion: intake.version, shelfCode: "QA-NO" },
    403,
  );
  await refused(
    `/auction-intakes/${intake.id}/publish`,
    seller,
    { expectedVersion: intake.version, startAt: null, durationHours: 1 },
    409,
  );
  await capture(selling, "seller-intake-receipt");
  await selling
    .getByRole("link", { name: /Theo dõi trong Đấu giá của tôi/ })
    .click();
  await expect(
    selling.getByText("Chờ bạn mang sách tới điểm", { exact: true }),
  ).toBeVisible();
  passed(
    "Seller shelf entry -> create intake with lost ACK -> one intake -> tracking",
  );

  phase = "Assigned Staff receives and inspects";
  await login(desk, ops, "/operations/intakes", "staff@operations.test");
  const row = desk.locator(`[data-motion-key='${intake.id}']`);
  await row.getByRole("button", { name: "Nhận sách", exact: true }).click();
  await row.getByLabel("Mã kệ", { exact: true }).fill("QA-A01");
  await row
    .getByRole("button", { name: "Xác nhận đã nhận sách", exact: true })
    .click();
  await desk
    .locator("dialog[open]")
    .getByRole("button", { name: /Xác nhận/ })
    .click();
  await expect(
    row.getByRole("button", { name: "Kiểm tra", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Kiểm tra", exact: true }).click();
  for (const label of [
    "Đúng đầu sách và ấn bản",
    "Dấu riêng khớp ảnh đã đăng",
    "Bìa và trang khớp mô tả",
    "Ghi chú và phụ kiện khớp mô tả",
  ])
    await row.getByRole("checkbox", { name: label, exact: true }).check();
  await row.getByRole("radio", { name: /Đạt: mọi mục khớp/ }).check();
  await row
    .getByRole("button", { name: "Ghi kết luận kiểm tra", exact: true })
    .click();
  await desk
    .locator("dialog[open]")
    .getByRole("button", { name: /Xác nhận/ })
    .click();
  await expect(
    row.getByText("Đạt kiểm tra, chờ người bán đăng phiên", { exact: true }),
  ).toBeVisible();
  await capture(desk, "staff-passed", 1440);
  passed(
    "Assigned Staff receives book and records actual checklist Pass via UI",
  );

  phase = "Seller follows exact intake -> publishes -> opens correct auction";
  await navigate(selling, `/my-auctions?intakeId=${intake.id}`);
  await button(selling, "Đăng phiên").click();
  const publishAck = await loseFirstAck(
    selling,
    `**/api/v1/auction-intakes/${intake.id}/publish`,
  );
  await selling
    .getByLabel("Thời lượng phiên", { exact: true })
    .selectOption("1");
  await selling.getByRole("radio", { name: "Hẹn giờ mở", exact: true }).check();
  await button(selling, "Hẹn giờ mở phiên").click();
  await sleep(1500);
  const publishDialog = selling.getByRole("dialog", {
    name: "Đăng phiên đấu giá",
  });
  if (
    (await publishDialog.isVisible()) &&
    (await publishDialog
      .getByRole("button", { name: "Thử lại", exact: true })
      .isVisible())
  )
    await publishDialog
      .getByRole("button", { name: "Thử lại", exact: true })
      .click();
  await expect(publishDialog).not.toBeVisible();
  await publishAck.verify();
  const published = await api(
    `/me/auction-intakes/${intake.id}`,
    seller.accessToken,
  );
  const auctionId = published.auctionId;
  const ownershipPath = `**/api/v1/me/auction-intakes?auctionId=${auctionId}`;
  assert.ok(auctionId);
  assert.equal(
    await db.collection("auctions").countDocuments({ intakeId: intake.id }),
    1,
  );
  await capture(selling, "seller-focus-after-publish");
  await expect(
    selling.getByRole("link", { name: "Xem phiên đấu giá", exact: true }),
  ).toHaveAttribute("href", `/auctions/${auctionId}`);
  await selling
    .getByRole("link", { name: "Xem phiên đấu giá", exact: true })
    .click();
  await expect(
    selling.getByText("Đây là phiên của bạn", { exact: true }),
  ).toBeVisible();
  await refused(
    `/auctions/${auctionId}/bids`,
    buyer,
    { amount: 100000, fulfillmentMethod: "SelfCollect" },
    409,
  );
  const scheduled = await api(`/auctions/${auctionId}`);
  assert.equal(scheduled.auction.phase, "Scheduled");
  await refused(
    `/auctions/${auctionId}/schedule`,
    seller,
    {
      expectedVersion: scheduled.auction.version + 1,
      startAt: null,
      durationHours: 1,
    },
    409,
  );
  await button(selling, "Đổi thời gian phiên").click();
  await selling.getByLabel("Thời lượng phiên", { exact: true }).selectOption("3");
  await selling.route(ownershipPath, route => route.fulfill({ status: 503, json: { code: "QA_UNAVAILABLE", message: "QA unavailable" } }));
  await reconnect(selling);
  await expect(button(selling, "Thử lại kiểm tra vai trò")).toBeVisible();
  await expect(selling.getByRole("dialog", { name: "Đổi thời gian phiên" })).not.toBeVisible();
  await selling.unroute(ownershipPath);
  await button(selling, "Thử lại kiểm tra vai trò").click();
  await expect(selling.getByLabel("Thời lượng phiên", { exact: true })).toHaveValue("3");
  await selling.getByRole("radio", { name: "Mở ngay", exact: true }).check();
  await button(selling, "Lưu thời gian mới").click();
  await expect(
    selling.getByRole("dialog", { name: "Đổi thời gian phiên" }),
  ).not.toBeVisible();
  assert.equal((await api(`/auctions/${auctionId}`)).auction.phase, "Live");
  passed(
    "Exact intake -> scheduled publish/replay -> one auction -> seller opens now; premature bid/stale edit refused",
  );

  phase = "RN web exact intake and published auction link";
  await login(native, rn, "/account", "member@operations.test");
  await navigate(native, `/send-to-auction?intakeId=${intake.id}`);
  await expect(
    native.getByText("Đã tạo phiên đấu giá", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await native.getByText(/Trạng thái hiện tại: Auctioning/).count(),
    0,
  );
  await capture(native, "rn-intake-published");
  await native.route(ownershipPath, (route) =>
    route.fulfill({
      status: 503,
      json: { code: "QA_UNAVAILABLE", message: "QA unavailable" },
    }),
  );
  await button(native, "Xem phiên đấu giá").click();
  await native.waitForURL(
    (url) =>
      url.pathname === "/auction" && url.searchParams.get("id") === auctionId,
  );
  await expect(
    native
      .getByText("Chưa kiểm tra được vai trò của bạn", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  assert.equal(
    await native
      .getByLabel("Số tiền trả lượt này", { exact: true })
      .filter({ visible: true })
      .count(),
    0,
  );
  await native.unroute(ownershipPath);
  await button(native, "Thử lại kiểm tra vai trò").click();
  // Expo keeps previous route trees mounted but hidden; assert the visible route.
  await expect(
    native
      .getByText(published.title, { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expect(
    native
      .getByText("Đây là phiên của bạn", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  assert.equal(
    await native
      .getByLabel("Số tiền trả lượt này", { exact: true })
      .filter({ visible: true })
      .count(),
    0,
  );
  passed(
    "RN web focused intake names the state and opens the exact real auction; not native acceptance",
  );

  await selling.route(ownershipPath, (route) =>
    route.fulfill({
      status: 503,
      json: { code: "QA_UNAVAILABLE", message: "QA unavailable" },
    }),
  );
  await navigate(selling, "/auctions");
  await selling.locator(`a[href='/auctions/${auctionId}']`).first().click();
  await expect(button(selling, "Thử lại kiểm tra vai trò")).toBeVisible();
  assert.equal(
    await selling.getByLabel("Số tiền trả lượt này", { exact: true }).count(),
    0,
  );
  await selling.unroute(ownershipPath);
  await button(selling, "Thử lại kiểm tra vai trò").click();
  await expect(
    selling.getByText("Đây là phiên của bạn", { exact: true }),
  ).toBeVisible();
  passed(
    "Web and RN ownership-read failure never becomes permission to self-bid; retry restores seller controls",
  );

  phase = "Buyer bid replay and competitor Buy Now after a bid";
  await login(buying, web, "/auctions", "auction-buyer@operations.test");
  await buying.locator(`a[href='/auctions/${auctionId}']`).first().click();
  // This fault is a revalidation failure after a known role, not a failed
  // initial lookup (covered above). Wait until the real form is available.
  await expect(buying.getByLabel("Số tiền trả lượt này", { exact: true })).toBeVisible();
  await buying.getByRole("button", { name: /Đặt giá tự động/ }).click();
  await buying.getByLabel("Mức tối đa cho đặt giá tự động", { exact: true }).fill("170000");
  await buying.route(ownershipPath, route => route.fulfill({ status: 503, json: { code: "QA_UNAVAILABLE", message: "QA unavailable" } }));
  await reconnect(buying);
  await expect(button(buying, "Thử lại kiểm tra vai trò")).toBeVisible();
  await expect(buying.getByRole("dialog", { name: "Đặt giá tự động", exact: true })).not.toBeVisible();
  await buying.unroute(ownershipPath);
  await button(buying, "Thử lại kiểm tra vai trò").click();
  await expect(buying.getByLabel("Mức tối đa cho đặt giá tự động", { exact: true })).toHaveValue("170.000");
  await buying.getByRole("dialog", { name: "Đặt giá tự động", exact: true }).getByRole("button", { name: "Đóng", exact: true }).click();
  passed("Schedule and Auto drafts survive ownership revalidation failure; paused dialogs release recovery controls");
  const bidAck = await loseFirstAck(
    buying,
    `**/api/v1/auctions/${auctionId}/bids`,
  );
  await buying.route(ownershipPath, route => route.fulfill({ status: 503, json: { code: "QA_UNAVAILABLE", message: "QA unavailable" } }));
  await buying
    .getByLabel("Số tiền trả lượt này", { exact: true })
    .fill("100000");
  await buying.getByRole("button", { name: /^Tiếp tục trả/ }).click();
  await buying
    .getByRole("dialog")
    .getByRole("button", { name: "Xác nhận trả giá", exact: true })
    .click();
  await expect(button(buying, "Thử lại kiểm tra vai trò")).toBeVisible();
  await expect(button(buying, "Thử lại thao tác vừa rồi")).not.toBeVisible();
  await buying.unroute(ownershipPath);
  await button(buying, "Thử lại kiểm tra vai trò").click();
  await expect(button(buying, "Thử lại thao tác vừa rồi")).toBeVisible();
  if (await button(buying, "Thử lại thao tác vừa rồi").isVisible())
    await button(buying, "Thử lại thao tác vừa rồi").click();
  await expect(
    buying.getByText("Bạn đang dẫn giá", { exact: true }),
  ).toBeVisible();
  await bidAck.verify();
  const bidState = await api(`/auctions/${auctionId}`);
  assert.equal(bidState.auction.bidderCount, 1);
  assert.equal(bidState.auction.currentPrice, 100000);
  await refused(
    `/auctions/${auctionId}/bids`,
    seller,
    { amount: 110000, fulfillmentMethod: "SelfCollect" },
    403,
  );
  await refused(
    `/auctions/${auctionId}/bids`,
    staff,
    { amount: 110000, fulfillmentMethod: "SelfCollect" },
    403,
  );
  await refused(
    `/auctions/${auctionId}/schedule`,
    seller,
    {
      expectedVersion: bidState.auction.version,
      startAt: null,
      durationHours: 2,
    },
    409,
  );
  await refused(
    `/auction-intakes/${intake.id}/cancel`,
    seller,
    { expectedVersion: published.version },
    409,
  );
  await login(
    competing,
    web,
    "/auctions",
    "auction-challenger@operations.test",
  );
  await competing.locator(`a[href='/auctions/${auctionId}']`).first().click();
  await button(competing, "Mua ngay").click();
  await competing
    .getByRole("dialog")
    .getByRole("button", { name: "Mua ngay", exact: true })
    .click();
  await expect(
    competing.getByText("Bạn đang dẫn giá", { exact: true }),
  ).toBeVisible();
  const challenge = await api(`/auctions/${auctionId}`);
  assert.equal(challenge.auction.currentPrice, 300000);
  assert.equal(challenge.auction.bidderCount, 2);
  assert.ok(challenge.auction.buyNowAt);
  assert.ok(
    Date.parse(challenge.auction.endAt) -
      Date.parse(challenge.auction.buyNowAt) <=
      60000,
  );
  assert.equal(
    await db.collection("point_orders").countDocuments({ auctionId }),
    0,
  );
  await capture(competing, "buyer-buy-now-challenge");
  passed(
    "Manual bid lost ACK keeps intent; Buy Now after bid opens real 60-second window; prohibited actors/edits refused",
  );

  phase = "Worker closes real Buy Now window and winner finds payment";
  // No clock/DB state mutation. Wait in bounded chunks and report why.
  console.log("Waiting for the real 60-second Buy Now deadline.");
  // Build real closed history while the clock runs. This must not hide the
  // first auction's ownership behind the endpoint's newest-50 window.
  for (let n = 0; n < 50; n++) {
    const current = await api(
      `/me/listings/${fixture.listings[2]}`,
      seller.accessToken,
    );
    const old = await api("/auction-intakes", seller.accessToken, {
      listingId: current.id,
      expectedListingVersion: current.version,
      pointId,
      startPrice: 100000,
      step: 10000,
      buyNowPrice: null,
    });
    await api(`/auction-intakes/${old.entityId}/cancel`, seller.accessToken, {
      expectedVersion: old.version,
    });
  }
  const recent = await api("/me/auction-intakes", seller.accessToken);
  assert.equal(recent.items.length, 50);
  assert.equal(
    recent.items.some((i) => i.id === intake.id),
    false,
  );
  const targeted = await api(
    `/me/auction-intakes?auctionId=${auctionId}`,
    seller.accessToken,
  );
  assert.deepEqual(
    targeted.items.map((i) => i.id),
    [intake.id],
  );
  assert.deepEqual(
    (await api(`/me/auction-intakes?auctionId=${auctionId}`, buyer.accessToken))
      .items,
    [],
  );
  await navigate(selling, "/my-auctions?view=selling");
  await selling.getByRole("link", { name: "Xem phiên", exact: true }).click();
  await expect(
    selling.getByText("Đây là phiên của bạn", { exact: true }),
  ).toBeVisible();
  await navigate(native, `/send-to-auction?intakeId=${intake.id}`);
  await button(native, "Xem phiên đấu giá").click();
  await expect(
    native
      .getByText("Đây là phiên của bạn", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await capture(native, "rn-owner-after-50-intakes");
  passed(
    "Fifty real create/cancel intakes do not hide the old auction owner; web/RN never offer self bidding",
  );
  for (
    let remaining = Date.parse(challenge.auction.endAt) - Date.now() + 500;
    remaining > 0;
    remaining -= 15000
  )
    await sleep(Math.min(remaining, 15000));
  await refused(
    `/auctions/${auctionId}/bids`,
    buyer,
    { amount: 310000, fulfillmentMethod: "SelfCollect" },
    409,
  );
  await fixture.processAuctions();
  await fixture.processAuctions();
  const won = await api(
    `/me/auctions/${auctionId}/participation`,
    challenger.accessToken,
  );
  assert.equal(won.won, true);
  assert.ok(won.orderId);
  assert.equal(
    await db.collection("point_orders").countDocuments({ auctionId }),
    1,
  );
  const order = await api(
    `/me/point-orders/${won.orderId}`,
    challenger.accessToken,
  );
  assert.equal(order.state, "AwaitingPayment");
  assert.equal(order.amounts.buyerTotal, 300000);
  assert.equal(
    Date.parse(order.paymentDeadline),
    Date.parse(challenge.auction.endAt) + 24 * 3600000,
  );
  await refused(`/me/point-orders/${order.id}`, buyer, undefined, 404);
  await refused(
    `/point-orders/${order.id}/pay`,
    buyer,
    { expectedVersion: order.version },
    404,
  );
  await navigate(competing, "/my-auctions?view=payment");
  await competing.getByRole("link", { name: /Xem và thanh toán/ }).click();
  await expect(
    competing.getByText("Bạn đã mua ngay cuốn sách này", { exact: true }),
  ).toBeVisible();
  await capture(competing, "buyer-payment-due");
  passed(
    "End-time refusal before sweep; two worker ticks yield one order; winner payment entry/deadline/ownership",
  );

  phase = "Insufficient funds then payment lost ACK -> one hold";
  await competing.getByRole("button", { name: /^Thanh toán 300/ }).click();
  await competing
    .getByRole("dialog")
    .getByRole("button", { name: "Thanh toán", exact: true })
    .click();
  await expect(
    competing.getByRole("alert").filter({ hasText: /số dư|không đủ/ }),
  ).toBeVisible();
  assert.equal(
    await db
      .collection("ledger_journals")
      .countDocuments({ orderId: order.id }),
    0,
  );
  const topup = await api("/me/topups", challenger.accessToken, {
    amount: 500000,
  });
  await api("/operations/simulator/topup-events", operator.accessToken, {
    eventId: randomUUID(),
    intentId: topup.entityId,
    recipientId: challenger.user.id,
    amount: 500000,
    currency: "VND",
    outcome: "Succeeded",
    occurredAt: new Date().toISOString(),
  });
  const payAck = await loseFirstAck(
    competing,
    `**/api/v1/point-orders/${order.id}/pay`,
  );
  // Delay reads (without faking their data) so live push cannot reconcile the
  // paid state before the browser exercises the exact POST retry.
  const paymentReads = `**/api/v1/me/point-orders/${order.id}`;
  const paymentReadGate = new Promise((resolve) => {
    releasePaymentReads = resolve;
  });
  await competing.route(paymentReads, async (route) => {
    await paymentReadGate;
    try {
      await route.continue();
    } catch (error) {
      // Query invalidation can abort a waiting GET and start a replacement.
      // A cancelled read is not an API result, nor evidence that payment passed.
      if (
        route.request().failure() ||
        /already handled|closed|cancelled|aborted/i.test(String(error.message))
      )
        cancelledQaReads++;
      else if (!closing)
        routeErrors.push({ phase, message: "QA delayed read failed" });
    }
  });
  await competing.getByRole("button", { name: /^Thanh toán 300/ }).click();
  await competing
    .getByRole("dialog")
    .getByRole("button", { name: "Thanh toán", exact: true })
    .click();
  await sleep(1200);
  if (await button(competing, "Thử lại thanh toán").isVisible())
    await button(competing, "Thử lại thanh toán").click();
  await payAck.verify();
  releasePaymentReads();
  await competing.unroute(paymentReads);
  await expect(competing.getByText(/^Đã thanh toán 300/)).toBeVisible();
  assert.equal(
    (await api(`/me/point-orders/${order.id}`, challenger.accessToken)).state,
    "Fulfilling",
  );
  assert.equal((await api(`/auctions/${auctionId}`)).auction.state, "Sold");
  const wallet = await api("/me/wallet", challenger.accessToken);
  assert.equal(wallet.available, 200000);
  assert.equal(wallet.transactionHeld, 300000);
  assert.equal(wallet.total, 500000);
  assert.equal(
    await db
      .collection("ledger_journals")
      .countDocuments({ orderId: order.id, type: "OrderPayment" }),
    1,
  );
  assert.equal(
    await db
      .collection("point_slots")
      .countDocuments({ pointId, active: true }),
    1,
  );
  assert.equal(
    await db
      .collection("exclusive_commitments")
      .countDocuments({ listingId: intake.listingId, status: "Active" }),
    1,
  );
  await capture(competing, "buyer-paid-hold", 1440);
  await capture(competing, "buyer-paid-hold-mobile", 320);
  passed(
    "Insufficient funds changes no ledger; payment replay holds money once and retains custody slot; stops before report acceptance",
  );

  phase = "Seller exact-intake read error and retry";
  const focusPath = `**/api/v1/me/auction-intakes/${intake.id}`;
  await selling.route(focusPath, (route) =>
    route.fulfill({
      status: 503,
      json: { code: "QA_UNAVAILABLE", message: "QA unavailable" },
    }),
  );
  await navigate(selling, `/my-auctions?intakeId=${intake.id}`);
  await expect(
    selling.getByText("Chưa tải được sách đang chờ mở phiên.", { exact: true }),
  ).toBeVisible();
  assert.equal(await selling.getByText(/Chưa có sách nào đang chờ/).count(), 0);
  await capture(selling, "seller-focus-read-error");
  await selling.unroute(focusPath);
  await button(selling, "Thử lại").click();
  await expect(
    selling.getByRole("link", { name: "Xem phiên đấu giá", exact: true }),
  ).toHaveAttribute("href", `/auctions/${auctionId}`);
  passed(
    "Focused intake failure stays an error; retry reopens the exact target",
  );

  phase = "Evidence branch and independent decision";
  const secondListing = await api(
    `/me/listings/${fixture.listings[1]}`,
    seller.accessToken,
  );
  const second = await api("/auction-intakes", seller.accessToken, {
    listingId: secondListing.id,
    expectedListingVersion: secondListing.version,
    pointId,
    startPrice: 100000,
    step: 10000,
    buyNowPrice: null,
  });
  const secondId = second.entityId;
  await api(
    `/operations/auction-intakes/${secondId}/receive`,
    staff.accessToken,
    { expectedVersion: 1, shelfCode: "QA-E01" },
  );
  const checklist = {
    titleEditionMatches: true,
    privateMarksMatch: true,
    coverPagesMatch: true,
    notesAccessoriesMatch: true,
    suspectedCopy: true,
  };
  await api(
    `/operations/auction-intakes/${secondId}/inspect`,
    staff.accessToken,
    {
      expectedVersion: 2,
      outcome: "NeedsEvidence",
      checklist,
      note: "DỮ LIỆU QA: cần bổ sung dấu riêng để đối chiếu.",
    },
  );
  await navigate(selling, `/my-auctions?intakeId=${secondId}`);
  await expect(
    selling.getByText("Điểm cần bạn bổ sung bằng chứng", { exact: true }),
  ).toBeVisible();
  await selling
    .getByLabel("Bằng chứng của bạn", { exact: true })
    .fill("DỮ LIỆU QA: đối chiếu ghi chú và dấu riêng tại trang hai mươi.");
  const evidenceAck = await loseFirstAck(
    selling,
    `**/api/v1/me/auction-intakes/${secondId}/evidence`,
  );
  await button(selling, "Gửi bằng chứng").click();
  await sleep(1200);
  if (await button(selling, "Thử lại gửi bằng chứng").isVisible())
    await button(selling, "Thử lại gửi bằng chứng").click();
  await expect(selling.getByText(/Bạn đã gửi bằng chứng lúc/)).toBeVisible();
  await evidenceAck.verify();
  const evidenced = await api(
    `/me/auction-intakes/${secondId}`,
    seller.accessToken,
  );
  const decision = {
    expectedVersion: evidenced.version,
    outcome: "Pass",
    checklist: { ...checklist, suspectedCopy: false },
    note: "DỮ LIỆU QA: đã đối chiếu bằng chứng và bảng kiểm.",
  };
  await refused(
    `/operations/auction-intakes/${secondId}/evidence-decision`,
    staff,
    decision,
    403,
  );
  await api(
    `/operations/auction-intakes/${secondId}/evidence-decision`,
    independent.accessToken,
    decision,
  );
  await navigate(selling, "/my-auctions?view=selling");
  await expect(button(selling, "Đăng phiên")).toBeVisible();
  await capture(selling, "seller-evidence-passed", 1440);
  passed(
    "NeedsEvidence API setup -> seller UI answer/replay -> requester forbidden -> independent Staff Pass -> publish available",
  );

  phase = "Cancelled intake exact focus on web and RN web";
  const thirdListing = await api(
    `/me/listings/${fixture.listings[2]}`,
    seller.accessToken,
  );
  const third = await api("/auction-intakes", seller.accessToken, {
    listingId: thirdListing.id,
    expectedListingVersion: thirdListing.version,
    pointId,
    startPrice: 100000,
    step: 10000,
    buyNowPrice: null,
  });
  await navigate(selling, `/my-auctions?intakeId=${third.entityId}`);
  await button(selling, "Rút khỏi đấu giá").click();
  await selling
    .getByRole("alertdialog")
    .getByRole("button", { name: "Rút sách", exact: true })
    .click();
  await expect(
    selling.getByText("Đã hủy lần gửi sách", { exact: true }),
  ).toBeVisible();
  assert.equal(await button(selling, "Đăng phiên").count(), 0);
  await navigate(native, `/send-to-auction?intakeId=${third.entityId}`);
  await expect(
    native.getByText("Đã hủy lần gửi sách", { exact: true }),
  ).toBeVisible();
  assert.equal(
    await native.getByText(/Trạng thái hiện tại: Cancelled/).count(),
    0,
  );
  assert.equal(await button(native, "Rút sách khỏi đấu giá").count(), 0);
  await capture(native, "rn-cancelled-intake");
  await button(native, "Xem tất cả lần gửi").click();
  await expect(native.getByText("1–168 giờ", { exact: true }).filter({ visible: true })).toBeVisible();
  await capture(native, "rn-send-policy", 390);
  assert.equal(
    await db
      .collection("exclusive_commitments")
      .countDocuments({ listingId: thirdListing.id, status: "Active" }),
    0,
  );
  passed(
    "Cancelled intake remains readable at exact web/RN focus with no stale actions and no active commitment",
  );

  assert.equal(pageErrors.length, 0, "Browser runtime errors occurred");
  assert.equal(routeErrors.length, 0, "QA response routing errors occurred");
  assert.equal(
    httpEvents.filter(
      (e) =>
        e.method !== "GET" &&
        /\/(?:shipments|carrier|ghn|driver|accept-report|handover|settle)(?:\/|$)/.test(
          e.path,
        ),
    ).length,
    0,
    "Out-of-scope command observed",
  );
  report.replay = {
    intake: createAck.attempts.length,
    publish: publishAck.attempts.length,
    bid: bidAck.attempts.length,
    payment: payAck.attempts.length,
    evidence: evidenceAck.attempts.length,
    allSameIntentVerified: true,
  };
  report.money = {
    pointOrdersForAuction: 1,
    paymentJournals: 1,
    finalPointOrderState: "Fulfilling",
    custodySlotRetained: true,
    walletAvailable: 200000,
    walletHeld: 300000,
  };
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
    `Auction journey ${report.status}: ${phase}; sanitized detail in .tmp/auction-journey/failure.txt`,
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
