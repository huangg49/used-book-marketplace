// Real Nest/Mongo QA fixture and Admin UI for the FR-G05 activity log.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium, expect } from "playwright/test";
import { createTestApi, root, base, origin, password } from "./test-api.mjs";
const qa = new URL(process.env.MONGO_TEST_URL ?? "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(qa.hostname) &&
    qa.port === (process.env.TEST_MONGO_PORT ?? "57017") &&
    qa.searchParams.get("replicaSet") === "rs-test",
  "Dedicated QA replica set required",
);
const req = createRequire(import.meta.url),
  { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
let fixture, vite, browser, page;
const errors = [],
  artifacts = path.join(root, "apps/admin-web/test-results/activity-log");
const login = async (email) => {
  await page.goto(origin + "/audit");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
};
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ listingCount: 0 });
  const admin = (await fixture.api("/auth/login", null, { email: "admin@operations.test", password })).accessToken;
  const id = fixture.member.user.id;
  const reason = "QA nhật ký: liên hệ qa.audit@example.com 0912345678";
  const detail = await fixture.api(`/operations/users/${id}`, admin);
  await fixture.api(`/operations/users/${id}/lock`, admin, {
    expectedVersion: detail.version,
    reason,
    unlockCondition: "Đã xác minh",
    relatedReference: "QA-AUDIT-1",
  });

  process.env.VITE_API_BASE_URL = base;
  process.chdir(path.join(root, "apps/admin-web"));
  vite = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });

  // Staff: no nav entry, page refuses, API refuses.
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await login("staff@operations.test");
  await expect(page.getByText("Chỉ quản trị viên đang hoạt động được xem nhật ký hoạt động.")).toBeVisible();
  await expect(page.locator('a[href="/audit"]')).toHaveCount(0);
  const staff = (await fixture.api("/auth/login", null, { email: "staff@operations.test", password })).accessToken;
  const refused = await fetch(base + "/operations/audit-events", { headers: { Authorization: `Bearer ${staff}` } });
  assert.equal(refused.status, 403);
  await page.close();

  // Admin: finds the lock, reason masked, drawer + pivots, URL filters.
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await login("admin@operations.test");
  await page.getByRole("heading", { name: "Nhật ký hoạt động", exact: true }).waitFor();
  await expect(page.locator('a[href="/audit"]').first()).toBeVisible();
  const row = page.locator("tbody tr").filter({ hasText: "Lock User Account" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("[email đã ẩn]");
  await expect(row).toContainText("[SĐT đã ẩn]");
  await expect(page.getByText("qa.audit@example.com")).toHaveCount(0);
  await expect(row.locator(`a[href="/users/${id}"]`)).toBeVisible();
  await row.getByRole("button", { name: "Lock User Account" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Lock User Account" })).toBeVisible();
  await expect(drawer).toContainText("Sau thay đổi");
  await expect(drawer).toContainText("LOCKED");
  await page.screenshot({ path: path.join(artifacts, "admin-1440.png"), fullPage: true });
  await drawer.getByRole("button", { name: "Cùng đối tượng" }).click();
  await expect(page).toHaveURL(new RegExp(`entityType=Account.*entityId=${id}`));
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await expect(page).toHaveURL(/\/audit$/);
  // The form re-reads the URL on the next render; wait for it before typing.
  await expect(page.getByRole("button", { name: "Xóa bộ lọc" })).toHaveCount(0);
  await expect(page.getByText(/Đang hiển thị \d+ sự kiện/)).toBeVisible();

  // Empty state through the time filter (in-app: tokens are memory-only, a reload signs out).
  await page.getByLabel("Từ", { exact: true }).fill("2099-01-01T00:00");
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(page).toHaveURL(/from=2099-01-01T00%3A00/);
  await expect(page.getByRole("heading", { name: "Không có sự kiện phù hợp" })).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.locator("tbody tr").first().waitFor();

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("heading", { name: "Nhật ký hoạt động", exact: true }).waitFor();
    await page.locator("tbody tr").first().waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `No horizontal page overflow at ${width}px`,
    );
    await page.screenshot({ path: path.join(artifacts, `admin-${width}.png`), fullPage: true });
  }
  assert.equal(errors.length, 0, `No browser page errors: ${errors.join(" | ")}`);
  console.log("PASS: Staff refused (UI/nav/API); Admin finds lock with masked reason, drawer, entity pivot, clear filters, empty state, 1440/390/320px without page overflow.");
} catch (e) {
  await page?.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  throw e;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close();
}
