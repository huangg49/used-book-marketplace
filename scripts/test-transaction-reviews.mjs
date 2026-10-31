// Browser QA only: disposable Mongo fixture, synthetic Completed transactions,
// fake storage. Does not exercise or approve fulfillment/settlement gates.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { createServer as httpServer } from "node:http";
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
const viteBin = path.join(
  path.dirname(require.resolve("vite/package.json")),
  "bin/vite.js",
);
async function serve(app, port) {
  const child = spawn(
    process.execPath,
    [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: path.join(root, "apps", app),
      env: { ...process.env, VITE_API_BASE_URL: base },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  try {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (child.exitCode !== null) throw new Error(`QA ${app} exited`);
      if (
        await fetch(`http://127.0.0.1:${port}`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        return child;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`QA ${app} startup timeout`);
  } catch (e) {
    child.kill();
    throw e;
  }
}
const web = "http://127.0.0.1:5184",
  adminOrigin = "http://127.0.0.1:5174",
  rn = "http://127.0.0.1:8087";
const artifacts = path.join(root, ".tmp/review-evidence");
await mkdir(artifacts, { recursive: true });
process.env.VITE_API_BASE_URL = base;
let fixture, browser, webServer, adminServer, rnServer;
const errors = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
async function capture(p, name, width) {
  await p.setViewportSize({ width, height: 900 });
  await p.evaluate(async () => {
    await document.fonts.ready;
  });
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `${name} horizontal overflow`,
  );
  await p.evaluate(() =>
    window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
  );
  await p.screenshot({
    path: path.join(artifacts, name + ".png"),
    fullPage: true,
  });
}
try {
  fixture = await createTestApi({
    corsOrigin: `${web},${adminOrigin},${rn}`,
    listingCount: 0,
  });
  const peer = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const a = fixture.member.user.id,
    b = peer.user.id;
  async function completed(age = 0) {
    const now = new Date(),
      id = randomUUID();
    await fixture.db.collection("exchanges").insertOne({
      _id: id,
      initiatorId: a,
      recipientId: b,
      initiatorListingId: randomUUID(),
      recipientListingId: randomUUID(),
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      status: "Completed",
      revision: 1,
      initiatorDeposit: 100000,
      recipientDeposit: 100000,
      diffAmount: 0,
      diffPayerId: null,
      fundingDeadline: null,
      initiatorFundedAt: null,
      recipientFundedAt: null,
      proposalExpiresAt: null,
      rejectionReason: null,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      initiatorShippedAt: null,
      recipientShippedAt: null,
      initiatorReceivedAt: null,
      recipientReceivedAt: null,
      inspectionDeadline: null,
      completedAt: new Date(+now - age),
      createdAt: new Date(+now - age),
      updatedAt: now,
      lockSeq: 0,
    });
    return id;
  }
  const fresh = await completed(),
    native = await completed(),
    published = await completed(6 * 86400000);
  const oldBody = {
    bookRating: 4,
    partnerRating: 5,
    comment: "QA công khai: sách đúng mô tả, trao đổi rõ ràng.",
  };
  let seedReview = await fixture.api(
    `/transactions/Exchange/${published}/reviews`,
    fixture.member.accessToken,
    oldBody,
  );
  for (let i = 0; i < 21; i++)
    seedReview = await fixture.api(
      `/transaction-reviews/${seedReview.id}/edit`,
      fixture.member.accessToken,
      { ...oldBody, expectedVersion: seedReview.version },
    );
  await fixture.api(
    `/transactions/Exchange/${published}/reviews`,
    peer.accessToken,
    { ...oldBody, partnerRating: 4, comment: "QA công khai: giữ đúng hẹn." },
  );
  const old = new Date(Date.now() - 3 * 86400000);
  await fixture.db
    .collection("transaction_reviews")
    .updateMany(
      { transactionId: published },
      { $set: { createdAt: old, editDeadline: new Date(+old + 48 * 3600000) } },
    );

  // A buyer receives a partner-only score from their seller. The same profile
  // now has two partner scores but just one book score, through real review APIs.
  const direct = randomUUID(),
    complete = new Date(Date.now() - 6 * 86400000),
    delivered = new Date(+complete - 72 * 3600000),
    created = new Date(+delivered - 3600000),
    paid = new Date(+created + 1000);
  await fixture.db.collection("direct_orders").insertOne({
    _id: direct,
    buyerId: b,
    sellerId: a,
    quoteId: randomUUID(),
    version: 6,
    state: "Completed",
    createdAt: created,
    paymentDeadline: new Date(+created + 1800000),
    closedAt: complete,
    paidAt: paid,
    sellerConfirmationDeadline: new Date(+paid + 48 * 3600000),
    cancellationRequestedAt: null,
    cancellationReason: null,
    deliveredAt: delivered,
    inspectionDeadline: complete,
    completedAt: complete,
    lockSeq: 0,
  });
  const directUrl = `/transactions/DirectOrder/${direct}/reviews`;
  await fixture.api(directUrl, fixture.member.accessToken, {
    partnerRating: 3,
    comment: "QA: nhận sách đúng hẹn.",
  });
  await fixture.api(directUrl, peer.accessToken, {
    bookRating: 2,
    partnerRating: 4,
    comment: "QA: chất lượng bản sách đã nhận.",
  });
  await fixture.db
    .collection("transaction_reviews")
    .updateMany(
      { transactionId: direct },
      { $set: { createdAt: old, editDeadline: new Date(+old + 48 * 3600000) } },
    );
  const emptyMember = randomUUID(),
    memberDoc = await fixture.db.collection("users").findOne({ _id: a });
  assert.ok(memberDoc);
  await fixture.db.collection("users").insertOne({
    ...memberDoc,
    _id: emptyMember,
    emailNormalized: `${emptyMember}@operations.test`,
    displayName: "Thành viên QA chưa có đánh giá",
  });

  webServer = await serve("user-web", 5184);
  adminServer = await serve("admin-web", 5174);
  const dist = path.join(root, "apps/mobile-react-native/dist");
  rnServer = httpServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, rn).pathname);
      let file = path.resolve(dist, "." + pathname);
      if (file !== dist && !file.startsWith(dist + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      if (file === dist) file = path.join(dist, "index.html");
      else if (!path.extname(file)) file += ".html";
      const type = {
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
            type[path.extname(file)] ?? "application/octet-stream",
        })
        .end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => rnServer.listen(8087, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const webContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    p = await webContext.newPage();
  p.setDefaultTimeout(15000);
  p.setDefaultNavigationTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(web + "/login?returnUrl=%2Faccount");
  await p.getByLabel(/^Email/).fill("member@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
  await p.waitForURL(web + "/account");
  await p.getByRole("heading", { name: "Tổng quan của bạn", exact: true }).waitFor();
  assert.equal(await p.getByText("★ 4.9", { exact: false }).count(), 0);
  await p
    .getByRole("link", { name: "Cách mua, bán, đổi và đấu giá", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Bắt đầu với Lật lại", exact: true })
    .waitFor();
  for (const [title, action, path] of [
    ["Tôi muốn mua sách", "Tìm sách để mua", "/books?mode=Sale"],
    ["Tôi muốn bán sách", "Đăng sách để bán", "/sell"],
    ["Tôi muốn đổi sách", "Tìm sách để đổi", "/books?mode=Exchange"],
    ["Tôi muốn tham gia đấu giá", "Xem phiên đấu giá", "/auctions"],
  ]) {
    await p
      .getByRole("navigation", { name: "Bạn muốn làm gì?" })
      .getByRole("link", { name: title, exact: true })
      .click();
    await p.getByRole("heading", { name: title, exact: true }).waitFor();
    assert.equal(
      await p
        .getByRole("link", { name: action, exact: true })
        .getAttribute("href"),
      path,
    );
  }
  await p.getByRole("link", { name: "Về việc của tôi", exact: true }).click();
  for (const width of [1440, 768, 390, 320])
    await capture(p, `member-workspace-${width}`, width);
  await p.getByRole("link", { name: /^Đơn mua\/bán trực tiếp/ }).click();
  await p
    .getByRole("link", {
      name: "Đơn thắng đấu giá ở Đấu giá của tôi",
      exact: true,
    })
    .waitFor();
  await p
    .getByRole("link", { name: "Xem hoặc viết đánh giá", exact: true })
    .click();
  await p.waitForURL(web + `/reviews?type=DirectOrder&transaction=${direct}`);
  await p
    .getByRole("heading", { name: "Đánh giá của bạn", exact: true })
    .waitFor();
  await p
    .getByRole("link", { name: "Về các giao dịch cần đánh giá", exact: true })
    .click();
  await p.waitForURL(web + "/reviews");
  await p
    .getByRole("heading", { name: "Đánh giá của tôi", exact: true })
    .waitFor();
  const freshSection = p.locator(`[data-transaction-id="${fresh}"]`);
  await freshSection
    .getByRole("link", { name: "Xem và viết đánh giá", exact: true })
    .click();
  const write = p.getByRole("button", { name: "Viết đánh giá", exact: true });
  await write.waitFor();
  await write.click();
  const form = p.getByRole("form", { name: "Soạn đánh giá" });
  await form.getByRole("combobox", { name: /^Điểm đối tác/ }).selectOption("5");
  await form
    .getByRole("combobox", { name: /^Điểm sách nhận được/ })
    .selectOption("4");
  await form
    .getByLabel("Nhận xét (không bắt buộc)", { exact: true })
    .fill(
      "QA <script>không thực thi HTML</script> — giữ nội dung khi mất phản hồi.",
    );
  const intents = [];
  let lost = false;
  await p.route("**/api/v1/transactions/Exchange/*/reviews", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    intents.push({
      url: route.request().url(),
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (!lost) {
      lost = true;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  await form.getByRole("button", { name: "Lưu đánh giá", exact: true }).click();
  await button(p, "Thử lại yêu cầu đã gửi").waitFor();
  await capture(p, "web-review-uncertain-390", 390);
  await button(p, "Thử lại yêu cầu đã gửi").click();
  await p
    .getByText("Đã lưu theo xác nhận của máy chủ.", { exact: true })
    .waitFor();
  assert.equal(intents.length, 2);
  assert.deepEqual(intents[1], intents[0]);
  const actualId = new URL(intents[0].url).pathname.split("/").at(-2);
  assert.equal(
    await fixture.db
      .collection("transaction_reviews")
      .countDocuments({ transactionId: actualId, authorId: a }),
    1,
  );
  await p.unroute("**/api/v1/transactions/Exchange/*/reviews");
  await p
    .getByRole("button", { name: "Sửa đánh giá", exact: true })
    .first()
    .click();
  const edit = p.getByRole("form", { name: "Soạn đánh giá" });
  await edit
    .getByRole("textbox", { name: /^Nhận xét/ })
    .fill("QA bản sửa vẫn được giữ nếu máy chủ từ chối.");
  await p.route("**/api/v1/transactions/Exchange/*/reviews", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "UNAVAILABLE",
          message: "QA refresh unavailable",
        }),
      });
    return route.continue();
  });
  await button(p, "Tải lại đánh giá").click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Chưa cập nhật được đánh giá" })
    .waitFor();
  assert.equal(
    await edit.getByRole("textbox").inputValue(),
    "QA bản sửa vẫn được giữ nếu máy chủ từ chối.",
  );
  await p.unroute("**/api/v1/transactions/Exchange/*/reviews");
  let reject = true;
  await p.route("**/api/v1/transaction-reviews/*/edit", async (route) => {
    if (reject) {
      reject = false;
      return route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          code: "VALIDATION_ERROR",
          message: "QA từ chối có chủ đích",
          requestId: randomUUID(),
        }),
      });
    }
    return route.continue();
  });
  await edit.getByRole("button", { name: "Lưu đánh giá", exact: true }).click();
  await p.getByRole("alert").filter({ hasText: "QA từ chối" }).waitFor();
  assert.equal(
    await edit.getByRole("textbox").inputValue(),
    "QA bản sửa vẫn được giữ nếu máy chủ từ chối.",
  );
  await edit.getByRole("button", { name: "Lưu đánh giá", exact: true }).click();
  await p
    .getByText("Đã lưu theo xác nhận của máy chủ.", { exact: true })
    .waitFor();
  for (const width of [1440, 768, 390, 320])
    await capture(p, `web-reviews-${width}`, width);
  await p
    .getByRole("button", { name: "Xóa đánh giá công khai", exact: true })
    .first()
    .click();
  await p.getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
  await p
    .getByText(
      "Đã xóa khỏi hiển thị công khai. Không thể gửi đánh giá mới cho giao dịch này.",
      { exact: true },
    )
    .waitFor();

  const publicContext = await browser.newContext(),
    pub = await publicContext.newPage();
  pub.on("pageerror", (e) => errors.push(e.message));
  await pub.goto(web + "/");
  await pub
    .getByRole("link", {
      name: "Chưa biết bắt đầu? Xem cách mua, bán, đổi và đấu giá.",
      exact: true,
    })
    .click();
  await pub
    .getByRole("heading", { name: "Bắt đầu với Lật lại", exact: true })
    .waitFor();
  for (const width of [1440, 390, 320])
    await capture(pub, `member-guide-${width}`, width);
  await pub.goto(web + `/members/${b}`);
  await pub
    .getByText("QA công khai: sách đúng mô tả, trao đổi rõ ràng.", {
      exact: true,
    })
    .waitFor();
  const partnerFact = pub
    .locator("dl > div")
    .filter({ has: pub.getByText("Điểm đối tác", { exact: true }) });
  const bookFact = pub.locator("dl > div").filter({
    has: pub.getByText("Chất lượng sách đã cung cấp", { exact: true }),
  });
  await partnerFact.getByText("Từ 2 đánh giá", { exact: true }).waitFor();
  await bookFact.getByText("Từ 1 đánh giá", { exact: true }).waitFor();
  assert.match(await partnerFact.innerText(), /4\.0\/5/);
  assert.match(await bookFact.innerText(), /4\.0\/5/);
  for (const width of [1440, 768, 390, 320])
    await capture(pub, `public-reputation-${width}`, width);
  const before = await fixture.api(`/members/${b}/reputation`);
  assert.equal(before.reviewCount, 2);
  assert.equal(before.partnerRatingCount, 2);
  assert.equal(before.bookRatingCount, 1);
  await pub.goto(web + `/members/${emptyMember}`);
  await pub.getByText("Chưa có đánh giá công khai.", { exact: true }).waitFor();
  assert.equal(
    await pub.getByText("Chưa có điểm", { exact: false }).count(),
    2,
  );
  assert.equal(
    await pub.getByText("Từ 0 đánh giá", { exact: true }).count(),
    2,
  );
  assert.equal(await pub.getByText("0.0/5", { exact: true }).count(), 0);
  await capture(pub, "public-reputation-empty-390", 390);
  await pub.goto(web + `/members/${b}`);
  await bookFact.getByText("Từ 1 đánh giá", { exact: true }).waitFor();

  const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    ops = await adminContext.newPage();
  ops.on("pageerror", (e) => errors.push(e.message));
  await ops.goto(adminOrigin + "/transaction-reviews");
  await ops
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("staff@operations.test");
  await ops.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await button(ops, "Đăng nhập").click();
  await ops
    .getByRole("heading", { name: "Đánh giá giao dịch", exact: true })
    .waitFor();
  await ops
    .getByRole("link", { name: "Dashboard", exact: true })
    .first()
    .click();
  const workGuide = ops.locator("details").filter({
    has: ops.getByText("Chưa biết bắt đầu ở đâu?", { exact: true }),
  });
  await workGuide.locator("summary").click();
  await workGuide
    .getByRole("link", { name: "Nhận sách đấu giá", exact: true })
    .waitFor();
  assert.equal(
    await workGuide
      .getByRole("link", { name: "Xử lý đơn tại điểm", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await workGuide
      .getByRole("link", { name: "Đầu sách", exact: true })
      .count(),
    0,
  );
  for (const width of [1440, 390])
    await capture(ops, `staff-work-guide-${width}`, width);
  await ops.setViewportSize({ width: 1440, height: 900 });
  await ops
    .getByRole("link", { name: "Đánh giá giao dịch", exact: true })
    .first()
    .click();
  const record = ops.locator("section").filter({
    has: ops.getByText("QA công khai: sách đúng mô tả, trao đổi rõ ràng.", {
      exact: true,
    }),
  });
  await record
    .getByRole("combobox", { name: /^Quyết định/ })
    .selectOption("Hide");
  await record
    .getByLabel("Lý do", { exact: true })
    .fill("QA kiểm tra ẩn review và loại khỏi điểm tổng.");
  await record
    .getByRole("button", { name: "Ghi nhận quyết định", exact: true })
    .click();
  await record.getByText("Đã ghi nhận quyết định.", { exact: true }).waitFor();
  const hiddenProfile = await fixture.api(`/members/${b}/reputation`);
  assert.equal(hiddenProfile.reviewCount, 1);
  assert.equal(hiddenProfile.partnerRatingCount, 1);
  assert.equal(hiddenProfile.bookRatingCount, 0);
  assert.equal(hiddenProfile.bookRating, null);
  await pub.reload();
  await bookFact.getByText("Từ 0 đánh giá", { exact: true }).waitFor();
  await bookFact.getByText("Chưa có điểm", { exact: false }).waitFor();
  await partnerFact.getByText("Từ 1 đánh giá", { exact: true }).waitFor();
  await record
    .getByRole("combobox", { name: /^Quyết định/ })
    .selectOption("Restore");
  await record
    .getByLabel("Lý do", { exact: true })
    .fill("QA khôi phục sau kiểm tra.");
  await record
    .getByRole("button", { name: "Ghi nhận quyết định", exact: true })
    .click();
  await record.getByText("Đã ghi nhận quyết định.", { exact: true }).waitFor();
  await record
    .getByText("Lịch sử phiên bản · mới nhất trước", { exact: true })
    .click();
  await record
    .getByRole("button", { name: "Xem phiên bản cũ hơn", exact: true })
    .click();
  await record
    .getByRole("heading", { name: "Phiên bản 1 · Create", exact: true })
    .waitFor();
  for (const width of [1440, 390])
    await capture(ops, `operations-reviews-${width}`, width);

  // Admin-only is deliberately different from Staff: role alone does not
  // grant intake/collection actions at a point.
  await fixture.db
    .collection("users")
    .updateOne(
      { _id: b },
      {
        $set: {
          roles: [{ role: "ADMIN", grantedAt: new Date() }],
          updatedAt: new Date(),
        },
        $inc: { lockSeq: 1 },
      },
    );
  const managerContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    manager = await managerContext.newPage();
  manager.setDefaultTimeout(15000);
  manager.on("pageerror", (e) => errors.push(e.message));
  await manager.goto(adminOrigin + "/dashboard");
  await manager
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@operations.test");
  await manager.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await button(manager, "Đăng nhập").click();
  const managerGuide = manager
    .locator("details")
    .filter({
      has: manager.getByText("Chưa biết bắt đầu ở đâu?", { exact: true }),
    });
  await managerGuide.locator("summary").click();
  await managerGuide
    .getByRole("link", { name: "Xử lý đơn tại điểm", exact: true })
    .waitFor();
  await managerGuide
    .getByRole("link", { name: "Đầu sách", exact: true })
    .waitFor();
  assert.equal(
    await managerGuide
      .getByRole("link", { name: "Nhận sách đấu giá", exact: true })
      .count(),
    0,
  );
  await capture(manager, "admin-work-guide-1440", 1440);
  await capture(manager, "admin-work-guide-390", 390);
  const nativeContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    np = await nativeContext.newPage();
  np.setDefaultTimeout(15000);
  np.setDefaultNavigationTimeout(15000);
  np.on("pageerror", (e) => errors.push(e.message));
  await np.goto(rn + "/account");
  await np
    .getByLabel("Email", { exact: true })
    .last()
    .fill("member@operations.test");
  await np.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await button(np, "Đăng nhập").click();
  await button(np, "Đánh giá giao dịch & hồ sơ uy tín").waitFor();
  await np
    .getByRole("heading", { name: "Việc của tôi", exact: true })
    .waitFor();
  assert.equal(await np.getByText("4.9", { exact: false }).count(), 0);
  for (const width of [390, 320])
    await capture(np, `rn-workspace-${width}`, width);
  await np.evaluate(() => {
    for (const el of document.querySelectorAll('[dir="auto"]')) {
      const c = getComputedStyle(el);
      el.style.fontSize = `${parseFloat(c.fontSize) * 1.3}px`;
      el.style.lineHeight = `${parseFloat(c.lineHeight) * 1.3}px`;
    }
  });
  await capture(np, "rn-workspace-large-320", 320);
  await button(np, "Cách mua, bán, đổi và đấu giá").click();
  await np
    .getByRole("heading", { name: "Bắt đầu với Lật lại", exact: true })
    .waitFor();
  await button(np, "Đổi sách").click();
  await button(np, "Tìm sách để đổi").click();
  await np.waitForURL(/\/search\?mode=Exchange$/);
  await np.goBack();
  await button(np, "Bán sách").click();
  await capture(np, "rn-guide-320", 320);
  await button(np, "Về việc của tôi").click();
  await button(np, "Đơn mua/bán trực tiếp").click();
  await button(np, "Mở đấu giá của tôi").waitFor();
  await button(np, "Xem hoặc viết đánh giá").click();
  await np.getByText("QA: nhận sách đúng hẹn.", { exact: true }).waitFor();
  await np.getByRole("button", { name: "Về tài khoản", exact: true }).click();
  await button(np, "Đánh giá giao dịch & hồ sơ uy tín").click();
  await np
    .getByRole("button", { name: new RegExp(native.slice(0, 8).toUpperCase()) })
    .click();
  // Main's Exchange UI must enter the shared lifecycle, never the legacy modal.
  await button(np, "Về tài khoản").click();
  await button(np, "Trao đổi của tôi").click();
  await button(np, `Mở đơn trao đổi #${native.slice(0, 8)}`).click();
  await button(np, "Xem hoặc viết đánh giá").waitFor();
  assert.equal(await button(np, "Xem hoặc viết đánh giá").count(), 1);
  await capture(np, "rn-exchange-review-entry-320", 320);
  await button(np, "Xem hoặc viết đánh giá").click();
  await np.waitForURL(new RegExp(`/reviews\\?type=Exchange&id=${native}$`));
  await button(np, "Viết đánh giá").click();
  await np.getByRole("button", { name: "5/5", exact: true }).first().click();
  await np.getByRole("button", { name: "4/5", exact: true }).last().click();
  await np
    .getByLabel("Nhận xét (không bắt buộc)", { exact: true })
    .fill("QA đánh giá từ RN web.");
  await button(np, "Lưu đánh giá").click();
  await np
    .getByText("Đã lưu theo xác nhận của máy chủ.", { exact: true })
    .waitFor();
  for (const width of [390, 320])
    await capture(np, `rn-review-${width}`, width);
  await np.evaluate(() => {
    for (const el of document.querySelectorAll('[dir="auto"]')) {
      const c = getComputedStyle(el);
      el.style.fontSize = `${parseFloat(c.fontSize) * 1.3}px`;
      el.style.lineHeight = `${parseFloat(c.lineHeight) * 1.3}px`;
    }
  });
  await capture(np, "rn-review-large-320", 320);
  await button(np, "Xem hồ sơ đối tác").click();
  await np
    .getByText("QA công khai: sách đúng mô tả, trao đổi rõ ràng.", {
      exact: true,
    })
    .waitFor();
  await np.getByText("Từ 2 đánh giá", { exact: true }).waitFor();
  await np.getByText("Từ 1 đánh giá", { exact: true }).waitFor();
  for (const width of [390, 320])
    await capture(np, `rn-reputation-${width}`, width);
  await np.evaluate(() => {
    for (const el of document.querySelectorAll('[dir="auto"]')) {
      const c = getComputedStyle(el);
      el.style.fontSize = `${parseFloat(c.fontSize) * 1.3}px`;
      el.style.lineHeight = `${parseFloat(c.lineHeight) * 1.3}px`;
    }
  });
  await capture(np, "rn-reputation-large-320", 320);
  await np.goto(rn + `/reputation?id=${emptyMember}`);
  await np.getByText("Chưa có đánh giá công khai", { exact: true }).waitFor();
  assert.equal(await np.getByText("Chưa có điểm", { exact: false }).count(), 2);
  assert.equal(await np.getByText("Từ 0 đánh giá", { exact: true }).count(), 2);
  await capture(np, "rn-reputation-empty-320", 320);
  assert.deepEqual(
    errors.filter((s) => !s.includes("Minified React error #418")),
    [],
  );
  console.log(
    "PASS review browser: Member web create/lost-ACK/same intent/edit/rejection retention/delete; Member task hub/guide/DirectOrder-to-review/Staff wayfinding; public reputation separate score counts/empty/hidden; independent Staff hide/restore/aggregate; RN create/profile; desktop/tablet/320px. Synthetic Completed QA, fake storage, native unverified.",
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages())
      await page
        .screenshot({
          path: path.join(
            artifacts,
            `failure-${browser.contexts().indexOf(context)}.png`,
          ),
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  webServer?.kill();
  adminServer?.kill();
  if (rnServer) await new Promise((resolve) => rnServer.close(resolve));
  await fixture?.close();
}
