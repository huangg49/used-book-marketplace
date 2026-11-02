// Real Nest/Mongo and Admin UI. The AI verdict is seeded as stored records, so no
// provider is called: this proves what a reviewer sees and can do with one.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const AUTO_REVIEWER_ID = "00000000-0000-4000-8000-00000000a1a1";
const req = createRequire(import.meta.url),
  { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
let fixture, vite, browser, page;
const errors = [],
  artifacts = path.join(root, "apps/admin-web/test-results/auto-review");
const yes = (stage, criterion) => ({
  stage,
  criterion,
  pass: true,
  confidence: 0.97,
  floor: 0.9,
  met: true,
});
const fits = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    `Horizontal overflow: ${name}`,
  );
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
};
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ listingCount: 1 });
  const id = fixture.listings[0];
  const db = fixture.db;
  const before = await db.collection("listings").findOne({ _id: id });
  const revisionId = before.currentRevisionId;
  const decidedAt = new Date();
  await db.collection("listing_decisions").insertOne({
    _id: randomUUID(),
    revisionId,
    reviewerId: AUTO_REVIEWER_ID,
    decision: "Approve",
    checklist: {
      catalogMatches: true,
      photosClear: true,
      conditionDisclosed: true,
      readable: true,
      pricingValid: true,
      contentAppropriate: true,
    },
    reason: null,
    decidedAt,
  });
  await db
    .collection("listings")
    .updateOne(
      { _id: id },
      { $set: { moderation: "Approved", publishedAt: decidedAt }, $inc: { version: 1 } },
    );
  await db.collection("listing_auto_reviews").insertOne({
    _id: randomUUID(),
    revisionId,
    listingId: id,
    outcome: "Approved",
    reasons: [],
    assessment: {
      stages: [
        { stage: "Text", status: "Completed" },
        { stage: "Extraction", status: "Completed" },
        { stage: "Visual", status: "Completed" },
      ],
      criteria: [
        yes("Text", "contentAppropriate"),
        yes("Visual", "realPhoto"),
        { ...yes("Visual", "singleCopy"), confidence: 0.91 },
      ],
      extraction: {
        title: "Tên sách đọc từ ảnh rất dài để kiểm tra việc xuống dòng trên màn hình hẹp của người kiểm duyệt",
        authors: ["Người viết"],
        isbn: null,
        edition: null,
        publisher: null,
        contactOrInstructionTextVisible: false,
      },
      comparison: {
        title: "Match",
        author: "Match",
        isbn: "Unread",
        edition: "NotInCatalog",
        publisher: "NotInCatalog",
        barcodes: [],
      },
      damage: "Minor",
    },
    model: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    decidedAt,
    policyVersion: "auto-review-v3",
    facts: {
      ownerAccountAgeDays: 40,
      recentSubmissions: 1,
      photoCount: 2,
      duplicatePhoto: false,
      priceBounds: { low: 120000, high: 180000 },
      textSignals: [],
    },
    photoHashes: [],
    sampleBucket: 42,
    inputTokens: 3000,
    outputTokens: 300,
    costMicroUsd: 4200,
    latencyMs: 6000,
  });
  await db.collection("listing_auto_review_checks").insertOne({
    _id: randomUUID(),
    revisionId,
    listingId: id,
    selection: "HumanAudit",
    status: "Open",
    reasons: ["RandomAudit"],
    assessment: null,
    facts: null,
    model: null,
    policyVersion: "auto-review-v3",
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    resolvedBy: null,
    resolvedAt: null,
    note: null,
    version: 1,
    createdAt: decidedAt,
    updatedAt: decidedAt,
    lockSeq: 0,
  });

  process.env.VITE_API_BASE_URL = base;
  process.chdir(path.join(root, "apps/admin-web"));
  vite = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(origin + "/ai-review-checks");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("staff@operations.test");
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();

  // The lane: off notice, numbers, the open check.
  await page.getByRole("heading", { name: "Hậu kiểm AI", exact: true }).waitFor();
  await expect(page.getByText(/AI đang tắt/)).toBeVisible();
  await expect(page.getByText("Lấy mẫu ngẫu nhiên để người kiểm tra")).toBeVisible();
  await fits("checks-1440");
  await page.setViewportSize({ width: 320, height: 800 });
  await fits("checks-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  // The dossier says who decided, and keeps facts apart from judgments.
  await page.getByRole("link", { name: new RegExp(`Hồ sơ #${id.slice(0, 8)}`) }).click();
  const panel = page.getByRole("region", { name: "Đánh giá của AI" });
  await panel.waitFor();
  await expect(page.getByText("AI đã tự duyệt bài đăng.", { exact: false })).toBeVisible();
  await expect(panel.getByText("không phải quyết định của người kiểm duyệt", { exact: false })).toBeVisible();
  await expect(panel.getByText("Dữ kiện hệ thống ghi nhận")).toBeVisible();
  await expect(panel.getByText("Nhận định của mô hình")).toBeVisible();
  await expect(panel.getByRole("cell", { name: "91%" })).toBeVisible();
  await fits("dossier-1440");
  await page.setViewportSize({ width: 320, height: 800 });
  await fits("dossier-320");
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Clearing: a person's note is on record, publication unchanged.
  await panel.getByLabel("Ghi chú của người kiểm duyệt").fill("ngắn");
  await panel.getByRole("button", { name: "Đóng cảnh báo", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("10 đến 1000");
  await panel
    .getByLabel("Ghi chú của người kiểm duyệt")
    .fill("Đã xem ảnh gốc, bài đăng đúng với cuốn sách.");
  await panel.getByRole("button", { name: "Đóng cảnh báo", exact: true }).click();
  await expect(panel.getByText("Người kiểm duyệt: bài đăng ổn", { exact: false })).toBeVisible();
  assert.equal(
    (await db.collection("listings").findOne({ _id: id })).moderation,
    "Approved",
  );

  // Override: a lost acknowledgement retries the same key and body.
  const attempts = [];
  let drop = true;
  await page.route(`**/operations/listings/${id}/auto-review/revoke`, async (route) => {
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
  await panel
    .getByLabel("Lý do thu hồi")
    .fill("Ảnh bìa có dấu hiệu là bản photo, cần người xem lại.");
  await panel.getByRole("button", { name: "Đưa về hàng chờ duyệt", exact: true }).click();
  const retry = panel.getByRole("button", { name: "Thử gửi lại", exact: true });
  await retry.waitFor();
  await retry.click();
  await expect(page.locator(".status-label").first()).toHaveText("Chờ duyệt");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].key, attempts[1].key);
  assert.equal(attempts[0].body, attempts[1].body);
  const after = await db.collection("listings").findOne({ _id: id });
  assert.equal(after.moderation, "PendingReview");
  assert.notEqual(after.currentRevisionId, revisionId);

  // A person decides from an empty checklist, and history shows both.
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Lịch sử", exact: true }).click();
  await page.getByRole("region", { name: "Lịch sử AI và người kiểm duyệt" }).waitFor();
  await expect(page.getByText("AI: đã duyệt")).toBeVisible();
  await expect(page.getByText(/Người kiểm duyệt thu hồi: Người kiểm duyệt: có vấn đề/)).toBeVisible();
  await fits("history-1440");

  // The queue can show listings by what the AI concluded.
  await page.getByRole("link", { name: "Bài đăng sách", exact: true }).click();
  await page.getByRole("button", { name: "AI chuyển người duyệt", exact: true }).click();
  await expect(page).toHaveURL(/ai=Escalated/);
  await expect(page.getByText("Chưa có hồ sơ ở mục này.")).toBeVisible();
  await page.getByRole("button", { name: "AI chưa xem", exact: true }).click();
  await page.locator(`a[href*="/review/listings/${id}"]`).first().waitFor();
  assert.deepEqual(errors, []);
  console.log("Admin AI review browser checks: PASS");
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close?.();
}
