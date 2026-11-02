// Real Nest/Mongo and both web apps. Only a disposable QA database; local mail,
// fake media. The deliberate lost-ACK proxy never changes command identity.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
const req = createRequire(
  new URL("../apps/admin-web/package.json", import.meta.url),
);
const webReq = createRequire(
  new URL("../apps/user-web/package.json", import.meta.url),
);
const { chromium } = req("playwright"),
  { expect } = req("playwright/test");
const { createServer } = await import(
  pathToFileURL(webReq.resolve("vite")).href
);
const tailwind = (
  await import(pathToFileURL(webReq.resolve("tailwindcss")).href)
).default;
const autoprefixer = (
  await import(pathToFileURL(webReq.resolve("autoprefixer")).href)
).default;
const tailwindConfig = webReq("tailwindcss/loadConfig")(
  path.join(root, "apps/user-web/tailwind.config.js"),
);
const memberOrigin = "http://127.0.0.1:5194",
  adminOrigin = "http://127.0.0.1:5195";
const evidence = path.join(root, ".tmp/support-evidence");
const qa = new URL(process.env.MONGO_TEST_URL ?? "http://invalid");
assert.ok(
  qa.protocol === "mongodb:" &&
    ["localhost", "127.0.0.1"].includes(qa.hostname) &&
    qa.port === "57017" &&
    qa.searchParams.get("replicaSet") === "rs-test" &&
    (qa.pathname.endsWith("_test") || qa.pathname === "/admin"),
  "Dedicated QA replica set required; fixture creates its own random *_test database.",
);
Object.assign(process.env, {
  VITE_API_BASE_URL: base,
  AUTH_MAIL_PROVIDER: "local",
});
let fixture, browser;
const servers = [],
  errors = [],
  checks = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
const shot = async (p, name) => {
  await p.evaluate(() => document.fonts.ready);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    `Overflow: ${name}`,
  );
  await p.screenshot({
    path: path.join(evidence, `${name}.png`),
    fullPage: true,
  });
};
async function login(p, origin, route, email) {
  await p.goto(origin + "/login?returnUrl=" + encodeURIComponent(route));
  await p.getByRole("textbox", { name: /^Email/ }).fill(email);
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
  await p.waitForURL(origin + route, { timeout: 20000 });
}
async function newMemberCase(p) {
  await p
    .getByRole("link", { name: "Hỗ trợ & phản ánh", exact: true })
    .first()
    .click();
  await expect(
    p.getByRole("heading", { name: "Hỗ trợ & phản ánh", exact: true }),
  ).toBeVisible();
  await p.getByRole("link", { name: "Gửi yêu cầu mới", exact: true }).click();
  await expect(
    p.getByRole("heading", { name: "Gửi yêu cầu", exact: true }),
  ).toBeVisible();
}
try {
  await mkdir(evidence, { recursive: true });
  fixture = await createTestApi({
    corsOrigin: memberOrigin + "," + adminOrigin,
    listingCount: 0,
  });
  for (const [app, port] of [
    ["user-web", 5194],
    ["admin-web", 5195],
  ]) {
    const vite = await createServer({
      root: path.join(root, "apps", app),
      configFile: path.join(root, "apps", app, "vite.config.ts"),
      ...(app === "user-web"
        ? {
            css: {
              postcss: {
                plugins: [
                  tailwind({
                    ...tailwindConfig,
                    content: [
                      path.join(root, "apps/user-web/index.html"),
                      path.join(root, "apps/user-web/src/**/*.{js,ts,jsx,tsx}"),
                    ],
                  }),
                  autoprefixer(),
                ],
              },
            },
          }
        : {}),
      server: { host: "127.0.0.1", port, strictPort: true },
      logLevel: "error",
    });
    await vite.listen();
    servers.push(vite);
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const member = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const page of [member, admin]) {
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => errors.push(e.message));
  }
  await login(member, memberOrigin, "/account", "member@operations.test");
  await member
    .getByRole("link", { name: "Hỗ trợ & phản ánh", exact: true })
    .first()
    .click();
  await expect(
    member.getByRole("heading", { name: "Hỗ trợ & phản ánh", exact: true }),
  ).toBeVisible();
  await member
    .getByRole("link", { name: "Gửi yêu cầu mới", exact: true })
    .click();
  await member.waitForURL(memberOrigin + "/support/new");
  await expect(
    member.getByRole("heading", { name: "Gửi yêu cầu", exact: true }),
  ).toBeVisible();
  await member.getByLabel("Loại yêu cầu", { exact: true }).selectOption("Bug");
  await member
    .getByLabel("Tiêu đề", { exact: true })
    .fill("QA: Bộ lọc tìm sách chưa cập nhật");
  await member
    .getByLabel("Nội dung", { exact: true })
    .fill(
      "Tôi chọn tình trạng sách nhưng danh sách chưa cập nhật đúng lựa chọn.",
    );
  let drop = true;
  const intents = [];
  await member.route("**/me/support-cases", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    intents.push({
      body: route.request().postData(),
      key: route.request().headers()["idempotency-key"],
    });
    if (drop) {
      drop = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await button(member, "Gửi yêu cầu").click();
  await expect(button(member, "Thử lại yêu cầu đã gửi")).toBeVisible();
  await member
    .getByRole("link", { name: "← Yêu cầu của tôi", exact: true })
    .click();
  await member.waitForURL(memberOrigin + "/support");
  await expect(
    member.getByRole("heading", { name: "Hỗ trợ & phản ánh", exact: true }),
  ).toBeVisible();
  await member
    .getByRole("link", { name: "Gửi yêu cầu mới", exact: true })
    .click();
  await member.waitForURL(memberOrigin + "/support/new");
  await expect(
    member.getByRole("heading", { name: "Gửi yêu cầu", exact: true }),
  ).toBeVisible();
  await expect(member.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
    "QA: Bộ lọc tìm sách chưa cập nhật",
  );
  await button(member, "Thử lại yêu cầu đã gửi").click();
  await member.waitForURL(/\/support\/[0-9a-f-]{36}$/);
  const id = member.url().split("/").pop();
  assert.equal(intents.length, 2);
  assert.equal(intents[0].key, intents[1].key);
  assert.equal(
    createHash("sha256").update(intents[0].body).digest("hex"),
    createHash("sha256").update(intents[1].body).digest("hex"),
  );
  assert.equal(
    await fixture.db
      .collection("support_cases")
      .countDocuments({ reporterId: fixture.member.user.id }),
    1,
  );
  checks.push("member menu/create/lost-ACK/Back/remount/exact replay");
  await shot(member, "member-open-desktop");
  await admin.goto(adminOrigin + "/support");
  await admin
    .getByRole("textbox", { name: /^Email/ })
    .fill("admin@operations.test");
  await admin.getByLabel(/^Mật khẩu/).fill(password);
  await button(admin, "Đăng nhập").click();
  await expect(
    admin.getByRole("heading", { name: "Trung tâm xử lý", exact: true }),
  ).toBeVisible();
  await admin
    .getByRole("link", {
      name: "QA: Bộ lọc tìm sách chưa cập nhật",
      exact: true,
    })
    .click();
  await button(admin, "Nhận phụ trách").click();
  const response = admin.getByLabel("Nội dung phản hồi / lý do", {
    exact: true,
  });
  await expect(response).toBeVisible();
  await admin.getByLabel("Ghi chú chỉ nội bộ", { exact: true }).check();
  await response.fill("Ghi chú điều tra QA chỉ dành cho Admin.");
  await button(admin, "Lưu ghi chú nội bộ").click();
  await expect(
    admin.getByText("Ghi chú điều tra QA chỉ dành cho Admin.", { exact: true }),
  ).toBeVisible();
  await admin.getByLabel("Ghi chú chỉ nội bộ", { exact: true }).uncheck();
  await response.fill(
    "Bạn vui lòng cho biết tình trạng sách đã chọn và thời điểm gặp lỗi.",
  );
  await button(admin, "Yêu cầu bổ sung").click();
  await expect(admin.getByRole('region', { name: 'Lịch sử hồ sơ', exact: true }).getByText('Bạn vui lòng cho biết tình trạng sách đã chọn và thời điểm gặp lỗi.', { exact: true })).toBeVisible();
  await button(member, "Cập nhật hồ sơ").click();
  await expect(
    member.getByText("Admin đang chờ bạn bổ sung thông tin.", { exact: true }),
  ).toBeVisible();
  assert.ok(
    !(await member.locator("body").textContent()).includes(
      "Ghi chú điều tra QA chỉ dành cho Admin.",
    ),
  );
  await member
    .getByLabel("Bổ sung thông tin", { exact: true })
    .fill(
      "Tôi đã chọn sách tình trạng tốt vào buổi sáng trong bộ lọc tìm kiếm.",
    );
  await button(member, "Gửi bổ sung").click();
  await expect(member.locator('article').getByText('Tôi đã chọn sách tình trạng tốt vào buổi sáng trong bộ lọc tìm kiếm.', { exact: true })).toBeVisible();
  await button(admin, "Cập nhật hồ sơ").click();
  await expect(
    admin.getByText(
      "Tôi đã chọn sách tình trạng tốt vào buổi sáng trong bộ lọc tìm kiếm.",
      { exact: true },
    ),
  ).toBeVisible();
  checks.push(
    "admin assignment/private notes/evidence request/member supplement",
  );
  await shot(admin, "admin-review-desktop");
  await admin.setViewportSize({ width: 320, height: 900 });
  await shot(admin, "admin-review-mobile");
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await response.fill(
    "Đã đối chiếu thông tin. Admin đã tiếp nhận lỗi bộ lọc và phản hồi cách khôi phục danh sách bằng Cập nhật.",
  );
  await button(admin, "Gửi kết quả xử lý").click();
  await response.fill(
    "Đóng yêu cầu hỗ trợ sau khi đã gửi kết quả và hướng dẫn.",
  );
  await button(admin, "Đóng hồ sơ hỗ trợ").click();
  await expect(
    admin.getByRole("button", { name: "Mở lại hồ sơ hỗ trợ", exact: true }),
  ).toBeVisible();
  await member
    .getByRole("link", { name: "Thông báo", exact: true })
    .first()
    .click();
  await expect(
    member.getByRole("heading", { name: /Thông Báo|Thông báo/ }),
  ).toBeVisible();
  await member
    .getByText("Yêu cầu hỗ trợ có cập nhật", { exact: true })
    .first()
    .click();
  await member.waitForURL(memberOrigin + "/support/" + id);
  await expect(
    member.getByText("Hồ sơ hỗ trợ đã đóng. Lịch sử vẫn được lưu bên dưới.", {
      exact: true,
    }),
  ).toBeVisible();
  await member.setViewportSize({ width: 320, height: 900 });
  await shot(member, "member-closed-mobile");
  await member.evaluate(() => {
    document.documentElement.style.fontSize = "130%";
  });
  await shot(member, "member-closed-mobile-large-text");
  checks.push(
    "admin answer/close/durable inbox/exact deep link/320px/large text",
  );
  // Explicitly synthetic Completed fixture: exercises reviews, not fulfillment.
  const owner = fixture.member.user.id,
    otherId = randomUUID(),
    exchangeId = randomUUID();
  const now = new Date(),
    completedAt = new Date(+now - 96 * 3600000),
    reviewCreated = new Date(+now - 72 * 3600000),
    editDeadline = new Date(+reviewCreated + 48 * 3600000);
  const originalUser = await fixture.db
    .collection("users")
    .findOne({ _id: owner });
  await fixture.db.collection("users").insertOne({
    ...originalUser,
    _id: otherId,
    emailNormalized: `review-${otherId}@example.test`,
    displayName: "Đối tác đánh giá QA",
    roles: [{ role: "MEMBER", grantedAt: now }],
  });
  await fixture.db.collection("exchanges").insertOne({
    _id: exchangeId,
    initiatorId: owner,
    recipientId: otherId,
    initiatorListingId: randomUUID(),
    recipientListingId: randomUUID(),
    initiatorOrderId: randomUUID(),
    recipientOrderId: randomUUID(),
    status: "Completed",
    revision: 1,
    initiatorDeposit: 100000,
    recipientDeposit: 100000,
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
    completedAt,
    createdAt: completedAt,
    updatedAt: completedAt,
    lockSeq: 0,
  });
  for (const [authorId, targetUserId] of [
    [owner, otherId],
    [otherId, owner],
  ])
    await fixture.db.collection("transaction_reviews").insertOne({
      _id: randomUUID(),
      transactionType: "Exchange",
      transactionId: exchangeId,
      authorId,
      authorName: authorId === owner ? "Bạn đọc QA" : "Đối tác đánh giá QA",
      targetUserId,
      bookRating: 4,
      partnerRating: 3,
      tags: [],
      comment:
        authorId === owner
          ? "Đánh giá bên gửi QA"
          : "QA: Nội dung đánh giá cần kiểm duyệt",
      publishedAt: editDeadline,
      createdAt: reviewCreated,
      updatedAt: reviewCreated,
      lockSeq: 0,
      version: 1,
      editDeadline,
      deletedAt: null,
      hiddenAt: null,
      evidenceHeld: false,
      legacyDisclosed: false,
      reply: null,
    });
  await member.setViewportSize({ width: 1440, height: 1000 });
  await member.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  // Recognition-based picker: paginated real owned rows; never ask for an ID.
  const originalExchange = await fixture.db
    .collection("exchanges")
    .findOne({ _id: exchangeId });
  for (let index = 0; index < 11; index++)
    await fixture.db.collection("exchanges").insertOne({
      ...originalExchange,
      _id: randomUUID(),
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      initiatorListingId: randomUUID(),
      recipientListingId: randomUUID(),
      createdAt: new Date(+completedAt - (index + 1) * 60000),
    });
  await newMemberCase(member);
  await expect(
    member.getByRole("heading", { name: "Gửi yêu cầu", exact: true }),
  ).toBeVisible();
  await expect(member.getByLabel("Mã đối tượng", { exact: true })).toHaveCount(
    0,
  );
  await member
    .getByLabel("Loại yêu cầu", { exact: true })
    .selectOption("TransactionIssue");
  await member
    .getByLabel("Đối tượng liên quan", { exact: true })
    .selectOption("Exchange");
  await expect(member.getByRole("radio")).toHaveCount(10);
  await button(member, "Xem thêm giao dịch").click();
  await expect(member.getByRole("radio")).toHaveCount(12);
  await member
    .getByLabel("Tìm theo tên người trao đổi", { exact: true })
    .fill("Không có tên này");
  await button(member, "Tìm giao dịch").click();
  await expect(
    member.getByText(
      "Không có giao dịch khớp tìm kiếm. Thử tên khác hoặc xóa từ khóa.",
      { exact: true },
    ),
  ).toBeVisible();
  await member
    .getByLabel("Tìm theo tên người trao đổi", { exact: true })
    .fill("Đối tác đánh giá QA");
  await member
    .getByLabel("Tìm theo tên người trao đổi", { exact: true })
    .press("Enter");
  await expect(member.getByRole("radio")).toHaveCount(10);
  await shot(member, "member-target-options-desktop");
  await member.getByRole("radio").first().click();
  await expect(
    member.getByText("Đã gắn kèm yêu cầu", { exact: true }),
  ).toBeVisible();
  await expect(
    member.getByRole("button", { name: "Chọn giao dịch khác", exact: true }),
  ).toBeVisible();
  await expect(
    member.getByRole("button", { name: "Chọn giao dịch khác", exact: true }),
  ).toBeFocused();
  await expect(member.getByText(/Với Đối tác đánh giá QA/)).toBeVisible();
  await member
    .getByLabel("Tiêu đề", { exact: true })
    .fill("QA: Phản ánh từ giao dịch đã chọn");
  await member
    .getByLabel("Nội dung", { exact: true })
    .fill("Tôi chọn giao dịch từ danh sách để Admin hỗ trợ đối chiếu.");
  await shot(member, "member-target-picker-desktop");
  await member.setViewportSize({ width: 320, height: 800 });
  await member.evaluate(() => {
    document.documentElement.style.fontSize = "130%";
  });
  await shot(member, "member-target-picker-mobile-large-text");
  await button(member, "Gửi yêu cầu").click();
  await member.waitForURL(/\/support\/[0-9a-f-]{36}$/);
  const pickedCaseId = new URL(member.url()).pathname.split("/").at(-1);
  assert.deepEqual(
    (
      await fixture.db
        .collection("support_cases")
        .findOne({ _id: pickedCaseId })
    ).target,
    { type: "Exchange", id: exchangeId },
  );
  checks.push(
    "readable target picker/search/empty/load more/Enter/select/submit/320px/130%",
  );
  await member.setViewportSize({ width: 1440, height: 1000 });
  await member.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await newMemberCase(member);
  await expect(
    member.getByRole("heading", { name: "Gửi yêu cầu", exact: true }),
  ).toBeVisible();
  await member
    .getByLabel("Tiêu đề", { exact: true })
    .fill("QA: Bản nháp đi tìm nội dung");
  await member
    .getByLabel("Nội dung", { exact: true })
    .fill("Nội dung bản nháp vẫn còn sau khi chọn từ hồ sơ đánh giá.");
  await member
    .getByLabel("Đối tượng liên quan", { exact: true })
    .selectOption("Review");
  await member.getByRole("link", { name: /^Về tài khoản của tôi/ }).click();
  await member.waitForURL(memberOrigin + "/account");
  await member
    .getByRole("link", { name: "Đánh giá của tôi", exact: true })
    .first()
    .click();
  await member.waitForURL(memberOrigin + "/reviews");
  await member
    .getByRole("link", { name: "Xem hồ sơ uy tín của tôi", exact: true })
    .click();
  await member.waitForURL(memberOrigin + "/members/" + owner);
  await member
    .locator("article")
    .filter({ hasText: "QA: Nội dung đánh giá cần kiểm duyệt" })
    .getByRole("link", { name: "Báo cáo nội dung", exact: true })
    .click();
  await expect(
    member.getByRole("heading", { name: "Gửi yêu cầu", exact: true }),
  ).toBeVisible();
  await expect(member.getByLabel("Loại yêu cầu", { exact: true })).toHaveValue(
    "Violation",
  );
  await expect(member.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
    "QA: Bản nháp đi tìm nội dung",
  );
  await expect(member.getByLabel("Nội dung", { exact: true })).toHaveValue(
    "Nội dung bản nháp vẫn còn sau khi chọn từ hồ sơ đánh giá.",
  );
  await expect(
    member.getByText("Đánh giá của Đối tác đánh giá QA", { exact: true }),
  ).toBeVisible();
  await expect(member.getByLabel("Mã đối tượng", { exact: true })).toHaveCount(
    0,
  );
  checks.push(
    "contextual review attachment with readable author/excerpt and draft preserved across entry",
  );
  await member
    .getByLabel("Tiêu đề", { exact: true })
    .fill("QA: Báo cáo đánh giá giao dịch");
  await member
    .getByLabel("Nội dung", { exact: true })
    .fill(
      "Đề nghị Admin đối chiếu nội dung đánh giá này với quy tắc của hệ thống.",
    );
  await button(member, "Gửi yêu cầu").click();
  await member.waitForURL(/\/support\/[0-9a-f-]{36}$/);
  await admin
    .getByRole("link", { name: "Trung tâm xử lý", exact: true })
    .first()
    .click();
  await admin.waitForURL(adminOrigin + "/support");
  await button(admin, "Cập nhật danh sách").click();
  await admin
    .getByRole("link", { name: "QA: Báo cáo đánh giá giao dịch", exact: true })
    .click();
  await button(admin, "Nhận phụ trách").click();
  await admin
    .getByLabel("Căn cứ kiểm duyệt", { exact: true })
    .fill("Nội dung vi phạm quy tắc đã được xác minh trong QA.");
  await button(admin, "Lưu quyết định kiểm duyệt").click();
  await expect(
    admin.getByText(
      "Đã cập nhật kiểm duyệt. Gửi kết quả xử lý hồ sơ để trả lời người báo cáo.",
      { exact: true },
    ),
  ).toBeVisible();
  await admin
    .getByLabel("Nội dung phản hồi / lý do", { exact: true })
    .fill(
      "Đã kiểm tra và ẩn nội dung vi phạm. Điểm đánh giá hợp lệ được tính lại theo quy tắc.",
    );
  await button(admin, "Gửi kết quả xử lý").click();
  await member
    .getByRole("link", { name: /^Thông báo/ })
    .first()
    .click();
  await member.waitForURL(memberOrigin + "/notifications");
  await member
    .getByText("Đánh giá giao dịch có cập nhật kiểm duyệt", { exact: true })
    .first()
    .click();
  await member.waitForURL(/\/reviews\?reviewId=/);
  await expect(
    member.getByRole("heading", { name: "Đánh giá giao dịch", exact: true }),
  ).toBeVisible();
  assert.equal(
    await fixture.db
      .collection("transaction_reviews")
      .countDocuments({ transactionId: exchangeId, hiddenAt: { $ne: null } }),
    1,
  );
  checks.push(
    "public review/report/admin moderation/member notification/exact review target",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(evidence, "result.json"),
    JSON.stringify(
      { status: "PASS", checks, pageErrors: errors.length },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        status: "PASS",
        checks,
        pageErrors: errors.length,
        evidence: ".tmp/support-evidence",
      },
      null,
      2,
    ),
  );
} catch (error) {
  for (const [index, page] of (
    browser?.contexts().flatMap((c) => c.pages()) ?? []
  ).entries())
    await page
      .screenshot({
        path: path.join(evidence, `failure-${index}.png`),
        fullPage: true,
      })
      .catch(() => {});
  console.error(JSON.stringify({ pageErrors: errors }));
  throw error;
} finally {
  await browser?.close();
  for (const server of servers) await server.close();
  await fixture?.close();
}
