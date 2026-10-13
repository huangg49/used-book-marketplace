// Browser verification of the RN export against real Nest/MongoDB; fake storage.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { listingJourney } from "./test-listing-journey.mjs";
import { addressJourney } from "./test-address-journey.mjs";
import {
  createTestApi,
  root,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
const require = createRequire(
  new URL("../apps/admin-web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const origin = "http://127.0.0.1:8087",
  dist = path.join(root, "apps/mobile-react-native/dist");
const artifacts = path.join(root, "apps/mobile-react-native/test-results");
await mkdir(artifacts, { recursive: true });
let fixture, server, browser;
try {
  await readFile(path.join(dist, "index.html"));
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
  const mime = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".json": "application/json",
  };
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, origin).pathname,
      );
      let target = path.resolve(dist, "." + pathname);
      if (target !== dist && !target.startsWith(dist + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      if (target === dist || pathname === "/")
        target = path.join(dist, "index.html");
      else if (!path.extname(target)) target += ".html";
      const bytes = await readFile(target);
      response
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(target)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(bytes);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8087, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.clock.install();
  const errors = [],
    publicRequests = [];
  p.on("pageerror", (error) => errors.push(error.message));
  p.on("request", (request) => {
    if (
      request.url().includes("/api/v1/listings") &&
      request.method() === "GET"
    )
      publicRequests.push(request);
  });
  const click = (name) => p.getByRole("button", { name, exact: true }).click();
  await p.goto(origin);
  await p
    .getByRole("button", { name: /^Xem sách:/ })
    .first()
    .waitFor();
  assert.equal(await p.getByRole("button", { name: /^Xem sách:/ }).count(), 12);
  await click("Trang tiếp");
  await p
    .getByRole("button", { name: /^Xem sách:/ })
    .first()
    .waitFor();
  assert.equal(await p.getByRole("button", { name: /^Xem sách:/ }).count(), 1);
  await click("Trang trước");
  await p
    .getByRole("button", { name: /^Xem sách:/ })
    .nth(11)
    .waitFor();
  await p.screenshot({
    path: path.join(artifacts, "shelf-390.png"),
    fullPage: true,
  });
  await p
    .getByRole("button", { name: /^Xem sách:/ })
    .first()
    .click();
  await p
    .getByRole("heading", { name: "Tình trạng sách", exact: true })
    .waitFor();
  const metadataToggle = p.getByRole("button", {
    name: "Thông tin xuất bản",
    exact: true,
  });
  assert.equal(await metadataToggle.getAttribute("aria-expanded"), "false");
  await metadataToggle.click();
  await p.getByText("Nhà xuất bản", { exact: true }).waitFor();
  assert.equal(await metadataToggle.getAttribute("aria-expanded"), "true");
  await metadataToggle.click();
  let imageOffline = true;
  await p.route("**/api/v1/listings/*/media/*/read", (route) =>
    imageOffline ? route.abort("failed") : route.continue(),
  );
  await p.clock.fastForward(91_000);
  await p.getByRole("button", { name: "Tải lại ảnh", exact: true }).waitFor();
  imageOffline = false;
  await click("Tải lại ảnh");
  await p
    .getByRole("button", { name: "Tải lại ảnh", exact: true })
    .waitFor({ state: "hidden" });
  await p.unroute("**/api/v1/listings/*/media/*/read");
  await click("Xem ảnh lớn");
  // RN Web paints the content before its effect activates the modal stack and
  // keyboard handler. Wait for the accessible dialog, not just a painted button.
  const photoDialog = p.getByRole("dialog");
  await photoDialog.waitFor();
  await photoDialog
    .getByRole("button", { name: "Đóng", exact: true })
    .waitFor();
  await p.screenshot({
    path: path.join(artifacts, "book-photo-dialog-390.png"),
  });
  await p.keyboard.press("Escape");
  await p
    .getByRole("button", { name: "Đóng", exact: true })
    .waitFor({ state: "hidden" });
  const back = p.getByRole("button", { name: "Quay lại", exact: true });
  await back.scrollIntoViewIfNeeded();
  const target = await back.boundingBox();
  assert.ok(
    target.width >= 48 && target.height >= 48,
    "Back navigation retains a 48px touch target",
  );
  await p.screenshot({
    path: path.join(artifacts, "book-390.png"),
    fullPage: true,
  });
  await p.setViewportSize({ width: 320, height: 780 });
  await p.evaluate(() => {
    const elements = [
      ...document.querySelectorAll('[dir="auto"],input,textarea'),
    ].map((element) => [
      element,
      parseFloat(getComputedStyle(element).fontSize),
    ]);
    for (const [element, size] of elements)
      element.style.fontSize = `${size * 1.35}px`;
  });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({
    path: path.join(artifacts, "book-320-large.png"),
    fullPage: true,
  });
  // A real owner status change hides both the fetched detail and future photos.
  await fixture.setUserStatus(fixture.member.user.id, "RESTRICTED");
  await click("Làm mới thông tin");
  await p.getByText("Không tìm thấy sách", { exact: true }).waitFor();
  assert.equal(
    await p
      .getByRole("heading", { name: "Tình trạng sách", exact: true })
      .count(),
    0,
  );
  await click("Quay lại");
  await p.getByText(/Không tìm thấy sách|Chưa có sách được đăng/).waitFor();
  await fixture.setUserStatus(fixture.member.user.id, "ACTIVE");
  await click("Xem thêm các tác phẩm gợi ý");
  await p
    .getByRole("button", { name: /^Xem sách:/ })
    .first()
    .waitFor();
  let offline = true;
  await p.route("**/api/v1/listings?*", (route) =>
    offline ? route.abort("failed") : route.continue(),
  );
  await click("Xem thêm các tác phẩm gợi ý");
  await p.getByText(/Chưa cập nhật được danh sách/).waitFor();
  assert.equal(await p.getByRole("button", { name: /^Xem sách:/ }).count(), 12);
  offline = false;
  await click("Thử lại");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  await p.getByLabel("Email", { exact: true }).last().waitFor();
  await p.screenshot({ path: path.join(artifacts, "login-390.png") });
  await p.getByLabel("Email", { exact: true }).last().fill("member@operations.test");
  await p.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await click("Đăng nhập");
  await p.getByRole("button", { name: "Sách của tôi", exact: true }).waitFor();
  await p.screenshot({ path: path.join(artifacts, "account-390.png") });
  await p.getByRole("tab", { name: "Trang chủ", exact: true }).click();
  await p
    .getByRole("button", { name: /^Xem sách:/ })
    .first()
    .waitFor();
  assert(publicRequests.length > 0);
  assert(
    publicRequests.every((request) => !request.headers().authorization),
    "Public requests must never attach session tokens",
  );
  // Continue through owner lifecycle using RN controls and real versioned commands.
  await p.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  await click("Sách của tôi");
  // DraftsScreen now uses the per-listing action label ("Xem sách" for an
  // approved listing) instead of the legacy "Quản lý sách 1" label.
  const ownerBookAction = p.getByRole("button", {
    name: "Xem sách",
    exact: true,
  }).last();
  await ownerBookAction.waitFor();
  await p.screenshot({ path: path.join(artifacts, "drafts-390.png") });
  const ownerResponse = p.waitForResponse(
    (r) =>
      r.url().includes("/me/listings/") &&
      r.request().method() === "GET" &&
      !r.url().includes("/media") &&
      r.status() === 200,
  );
  await ownerBookAction.click();
  const ownerId = new URL((await ownerResponse).url()).pathname
    .split("/")
    .at(-1);
  await click("Ẩn khỏi kệ");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Ẩn khỏi kệ", exact: true })
    .click();
  await p.getByText("Đã ẩn bài khỏi kệ.", { exact: true }).waitFor();
  assert.equal(
    (await fetch(`http://127.0.0.1:3009/api/v1/listings/${ownerId}`)).status,
    404,
  );
  await click("Mở lại trên kệ");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Mở lại trên kệ", exact: true })
    .click();
  await p.getByText("Đã mở lại bài trên kệ.", { exact: true }).waitFor();
  await click("Sửa bài đã duyệt");
  // The approved-edit flow names the first transition after the book
  // information step explicitly; later steps use the generic "Tiếp theo".
  await click("Tiếp tục: Ảnh bản sách →");
  await click("Tiếp theo");
  await click("Tiếp theo");
  await p.getByLabel("Giá bán (đồng)", { exact: true }).fill("175000");
  await click("Tiếp theo");
  await p
    .getByRole("checkbox", {
      name: "Tôi xác nhận sở hữu ấn bản này và cam kết thông tin trung thực theo quy chuẩn thẩm định của cộng đồng Lật Lại.",
    })
    .click();
  let lostRevision = true;
  await p.route("**/api/v1/listings/*/revision", async (route) => {
    if (!lostRevision) return route.continue();
    lostRevision = false;
    await route.fetch();
    await route.abort("failed");
  });
  await click("Gửi bản sửa để duyệt lại");
  await click("Gửi bản sửa");
  await click("Thử lại yêu cầu vừa gửi");
  await p
    .getByText("Đã gửi duyệt. Bạn có thể quay lại để xem kết quả.", {
      exact: true,
    })
    .waitFor();
  const own = await fixture.api(
    `/me/listings/${ownerId}`,
    fixture.member.accessToken,
  );
  assert.equal(own.state.moderation, "PendingReview");
  assert.equal(own.currentRevision.content.salePrice, 175000);
  assert.equal(
    await fixture.db.collection("mutation_receipts").countDocuments({
      listingId: ownerId,
      operation: "reviseApprovedListing",
    }),
    1,
  );
  assert.equal(
    (await fetch(`http://127.0.0.1:3009/api/v1/listings/${ownerId}`)).status,
    404,
  );
  await p.screenshot({
    path: path.join(artifacts, "lifecycle-pending.png"),
    fullPage: true,
  });
  let lostArchive = true;
  await p.route("**/api/v1/listings/*/archive", async (route) => {
    if (!lostArchive) return route.continue();
    lostArchive = false;
    await route.fetch();
    await route.abort("failed");
  });
  await click("Xóa bài đăng");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Xóa bài đăng", exact: true })
    .click();
  await click("Thử lại yêu cầu này");
  await p.getByRole("heading", { name: "Sách của tôi", exact: true }).waitFor();
  assert.equal(
    await fixture.db.collection("mutation_receipts").countDocuments({
      listingId: ownerId,
      operation: "archiveListing",
    }),
    1,
  );
  await addressJourney(p, fixture, artifacts);
  await listingJourney(p, fixture, admin, artifacts);
  // Account actions must still reflect server eligibility after the layout changes.
  await click("Quay lại");
  await fixture.setUserStatus(fixture.member.user.id, "RESTRICTED");
  // listingJourney navigates to a guest URL; browser tokens are memory-only.
  await p.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  await p.getByLabel("Email", { exact: true }).last().fill("member@operations.test");
  await p.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await click("Đăng nhập");
  await p
    .getByText("Tài khoản đang bị hạn chế một số hoạt động.", { exact: true })
    .waitFor();
  await p.screenshot({
    path: path.join(artifacts, "account-restricted-390.png"),
  });
  await p.getByRole("tab", { name: "Trang chủ", exact: true }).click();
  await fixture.setUserStatus(fixture.member.user.id, "LOCKED");
  await p.getByRole("tab", { name: "Tài khoản", exact: true }).click();
  await p.getByText(/Tài khoản đang bị khóa/).last().waitFor();
  assert.equal(
    await p.getByRole("button", { name: "Sách của tôi", exact: true }).count(),
    0,
  );
  assert.equal(
    await p.getByRole("button", { name: "Sổ địa chỉ", exact: true }).count(),
    0,
  );
  await p.screenshot({ path: path.join(artifacts, "account-locked-390.png") });
  await click("Đăng xuất");
  assert.deepEqual(errors, []);
  console.log(
    "PASS RN export browser: shelf/detail/pagination/search/filters/images/errors, responsive large text, owner restriction, login; owner hide/reopen, approved revision with lost-ack replay, archive pending with lost-ack replay. Real HTTP/MongoDB; fake storage.",
  );
} catch (error) {
  const p = browser?.contexts()[0]?.pages()[0];
  if (p) {
    await p
      .screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error((await p.locator("body").innerText()).slice(-2500));
  }
  console.error(
    error instanceof Error ? error.message : "Public browser test failed",
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await fixture?.close();
}
