import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { createTestApi, root, origin, base, password } from "./test-api.mjs";
const require = createRequire(import.meta.url);
const artifacts = path.join(root, "apps/admin-web/test-results");
await mkdir(artifacts, { recursive: true });
let fixture, server, browser;
try {
  fixture = await createTestApi();
  server = spawn(
    process.execPath,
    [
      path.join(
        path.dirname(require.resolve("vite/package.json")),
        "bin/vite.js",
      ),
      "--host",
      "127.0.0.1",
      "--port",
      "5174",
      "--strictPort",
    ],
    {
      cwd: path.join(root, "apps/admin-web"),
      env: { ...process.env, VITE_API_BASE_URL: base },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  // Drain output without exposing environment configuration or credentials.
  server.stdout.resume();
  server.stderr.resume();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Vite startup timed out")),
      20000,
    );
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited: ${code}`));
    });
    const poll = async () => {
      try {
        if ((await fetch(origin)).ok) {
          clearTimeout(timer);
          resolve();
          return;
        }
      } catch {}
      if (server.exitCode === null) setTimeout(poll, 100);
    };
    void poll();
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const pageErrors = [];
  const page = async () => {
    const p = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    p.on("pageerror", (error) => pageErrors.push(error.message));
    return p;
  };
  const click = (p, name) =>
    p.getByRole("button", { name, exact: true }).click();
  const focused = async (locator) =>
    assert(await locator.evaluate((node) => node === document.activeElement), `Expected focus: ${locator}`);
  const shot = async (p, name) => {
    await p.evaluate(() => document.fonts.ready);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      `Horizontal overflow: ${name}`,
    );
    await p.screenshot({ path: path.join(artifacts, name + ".png"), fullPage: true });
  };
  const login = async (
    p,
    route = "/review/listings",
    email = "admin@operations.test",
  ) => {
    await p.goto(origin + route);
    await p.getByLabel("Email", { exact: true }).fill(email);
    await p.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await click(p, "Đăng nhập");
    await p.waitForURL(origin + (route === "/" ? "/dashboard" : route));
  };
  const openListing = async (p, index) => {
    await p
      .getByRole("link", { name: "Bài đăng sách", exact: true })
      .click();
    await p
      .locator(`a[href='/review/listings/${fixture.listings[index]}']`)
      .first()
      .click();
    await p.getByLabel("Lý do từ chối", { exact: true }).waitFor();
  };
  const p = await page();
  let releaseQueue;
  const queueGate = new Promise((resolve) => { releaseQueue = resolve; });
  await p.route("**/operations/listings?*", async (route) => {
    await queueGate;
    await route.abort("failed");
  });
  await login(p, "/");
  await p
    .getByText("Dashboard này chưa truy vấn API và không hỗ trợ thao tác vận hành.")
    .waitFor();
  await p.getByRole("link", { name: "Bài đăng sách", exact: true }).click();
  await p
    .getByRole("heading", { name: "Trước khi sách chuyền tay." })
    .waitFor();
  await p.getByRole("status").filter({ hasText: "Đang tải hồ sơ" }).waitFor();
  await shot(p, "queue-loading-1440");
  releaseQueue();
  await p.getByRole("alert").waitFor();
  assert.equal(await p.getByText("Chưa có hồ sơ ở mục này.").count(), 0);
  await shot(p, "queue-first-error-1440");
  await p.unroute("**/operations/listings?*");
  const retry = p.getByRole("button", { name: "Thử tải lại", exact: true });
  await retry.focus();
  await p.keyboard.press("Enter");
  await p.locator(".queue-row").nth(2).waitFor();
  assert.match(await p.locator(".queue-row").first().innerText(), /Giá bán: 125\.000/);
  assert.match(await p.locator(".queue-row").first().innerText(), /Giá trị đổi: 150\.000/);
  await shot(p, "queue-1440");
  const skip = p.getByRole("link", { name: "Đến nội dung chính" });
  await skip.focus();
  await p.keyboard.press("Enter");
  await focused(p.locator("#main"));
  await p.keyboard.press("Tab");
  await focused(p.getByRole("button", { name: "Chờ duyệt", exact: true }));
  await p.setViewportSize({ width: 320, height: 780 });
  await p.addStyleTag({ content: "html{font-size:21.6px !important}" });
  await shot(p, "queue-320-large");
  assert(
    await p.locator(".mock-nav-label").evaluate((badge) => {
      const label = badge.getBoundingClientRect();
      const link = badge.closest("a").getBoundingClientRect();
      return label.left >= link.left && label.right <= link.right;
    }),
    "Dashboard sample label must stay inside its navigation link",
  );
  const userLink = p.getByRole("link", { name: "Quản lý người dùng", exact: true });
  assert(await userLink.isVisible(), "Admin navigation remains available at 320px");
  await userLink.focus();
  await focused(userLink);
  await p.keyboard.press("Enter");
  await p.getByRole("heading", { name: "Người dùng", level: 1 }).waitFor();
  await shot(p, "users-320-large");
  const listingLink = p.getByRole("link", { name: "Bài đăng sách", exact: true });
  await listingLink.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("heading", { name: "Trước khi sách chuyền tay.", level: 1 }).waitFor();
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.addStyleTag({ content: "html{font-size:16px !important}" });
  await p.getByRole("link", { name: "Đầu sách", exact: true }).click();
  await p
    .locator(`a[href='/review/catalog-requests/${fixture.catalogId}']`)
    .first()
    .click();
  await click(p, "Xác nhận đầu sách");
  await p.getByRole("dialog").waitFor();
  await focused(p.getByRole("button", { name: "Quay lại kiểm tra", exact: true }));
  await p.keyboard.press("Tab");
  await focused(p.getByRole("button", { name: "Xác nhận quyết định", exact: true }));
  await p.keyboard.press("Shift+Tab");
  await focused(p.getByRole("button", { name: "Quay lại kiểm tra", exact: true }));
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await focused(p.getByRole("button", { name: "Xác nhận đầu sách", exact: true }));
  await p.keyboard.press("Enter");
  await shot(p, "decision-confirm-1440");
  await click(p, "Xác nhận quyết định");
  await p.locator(".status-label").filter({ hasText: "Đã xác nhận" }).waitFor();
  await openListing(p, 0);
  await click(p, "Xem lớn ảnh 1");
  await p.getByRole("dialog").waitFor();
  await focused(p.getByRole("button", { name: "Đóng ảnh 1", exact: true }));
  await p.keyboard.press("Escape");
  await focused(p.getByRole("button", { name: "Xem lớn ảnh 1", exact: true }));
  assert.equal(await p.locator("dialog[open]").count(), 0);
  assert(
    await p
      .getByRole("button", { name: "Duyệt bài đăng", exact: true })
      .isDisabled(),
  );
  await click(p, "Từ chối có lý do");
  await focused(p.getByLabel("Lý do từ chối", { exact: true }));
  assert.equal(
    await p
      .getByLabel("Lý do từ chối", { exact: true })
      .getAttribute("aria-invalid"),
    "true",
  );
  for (const checkbox of await p.getByRole("checkbox").all())
    await checkbox.check();
  await p.getByRole("link", { name: "← Về danh sách", exact: true }).click();
  await p.getByRole("dialog").waitFor();
  await focused(p.getByRole("button", { name: "Ở lại hồ sơ", exact: true }));
  await shot(p, "leave-guard-1440");
  await p.keyboard.press("Escape");
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await focused(p.getByRole("link", { name: "← Về danh sách", exact: true }));
  assert.equal(await p.getByRole("checkbox", { checked: true }).count(), 6);
  await p.screenshot({
    path: path.join(artifacts, "listing-1440.png"),
    fullPage: true,
  });
  let lost = false;
  const keys = [];
  await p.route("**/operations/listings/*/decision", async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await click(p, "Duyệt bài đăng");
  await click(p, "Xác nhận quyết định");
  await p.getByRole("button", { name: "Thử lại quyết định vừa gửi", exact: true }).waitFor();
  await p.getByRole("dialog").waitFor({ state: "hidden" });
  await focused(p.getByRole("button", { name: "Thử lại quyết định vừa gửi", exact: true }));
  await shot(p, "decision-lost-ack-1440");
  await click(p, "Thử lại quyết định vừa gửi");
  await p.locator(".status-label").filter({ hasText: "Đã duyệt" }).waitFor();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  await p.unroute("**/operations/listings/*/decision");
  await openListing(p, 1);
  await p
    .getByLabel("Lý do từ chối", { exact: true })
    .fill("Vui lòng bổ sung ảnh rõ phần trang bị gạch chân.");
  await click(p, "Từ chối có lý do");
  await click(p, "Xác nhận quyết định");
  await p.locator(".status-label").filter({ hasText: "Đã từ chối" }).waitFor();
  await p.setViewportSize({ width: 390, height: 844 });
  await p.screenshot({
    path: path.join(artifacts, "rejected-390.png"),
    fullPage: true,
  });
  await p.setViewportSize({ width: 320, height: 780 });
  await p.addStyleTag({ content: "html{font-size:21.6px !important}" });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({
    path: path.join(artifacts, "rejected-320-large.png"),
    fullPage: true,
  });
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.addStyleTag({ content: "html{font-size:16px !important}" });
  // The member resubmits after rejection. Reopening in this session must load the new
  // revision, not the copy cached at the decision (ADR 0010 bars refetch only while open).
  const rejected = await fixture.api(
    `/me/listings/${fixture.listings[1]}`,
    fixture.member.accessToken,
  );
  const corrected = await fixture.api(
    `/listings/${fixture.listings[1]}/draft`,
    fixture.member.accessToken,
    {
      expectedVersion: rejected.version,
      content: {
        ...rejected.currentRevision.content,
        notes: "Đã bổ sung ảnh rõ phần trang bị gạch chân.",
      },
    },
    "PUT",
  );
  await fixture.api(
    `/listings/${fixture.listings[1]}/submit`,
    fixture.member.accessToken,
    { expectedVersion: corrected.version, ownershipDeclared: true },
  );
  await openListing(p, 1);
  await p.locator(".status-label").filter({ hasText: "Chờ duyệt" }).waitFor();
  await p.getByText("Đã bổ sung ảnh rõ phần trang bị gạch chân.").waitFor();
  for (const checkbox of await p.getByRole("checkbox").all())
    await checkbox.check();
  await click(p, "Duyệt bài đăng");
  await click(p, "Xác nhận quyết định");
  await p.locator(".status-label").filter({ hasText: "Đã duyệt" }).waitFor();
  // Two real sessions view the same version. The second must reconcile a 409.
  const second = await page();
  await login(second, `/review/listings/${fixture.listings[2]}?source=handoff#main`);
  await second.getByRole("checkbox").first().waitFor();
  for (const checkbox of await second.getByRole("checkbox").all())
    await checkbox.check();
  await openListing(p, 2);
  await p
    .getByLabel("Lý do từ chối", { exact: true })
    .fill("Cần mô tả rõ phần gáy sách trước khi duyệt.");
  await click(p, "Từ chối có lý do");
  await click(p, "Xác nhận quyết định");
  await p.locator(".status-label").filter({ hasText: "Đã từ chối" }).waitFor();
  await click(second, "Duyệt bài đăng");
  await click(second, "Xác nhận quyết định");
  await second
    .getByText(
      "Hồ sơ đã thay đổi hoặc không còn đủ điều kiện. Tải lại và kiểm tra nội dung trước khi quyết định.",
    )
    .waitFor();
  await second.getByRole("dialog").waitFor({ state: "hidden" });
  await focused(second.getByRole("button", { name: "Tải kết quả mới nhất", exact: true }));
  await second.screenshot({
    path: path.join(artifacts, "conflict.png"),
    fullPage: true,
  });
  await click(second, "Tải kết quả mới nhất");
  await second
    .locator(".status-label")
    .filter({ hasText: "Đã từ chối" })
    .waitFor();
  await p
    .getByRole("link", { name: "Bài đăng sách", exact: true })
    .click();
  await p.getByRole("heading", { name: "Chưa có hồ sơ ở mục này." }).waitFor();
  await shot(p, "queue-empty-1440");
  await click(p, "Đã từ chối");
  await p.locator(".queue-row").first().waitFor();
  let offline = true;
  await p.route("**/operations/listings?*", (route) =>
    offline ? route.abort("failed") : route.continue(),
  );
  await click(p, "Cập nhật danh sách");
  await p
    .getByText("Chưa kết nối được máy chủ. Kiểm tra mạng và thử lại.")
    .waitFor();
  assert((await p.locator(".queue-row").count()) > 0);
  await shot(p, "queue-refresh-error-1440");
  offline = false;
  await click(p, "Thử tải lại");
  await p.getByRole("alert").waitFor({ state: "hidden" });
  const staff = await page();
  await login(staff, "/review/catalog-requests", "staff@operations.test");
  await staff
    .getByText("Không có quyền xem khu vực này.", { exact: true })
    .waitFor();
  assert.equal(
    await staff
      .getByRole("link", { name: "Đầu sách", exact: true })
      .count(),
    0,
  );
  const member = await page();
  await login(member, "/review/listings", "member@operations.test");
  await member
    .getByText("Tài khoản hiện không có quyền kiểm duyệt.", { exact: false })
    .waitFor();
  assert.equal(await member.locator(".workspace-nav").count(), 0);
  // Refresh is really rotated; only the first protected request is forced to 401.
  let expire = true,
    rotations = 0;
  p.on("request", (request) => {
    if (request.url().endsWith("/auth/refresh")) rotations++;
  });
  await p.route("**/operations/listings?*", (route) => {
    if (expire) {
      expire = false;
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: '{"code":"SESSION_EXPIRED"}',
      });
    }
    return route.continue();
  });
  const rotatedResponse = p.waitForResponse(
    (response) =>
      response.url().includes("/operations/listings?") &&
      response.status() === 200,
  );
  await click(p, "Cập nhật danh sách");
  await rotatedResponse;
  assert.equal(rotations, 1);
  // Catalog rejection, pagination and independent-review guard.
  await p.getByRole("link", { name: "Đầu sách", exact: true }).click();
  await p
    .locator(`a[href='/review/catalog-requests/${fixture.extraId}']`)
    .first()
    .click();
  await p
    .getByLabel("Lý do từ chối", { exact: true })
    .fill("Cần bổ sung đúng tên tác giả và thông tin xuất bản.");
  await click(p, "Từ chối có lý do");
  await click(p, "Xác nhận quyết định");
  await p.locator(".status-label").filter({ hasText: "Đã từ chối" }).waitFor();
  for (let i = 0; i < 21; i++)
    await fixture.api("/catalog/requests", fixture.member.accessToken, {
      metadata: {
        ...fixture.metadata,
        title: "Hồ sơ phân trang kiểm thử " + i,
      },
    });
  const admin = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const self = await fixture.api("/catalog/requests", admin.accessToken, {
    metadata: {
      ...fixture.metadata,
      title: "Hồ sơ tự gửi cần người khác duyệt",
    },
  });
  await p.getByRole("link", { name: "Đầu sách", exact: true }).click();
  await click(p, "Cập nhật danh sách");
  await p.locator(".queue-row").nth(19).waitFor();
  assert.equal(await p.locator(".queue-row").count(), 20);
  await click(p, "Xem thêm hồ sơ");
  await p.locator(".queue-row").nth(21).waitFor();
  assert.equal(await p.locator(".queue-row").count(), 22);
  await p
    .locator(`a[href='/review/catalog-requests/${self.entityId}']`)
    .first()
    .click();
  await p.getByText("Bạn là người gửi hồ sơ này.", { exact: false }).waitFor();
  assert.equal(
    await p
      .getByRole("button", { name: "Xác nhận đầu sách", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await p.evaluate(() => localStorage.length + sessionStorage.length),
    0,
  );
  // Independent removal of an approved listing, including a lost acknowledgement.
  const removal = p;
  await p
    .getByRole("link", { name: "Bài đăng sách", exact: true })
    .click();
  await click(p, "Đã duyệt");
  await p
    .locator(`a[href='/review/listings/${fixture.listings[0]}']`)
    .first()
    .click();
  await removal.getByLabel("Lý do gỡ bài", { exact: true }).fill("short");
  await click(removal, "Gỡ bài đăng");
  await removal
    .getByText(
      "Nhập lý do từ 10 đến 1.000 ký tự để người đăng biết cách sửa.",
      { exact: true },
    )
    .waitFor();
  await removal
    .getByLabel("Lý do gỡ bài", { exact: true })
    .fill("Bài đăng có thông tin sai cần gỡ khỏi kệ sách.");
  let lostRemoval = true;
  await removal.route("**/operations/listings/*/remove", async (route) => {
    if (!lostRemoval) return route.continue();
    lostRemoval = false;
    await route.fetch();
    await route.abort("failed");
  });
  await click(removal, "Gỡ bài đăng");
  await click(removal, "Xác nhận quyết định");
  await click(removal, "Thử lại quyết định vừa gửi");
  await removal.locator(".status-label").filter({ hasText: "Đã gỡ" }).waitFor();
  await removal
    .getByText("Bài đăng có thông tin sai cần gỡ khỏi kệ sách.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await fixture.db.collection("mutation_receipts").countDocuments({
      listingId: fixture.listings[0],
      operation: "removeListing",
    }),
    1,
  );
  assert.equal(
    (await fetch(`${base}/listings/${fixture.listings[0]}`)).status,
    404,
  );
  await removal.screenshot({
    path: path.join(artifacts, "lifecycle-removed.png"),
    fullPage: true,
  });
  await click(p, "Đăng xuất");
  await p.getByRole("button", { name: "Đăng nhập", exact: true }).waitFor();
  let refreshes = 0;
  await second.route("**/auth/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"code":"SESSION_EXPIRED"}',
    }),
  );
  await second.route("**/auth/refresh", (route) => {
    refreshes++;
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"code":"SESSION_EXPIRED"}',
    });
  });
  await second.evaluate(() => window.dispatchEvent(new Event("online")));
  await second
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .waitFor({ timeout: 45000 });
  assert.equal(refreshes, 1);
  assert.deepEqual(pageErrors, []);
  console.log(
    "PASS: real catalog/listing decisions, private images, lost-ack replay, stale-version conflict, reason/checklist/leave guards, responsive large text, queue recovery, staff/member gates, token rotation/expiry/logout. Storage is fake; no live-provider claim.",
  );
} catch (error) {
  for (const [index, context] of (browser?.contexts() || []).entries()) {
    const p = context.pages()[0];
    if (p)
      await p
        .screenshot({
          path: path.join(artifacts, `failure-${index}.png`),
          fullPage: true,
        })
        .catch(() => {});
  }
  console.error(
    error instanceof Error ? error.message : "Browser verification failed",
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  await fixture?.close();
}
