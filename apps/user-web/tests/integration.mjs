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
  await p.goto(origin);
  console.log('QA: home/search');
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
    fullPage: true, animations: "disabled",
  });
  await p.getByLabel("Bạn muốn tìm cuốn nào?").fill("khong-co-sach-nay");
  await button("Tìm sách").click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Tìm sách", { exact: true }).fill("");
  await p.getByText("12 cuốn trên trang này").waitFor();
  await button("Trang tiếp theo").click();
  await p.getByText("1 cuốn trên trang này").waitFor();
  await button("Về trang đầu").click();
  await p.getByText("12 cuốn trên trang này").waitFor();
  await p.getByLabel("Cũ nhiều", { exact: true }).click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Cũ nhiều", { exact: true }).click();
  await p.getByLabel("Trao đổi", { exact: true }).click();
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
  const failedSearch = p.waitForResponse(response => response.status() === 503 && new URL(response.url()).searchParams.get("q") === "QA-failure");
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
      fullPage: true, animations: "disabled",
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Search overflow at ${scale}%`,
    );
  }
  console.log('QA: public shelf/detail/states passed; sell journey');
  await button("Mở menu").click();
  await p.getByRole("navigation", {name:"Điều hướng trên điện thoại"}).getByRole("link", {name:"Đăng nhập",exact:true}).click();
  await p.waitForURL("**/login");
  await p.getByLabel("Email", { exact: true }).fill("member@operations.test");
  await p.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await button("Đăng nhập").click();
  await p.getByRole("link", { name: "Đăng sách của bạn", exact: true }).click();
  await button(/^5\s*Kiểm tra$/).click();
  await button("Gửi duyệt").click();
  await p.getByRole("alert").waitFor();
  await button(/^1\s*Thông tin sách$/).click();
  await p
    .getByLabel("Tên sách", { exact: true })
    .fill("QA — Một cuốn sách cũ qua nhiều người đọc với tên dài");
  await p.getByLabel("Tác giả", { exact: true }).fill("Tác giả QA");
  await button(/^2\s*Ảnh cuốn sách$/).click();
  await p
    .locator("input[type=file]")
    .setInputFiles({
      name: "qa-cover.png",
      mimeType: "image/png",
      buffer: fixture.photo,
    });
  await button(/^3\s*Tình trạng$/).click();
  await p.getByLabel("Tình trạng tổng thể").selectOption("Worn");
  await p
    .getByLabel("Ruột sách và trang thiếu")
    .fill("Đủ nội dung, thiếu một trang trắng cuối sách.");
  await p.getByLabel("Bìa và gáy sách").fill("Gáy sờn, bìa có nếp gấp.");
  await p.getByLabel("Ghi chú và đánh dấu").fill("Không có");
  await p.locator("input[name=readable]").first().check();
  await p.locator("input[name=hasMissingPages]").first().check();
  await p.locator("input[name=missingEssentialContent]").last().check();
  await button(/^4\s*Bán hoặc đổi$/).click();
  await button("Bán hoặc đổi").click();
  await p.getByLabel("Giá bán (VNĐ)").fill("35000");
  await p.getByLabel("Giá trị quy đổi (VNĐ)").fill("45000");
  await p.getByLabel("Phụ kiện đi kèm").fill("Không có");
  await p
    .getByLabel("Mô tả chung")
    .fill("DỮ LIỆU QA. Bản sách cũ có gáy sờn, đủ nội dung để đọc.");
  await button(/^1\s*Thông tin sách$/).click();
  assert.match(
    await p.getByLabel("Tên sách", { exact: true }).inputValue(),
    /QA/,
  );
  await button(/^5\s*Kiểm tra$/).click();
  await p
    .getByLabel("Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.")
    .check();
  for (const scale of [100, 130]) {
    await p.evaluate(
      (scale) => (document.documentElement.style.fontSize = `${scale}%`),
      scale,
    );
    await p.evaluate(() => window.scrollTo(0,0));
    await p.screenshot({
      path: path.join(artifacts, `sell-review-390-${scale}.png`),
      fullPage: true, animations: "disabled",
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
  assert.deepEqual(errors, []);
  console.log(
    "PASS user-web: real shelf/filter/pagination/detail; empty/error/retry; five tabs/data retention; upload/submit and lost-response replay; 390px 100/130%. Fake storage, no native acceptance.",
  );
} catch (error) {
  const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
  if (pages[0])
    await pages[0].screenshot({
      path: path.join(artifacts, "failure.png"),
      fullPage: true, animations: "disabled",
    });
  throw error;
} finally {
  clearInterval(mediaTimer);
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
