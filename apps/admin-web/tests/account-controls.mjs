// Real Nest/Mongo and Admin UI. Storage fixture is fake; no external provider.
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
  artifacts = path.join(root, "apps/admin-web/test-results/account-controls");
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ listingCount: 0 });
  process.env.VITE_API_BASE_URL = base;
  process.chdir(path.join(root, "apps/admin-web"));
  vite = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/users?q=member%40operations.test");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@operations.test");
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("heading", { name: "Người dùng", exact: true })
    .waitFor();
  const id = fixture.member.user.id;
  await page.locator(`a[href="/users/${id}"]`).click();
  await page
    .getByRole("heading", { name: "Quản lý tài khoản", exact: true })
    .waitFor();
  await expect(
    page.getByText("Chưa có quyết định khóa/mở được ghi trong phạm vi đã tải."),
  ).toBeVisible();
  const lockPath = `/operations/users/${id}/lock`,
    attempts = [];
  let drop = true;
  await page.route("**" + lockPath, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    attempts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (drop) {
      drop = false;
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "QA lost acknowledgement" },
      });
    }
    return route.fulfill({ response });
  });
  await page
    .getByLabel("Lý do khóa", { exact: true })
    .fill("QA đối chiếu hồ sơ tài khoản. ".repeat(8));
  await page
    .getByLabel("Điều kiện mở khóa", { exact: true })
    .fill("QA đã xác minh và xử lý nghĩa vụ cũ.");
  await page
    .getByLabel("Mã hồ sơ liên quan (không bắt buộc)")
    .fill("QA-ACCOUNT-2026");
  await page
    .getByRole("button", { name: "Kiểm tra khóa tài khoản", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quay lại kiểm tra", exact: true })
    .click();
  await expect(page.getByLabel("Lý do khóa", { exact: true })).not.toHaveValue(
    "",
  );
  await page
    .getByRole("button", { name: "Kiểm tra khóa tài khoản", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận quyết định", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác minh thao tác trước", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Tải trạng thái mới", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Kiểm tra mở khóa", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "← Về danh sách người dùng", exact: true })
    .click();
  await expect(page).toHaveURL(/users\?q=member/);
  await page.locator(`a[href="/users/${id}"]`).click();
  await page
    .getByRole("button", { name: "Xác minh thao tác trước", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Kiểm tra mở khóa", exact: true })
    .waitFor();
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].key, attempts[1].key);
  assert.equal(
    attempts[0].body === attempts[1].body,
    true,
    "Retry must preserve original command",
  );
  await page.unroute("**" + lockPath);
  assert.equal(
    await fixture.db
      .collection("audit_events")
      .countDocuments({ accountId: id, action: "lockUserAccount" }),
    1,
  );
  assert.equal(
    (await fixture.api("/me/profile", fixture.member.accessToken)).id,
    id,
  );
  async function decide(label, reasonLabel) {
    await page
      .getByLabel(reasonLabel, { exact: true })
      .fill("QA đã đối chiếu điều kiện và quyết định");
    await page.getByRole("button", { name: label, exact: true }).click();
    await page
      .getByRole("button", { name: "Xác nhận quyết định", exact: true })
      .click();
  }
  await decide("Kiểm tra mở khóa", "Lý do mở khóa");
  await page
    .getByRole("button", { name: "Kiểm tra khóa tài khoản", exact: true })
    .waitFor();
  const admin = (
    await fixture.api("/auth/login", null, {
      email: "admin@operations.test",
      password,
    })
  ).accessToken;
  // A real competing Admin decision while the old confirmation is open must
  // yield a stale refusal, never invert the old Lock into Unlock on refresh.
  await page
    .getByLabel("Lý do khóa", { exact: true })
    .fill("QA stale confirmation");
  await page
    .getByLabel("Điều kiện mở khóa", { exact: true })
    .fill("QA cần đối chiếu");
  await page
    .getByRole("button", { name: "Kiểm tra khóa tài khoản", exact: true })
    .click();
  let detail = await fixture.api(`/operations/users/${id}`, admin);
  await fixture.api(lockPath, admin, {
    expectedVersion: detail.version,
    reason: "QA competing Admin",
    unlockCondition: "QA verified",
    relatedReference: null,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("button", { name: "Xác nhận quyết định", exact: true })
    .click();
  await expect(
    page.getByText(/Nội dung đã thay đổi|Trạng thái hiện tại/),
  ).toBeVisible();
  assert.equal(
    (await fixture.api(`/operations/users/${id}`, admin)).user.status,
    "LOCKED",
  );
  await page
    .getByRole("button", { name: "Tải trạng thái mới", exact: true })
    .click();
  await decide("Kiểm tra mở khóa", "Lý do mở khóa");
  await page
    .getByRole("button", { name: "Kiểm tra khóa tài khoản", exact: true })
    .waitFor();
  for (let i = 0; i < 5; i++) {
    detail = await fixture.api(`/operations/users/${id}`, admin);
    await fixture.api(lockPath, admin, {
      expectedVersion: detail.version,
      reason: `QA lock ${i}`,
      unlockCondition: "QA verified",
      relatedReference: null,
    });
    await fixture.api(`/operations/users/${id}/unlock`, admin, {
      expectedVersion: detail.version + 1,
      reason: `QA unlock ${i}`,
      restoreStatus: "ACTIVE",
    });
  }
  await page
    .getByRole("button", { name: "Tải trạng thái mới", exact: true })
    .click();
  // Navigate through the directory so both account and history refetch on entry.
  await page
    .getByRole("link", { name: "← Về danh sách người dùng", exact: true })
    .click();
  await page.locator(`a[href="/users/${id}"]`).click();
  await page
    .getByRole("button", { name: "Xem thêm lịch sử", exact: true })
    .click();
  await expect(page.locator(".account-control-history li")).toHaveCount(14);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 320)
      await page.addStyleTag({ content: ":root {font-size:130%}" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      "No horizontal overflow",
    );
    await page.screenshot({
      path: path.join(artifacts, `account-${width}.png`),
      fullPage: true,
    });
  }
  assert.equal(errors.length, 0, "No browser page errors");
  console.log(
    "PASS: Admin lock/unlock from directory, confirmation/stale refusal, real history pagination, current obligation read, lost ACK + refresh + navigation exact retry, responsive320px/130%.",
  );
} catch (e) {
  await page?.screenshot({
    path: path.join(artifacts, "failure.png"),
    fullPage: true,
  });
  throw e;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close();
}
