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
  if (catalog.status !== "Confirmed")
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
    new Set([...firstPage.items, ...lastPage.items].map((book) => book.id))
      .size,
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
      .getByRole("navigation", { name: "Các bước đăng sách" })
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
  await p.getByRole("radio", { name: "Cũ nhiều", exact: true }).click();
  await button("Áp dụng").click();
  await p.waitForURL((url) => url.searchParams.has("condition"));
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p
    .getByRole("radio", { name: "Tất cả tình trạng", exact: true })
    .click();
  await button("Áp dụng").click();
  await p.waitForURL((url) => !url.searchParams.has("condition"));
  await p.getByText("13 cuốn trên trang này").waitFor();
  await button("Đổi sách").click();
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  assert.equal(new URL(p.url()).searchParams.get("mode"), "Exchange");
  await p.getByRole("button", { name: /^Sắp xếp / }).click();
  await p.getByRole("menuitemradio", { name: "Giá bán giảm dần" }).click();
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await p
    .getByRole("heading", { level: 1, name: fixture.metadata.title })
    .waitFor();
  await p.getByText(/125\.000\s*₫/).waitFor();
  await p.getByText(/150\.000\s*₫/).waitFor();
  await p.getByRole("link", { name: "Về kệ sách", exact: true }).click();
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
  await button("Chat với người bán").waitFor();
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
  await p.getByRole("link", { name: "Về kệ sách", exact: true }).click();
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
  await p.locator(`a[href="/books/${fixture.listings[0]}"]`).first().click();
  await button("Chat với người bán").click();
  await p.waitForURL("**/login?returnUrl=*");
  const returnPath = new URL(p.url()).searchParams.get("returnUrl");
  assert.match(returnPath, /^\/books\//);
  await p.getByLabel(/^Email/).fill("member@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button("Đăng nhập").click();
  await p.waitForURL(origin + returnPath);
  await p
    .getByRole("heading", { name: "Đây là bài đăng của bạn", exact: true })
    .waitFor();
  assert.equal(await button("Chat với người bán").count(), 0);
  await p
    .getByRole("link", { name: "Trang chủ Lật lại", exact: true })
    .first()
    .click();
  // Both the closing invitation and the footer have this label. Wait for the
  // footer too so this journey covers the fully rendered page, then scope the
  // click to the invitation instead of depending on which link renders first.
  await p
    .getByRole("contentinfo")
    .getByRole("link", { name: "Đăng sách của bạn", exact: true })
    .waitFor();
  await p
    .getByRole("region", {
      name: "Đọc xong rồi? Để sách đi tiếp.",
      exact: true,
    })
    .getByRole("link", { name: "Đăng sách của bạn", exact: true })
    .click();
  await p.waitForURL(origin + "/sell");
  await step(/Kiểm tra/).click();
  await p.getByText(/Đăng bài miễn phí/).waitFor();
  assert.equal(await p.getByText(/Phí gửi duyệt:/).count(), 0);
  assert.equal(
    await p.getByRole("link", { name: "Nạp ví", exact: true }).count(),
    0,
  );
  await button("Gửi duyệt").click();
  await p.getByRole("alert").waitFor();
  await step(/Thông tin sách/).click();
  if (await button("Không thấy sách? Tự nhập theo bìa").count())
    await button("Không thấy sách? Tự nhập theo bìa").click();
  await p
    .getByLabel("Tên sách", { exact: true })
    .fill("QA — Một cuốn sách cũ qua nhiều người đọc với tên dài");
  await p.getByLabel("Tác giả", { exact: true }).fill("Tác giả QA");
  await p
    .getByRole("combobox", { name: "Danh mục sách", exact: true })
    .selectOption({ label: "Sách khác" });
  await step(/Ảnh bản sách/).click();
  await p.locator("input[type=file]").setInputFiles({
    name: "qa-cover.png",
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  await step(/Tình trạng/).click();
  await p.getByLabel("Mức độ đã qua sử dụng").selectOption("Worn");
  await p
    .getByLabel("Ruột sách")
    .fill("Đủ nội dung, thiếu một trang trắng cuối sách.");
  await p.getByLabel("Bìa và gáy").fill("Gáy sờn, bìa có nếp gấp.");
  await p.getByLabel("Ghi chú, đánh dấu").fill("Không có");
  for (const [name, index] of [
    ["readable", 0],
    ["hasMissingPages", 0],
    ["missingEssentialContent", 1],
  ]) {
    const input = p.locator(`input[name=${name}]`).nth(index);
    await input.locator("..").click();
    assert.equal(await input.isChecked(), true);
  }
  await p.getByLabel("Phụ kiện").fill("Không có");
  await p
    .getByLabel("Mô tả chung")
    .fill("DỮ LIỆU QA. Bản sách cũ có gáy sờn, đủ nội dung để đọc.");
  await step(/Bán hoặc đổi/).click();
  const both = p.getByRole("radio", { name: "Bán hoặc đổi", exact: true });
  if (!(await both.isChecked())) await both.locator("..").click();
  assert.equal(await both.isChecked(), true);
  await p.getByLabel("Giá bán (VNĐ)").fill("35000");
  await p.getByLabel("Giá trị đổi (VNĐ)").fill("45000");
  // Regression: validation's address link must open the portalled form.
  await p.setViewportSize({ width: 1440, height: 900 });
  await button("Tiếp tục").click();
  await p.screenshot({
    path: path.join(artifacts, "origin-validation-error-desktop.png"),
    fullPage: false,
  });
  const originErrorLink = p.getByRole("alert").getByRole("button", {
    name: "Chọn địa chỉ đã lưu hoặc nhập đủ nơi gửi sách và khu vực luân chuyển.",
    exact: true,
  });
  await originErrorLink.click();
  await p
    .getByRole("dialog", { name: "Nơi gửi sách", exact: true })
    .waitFor({ timeout: 5000 });
  await p.locator("dialog[open]").evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished),
    );
  });
  await p.screenshot({
    path: path.join(artifacts, "origin-validation-popup-desktop.png"),
    fullPage: false,
  });
  await p.getByRole("button", { name: "Đóng popup", exact: true }).click();
  assert.equal(
    await originErrorLink.evaluate((node) => node === document.activeElement),
    true,
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await originErrorLink.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog", { name: "Nơi gửi sách", exact: true }).waitFor();
  await p.getByLabel("Họ tên người gửi", { exact: true }).fill("Người gửi QA");
  await p.getByRole("button", { name: "Đóng popup", exact: true }).click();
  await originErrorLink.click();
  assert.equal(
    await p.getByLabel("Họ tên người gửi", { exact: true }).inputValue(),
    "Người gửi QA",
  );
  await p
    .getByLabel("Số điện thoại người gửi", { exact: true })
    .fill("0901234567");
  const regionSelect = p.getByLabel("Khu vực luân chuyển sách", {
    exact: true,
  });
  assert.deepEqual(await regionSelect.locator("option").allTextContents(), [
    "Chọn khu vực",
    "TP.HCM",
    "Bình Dương",
    "Vũng Tàu",
  ]);
  await regionSelect.selectOption("DEMO-C");
  await p.getByLabel("Địa chỉ chi tiết", { exact: true }).fill("123 Đường QA");

  await p.locator("dialog[open]").evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished),
    );
    node.querySelector("h2")?.focus();
    node.scrollTo({ top: 0 });
  });
  const originBorders = await p
    .locator("dialog[open] input")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderTopColor),
    );
  for (const border of originBorders)
    assert.equal(border, "rgb(142, 117, 100)");
  await p.screenshot({
    path: path.join(artifacts, "origin-popup-mobile.png"),
    fullPage: false,
  });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.screenshot({
    path: path.join(artifacts, "origin-popup-desktop.png"),
    fullPage: false,
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p
    .getByRole("button", { name: "Dùng nơi gửi này", exact: true })
    .click();
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
    const response = await route.fetch();
    if (!lost && response.status() === 200) {
      lost = true;
      await route.abort("failed");
    } else await route.fulfill({ response });
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
  const addressesBefore = await fixture.db
    .collection("member_addresses")
    .countDocuments();
  await button("Gửi duyệt").click();
  await button("Thử gửi lại").waitFor({ timeout: 45000 });
  await p.getByRole("alert").waitFor();
  await p
    .getByText(/Bạn đã có tối đa 5 bài đang hiển thị hoặc chờ admin duyệt/)
    .waitFor();
  assert.equal(
    await fixture.db.collection("listings").countDocuments(),
    before + 1,
  );
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    await p.screenshot({
      path: path.join(artifacts, `listing-quota-${width}.png`),
      fullPage: true,
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  // Free one actual slot, then retry the pinned request through a lost ACK.
  const toHide = await fixture.api(
    `/me/listings/${fixture.listings[0]}`,
    fixture.member.accessToken,
  );
  await fixture.api(
    `/listings/${toHide.id}/visibility`,
    fixture.member.accessToken,
    { expectedVersion: toHide.version, visibility: "Hidden" },
    "PUT",
  );
  await button("Thử gửi lại").click();
  await p
    .getByRole("alert")
    .filter({ hasText: /Thông tin đang được giữ nguyên/ })
    .waitFor();
  await button("Thử gửi lại").waitFor();
  await button("Thử gửi lại").click();
  await p
    .getByRole("heading", { name: "Đã gửi duyệt", exact: true })
    .waitFor({ timeout: 45000 });
  assert.equal(attempts.length, 3);
  for (const attempt of attempts.slice(1)) {
    assert.equal(
      attempts[0].headers["idempotency-key"],
      attempt.headers["idempotency-key"],
    );
    assert.equal(attempts[0].body, attempt.body);
  }
  assert.equal(
    await fixture.db.collection("listings").countDocuments(),
    before + 1,
  );
  assert.equal(
    await fixture.db.collection("member_addresses").countDocuments(),
    addressesBefore + 1,
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
  assert.equal(await fixture.db.collection("listing_fees").countDocuments(), 0);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  assert.equal(posted.currentRevision.content.hasMissingPages, true);
  assert.equal(posted.currentRevision.content.condition, "Worn");
  assert.equal(posted.currentRevision.content.exchangeValue, 45000);
  assert.equal(posted.currentRevision.fulfillmentStatus, "Current");
  assert.equal(
    posted.currentRevision.content.fulfillment.method,
    "DirectDelivery",
  );
  // Another authenticated Member reserves a real fixture listing. The server
  // commits the first request but its response is lost; retry must replay it.
  await p.goto(origin + "/login");
  await p.getByLabel(/^Email/).fill("admin@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button("Đăng nhập").click();
  await p.waitForURL(origin + "/");
  const selectedPath = await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .getAttribute("href");
  const selectedListing = selectedPath.split("/").at(-1);
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await button("Chat với người bán").click();
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
  await dialog.getByRole("button", { name: "Mở chat", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  await dialog.getByRole("button", { name: "Mở chat", exact: true }).click();
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
    "PASS user-web: real shelf/filter/pagination/detail; empty/error/retry; login return and owner guard; five tabs/data retention; upload/submit replay; chat lost-response replay with one conversation; 390px100/130%, Home/Detail/Search320px130%. Fake storage, no native acceptance.",
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
