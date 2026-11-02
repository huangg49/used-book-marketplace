// Browser regression with controlled HTTP responses; no API/DB/provider calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(root, "apps/admin-web/package.json"));
const { chromium, expect } = require("playwright/test");
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
const origin = "http://127.0.0.1:5186";
const artifacts = path.join(root, ".tmp/search-recovery");
await mkdir(artifacts, { recursive: true });
const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", "5186", "--strictPort"], {
  cwd: path.join(root, "apps/user-web"), windowsHide: true, stdio: "ignore",
  env: { ...process.env, VITE_API_BASE_URL: origin + "/api/v1" },
});
let browser;
const checks = [];
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* Vite startup */ }
    assert.equal(vite.exitCode, null, "QA Vite exited or port occupied");
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let mode = "empty";
  let listingRequests = 0;
  let pendingRoute;
  const queries = [];
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/v1/listings") {
      await route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", message: "QA anonymous" } });
      return;
    }
    listingRequests++;
    queries.push(url.searchParams.get("q") || "");
    if (mode === "network-error") { await route.abort("failed"); return; }
    if (mode === "timeout") { pendingRoute = route; return; }
    await route.fulfill({ json: { items: [], nextCursor: null, serverTime: new Date().toISOString() } });
  });
  const input = page.locator("#catalog-search");
  const loading = page.getByText("Đang tìm kiếm và tải kệ sách…", { exact: true });
  const empty = page.getByRole("heading", { name: "Chưa có cuốn sách nào phù hợp.", exact: true });
  const error = page.getByRole("heading", { name: "Chưa tải được kệ sách", exact: true });
  await page.goto(origin + "/books?data=live&q=no-match-qa");
  await expect(empty).toBeVisible();
  await expect(loading).toHaveCount(0);
  checks.push("no-match response ends loading and shows the empty state");

  await input.focus();
  await input.dispatchEvent("compositionstart");
  await input.fill("đang-ghép-dấu-qa");
  const beforeComposition = listingRequests;
  await page.waitForTimeout(600);
  assert.equal(listingRequests, beforeComposition, "Do not search unfinished IME input");
  const enterPrevented = await input.evaluate(el => {
    const event = new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert(enterPrevented, "IME Enter must commit characters without submitting");
  await input.dispatchEvent("compositionend");
  await expect.poll(() => queries.at(-1)).toBe("đang-ghép-dấu-qa");
  await expect(empty).toBeVisible();
  assert.equal(queries.at(-1), "đang-ghép-dấu-qa");
  checks.push("IME Enter does not submit unfinished text; compositionend resumes search");

  await input.focus();
  await input.dispatchEvent("compositionstart");
  await input.fill("blur-without-compositionend-qa");
  await page.waitForTimeout(400);
  await input.blur();
  await expect.poll(() => queries.at(-1)).toBe("blur-without-compositionend-qa");
  await expect(empty).toBeVisible({ timeout: 2000 });
  await expect(loading).toHaveCount(0);
  assert.equal(queries.at(-1), "blur-without-compositionend-qa");
  checks.push("blur recovers an interrupted IME session without an infinite skeleton");

  await input.focus();
  await input.dispatchEvent("compositionstart");
  await input.fill("  explicit-submit-qa  ");
  // Submit without blur or compositionend, including keyboard/assistive submit.
  await page.getByRole("search").evaluate(form => form.requestSubmit());
  await expect.poll(() => queries.at(-1)).toBe("explicit-submit-qa");
  await expect(empty).toBeVisible();
  await expect(input).toHaveValue("explicit-submit-qa");
  assert.equal(queries.at(-1), "explicit-submit-qa");
  checks.push("explicit submit clears stale composition and searches trimmed text");

  await input.fill("");
  await expect.poll(() => queries.at(-1)).toBe("");
  await expect(empty).toBeVisible();
  assert.equal(queries.at(-1), "");
  checks.push("clearing text searches the unfiltered shelf");

  mode = "network-error";
  await input.fill("network-error-qa");
  await expect(error).toBeVisible();
  await expect(loading).toHaveCount(0);
  await expect(input).toHaveValue("network-error-qa");
  mode = "empty";
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(empty).toBeVisible();
  assert.equal(queries.at(-1), "network-error-qa");
  checks.push("network failure preserves the query and retry reaches the empty state");

  mode = "timeout";
  await input.fill("stalled-request-qa");
  await expect(loading).toBeVisible();
  await expect(error).toBeVisible({ timeout: 18_000 });
  await expect(loading).toHaveCount(0);
  await expect(input).toHaveValue("stalled-request-qa");
  await pendingRoute?.abort().catch(() => {});
  mode = "empty";
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(empty).toBeVisible();
  checks.push("existing 15-second transport timeout exits loading and supports retry");

  await page.setViewportSize({ width: 390, height: 844 });
  await input.focus();
  await input.dispatchEvent("compositionstart");
  await input.fill("màn-hẹp-qa");
  await page.getByRole("search").getByRole("button", { name: "Tìm sách", exact: true }).click();
  await expect.poll(() => queries.at(-1)).toBe("màn-hẹp-qa");
  await expect(empty).toBeVisible();
  await expect(loading).toHaveCount(0);
  assert.equal(queries.at(-1), "màn-hẹp-qa");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await empty.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, "empty-mobile.png") });
  checks.push("mobile search button recovers IME without horizontal overflow");
  assert.deepEqual(errors, []);
  await writeFile(path.join(artifacts, "browser-result.json"), JSON.stringify({ status: "PASS", environment: "real Member web; controlled HTTP responses; no API/DB", checks, pageErrors: errors.length }, null, 2));
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, pageErrors: errors.length, apiDatabaseCalls: false }));
} finally {
  await browser?.close();
  vite.kill();
  if (vite.exitCode === null) await new Promise(resolve => { vite.once("exit", resolve); setTimeout(resolve, 2000); });
}
