// Real HTTP/Mongo QA and both web clients; storage and payout are explicitly simulated.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
const req = createRequire(path.join(root, "apps/admin-web/package.json"));
const webReq = createRequire(path.join(root, "apps/user-web/package.json"));
const { chromium, expect } = req("playwright/test");
const qa = new URL(process.env.MONGO_TEST_URL ?? "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(qa.hostname) &&
    qa.port === "57017" &&
    qa.searchParams.get("replicaSet") === "rs-test",
  "Dedicated QA replica required",
);
const memberOrigin = "http://127.0.0.1:5195",
  adminOrigin = "http://127.0.0.1:5196";
const evidence = path.join(root, ".tmp/withdrawals-evidence");
let fixture, browser, web, adminVite, member, admin, op;
const pageErrors = [];
const captures = [];
const overflows = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
async function capture(p, name, width = 1440) {
  await p.setViewportSize({ width, height: 1000 });
  await p.evaluate(() => {
    window.scrollTo(0, 0);
    return document.fonts.ready;
  });
  // The incumbent native-dialog entrance lasts 260ms. Capture its settled opaque surface.
  await p.waitForTimeout(350);
  const modal = await p.locator("dialog[open]").count();
  await p.screenshot({
    path: path.join(evidence, name + ".png"),
    fullPage: !modal,
  });
  captures.push(name);
  if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    overflows.push({
      name,
      items: await p.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((e) => ({
            tag: e.tagName,
            cls: e.className,
            right: e.getBoundingClientRect().right,
            left: e.getBoundingClientRect().left,
          }))
          .filter((e) => e.right > innerWidth + 1 && typeof e.cls === "string")
          .slice(0, 20),
      ),
    });
  await writeFile(
    path.join(evidence, "overflows.json"),
    JSON.stringify(overflows, null, 2),
  );
}
async function closePopup(p) {
  await button(p, "Đóng popup").click();
  await expect(p.getByRole("dialog")).toHaveCount(0);
}
async function login(p, origin, email, url) {
  await p.goto(origin + url);
  await p.getByLabel(/^Email/).fill(email);
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
}
async function form(p, amount) {
  await p.getByRole("button", { name: /^Rút tiền(?: Demo)?$/ }).click();
  const d = p.getByRole("dialog", { name: "Rút tiền từ ví" });
  await d.getByLabel("Số tiền muốn rút").fill(String(amount));
  await d.getByLabel("Lý do rút tiền").selectOption("Personal");
  await d.getByLabel("Ngân hàng", { exact: true }).fill("Ngân hàng QA");
  await d.getByLabel("Số tài khoản", { exact: true }).fill("0123456789");
  await d.getByLabel("Tên chủ tài khoản").fill("NGUOI NHAN QA");
  return d;
}
async function confirmCreate(p) {
  await button(p, "Tiếp tục").click();
  await button(p, "Xác nhận gửi yêu cầu").click();
}
try {
  await mkdir(evidence, { recursive: true });
  Object.assign(process.env, {
    PAYMENT_SIMULATOR_SECRET: "withdrawals-browser-qa-only-000000000000",
    VNPAY_SANDBOX_ENABLED: "false",
    AUTH_MAIL_PROVIDER: "local",
    VITE_API_BASE_URL: base,
  });
  fixture = await createTestApi({
    corsOrigin: memberOrigin + "," + adminOrigin,
    listingCount: 0,
  });
  const seed = await fixture.db
    .collection("users")
    .findOne({ _id: fixture.member.user.id });
  await fixture.db
    .collection("users")
    .insertOne({
      ...seed,
      _id: randomUUID(),
      emailNormalized: "withdraw-operator@operations.test",
      displayName: "Vận hành chi QA",
      roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
    });
  const operator = await fixture.api("/auth/login", null, {
    email: "withdraw-operator@operations.test",
    password,
  });
  await fixture.api("/operations/simulator/topups", operator.accessToken, {
    recipientId: seed._id,
    amount: 500000,
  });
  const vite = await import(pathToFileURL(req.resolve("vite")).href),
    webVite = await import(pathToFileURL(webReq.resolve("vite")).href);
  web = await webVite.createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5195, strictPort: true },
    logLevel: "error",
  });
  await web.listen();
  adminVite = await vite.createServer({
    root: path.join(root, "apps/admin-web"),
    server: { host: "127.0.0.1", port: 5196, strictPort: true },
    logLevel: "error",
  });
  await adminVite.listen();
  browser = await chromium.launch({ headless: true });
  member = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  op = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  for (const p of [member, admin, op]) {
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => pageErrors.push(e.message));
  }
  await login(member, memberOrigin, "member@operations.test", "/login");
  await member.getByRole("button", { name: /^Tài khoản của/ }).click();
  await member
    .getByRole("link", { name: /Ví của tôi/ })
    .first()
    .click();
  await member.getByRole("button", { name: /^Rút tiền(?: Demo)?$/ }).waitFor();
  await expect(
    member.getByText("Chưa có yêu cầu rút tiền.", { exact: false }),
  ).toBeVisible();
  await expect(
    member
      .getByRole("region", { name: "Lịch sử giao dịch" })
      .getByText("Nạp tiền", { exact: true })
      .last(),
  ).toBeVisible();
  await capture(member, "member-empty-desktop");
  let d = await form(member, 100000);
  await d.getByLabel("Lý do rút tiền").selectOption("Other");
  assert.equal(
    await d.getByLabel("Mô tả lý do").evaluate((e) => e.checkValidity()),
    false,
  );
  await d
    .getByLabel("Mô tả lý do")
    .fill("Rút tiền mô phỏng để kiểm tra luồng.");
  await capture(member, "member-form-desktop");
  await capture(member, "member-form-mobile", 390);
  await d.evaluate((e) => e.scrollTo(0, e.scrollHeight));
  await capture(member, "member-form-footer-mobile", 390);
  await d.evaluate((e) => e.scrollTo(0, 0));
  await capture(member, "member-form-small", 320);
  await member.setViewportSize({ width: 390, height: 1000 });
  await member.evaluate(
    () => (document.documentElement.style.fontSize = "130%"),
  );
  await capture(member, "member-form-large-text", 390);
  await member.evaluate(() => (document.documentElement.style.fontSize = ""));
  const posted = [];
  let drop = true;
  await member.route("**/me/withdrawals", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posted.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    if (drop) {
      drop = false;
      assert.equal(response.status(), 200);
      await route.abort("connectionfailed");
    } else await route.fulfill({ response });
  });
  await button(member, "Tiếp tục").click();
  await capture(member, "member-confirm-mobile", 390);
  await button(member, "Xác nhận gửi yêu cầu").click();
  await button(member, "Kiểm tra lại yêu cầu").waitFor();
  assert.equal(await member.getByLabel("Số tiền muốn rút").isDisabled(), true);
  await button(member, "Kiểm tra lại yêu cầu").click();
  await member.getByRole("dialog", { name: "Chi tiết rút tiền" }).waitFor();
  assert.equal(posted.length, 2);
  assert.deepEqual(posted[0], posted[1]);
  const id = new URL(member.url()).searchParams.get("withdrawal");
  assert.ok(id);
  await expect(
    member
      .getByRole("dialog", { name: "Chi tiết rút tiền" })
      .getByText("Chờ duyệt", { exact: true })
      .first(),
  ).toBeVisible();
  await capture(member, "member-requested-mobile", 390);
  await closePopup(member);
  await member.getByRole("tab", { name: "Rút tiền", exact: true }).click();
  await expect(member.getByText("−100.000 ₫", { exact: true })).toBeVisible();
  await login(admin, adminOrigin, "admin@operations.test", "/withdrawals");
  await admin
    .getByRole("heading", { name: "Yêu cầu rút tiền", exact: true })
    .waitFor();
  await capture(admin, "admin-queue-desktop");
  await capture(admin, "admin-queue-mobile", 390);
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.getByRole("link", { name: "Xem đơn" }).first().click();
  await admin
    .getByRole("heading", { name: "Chi tiết yêu cầu rút tiền" })
    .waitFor();
  const approvedPosts = [];
  let dropApproval = true;
  await admin.route("**/admin/withdrawals/*/decision", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    approvedPosts.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    if (dropApproval) {
      dropApproval = false;
      assert.equal(response.status(), 200);
      await route.abort("connectionfailed");
    } else await route.fulfill({ response });
  });
  await capture(admin, "admin-detail-desktop");
  await button(admin, "Duyệt yêu cầu").click();
  d = admin.getByRole("dialog", { name: "Duyệt yêu cầu rút tiền" });
  await d
    .getByLabel("Lý do duyệt")
    .fill("Đã đối chiếu số tiền và thông tin nhận.");
  await capture(admin, "admin-approve-desktop");
  await capture(admin, "admin-approve-mobile", 390);
  await button(d, "Duyệt yêu cầu rút tiền").click();
  await button(d, "Thử lại thao tác vừa gửi").waitFor();
  await button(d, "Thử lại thao tác vừa gửi").click();
  await button(admin, "Gửi lệnh chi mô phỏng").waitFor();
  assert.equal(approvedPosts.length, 2);
  assert.deepEqual(approvedPosts[0], approvedPosts[1]);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken))
      .withdrawalHeld,
    100000,
  );
  await button(admin, "Gửi lệnh chi mô phỏng").click();
  d = admin.getByRole("dialog", { name: "Gửi lệnh chi mô phỏng" });
  await button(d, "Gửi lệnh chi mô phỏng").click();
  await expect(
    admin.getByText("Đang chờ kết quả mô phỏng hoặc đối soát.", {
      exact: false,
    }),
  ).toBeVisible();
  await login(
    op,
    adminOrigin,
    "withdraw-operator@operations.test",
    "/simulator/withdrawals",
  );
  await op.getByRole("heading", { name: "Kết quả chi mô phỏng" }).waitFor();
  await button(op, "Nhập kết quả").click();
  d = op.getByRole("dialog", { name: "Ghi nhận kết quả chi mô phỏng" });
  await d.getByLabel("Kết quả xác minh").selectOption("Unknown");
  await capture(op, "operator-unknown-desktop");
  await button(d, "Ghi nhận kết quả chi mô phỏng").click();
  await button(op, "Nhập kết quả").waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken))
      .withdrawalHeld,
    100000,
  );
  await button(op, "Nhập kết quả").click();
  d = op.getByRole("dialog", { name: "Ghi nhận kết quả chi mô phỏng" });
  await d.getByLabel("Kết quả xác minh").selectOption("Succeeded");
  await button(d, "Ghi nhận kết quả chi mô phỏng").click();
  await expect(
    op.getByRole("dialog", { name: "Ghi nhận kết quả chi mô phỏng" }),
  ).toBeHidden();
  await member.getByRole("button", { name: /Rút tiền · 100/ }).click();
  await expect(
    member
      .getByRole("dialog", { name: "Chi tiết rút tiền" })
      .getByText("Thành công", { exact: true })
      .first(),
  ).toBeVisible();
  await capture(member, "member-completed-mobile", 390);
  await closePopup(member);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    400000,
  );
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken))
      .withdrawalHeld,
    0,
  );
  await form(member, 75000);
  await confirmCreate(member);
  await member.getByRole("dialog", { name: "Chi tiết rút tiền" }).waitFor();
  const rejectedId = new URL(member.url()).searchParams.get("withdrawal");
  await closePopup(member);
  await admin
    .getByRole("link", { name: "Yêu cầu rút tiền", exact: true })
    .last()
    .click();
  await button(admin, "Cập nhật danh sách").click();
  await admin.getByRole("link", { name: "Xem đơn" }).first().click();
  await button(admin, "Từ chối").click();
  d = admin.getByRole("dialog", { name: "Từ chối yêu cầu rút tiền" });
  await d.getByLabel("Lý do từ chối").fill("Thông tin nhận tiền chưa khớp.");
  await button(d, "Từ chối yêu cầu rút tiền").click();
  await expect(
    admin.getByText("Yêu cầu đã kết thúc.", { exact: false }),
  ).toBeVisible();
  assert.equal(
    (
      await fixture.api(
        "/me/withdrawals/" + rejectedId,
        fixture.member.accessToken,
      )
    ).state,
    "Rejected",
  );
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    400000,
  );
  await capture(admin, "admin-rejected-mobile", 390);
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.evaluate(
    () => (document.documentElement.style.fontSize = "130%"),
  );
  await capture(admin, "admin-detail-large-text");
  await member.getByRole("button", { name: /Rút tiền · 75/ }).click();
  await expect(
    member
      .getByRole("dialog", { name: "Chi tiết rút tiền" })
      .getByText("Bị từ chối", { exact: true })
      .first(),
  ).toBeVisible();
  await capture(member, "member-rejected-mobile", 390);
  await closePopup(member);
  // A deep link to another owner's request must not disclose the cached original.
  await login(
    member,
    memberOrigin,
    "member@operations.test",
    "/wallet?withdrawal=" + randomUUID(),
  );
  await expect(
    member.getByText(
      "Chưa mở được yêu cầu rút tiền hoặc bạn không có quyền xem.",
    ),
  ).toBeVisible();
  await capture(member, "member-unavailable-mobile", 390);
  await closePopup(member);
  await capture(member, "member-history-mobile", 390);
  await capture(member, "member-history-small", 320);
  await member.evaluate(
    () => (document.documentElement.style.fontSize = "130%"),
  );
  await capture(member, "member-history-large-text", 390);
  await member.evaluate(() => (document.documentElement.style.fontSize = ""));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(overflows, []);
  await writeFile(
    path.join(evidence, "result.json"),
    JSON.stringify(
      {
        checks: [
          "real-api-mongo",
          "modal-required-fields",
          "320-390-1440",
          "large-text",
          "member-admin-lost-ack-exact-retry",
          "independent-admin-approval",
          "unknown-retains-hold",
          "one-successful-payout",
          "rejection-refunds",
          "owner-deep-link-refusal",
        ],
        captures,
        pageErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS withdrawals browser: real API/Mongo, Member/Admin/operator, lost ACK, hold/payout/refund; " +
      captures.length +
      " captures; 0 page errors.",
  );
} catch (error) {
  for (const [name, p] of [
    ["member", member],
    ["admin", admin],
    ["operator", op],
  ])
    if (p) {
      await p
        .screenshot({ path: path.join(evidence, "failure-" + name + ".png") })
        .catch(() => {});
      await writeFile(
        path.join(evidence, "failure-" + name + ".txt"),
        await p.locator("body").innerText(),
      ).catch(() => {});
    }
  throw error;
} finally {
  await browser?.close();
  await web?.close();
  await adminVite?.close();
  await fixture?.close();
}
