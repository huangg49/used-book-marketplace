// Real Nest/Mongo reads on a disposable *_test database; storage is fake.
// Run with MONGO_TEST_URL pointed at the dedicated QA replica set, never app DB.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
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
const origin = "http://127.0.0.1:5192";
const evidence = path.join(root, ".impeccable/review/account-overview-refined");
await mkdir(evidence, { recursive: true });
Object.assign(process.env, {
  VITE_API_BASE_URL: base,
  AUTH_MAIL_PROVIDER: "local",
  AUTH_WEB_ORIGIN: origin,
  AUTH_MAIL_ENCRYPTION_KEY: "account-overview-test-only-encryption-key-000",
});
let fixture, server, browser;
const checks = [];
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 4 });
  const targetId = randomUUID();
  const notices = Array.from({ length: 5 }, (_, index) => ({
    _id: randomUUID(),
    userId: fixture.member.user.id,
    kind: "AuctionOutbid",
    title: `Cập nhật phiên đấu giá ${index + 1}`,
    body: "DỮ LIỆU KIỂM THỬ. Có lượt trả giá mới; mở phiên để xem trạng thái hiện tại.",
    targetType: "Auction",
    targetId,
    dedupeKey: randomUUID(),
    createdAt: new Date(Date.now() - index * 60_000),
    readAt: null,
  }));
  await fixture.db.collection("member_notifications").insertMany(notices);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  assert.equal(
    (await fixture.api("/me/listings?limit=4", fixture.member.accessToken))
      .items.length,
    4,
  );
  const admin = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5192, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  const main = page.locator("#account-content");
  const books = page.getByRole("region", { name: "Kệ cập nhật gần đây" });
  const activity = page.getByRole("region", { name: "Hoạt động gần đây" });
  const wallet = page.getByRole("region", { name: "Ví mô phỏng" });
  const focus = page.locator('section[aria-labelledby="overview-focus"]');
  async function login(email) {
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Mật khẩu/).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await main.getByRole("heading", { name: "Tổng quan của bạn" }).waitFor();
    await page.locator("canvas").waitFor({ state: "detached" });
  }
  async function account() {
    const sidebarLink = page
      .getByRole("navigation", { name: "Không gian cá nhân", exact: true })
      .getByRole("link", { name: "Tổng quan", exact: true });
    if (await sidebarLink.isVisible()) {
      await sidebarLink.click();
      await main.getByRole("heading", { name: "Tổng quan của bạn" }).waitFor();
      return;
    }
    // Let route effects settle before opening a disclosure they can close.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    await page.getByRole("button", { name: /^Tài khoản của .+$/, exact: true }).click();
    await page
      .getByRole("navigation", { name: "Tài khoản cá nhân", exact: true })
      .getByRole("link", { name: "Tổng quan", exact: true })
      .click();
    await main.getByRole("heading", { name: "Tổng quan của bạn" }).waitFor();
  }
  async function capture(name, viewport) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#overview-books").waitFor();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#account-content img")].every(
        (img) => img.complete,
      ),
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
      true,
      name,
    );
    await page.screenshot({
      path: path.join(evidence, `${name}.png`),
      fullPage: true,
    });
  }
  await page.goto(origin + "/account?check=return");
  await page.waitForURL("**/login?returnUrl=*");
  assert.equal(
    new URL(page.url()).searchParams.get("returnUrl"),
    "/account?check=return",
  );
  await login("member@operations.test");
  assert.equal(new URL(page.url()).search, "?check=return");
  await books.locator("ul > li").nth(3).waitFor();
  await activity.locator("li").nth(2).waitFor();
  assert.equal(await books.locator("ul > li").count(), 4);
  assert.equal(await activity.locator("li").count(), 3);
  assert.equal(await wallet.getByText(/0\s*₫/, { exact: true }).count(), 2);
  assert.equal(
    (await fixture.api("/me/notifications?limit=3", fixture.member.accessToken))
      .unreadCount,
    5,
  );
  assert.equal(
    await books.getByRole("link", { name: /^Xem bài đăng/ }).count(),
    0,
  );
  checks.push(
    "guest returnUrl; bounded4/3 real reads; wallet zero; pending private rows; preview does not mark read",
  );
  await focus
    .getByRole("heading", { name: "Sách của bạn đang chờ duyệt" })
    .waitFor();
  assert.equal(
    await focus
      .getByRole("link", { name: "Xem bài chờ duyệt" })
      .getAttribute("href"),
    "/my-books?moderation=PendingReview",
  );

  // One batch of valid desktop/laptop/mobile evidence, with real owner data.
  await capture("desktop", { width: 1440, height: 1000 });
  await capture("laptop", { width: 1280, height: 720 });
  await capture("mobile", { width: 390, height: 844 });
  await capture("narrow", { width: 320, height: 740 });
  const rejectedRoute = (url) =>
    url.pathname.endsWith("/me/listings") &&
    url.searchParams.get("limit") === "1" &&
    url.searchParams.get("moderation") === "Rejected";
  await page.route(rejectedRoute, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "TEST_FAILURE", message: "QA" }),
    }),
  );
  await page.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
  });
  await focus
    .getByRole("heading", { name: "Chưa kiểm tra được việc trên kệ" })
    .waitFor();
  assert.equal(await books.locator("ul > li").count(), 4);
  await capture("focus-error", { width: 1280, height: 720 });
  await page.unroute(rejectedRoute);
  await focus.getByRole("button", { name: "Thử lại việc trên kệ" }).click();
  await focus
    .getByRole("heading", { name: "Sách của bạn đang chờ duyệt" })
    .waitFor();
  checks.push(
    "filtered limit1 reads find pending work; incomplete read never claims no work; local retry recovers",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await main.evaluate((el) => {
    el.style.zoom = "2";
  });
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
    true,
  );
  await main.evaluate((el) => {
    el.style.zoom = "";
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await main
      .getByRole("link", { name: "Đăng sách", exact: true })
      .evaluate((el) => getComputedStyle(el).transitionDuration),
    "0.17s, 0.17s",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  checks.push(
    "1440/1280/390/320 no overflow;200% content zoom; scoped motion retained",
  );

  // Additional drafts exercise pagination without exceeding upload rate limits.
  const seed = await fixture.api(
    `/me/listings/${fixture.listings[0]}`,
    fixture.member.accessToken,
  );
  for (let index = 0; index < 20; index++)
    await fixture.api("/listings", fixture.member.accessToken, {
      content: { ...seed.currentRevision.content, mediaIds: [] },
    });
  await books.getByRole("link", { name: "Xem toàn bộ kệ" }).click();
  await main.getByText("20 bài đăng trên trang này").waitFor();
  await main.getByRole("button", { name: "Trang tiếp theo" }).click();
  await main.getByText("4 bài đăng trên trang này").waitFor();
  assert.ok(new URL(page.url()).searchParams.get("cursor"));
  await main.getByRole("button", { name: "Chờ duyệt", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.has("cursor"), false);
  await main.getByText("4 bài đăng trên trang này").waitFor();
  assert.equal(
    new URL(page.url()).searchParams.get("moderation"),
    "PendingReview",
  );
  await main.getByRole("button", { name: "Bị từ chối", exact: true }).click();
  await main
    .getByRole("heading", { name: "Chưa có bài trong mục này" })
    .waitFor();
  await account();
  await focus
    .getByRole("heading", { name: "Bạn còn bản nháp trên kệ" })
    .waitFor();
  await capture("draft-priority", { width: 1440, height: 900 });
  checks.push(
    "full shelf20+cursor remains independent; filter clears cursor; overview navigation",
  );

  // Route focus and keyboard disclosure use the existing shared navigation.
  await page
    .getByRole("navigation", { name: "Không gian cá nhân" })
    .getByRole("link", { name: "Hồ sơ của tôi" })
    .click();
  await main.getByRole("heading", { name: "Hồ sơ của tôi" }).waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.tagName),
    "H1",
  );
  const accountButton = page.getByRole("button", {
    name: /^Tài khoản của .+$/,
    exact: true,
  });
  await accountButton.focus();
  await page.keyboard.press("ArrowDown");
  await page
    .getByRole("navigation", { name: "Tài khoản cá nhân", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent?.trim()),
    "Tổng quan",
  );
  await page.keyboard.press("Escape");
  assert.equal(await accountButton.getAttribute("aria-expanded"), "false");
  await accountButton.click();
  await page
    .getByRole("navigation", { name: "Tài khoản cá nhân", exact: true })
    .getByRole("link", { name: "Tổng quan", exact: true })
    .click();
  await main.getByRole("heading", { name: "Tổng quan của bạn" }).waitFor();
  checks.push("Profile preserved; H1 focus; account ArrowDown/Escape");

  // Inject transport failures only; underlying user data remains real and unchanged.
  const walletRoute = "**/api/v1/me/wallet";
  await page.route(walletRoute, (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ code: "TEST_FAILURE", message: "QA" }),
    }),
  );
  await main.getByRole("link", { name: "Xem toàn bộ kệ" }).click();
  await account();
  await page.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["wallet-summary"] });
  });
  await wallet.getByRole("alert").waitFor();
  assert.equal(await books.locator("ul > li").count(), 4);
  await capture("partial-error", { width: 1280, height: 720 });
  await page.unroute(walletRoute);
  await wallet.getByRole("button", { name: "Thử lại", exact: true }).click();
  await wallet.getByRole("alert").waitFor({ state: "detached" });
  checks.push("wallet failure is local; cached values flagged; retry recovers");

  const photoRoute = "**/api/v1/me/listings/*/media/*/read";
  await page.route(photoRoute, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "TEST_FAILURE", message: "QA" }),
    }),
  );
  // Current preview is made of newer drafts without media; revisit pending owner rows.
  await focus.getByRole("link", { name: /^Chờ duyệt/ }).click();
  await main.getByText("4 bài đăng trên trang này").waitFor();
  await page.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["my-photo"] });
  });
  await main
    .getByRole("button", { name: "Tải lại ảnh", exact: true })
    .first()
    .waitFor();
  await page.unroute(photoRoute);
  await main
    .getByRole("button", { name: "Tải lại ảnh", exact: true })
    .first()
    .click();
  await main
    .getByRole("img", { name: /^Ảnh bản sách/ })
    .first()
    .waitFor();
  await account();
  checks.push("shared owner photo failure/retry; no public-cover fallback");

  const readResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/me/notifications/read") &&
      response.status() === 200,
  );
  await activity.locator("li a").first().click();
  await readResponse;
  assert.equal(
    (await fixture.api("/me/notifications?limit=3", fixture.member.accessToken))
      .unreadCount,
    4,
  );
  await account();
  checks.push(
    "opening a notification targets its auction and marks only that notice read",
  );

  const toReject = await fixture.api(
    `/me/listings/${fixture.listings[0]}`,
    fixture.member.accessToken,
  );
  await fixture.api(
    `/operations/listings/${fixture.listings[0]}/decision`,
    admin.accessToken,
    {
      expectedVersion: toReject.version,
      revisionId: toReject.currentRevision.id,
      decision: "Reject",
      reason:
        "DỮ LIỆU KIỂM THỬ: cần bổ sung ảnh góc bìa để kiểm tra tình trạng.",
    },
  );
  // Rejection updates updatedAt; newer drafts deliberately push it out of limit4.
  for (let index = 0; index < 5; index++)
    await fixture.api("/listings", fixture.member.accessToken, {
      content: { ...seed.currentRevision.content, mediaIds: [] },
    });
  const recent = await fixture.api(
    "/me/listings?limit=4",
    fixture.member.accessToken,
  );
  assert.equal(
    recent.items.some((item) => item.id === fixture.listings[0]),
    false,
  );
  await page.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["my-listings"] });
  });
  await focus.getByRole("heading", { name: "Có bài cần xem lại" }).waitFor();
  await page.waitForFunction(() => {
    const titles = document
      .querySelector("#overview-books")
      ?.closest("section");
    return titles && !titles.textContent.includes("Bị từ chối");
  });
  assert.equal(
    await focus
      .getByRole("link", { name: "Xem bài bị từ chối" })
      .getAttribute("href"),
    "/my-books?moderation=Rejected",
  );
  await capture("rejected-priority", { width: 1440, height: 900 });
  checks.push(
    "real rejected item outside recent four takes priority over drafts and pending; link selects exact owner filter",
  );

  // Switch to a second real account through logout/login, never editing browser token storage.
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.waitForURL(origin + "/login");
  await page.goto(origin + "/account");
  await login("admin@operations.test");
  await books
    .getByRole("heading", { name: "Một chỗ trống cho cuốn sách đầu tiên." })
    .waitFor();
  await activity.getByRole("heading", { name: "Chưa có thông báo" }).waitFor();
  await focus
    .getByRole("heading", { name: "Dành chỗ cho cuốn sách tiếp theo" })
    .waitFor();
  assert.equal(await books.locator("ul > li").count(), 0);
  assert.equal(await activity.locator("li").count(), 0);
  assert.equal(
    (await fixture.api("/me/listings", admin.accessToken)).items.length,
    0,
  );
  await capture("empty-desktop", { width: 1440, height: 900 });
  await capture("empty-mobile", { width: 390, height: 844 });
  checks.push(
    "account switch isolates owner books/notifications; real empty account",
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await fixture.setUserStatus(admin.user.id, "LOCKED");
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page.waitForURL(origin + "/login");
  await page.goto(origin + "/account");
  await login("admin@operations.test");
  await books.getByRole("alert").waitFor();
  await focus
    .getByRole("heading", { name: "Xem lại trạng thái tài khoản" })
    .waitFor();
  await main
    .getByText("Tài khoản đang khóa giao dịch mới.", { exact: false })
    .waitFor();
  assert.equal(await books.locator("ul > li").count(), 0);
  await wallet.getByText("Số dư khả dụng", { exact: true }).waitFor();
  assert.equal(await books.getByRole("button", { name: "Thử lại" }).count(), 0);
  await capture("locked", { width: 1280, height: 720 });
  checks.push(
    "real LOCKED member: listing403 is distinct from empty; wallet obligation read remains available",
  );
  assert.deepEqual(pageErrors, []);
  await writeFile(
    path.join(evidence, "checks.json"),
    JSON.stringify(
      {
        checks,
        browser: "Chromium",
        api: "real Nest on disposable *_test Mongo",
        storage: "fake",
        native: "NOT RUN",
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS account overview:",
    checks.length,
    "browser scenarios; real isolated API reads; screenshots saved.",
  );
} finally {
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
