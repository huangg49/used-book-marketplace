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
  const addToCart = page.locator("[data-book-detail]").getByText(/thêm vào giỏ/i);
  const buy = page.getByRole("link", { name: "Mua ngay", exact: true });
  const chat = page.getByRole("button", { name: "Chat với người bán", exact: true });
  const cartAdds = [];
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/me/cart/add")) cartAdds.push(request.url());
  });
  await page.goto(detailUrl);
  await page.getByRole("heading", { name: fixture.metadata.title, exact: true }).waitFor();
  const seller = page.getByRole("region", { name: "Thông tin người đăng", exact: true });
  await expect(seller).toBeVisible();
  await expect(addToCart).toHaveCount(0);
  await expect(buy).toHaveAttribute("href", `/buy-now/${id}`);
  await expect(chat).toBeEnabled();
  checks.push("guest book detail offers buy and chat with no cart entry");
  await page.goto(origin + "/login?returnUrl=" + encodeURIComponent("/books/" + id));
  await page.locator('input[type="email"]').fill("admin@operations.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(detailUrl);
  await expect(addToCart).toHaveCount(0);
  await expect(buy).toHaveAttribute("href", `/buy-now/${id}`);
  await expect(chat).toBeEnabled();
  await buy.focus();
  await page.keyboard.press("Tab");
  await expect(chat).toBeFocused();
  await expect(page.getByRole("link", { name: "Đề nghị đổi sách", exact: true })).toHaveAttribute("href", `/exchange/new?book=${id}`);
  checks.push("Both listing keeps real buy-now and exchange entry routes, one main purchase action");

  const opener = page.getByRole("button", { name: "Xem ảnh lớn", exact: true });
  await opener.click();
  await page.getByRole("dialog", { name: "Ảnh bản sách", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  checks.push("gallery viewer opens and Escape restores focus");

  const publicPath = `**/api/v1/listings/${id}?*`;
  const transientDetailFailure = route => route.fulfill({ status: 503, json: { code: "QA_TEMPORARY_FAILURE", message: "Controlled QA response" } });
  await page.route(publicPath, transientDetailFailure);
  await page.evaluate(async listingId => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["public-listing", listingId] });
  }, id);
  await expect(page.getByRole("alert").filter({ hasText: "Chưa cập nhật được thông tin mới nhất." })).toBeVisible();
  await expect(addToCart).toHaveCount(0);
  await page.unroute(publicPath, transientDetailFailure);
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Chưa cập nhật được thông tin mới nhất." })).toHaveCount(0);
  checks.push("detail refresh recovers after 503 without exposing a cart entry");

  await page.reload();
  await page.getByRole("heading", { name: fixture.metadata.title, exact: true }).waitFor();
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
    const exchange = page.getByRole("link", { name: "Đề nghị đổi sách", exact: true });
    if (mode === "Sale") await expect(exchange).toHaveCount(0);
    else await expect(exchange).toHaveAttribute("href", `/exchange/new?book=${id}`);
    await expect(addToCart).toHaveCount(0);
  }
  checks.push("contract UI variants Sale/Exchange/Both show only applicable prices and commands; variants are mocked, not transaction evidence");
  variant = { purchaseAvailability: { status: "AwaitingPayment", expiresAt: null } };
  await page.reload();
  await expect(page.getByRole("heading", { name: "Chờ thanh toán", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mua ngay", exact: true })).toHaveCount(0);
  await expect(addToCart).toHaveCount(0);
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
    const buyBox = await buy.boundingBox();
    const chatBox = await chat.boundingBox();
    assert(sellerBox.y < buyBox.y, "Seller identity must precede purchase actions");
    assert(buyBox.height >= 48 && chatBox.height >= 48, "Both purchase targets are at least 48px tall");
    assert(Math.abs(buyBox.width - chatBox.width) < 2, "Purchase actions have equal widths");
    if (width <= 420) assert(chatBox.y >= buyBox.y + buyBox.height, "Narrow layouts stack the actions");
    else assert(Math.abs(buyBox.y - chatBox.y) < 2, "Wide layouts keep both actions in one row");
    await page.screenshot({ path: path.join(artifacts, `sale-${width}.png`) });
    await page.getByRole("region", { name: "Chọn cách mua", exact: true }).screenshot({
      path: path.join(artifacts, `actions-${width}.png`),
    });
  }
  checks.push("five widths 320–1440 have no page overflow; seller precedes purchase actions");
  await page.unroute(publicPath);
  await page.goto(origin + "/login?returnUrl=" + encodeURIComponent("/books/" + id));
  await page.locator('input[type="email"]').fill("member@operations.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByRole("heading", { name: "Đây là bài đăng của bạn", exact: true }).waitFor();
  await expect(page.getByRole("link", { name: "Mua ngay", exact: true })).toHaveCount(0);
  await expect(addToCart).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Chat với người bán", exact: true })).toHaveCount(0);
  checks.push("real seller session cannot buy its own listing or start self-chat");
  assert.deepEqual(cartAdds, [], "Visiting or refreshing book detail must not add anything to the cart");
  assert.equal((await fixture.api("/me/cart", admin.accessToken)).items.length, 0);
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
