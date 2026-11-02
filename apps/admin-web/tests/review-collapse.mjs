// Scoped UI QA with real Nest/Mongo commands on an isolated *_test database.
// Synthetic published reviews; no fulfillment or live storage acceptance.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium, expect } from "playwright/test";
import { createTestApi, root, base, password } from "./test-api.mjs";

const qa = new URL(process.env.MONGO_TEST_URL ?? "http://invalid");
assert.equal(qa.protocol, "mongodb:");
assert.ok(["localhost", "127.0.0.1"].includes(qa.hostname));
assert.equal(qa.port, "57017");
assert.equal(qa.searchParams.get("replicaSet"), "rs-test");
assert.ok(qa.pathname === "/admin" || qa.pathname.endsWith("_test"));
const origin = "http://127.0.0.1:5196";
const artifacts = path.join(root, ".tmp/admin-review-collapse");
let fixture, vite, browser;
try {
  await mkdir(artifacts, { recursive: true });
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 0 });
  const actorId = fixture.member.user.id,
    peerId = randomUUID(),
    exchangeId = randomUUID();
  const now = new Date(),
    completed = new Date(+now - 96 * 3600000),
    created = new Date(+now - 72 * 3600000),
    deadline = new Date(+created + 48 * 3600000);
  const actor = await fixture.db.collection("users").findOne({ _id: actorId });
  await fixture.db
    .collection("users")
    .insertOne({
      ...actor,
      _id: peerId,
      emailNormalized: `collapse-${peerId}@example.test`,
      displayName: "Đối tác QA thu gọn",
      roles: [{ role: "MEMBER", grantedAt: now }],
    });
  await fixture.db.collection("exchanges").insertOne({
    _id: exchangeId,
    initiatorId: actorId,
    recipientId: peerId,
    initiatorListingId: randomUUID(),
    recipientListingId: randomUUID(),
    initiatorOrderId: randomUUID(),
    recipientOrderId: randomUUID(),
    status: "Completed",
    revision: 1,
    initiatorDeposit: 0,
    recipientDeposit: 0,
    diffAmount: 0,
    diffPayerId: null,
    fundingDeadline: null,
    initiatorFundedAt: null,
    recipientFundedAt: null,
    proposalExpiresAt: null,
    rejectionReason: null,
    cancelReason: null,
    cancelledBy: null,
    cancelledAt: null,
    initiatorShippedAt: null,
    recipientShippedAt: null,
    initiatorReceivedAt: null,
    recipientReceivedAt: null,
    inspectionDeadline: null,
    completedAt: completed,
    createdAt: completed,
    updatedAt: completed,
    lockSeq: 0,
  });
  const reviewId = randomUUID(),
    otherId = randomUUID();
  for (const [id, authorId, targetUserId, authorName] of [
    [reviewId, actorId, peerId, "Bạn đọc QA thu gọn"],
    [otherId, peerId, actorId, "Đối tác QA thu gọn"],
  ]) {
    await fixture.db.collection("transaction_reviews").insertOne({
      _id: id,
      transactionType: "Exchange",
      transactionId: exchangeId,
      authorId,
      authorName,
      targetUserId,
      bookRating: 5,
      partnerRating: 5,
      tags: [],
      comment: `[QA THU GỌN] Đánh giá của ${authorName}`,
      publishedAt: deadline,
      version: 1,
      editDeadline: deadline,
      deletedAt: null,
      hiddenAt: null,
      evidenceHeld: false,
      legacyDisclosed: false,
      reply: null,
      createdAt: created,
      updatedAt: created,
      lockSeq: 0,
    });
  }
  process.env.VITE_API_BASE_URL = base;
  vite = await createServer({
    root: path.join(root, "apps/admin-web"),
    configFile: path.join(root, "apps/admin-web/vite.config.ts"),
    server: { host: "127.0.0.1", port: 5196, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/transaction-reviews");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@operations.test");
  await page.getByLabel(/^Mật khẩu(?:\s|$)/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Đánh giá giao dịch", exact: true }),
  ).toBeVisible();
  const record = page
    .locator("section")
    .filter({
      has: page.getByText("[QA THU GỌN] Đánh giá của Bạn đọc QA thu gọn", {
        exact: true,
      }),
    });
  const other = page
    .locator("section")
    .filter({
      has: page.getByText("[QA THU GỌN] Đánh giá của Đối tác QA thu gọn", {
        exact: true,
      }),
    });
  const disclosure = record.locator("details").first(),
    summary = record.locator("summary").first();
  const decision = record.getByRole("combobox", {
      name: "Quyết định",
      exact: true,
    }),
    reason = record.getByRole("textbox", { name: "Lý do", exact: true });
  const save = record.getByRole("button", {
    name: "Ghi nhận quyết định",
    exact: true,
  });
  await expect(disclosure).toHaveAttribute("open", "");
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0,
    rejectOnce = false,
    failRefresh = false;
  const intents = [];
  await page.route(
    `**/operations/transaction-reviews/${reviewId}/decision`,
    async (route) => {
      requests++;
      intents.push({
        body: route.request().postData(),
        key: route.request().headers()["idempotency-key"],
      });
      if (requests === 1) {
        await gate;
        await route.fetch();
        return route.abort("failed");
      }
      if (rejectOnce) {
        rejectOnce = false;
        return route.fulfill({
          status: 422,
          json: {
            code: "VALIDATION_ERROR",
            message: "QA: cần kiểm tra lại lý do.",
          },
        });
      }
      return route.continue();
    },
  );
  await decision.selectOption("Hide");
  await reason.fill("QA kiểm tra thu gọn sau ACK, không trước ACK.");
  await save.click();
  await expect(
    record.getByRole("button", {
      name: "Thử lại quyết định đã gửi",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(
    record.getByText("Đã ghi nhận quyết định.", { exact: true }),
  ).toHaveCount(0);
  release();
  const retry = record.getByRole("button", {
    name: "Thử lại quyết định đã gửi",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(disclosure).toHaveAttribute("open", "");
  await retry.click();
  await expect(
    record.getByText("Đã ghi nhận quyết định.", { exact: true }),
  ).toBeVisible();
  await expect(disclosure).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  await expect(decision).not.toBeVisible();
  await expect(summary).toContainText("Đã ẩn");
  await expect(summary).toContainText("Phiên bản 2");
  await expect(other.locator("details").first()).toHaveAttribute("open", "");
  assert.deepEqual(intents[0], intents[1]);
  assert.equal(
    await fixture.db
      .collection("review_revisions")
      .countDocuments({ reviewId, action: "Hide" }),
    1,
  );

  await summary.press("Enter");
  await expect(decision).toBeVisible();
  await expect(decision).toHaveValue("");
  await expect(reason).toHaveValue("");
  rejectOnce = true;
  await decision.selectOption("Restore");
  await reason.fill("QA giữ nguyên lý do khi máy chủ từ chối.");
  await save.click();
  await expect(record.getByRole("alert")).toContainText(
    "QA: cần kiểm tra lại lý do.",
  );
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(decision).toHaveValue("Restore");
  await expect(reason).toHaveValue("QA giữ nguyên lý do khi máy chủ từ chối.");

  await page.route("**/operations/transaction-reviews?*", (route) =>
    failRefresh
      ? route.fulfill({
          status: 503,
          json: {
            code: "UNAVAILABLE",
            message: "QA: cập nhật danh sách thất bại.",
          },
        })
      : route.continue(),
  );
  failRefresh = true;
  await save.click();
  await expect(disclosure).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Phiên bản 3");
  await expect(summary).toContainText("Đã công bố");
  await expect(
    page.getByText(
      "Đang giữ danh sách lần tải trước; chưa cập nhật được trạng thái mới nhất.",
      { exact: true },
    ),
  ).toBeVisible();
  assert.equal(JSON.parse(intents.at(-1).body).expectedVersion, 2);
  failRefresh = false;
  await page
    .getByRole("button", { name: "Cập nhật danh sách", exact: true })
    .click();
  await expect(summary).toContainText("Phiên bản 3");
  await expect(disclosure).not.toHaveAttribute("open", "");
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((width) => {
      document.documentElement.style.fontSize = width === 320 ? "130%" : "";
    }, width);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: path.join(artifacts, `collapsed-${width}.png`),
      fullPage: true,
    });
  }
  await summary.click();
  await expect(decision).toBeVisible();
  await record
    .getByText("Lịch sử phiên bản · mới nhất trước", { exact: true })
    .click();
  await expect(
    record.getByRole("heading", { name: "Phiên bản 3 · Restore", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(artifacts, "reopened-320.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  const result = {
    status: "PASS",
    checks: [
      "ACK only collapse",
      "lost ACK exact replay once",
      "only saved record collapses",
      "keyboard reopen and focus",
      "definite rejection keeps draft",
      "receipt version survives failed refresh",
      "refresh keeps collapsed record",
      "history available after reopening",
      "1440px/320px/130% no overflow",
    ],
    pageErrors: errors.length,
  };
  await writeFile(
    path.join(artifacts, "result.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} catch (error) {
  for (const page of browser?.contexts().flatMap((c) => c.pages()) ?? [])
    await page
      .screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true })
      .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close();
}
