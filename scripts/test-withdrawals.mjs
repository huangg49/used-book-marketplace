// Real HTTP/Mongo QA and both web clients; fake storage, manual wallet approval, no bank API.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditWalletButtons, assertWalletButtonsReadable } from "./wallet-button-states.mjs";
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
const evidence = path.join(root, ".tmp/wallet-button-states-evidence");
const buttonStates = [];
let fixture, browser, web, adminVite, member, admin, op;
const pageErrors = [];
const captures = [];
const overflows = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
async function capture(p, name, width = 1440, height = 1000) {
  await p.setViewportSize({ width, height });
  await p.evaluate(() => {
    window.scrollTo(0, 0);
    return document.fonts.ready;
  });
  // Wait for the authored popup/light sequence; ordinary surfaces use the incumbent timing.
  const animatedForm = await p.locator("dialog[open] form[data-step]").count();
  await p.waitForTimeout(animatedForm ? 1050 : 350);
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
  await p.waitForURL(origin + url);
}
async function openWithdrawalNotification(p, stateLabel) {
  await p.setViewportSize({ width: 1440, height: 1000 });
  await p.getByRole("link", { name: /^Thông báo/ }).last().click();
  await p.getByRole("button", { name: new RegExp("^Rút tiền · " + stateLabel + ":") }).first().click();
  await p.getByRole("dialog", { name: "Chi tiết rút tiền" }).waitFor();
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
  await login(member, memberOrigin, "member@operations.test", "/wallet");
  await member.getByRole("button", { name: /^Rút tiền(?: Demo)?$/ }).waitFor();
  await expect(member.getByRole("heading", { name: "Yêu cầu rút tiền", exact: true })).toHaveCount(0);
  await expect(
    member
      .getByRole("region", { name: "Lịch sử giao dịch" })
      .getByText("Nạp tiền", { exact: true })
      .last(),
  ).toBeVisible();
  await capture(member, "member-empty-desktop");
  const wallet = member.locator("section").filter({ has: member.getByRole("heading", { name: "Ví & Ký Quỹ Thư Quán", exact: true }) }).last();
  await auditWalletButtons(member, wallet, "wallet", buttonStates);
  await button(member, "Nạp tiền VNPay").click();
  await auditWalletButtons(member, member.getByRole("dialog", { name: "Nạp tiền vào ví" }), "topup", buttonStates);
  await closePopup(member);
  await member.emulateMedia({ reducedMotion: "reduce" });
  let d = await form(member, 100000);
  assert.equal(await d.evaluate(e => getComputedStyle(e).animationDuration), "0.52s");
  await member.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(await d.evaluate(e => getComputedStyle(e).animationDuration), "0.52s");
  await button(d, "Tối đa").click();
  await expect(d.getByLabel("Số tiền muốn rút")).toHaveValue("500000");
  await button(d, "100.000").click();
  await expect(d.getByLabel("Số tiền muốn rút")).toHaveValue("100000");
  await auditWalletButtons(member, d, "withdrawal-entry", buttonStates);
  // Simulate a missing inherited hover token: native portals must have a safe fallback.
  await d.evaluate(node => node.style.setProperty("--shop-wine-hover", "initial"));
  await auditWalletButtons(member, d, "withdrawal-entry-without-hover-token", buttonStates);
  await d.evaluate(node => node.style.removeProperty("--shop-wine-hover"));
  await closePopup(member);
  await member.getByRole("link", { name: "Tìm sách", exact: true }).first().click();
  const leave = member.getByRole("dialog", { name: "Rời bản nháp rút tiền?" });
  await leave.waitFor();
  await auditWalletButtons(member, leave, "leave-draft", buttonStates);
  await leave.getByRole("button", { name: "Quay lại yêu cầu", exact: true }).click();
  await d.waitFor();
  await writeFile(path.join(evidence, "button-states.json"), JSON.stringify(buttonStates, null, 2));
  assertWalletButtonsReadable(buttonStates);
  const moneyStyle = await d.getByLabel("Số tiền muốn rút").evaluate(e => {
    const s = getComputedStyle(e);
    return { border: s.borderTopWidth, size: parseFloat(s.fontSize) };
  });
  assert.equal(moneyStyle.border, "0px");
  assert.ok(moneyStyle.size >= 24);
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
  await auditWalletButtons(member, member.getByRole("dialog"), "withdrawal-review", buttonStates);
  await writeFile(path.join(evidence, "button-states.json"), JSON.stringify(buttonStates, null, 2));
  assertWalletButtonsReadable(buttonStates);
  await button(member, "Chỉnh sửa").click();
  await expect(member.getByLabel("Số tiền muốn rút")).toBeVisible();
  await expect(member.getByLabel("Số tiền muốn rút")).toHaveValue("100000");
  await expect(member.getByLabel("Ngân hàng", {exact:true})).toHaveValue("Ngân hàng QA");
  await button(member, "Tiếp tục").click();
  await button(member, "Xác nhận gửi yêu cầu").click();
  await button(member, "Kiểm tra lại yêu cầu").waitFor();
  assert.equal(await member.getByLabel("Số tiền muốn rút").isDisabled(), true);
  await auditWalletButtons(member, member.getByRole("dialog"), "withdrawal-retry", buttonStates);
  await writeFile(path.join(evidence, "button-states.json"), JSON.stringify(buttonStates, null, 2));
  assertWalletButtonsReadable(buttonStates);
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
  const pendingNotice = member.getByRole("region", { name: "Bạn đang có 1 đơn rút tiền chờ duyệt" });
  await expect(pendingNotice).toBeVisible();
  await expect(pendingNotice.getByText("dưới 24 giờ", { exact: true })).toBeVisible();
  await capture(member, "member-pending-desktop", 1440, 900);
  await auditWalletButtons(member, pendingNotice, "pending-notice", buttonStates);
  await writeFile(path.join(evidence, "button-states.json"), JSON.stringify(buttonStates, null, 2));
  assertWalletButtonsReadable(buttonStates);
  assert.ok(await pendingNotice.evaluate(e => e.getBoundingClientRect().bottom < window.innerHeight));
  await capture(member, "member-pending-mobile", 390, 844);
  await capture(member, "member-pending-small", 320, 844);
  await member.evaluate(() => (document.documentElement.style.fontSize = "130%"));
  await capture(member, "member-pending-large-text", 390, 844);
  await member.evaluate(() => (document.documentElement.style.fontSize = ""));
  await pendingNotice.getByRole("button", { name: "Xem chi tiết" }).click();
  await member.getByRole("dialog", { name: "Chi tiết rút tiền" }).waitFor();
  assert.equal(new URL(member.url()).searchParams.get("withdrawal"), id);
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
  await capture(admin, "admin-detail-desktop", 1440, 900);
  assert.ok(
    await button(admin, "Duyệt yêu cầu").evaluate(
      e => e.getBoundingClientRect().bottom < window.innerHeight,
    ),
    "Primary decision is visible without scrolling",
  );
  await admin.getByText("Mã tham chiếu", { exact: true }).click();
  await expect(admin.getByText(id, { exact: true })).toBeVisible();
  await admin.getByText("Mã tham chiếu", { exact: true }).click();
  await capture(admin, "admin-detail-tablet", 1000, 900);
  await capture(admin, "admin-detail-mobile", 390, 844);
  await capture(admin, "admin-detail-small", 320, 844);
  await admin.setViewportSize({ width: 1440, height: 900 });
  await button(admin, "Duyệt yêu cầu").click();
  d = admin.getByRole("dialog", { name: "Duyệt yêu cầu rút tiền" });
  await expect(d.getByRole("textbox")).toHaveCount(0);
  await expect(button(d, "Xác nhận")).toBeEnabled();
  await capture(admin, "admin-approve-desktop");
  await capture(admin, "admin-approve-mobile", 390);
  await button(d, "Xác nhận").click();
  await button(d, "Thử lại thao tác vừa gửi").waitFor();
  await button(d, "Thử lại thao tác vừa gửi").click();
  await expect(admin.getByText("Yêu cầu đã kết thúc.", {exact:false})).toBeVisible();
  assert.equal(approvedPosts.length,2);assert.deepEqual(approvedPosts[0],approvedPosts[1]);
  assert.equal((await fixture.api('/me/wallet',fixture.member.accessToken)).withdrawalHeld,0);
  assert.equal(await fixture.db.collection('withdrawal_events').countDocuments(),0);
  await capture(admin,'admin-completed-desktop');
  await openWithdrawalNotification(member, "Rút tiền thành công");
  assert.equal(new URL(member.url()).searchParams.get("withdrawal"), id);
  await expect(
    member
      .getByRole("dialog", { name: "Chi tiết rút tiền" })
      .getByText("Thành công", { exact: true })
      .first(),
  ).toBeVisible();
  await capture(member, "member-completed-mobile", 390);
  await closePopup(member);
  await expect(pendingNotice).toHaveCount(0);
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
  await openWithdrawalNotification(member, "Đã từ chối");
  assert.equal(new URL(member.url()).searchParams.get("withdrawal"), rejectedId);
  await expect(
    member
      .getByRole("dialog", { name: "Chi tiết rút tiền" })
      .getByText("Bị từ chối", { exact: true })
      .first(),
  ).toBeVisible();
  await capture(member, "member-rejected-mobile", 390);
  await closePopup(member);
  await expect(pendingNotice).toHaveCount(0);
  // Force real server pagination at one pending request per page.
  await member.route("**/me/withdrawals?state=Requested&limit=100*", route => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", "1");
    return route.continue({ url: url.toString() });
  });
  for (let i = 0; i < 2; i++) {
    await form(member, 50000);
    await confirmCreate(member);
    await member.getByRole("dialog", { name: "Chi tiết rút tiền" }).waitFor();
    await closePopup(member);
  }
  await expect(member.getByRole("region", { name: "Bạn đang có 2 đơn rút tiền chờ duyệt" })).toBeVisible();
  await capture(member, "member-two-pending-desktop", 1440, 900);
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
          "320-390-1000-1440",
          "decision-visible-above-fold",
          "expandable-reference-identifiers",
          "pending-notice-visible-above-wallet",
          "separate-withdrawal-list-removed",
          "withdrawal-motion-both-os-preferences",
          "wallet-button-hover-active-keyboard-contrast",
          "portal-buttons-without-inherited-hover-token",
          "quick-amount-and-edit-preserve-values",
          "withdrawal-details-from-notifications",
          "pending-count-all-filtered-pages",
          "completed-rejected-not-counted",
          "pending-detail-link",
          "under-24-hour-copy",
          "large-text",
          "member-admin-lost-ack-exact-retry",
          "independent-admin-approval",
          "approval-confirmation-without-reason-input",
          "approval-completes-without-simulator",
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
    "PASS withdrawals browser: real API/Mongo, Member/Admin, manual approval, lost ACK, hold/payout/refund; " +
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
