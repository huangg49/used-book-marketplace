// Real Nest/MongoDB HTTP integration on a disposable *_test DB; storage is fake.
import assert from "node:assert/strict";
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
const artifacts = path.join(root, "apps/user-web/test-results");
await mkdir(artifacts, { recursive: true });
process.env.VITE_API_BASE_URL = base;
let fixture, server, browser, mediaTimer;
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 13 });
  const admin = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const catalog = await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}`,
    admin.accessToken,
  );
  await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}/decision`,
    admin.accessToken,
    {
      expectedVersion: catalog.version,
      revisionId: catalog.currentRevision.id,
      decision: "Confirm",
    },
  );
  for (const id of fixture.listings) {
    const listing = await fixture.api(
      `/operations/listings/${id}`,
      admin.accessToken,
    );
    await fixture.api(
      `/operations/listings/${id}/decision`,
      admin.accessToken,
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
  }
  // The denser UI page fits this fixture; retain server cursor coverage separately.
  const firstPage = await fixture.api("/listings?limit=12");
  assert.equal(firstPage.items.length, 12);
  assert.ok(firstPage.nextCursor);
  const lastPage = await fixture.api(
    "/listings?limit=12&cursor=" + encodeURIComponent(firstPage.nextCursor),
  );
  assert.equal(lastPage.items.length, 1);
  assert.equal(
    new Set([...firstPage.items, ...lastPage.items].map((book) => book.id)).size,
    13,
  );
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5184, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on("pageerror", (error) => errors.push(error.message));
  const button = (name) => p.getByRole("button", { name, exact: true });
  const step = (name) =>
    p
      .getByRole("navigation", { name: "Tiến trình" })
      .getByRole("button", { name });
  await p.goto(origin);
  console.log("QA: home/search");
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  await p
    .getByRole("img", { name: /^Bìa sách/ })
    .first()
    .waitFor();
  await p.screenshot({
    path: path.join(artifacts, "home-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.getByLabel("Bạn muốn tìm cuốn nào?").fill("khong-co-sach-nay");
  await button("Tìm sách").click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Tìm sách", { exact: true }).fill("");
  await p.getByText("13 cuốn trên trang này").waitFor();
  assert.equal(await button("Trang tiếp theo").count(), 0);
  await p.getByLabel("Cũ nhiều", { exact: true }).click();
  await button("Áp dụng bộ lọc").click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Tất cả tình trạng", { exact: true }).click();
  await button("Áp dụng bộ lọc").click();
  await button("Đổi sách").click();
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  assert.equal(new URL(p.url()).searchParams.get("mode"), "Exchange");
  await p.getByLabel("Sắp xếp").selectOption("salePriceDesc");
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await p
    .getByRole("heading", { level: 1, name: fixture.metadata.title })
    .waitFor();
  await p.getByText(/125\.000\s*₫/).waitFor();
  await p.getByText(/150\.000\s*₫/).waitFor();
  await p.getByRole("link", { name: "← Về kệ sách" }).click();
  // Search failure/retry against the same real data.
  await p.route("**/api/v1/listings?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "Unavailable", message: "QA outage" }),
    }),
  );
  const failedSearch = p.waitForResponse(
    (response) =>
      response.status() === 503 &&
      new URL(response.url()).searchParams.get("q") === "QA-failure",
  );
  await p.getByLabel("Tìm sách", { exact: true }).fill("QA-failure");
  await p.waitForURL("**q=QA-failure");
  await failedSearch;
  await p.getByRole("alert").waitFor();
  await button("Thử lại").waitFor();
  await p.unroute("**/api/v1/listings?*");
  await button("Thử lại").click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Tìm sách", { exact: true }).fill("");
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  await p.setViewportSize({ width: 390, height: 844 });
  for (const scale of [100, 130]) {
    await p.evaluate(
      (scale) => (document.documentElement.style.fontSize = `${scale}%`),
      scale,
    );
    await p.screenshot({
      path: path.join(artifacts, `search-390-${scale}.png`),
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Search overflow at ${scale}%`,
    );
  }
  await p.setViewportSize({ width: 320, height: 844 });
  await p
    .getByRole("link", { name: "Trang chủ Lật lại", exact: true })
    .first()
    .click();
  await p.getByLabel("Bạn muốn tìm cuốn nào?").waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Home overflow at320px130%",
  );
  await p.screenshot({
    path: path.join(artifacts, "home-320-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await button("Giữ sách và mở chat").waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Detail overflow at320px130%",
  );
  await p.screenshot({
    path: path.join(artifacts, "detail-320-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.getByRole("link", { name: "← Về kệ sách", exact: true }).click();
  await p.getByLabel("Tìm sách", { exact: true }).waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Search overflow at320px130%",
  );
  await p.screenshot({
    path: path.join(artifacts, "search-320-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.setViewportSize({ width: 390, height: 844 });
  console.log("QA: public shelf/detail/states passed; sell journey");
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await button("Giữ sách và mở chat").click();
  await p.waitForURL("**/login?returnUrl=*");
  const returnPath = new URL(p.url()).searchParams.get("returnUrl");
  assert.match(returnPath, /^\/books\//);
  await p.getByLabel("Email", { exact: true }).fill("member@operations.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await button("Đăng nhập").click();
  await p.waitForURL(origin + returnPath);
  await p
    .getByRole("heading", { name: "Đây là bài đăng của bạn", exact: true })
    .waitFor();
  assert.equal(await button("Giữ sách và mở chat").count(), 0);
  await p
    .getByRole("link", { name: "Trang chủ Lật lại", exact: true })
    .first()
    .click();
  await p.getByRole("link", { name: "Đăng sách của bạn", exact: true }).click();
  await step(/Kiểm tra/).click();
  await button("Gửi duyệt").click();
  await p.getByRole("alert").waitFor();
  await step(/Thông tin sách/).click();
  await p
    .getByLabel("Tên sách", { exact: true })
    .fill("QA — Một cuốn sách cũ qua nhiều người đọc với tên dài");
  await p.getByLabel("Tác giả", { exact: true }).fill("Tác giả QA");
  await step(/Ảnh cuốn sách/).click();
  await p.locator("input[type=file]").setInputFiles({
    name: "qa-cover.png",
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  await step(/Tình trạng/).click();
  await p.getByLabel("Tình trạng tổng thể").selectOption("Worn");
  await p
    .getByLabel("Ruột sách và trang thiếu")
    .fill("Đủ nội dung, thiếu một trang trắng cuối sách.");
  await p.getByLabel("Bìa và gáy sách").fill("Gáy sờn, bìa có nếp gấp.");
  await p.getByLabel("Ghi chú và đánh dấu").fill("Không có");
  await p.locator("input[name=readable]").first().check();
  await p.locator("input[name=hasMissingPages]").first().check();
  await p.locator("input[name=missingEssentialContent]").last().check();
  await step(/Bán hoặc đổi/).click();
  await button("Bán hoặc đổi").click();
  await p.getByLabel("Giá bán (VNĐ)").fill("35000");
  await p.getByLabel("Giá trị quy đổi (VNĐ)").fill("45000");
  await p.getByLabel("Phụ kiện đi kèm").fill("Không có");
  await p
    .getByLabel("Mô tả chung")
    .fill("DỮ LIỆU QA. Bản sách cũ có gáy sờn, đủ nội dung để đọc.");
  await step(/Thông tin sách/).click();
  assert.match(
    await p.getByLabel("Tên sách", { exact: true }).inputValue(),
    /QA/,
  );
  await step(/Kiểm tra/).click();
  await p
    .getByLabel("Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.")
    .check();
  for (const scale of [100, 130]) {
    await p.evaluate(
      (scale) => (document.documentElement.style.fontSize = `${scale}%`),
      scale,
    );
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({
      path: path.join(artifacts, `sell-review-390-${scale}.png`),
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Sell overflow at ${scale}%`,
    );
  }
  let lost = false;
  const attempts = [];
  await p.route("**/api/v1/listings/*/submit", async (route) => {
    attempts.push({
      headers: route.request().headers(),
      body: route.request().postData(),
    });
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  let processing = false;
  mediaTimer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      await fixture.processMedia();
    } finally {
      processing = false;
    }
  }, 250);
  const before = await fixture.db.collection("listings").countDocuments();
  await button("Gửi duyệt").click();
  await button("Thử gửi lại").waitFor({ timeout: 45000 });
  await p.getByRole("alert").waitFor();
  await button("Thử gửi lại").click();
  await p
    .getByRole("heading", { name: "Đang chờ duyệt", exact: true })
    .waitFor({ timeout: 45000 });
  assert.equal(attempts.length, 2);
  assert.equal(
    attempts[0].headers["idempotency-key"],
    attempts[1].headers["idempotency-key"],
  );
  assert.equal(attempts[0].body, attempts[1].body);
  assert.equal(
    await fixture.db.collection("listings").countDocuments(),
    before + 1,
  );
  const latest = await fixture.api("/me/listings", fixture.member.accessToken);
  const id = latest.items.find(
    (item) => !fixture.listings.includes(item.id),
  ).id;
  const posted = await fixture.api(
    `/me/listings/${id}`,
    fixture.member.accessToken,
  );
  assert.equal(posted.state.moderation, "PendingReview");
  assert.equal(posted.currentRevision.content.hasMissingPages, true);
  assert.equal(posted.currentRevision.content.condition, "Worn");
  assert.equal(posted.currentRevision.content.exchangeValue, 45000);
  // Another authenticated Member reserves a real fixture listing. The server
  // commits the first request but its response is lost; retry must replay it.
  await p.goto(origin + "/login");
  await p.getByLabel("Email", { exact: true }).fill("admin@operations.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await button("Đăng nhập").click();
  await p.waitForURL(origin + "/");
  const selectedPath = await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .getAttribute("href");
  const selectedListing = selectedPath.split("/").at(-1);
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await button("Giữ sách và mở chat").click();
  const dialog = p.getByRole("dialog");
  await dialog.waitFor();
  await p.screenshot({
    path: path.join(artifacts, "purchase-dialog-390-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  const reserveAttempts = [];
  let reserveLost = false;
  await p.route(
    "**/api/v1/listings/*/purchase-conversations",
    async (route) => {
      reserveAttempts.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      if (!reserveLost) {
        reserveLost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await dialog
    .getByRole("button", { name: "Giữ sách và mở chat", exact: true })
    .click();
  await dialog.getByRole("alert").waitFor();
  await dialog
    .getByRole("button", { name: "Giữ sách và mở chat", exact: true })
    .click();
  await p.waitForURL("**/chat/*");
  assert.equal(reserveAttempts.length, 2);
  assert.equal(reserveAttempts[0].key, reserveAttempts[1].key);
  assert.equal(reserveAttempts[0].body, reserveAttempts[1].body);
  const buyerConversations = await fixture.api(
    "/me/purchase-conversations",
    admin.accessToken,
  );
  assert.equal(
    buyerConversations.filter((item) => item.listingId === selectedListing)
      .length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS user-web: real shelf/filter/pagination/detail; empty/error/retry; login return and owner guard; five tabs/data retention; upload/submit replay; purchase lost-response replay with one conversation; 390px100/130%, Home/Detail/Search320px130%. Fake storage, no native acceptance.",
  );
} catch (error) {
  const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
  if (pages[0])
    await pages[0].screenshot({
      path: path.join(artifacts, "failure.png"),
      fullPage: true,
      animations: "disabled",
    });
  throw error;
} finally {
  clearInterval(mediaTimer);
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
