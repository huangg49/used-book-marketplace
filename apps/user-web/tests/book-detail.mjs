// Real API/Mongo *_test and QA media. Contract variants below are UI-only mocks.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createTestApi, root, base, password } from "../../admin-web/tests/test-api.mjs";
const require = createRequire(new URL("../../admin-web/package.json", import.meta.url));
const { chromium, expect } = require("playwright/test");
const origin = "http://127.0.0.1:5184";
const artifacts = path.join(root, ".tmp/book-detail/qa");
await mkdir(artifacts, { recursive: true });
let fixture, vite, browser;
const checks = [], errors = [];
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 1 });
  const admin = await fixture.api("/auth/login", null, { email: "admin@operations.test", password });
  const catalog = await fixture.api(`/operations/catalog-requests/${fixture.catalogId}`, admin.accessToken);
  await fixture.api(`/operations/catalog-requests/${fixture.catalogId}/decision`, admin.accessToken, {
    expectedVersion: catalog.version, revisionId: catalog.currentRevision.id, decision: "Confirm",
  });
  const id = fixture.listings[0];
  const listing = await fixture.api(`/operations/listings/${id}`, admin.accessToken);
  await fixture.api(`/operations/listings/${id}/decision`, admin.accessToken, {
    expectedVersion: listing.version, revisionId: listing.currentRevision.id, decision: "Approve",
    checklist: { catalogMatches: true, photosClear: true, conditionDisclosed: true, readable: true, pricingValid: true, contentAppropriate: true },
  });
  const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
  vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5184", "--strictPort"], {
    cwd: path.join(root, "apps/user-web"), windowsHide: true, stdio: "ignore", env: { ...process.env, VITE_API_BASE_URL: base },
  });
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* startup */ }
    assert.equal(vite.exitCode, null, "QA Vite exited or port occupied");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  page.on("pageerror", () => errors.push("pageerror"));
  const detailUrl = `${origin}/books/${id}`;
  const add = () => page.getByRole("button", { name: "Thêm vào giỏ sách", exact: true });
  await page.goto(detailUrl);
  await page.getByRole("heading", { name: fixture.metadata.title, exact: true }).waitFor();
  const seller = page.getByRole("region", { name: "Thông tin người đăng", exact: true });
  await expect(seller).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem giỏ sách", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Thêm vào giỏ sách", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/login\\?returnUrl=${encodeURIComponent("/books/" + id)}`));
  checks.push("guest cart action returns through login to the exact listing; no premature cart-success link");
  await page.locator('input[type="email"]').fill("admin@operations.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(add()).toBeEnabled();
  await expect(page.getByRole("link", { name: "Mua ngay", exact: true })).toHaveAttribute("href", `/buy-now/${id}`);
  await expect(page.getByRole("link", { name: "Gửi đề nghị đổi sách", exact: true })).toHaveAttribute("href", `/chat/start/${id}?intent=Exchange`);
  checks.push("Both listing keeps real buy-now and exchange entry routes, one main purchase action");

  const opener = page.getByRole("button", { name: "Xem ảnh lớn", exact: true });
  await opener.click();
  await page.getByRole("dialog", { name: "Ảnh bản sách", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  checks.push("gallery viewer opens and Escape restores focus");

  let lost = false;
  const attempts = [];
  await page.route("**/api/v1/me/cart/add", async route => {
    attempts.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() });
    if (!lost) {
      lost = true;
      const response = await route.fetch();
      assert(response.ok(), "QA server must commit before losing the response");
      await route.abort("failed");
    } else await route.continue();
  });
  await add().click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem giỏ sách", exact: true })).toHaveCount(0);
  const transientDetailFailure = route => route.fulfill({ status: 503, json: { code: "QA_TEMPORARY_FAILURE", message: "Controlled QA response" } });
  await page.route(`**/api/v1/listings/${id}?*`, transientDetailFailure);
  await page.evaluate(async listingId => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["public-listing", listingId] });
  }, id);
  await expect(page.getByRole("alert").filter({ hasText: "Chưa cập nhật được thông tin mới nhất." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác minh thao tác giỏ trước", exact: true })).toBeEnabled();
  await page.unroute(`**/api/v1/listings/${id}?*`, transientDetailFailure);
  await page.getByRole("button", { name: "Xác minh thao tác giỏ trước", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã cập nhật giỏ sách" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Xem giỏ sách", exact: true })).toHaveAttribute("href", "/cart");
  assert.equal(attempts.length, 2);
  assert(attempts[0].key);
  assert.deepEqual(attempts[0], attempts[1], "Lost cart ACK must replay the same key and body");
  const cart = await fixture.api("/me/cart", admin.accessToken);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].listingId, id);
  const publicListing = await fixture.api(`/listings/${id}?bundleSupport=whole-v1`);
  assert.equal(publicListing.purchaseAvailability.status, "Available", "Adding to cart must not reserve the book");
  checks.push("cart lost-ACK replay survives detail refresh failure, uses the same key/body, one real cart item; success link appears only after ACK and does not reserve");

  await page.reload();
  await page.getByRole("heading", { name: fixture.metadata.title, exact: true }).waitFor();
  const publicPath = `**/api/v1/listings/${id}?*`;
  let variant;
  await page.route(publicPath, async route => {
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({ response, json: { ...value, ...variant } });
  });
  for (const mode of ["Sale", "Exchange", "Both"]) {
    variant = { mode, salePrice: mode === "Exchange" ? null : 125000, exchangeValue: mode === "Sale" ? null : 150000 };
    await page.reload();
    await page.getByRole("heading", { name: fixture.metadata.title, exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Mua ngay", exact: true }).count(), mode === "Exchange" ? 0 : 1);
    const prices = page.locator('[data-book-detail] [class*="prices"]');
    assert.equal(await prices.locator(":scope > div").count(), mode === "Both" ? 2 : 1);
    if (mode === "Exchange") {
      await expect(page.getByRole("link", { name: "Gửi đề nghị đổi sách", exact: true })).toHaveAttribute("href", `/chat/start/${id}?intent=Exchange`);
      await expect(page.getByRole("link", { name: "Thêm vào giỏ sách", exact: true })).toHaveCount(0);
    }
  }
  checks.push("contract UI variants Sale/Exchange/Both show only applicable prices and commands; variants are mocked, not transaction evidence");
  variant = { purchaseAvailability: { status: "AwaitingPayment", expiresAt: null } };
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chờ thanh toán", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mua ngay", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Thêm vào giỏ sách", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chờ thanh toán", exact: true })).toBeDisabled();
  checks.push("held contract UI variant removes purchase/cart and explains the state");
  variant = { mode: "Sale", salePrice: 125000, exchangeValue: null };
  await page.reload();
  await page.getByRole("heading", { name: fixture.metadata.title, exact: true }).waitFor();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const sellerBox = await seller.boundingBox();
    const buyBox = await page.getByRole("link", { name: "Mua ngay", exact: true }).boundingBox();
    assert(sellerBox.y < buyBox.y, "Seller identity must precede purchase actions");
    await page.screenshot({ path: path.join(artifacts, `sale-${width}.png`) });
  }
  checks.push("five widths 320–1440 have no page overflow; seller precedes purchase actions");
  await page.unroute(publicPath);
  await page.goto(origin + "/login?returnUrl=" + encodeURIComponent("/books/" + id));
  await page.locator('input[type="email"]').fill("member@operations.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("heading", { name: "Đây là bài đăng của bạn", exact: true }).waitFor();
  await expect(page.getByRole("link", { name: "Mua ngay", exact: true })).toHaveCount(0);
  await expect(add()).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chat với người bán", exact: true })).toHaveCount(0);
  checks.push("real seller session cannot buy/add own listing or chat with itself");
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "result.json"), JSON.stringify({ status: "PASS", environment: "real API/Mongo *_test + QA media; contract UI variants separately mocked", checks, pageErrors: 0 }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, pageErrors: 0, database: "isolated *_test", media: "QA fake" }));
} finally {
  await browser?.close();
  if (vite) {
    vite.kill();
    if (vite.exitCode === null) await new Promise(resolve => { vite.once("exit", resolve); setTimeout(resolve, 2000); });
  }
  await fixture?.close();
}
