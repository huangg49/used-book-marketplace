// Focused UI regression: real Nest/Mongo *_test, fake storage; never the local app DB.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, expect } from "playwright/test";
import { createTestApi, root, password } from "./test-api.mjs";
import { assertReviewThumbnailGeometry } from "./review-gallery-geometry.mjs";
import { assertReviewScrollOwnership } from "./review-scroll-geometry.mjs";

const require = createRequire(import.meta.url);
const origin = "http://127.0.0.1:5293";
const artifacts = path.join(root, ".tmp/admin-review/qa");
await mkdir(artifacts, { recursive: true });
let fixture, vite, browser;
const checks = [];
const record = (name) => checks.push(name);
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 3 });
  vite = spawn(
    process.execPath,
    [
      path.join(
        path.dirname(require.resolve("vite/package.json")),
        "bin/vite.js",
      ),
      "--host",
      "127.0.0.1",
      "--port",
      "5293",
      "--strictPort",
    ],
    {
      cwd: path.join(root, "apps/admin-web"),
      windowsHide: true,
      env: {
        ...process.env,
        VITE_API_BASE_URL: "http://127.0.0.1:3009/api/v1",
      },
      stdio: "ignore",
    },
  );
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* wait for Vite */
    }
    assert(vite.exitCode === null, "QA Vite exited");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", () => errors.push("pageerror"));
  await page.goto(origin + "/review/listings");
  await page.locator('input[type="email"]').fill("admin@operations.test");
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/review/listings/${fixture.listings[0]}`),
  );
  await page
    .getByRole("heading", { name: "Hồ sơ bài đăng", exact: true })
    .waitFor();
  record(
    "queue entry opens oldest loaded dossier without an extra welcome step",
  );
  await expect(
    page.getByRole("button", { name: "Duyệt bài đăng", exact: true }),
  ).toBeDisabled();
  await page.getByRole("link", { name: /Mở yêu cầu đầu sách/ }).waitFor();
  record(
    "pending catalog remains an explicit approval gate with an exact catalog deep link",
  );
  await page
    .getByRole("button", { name: "Xem lớn ảnh 1", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Xem lớn ảnh 1", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Xem lớn ảnh 1", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Xem lớn ảnh 1", exact: true }),
  ).toBeFocused();
  record("image viewer loads and restores keyboard focus on Escape");
  for (const width of [1920, 1600, 1440, 1100, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await assertReviewThumbnailGeometry(page, 1);
  }
  await page.setViewportSize({ width: 1600, height: 1000 });
  record(
    "loaded thumbnail fits its frame, clears its caption and next section at six widths",
  );
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  const approvalGate = page.getByRole("status", { name: "Điều kiện duyệt bài", exact: true });
  const approvalButton = page.getByRole("button", { name: "Duyệt bài đăng", exact: true });
  await expect(approvalButton).toBeDisabled();
  await expect(approvalGate).toContainText("Đầu sách chưa được xác nhận");
  await expect(approvalGate.getByRole("link", { name: "Xem yêu cầu đầu sách", exact: true })).toHaveAttribute("href", `/review/catalog-requests/${fixture.catalogId}`);
  for (const width of [1920, 1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await approvalButton.scrollIntoViewIfNeeded();
    const gateBox = await approvalGate.boundingBox();
    const buttonBox = await approvalButton.boundingBox();
    assert(gateBox.y >= 0 && gateBox.y + gateBox.height <= buttonBox.y && buttonBox.y - gateBox.y - gateBox.height <= 24, "Block reason must be visible directly above the disabled approval button");
    assert.equal(await approvalButton.getAttribute("aria-describedby"), await approvalGate.getAttribute("id"));
  }
  await approvalGate.getByRole("link", { name: "Xem yêu cầu đầu sách", exact: true }).click();
  await page.getByRole("button", { name: "Ở lại hồ sơ", exact: true }).click();
  for (const box of await page.getByRole("checkbox").all()) await expect(box).toBeChecked();
  for (const box of await page.getByRole("checkbox").all()) await box.uncheck();
  record("all six checks do not bypass catalog confirmation; adjacent explanation/deep link, accessible description and dirty guard at three widths");
  const staffPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    let catalogReads = 0;
    staffPage.on("request", request => { if (request.url().startsWith("http://127.0.0.1:3009/api/v1/operations/catalog-requests/")) catalogReads++; });
    staffPage.on("pageerror", () => errors.push("staff-pageerror"));
    await staffPage.goto(origin + "/review/listings");
    await staffPage.locator('input[type="email"]').fill("staff@operations.test");
    await staffPage.locator('input[type="password"]').fill(password);
    await staffPage.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await staffPage.getByRole("heading", { name: "Hồ sơ bài đăng", exact: true }).waitFor();
    for (const box of await staffPage.getByRole("checkbox").all()) await box.check();
    const staffGate = staffPage.getByRole("status", { name: "Điều kiện duyệt bài", exact: true });
    await expect(staffGate).toContainText("Cần Admin xác nhận đầu sách");
    await expect(staffGate.getByRole("link")).toHaveCount(0);
    await expect(staffPage.getByRole("button", { name: "Duyệt bài đăng", exact: true })).toBeDisabled();
    assert.equal(catalogReads, 0, "Staff must not request the Admin-only catalog detail");
    record("Staff sees the Admin prerequisite with no catalog action or unauthorized catalog read");
  } finally { await staffPage.close(); }
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const [width, height] of [[1920, 1080], [1440, 900], [1100, 900], [768, 1024], [390, 844], [1920, 600], [390, 500]]) {
    await page.setViewportSize({ width, height });
    await assertReviewScrollOwnership(page);
    const toggle = page.getByRole("button", { name: "Mở hàng chờ", exact: true });
    if (await toggle.isVisible()) {
      await toggle.click();
      await expect(page.getByRole("region", { name: "Bàn đọc hồ sơ", exact: true })).toBeHidden();
      const queue = page.getByRole("region", { name: "Hàng chờ kiểm duyệt", exact: true });
      await expect(queue).toBeVisible();
      const dimensions = await queue.evaluate(el => ({ height: el.clientHeight, bottom: el.getBoundingClientRect().bottom, viewport: innerHeight }));
      assert(dimensions.height > 40 && dimensions.bottom <= dimensions.viewport, "Queue must retain usable scrolling space on short screens");
      await queue.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
      await queue.hover();
      await page.mouse.wheel(0, 1200);
      assert.equal(await page.evaluate(() => scrollY), 0);
      await queue.evaluate(el => el.scrollTo({ top: 0, behavior: "instant" }));
      await page.getByRole("button", { name: "Ẩn hàng chờ", exact: true }).click();
      const jump = page.getByRole("button", { name: "Đi tới phiếu quyết định", exact: true });
      if (await jump.isVisible()) {
        const pageHeading = page.getByRole("heading", { name: "Bài đăng sách", exact: true });
        const headingY = (await pageHeading.boundingBox()).y;
        await jump.click();
        await expect(page.getByRole("region", { name: "Phiếu quyết định", exact: true })).toBeFocused();
        assert.equal(await page.evaluate(() => scrollY), 0);
        assert(Math.abs((await pageHeading.boundingBox()).y - headingY) <= 1, "Decision jump must not move or cover the page header");
      }
    }
  }
  record("seven viewport sizes: bounded independent desktop panes, one narrow scroller, contained wheel/keyboard, queue toggle and decision jump");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("checkbox").first().check();
  await expect(
    page.getByRole("progressbar", {
      name: "Tiến độ đối chiếu hồ sơ",
      exact: true,
    }),
  ).toHaveAttribute("value", "1");
  await page
    .getByLabel("Lý do từ chối", { exact: true })
    .fill("Lý do đang nhập chưa gửi đi");
  const reader = page.getByRole("region", { name: "Nội dung và bằng chứng", exact: true });
  await reader.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
  const readingPosition = await reader.evaluate(el => el.scrollTop);
  await page.locator(".queue-row .read-link").nth(1).click();
  await page
    .getByRole("dialog", { name: "Rời hồ sơ đang xem?", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Ở lại hồ sơ", exact: true }).click();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
  await expect(page.getByLabel("Lý do từ chối", { exact: true })).toHaveValue(
    "Lý do đang nhập chưa gửi đi",
  );
  assert.equal(await reader.evaluate(el => el.scrollTop), readingPosition, "Cancel leave must retain the reading position");
  record(
    "attempted dossier switch preserves dirty checklist and reason when cancelled",
  );
  await page.locator(".queue-row .read-link").nth(1).click();
  await page.getByRole("button", { name: "Rời hồ sơ", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(fixture.listings[1]));
  await expect(reader.locator(".record-id")).toHaveText(`Mã hồ sơ: ${fixture.listings[1]}`);
  assert.equal(await reader.evaluate(el => el.scrollTop), 0, "New dossier starts at the top of the reader");
  assert.equal(await page.getByRole("region", { name: "Phiếu quyết định", exact: true }).evaluate(el => el.scrollTop), 0, "New dossier starts at the top of the decision pane");
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
  await expect(
    page.getByRole("progressbar", {
      name: "Tiến độ đối chiếu hồ sơ",
      exact: true,
    }),
  ).toHaveAttribute("value", "0");
  record(
    "explicit leave opens the requested dossier and clears the previous form",
  );
  await page.getByRole("link", { name: /Về danh sách/ }).click();
  await expect(page).toHaveURL(/\/review\/listings\?status=PendingReview$/);
  await expect(
    page.getByRole("heading", { name: "Chọn bài để kiểm duyệt", exact: true }),
  ).toBeVisible();
  record(
    "Back stays on the queue instead of reopening the first item in a redirect loop",
  );
  await page.locator(".queue-row .read-link").first().click();
  await page.getByRole("link", { name: /Mở yêu cầu đầu sách/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/review/catalog-requests/${fixture.catalogId}`),
  );
  await page
    .getByRole("button", { name: "Xác nhận đầu sách", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận quyết định", exact: true })
    .click();
  await page
    .getByRole("region", {
      name: "Kết quả kiểm duyệt đã ghi nhận",
      exact: true,
    })
    .getByText("Đầu sách đã được xác nhận.", { exact: true })
    .waitFor();
  record(
    "catalog link leads to the correct independent Admin review, real QA command acknowledged",
  );
  await page.getByRole("link", { name: "Bài đăng sách", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/review/listings/${fixture.listings[0]}`),
  );
  await page
    .getByRole("button", { name: "Xem lớn ảnh 1", exact: true })
    .waitFor();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await expect(
    page.getByRole("button", { name: "Duyệt bài đăng", exact: true }),
  ).toBeEnabled();
  await expect(approvalGate).toHaveCount(0);
  assert.equal(await approvalButton.getAttribute("aria-describedby"), null);
  await page
    .getByRole("button", { name: "Duyệt bài đăng", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Quay lại kiểm tra", exact: true })
    .click();
  const pending = await fixture.db
    .collection("listings")
    .findOne({ _id: fixture.listings[0] });
  assert.equal(pending.moderation, "PendingReview");
  record("approval confirmation can be cancelled without mutating the listing");
  await page
    .getByRole("button", { name: "Duyệt bài đăng", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Xác nhận quyết định", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", {
        name: "Kết quả kiểm duyệt đã ghi nhận",
        exact: true,
      })
      .getByText("Bài đăng đã được duyệt.", { exact: true }),
  ).toBeVisible();
  const approved = await fixture.db
    .collection("listings")
    .findOne({ _id: fixture.listings[0] });
  assert.equal(approved.moderation, "Approved");
  assert(
    page.url().includes(fixture.listings[0]),
    "Polling must not switch the dossier after a decision",
  );
  record(
    "real QA approval persists, exact decided dossier stays open after queue invalidation",
  );
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(artifacts, `approved-${width}.png`),
      fullPage: true,
    });
  }
  record(
    "1440/768/390 layouts preserve content without horizontal page overflow",
  );
  assert.equal(errors.length, 0);
  await writeFile(
    path.join(artifacts, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        environment: "isolated real Nest/Mongo *_test; fake media storage",
        checks,
        pageErrors: errors.length,
        native: "NOT RUN",
        mainDatabaseTouched: false,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      status: "PASS",
      checks: checks.length,
      pageErrors: errors.length,
      database: "isolated QA only",
      storage: "fake",
    }),
  );
} finally {
  await browser?.close();
  if (vite?.pid) vite.kill();
  await fixture?.close();
}
