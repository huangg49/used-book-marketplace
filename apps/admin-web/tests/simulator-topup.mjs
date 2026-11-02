// Real Nest/Mongo + Admin UI; fake storage, no VNPay/network mail/provider calls.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { chromium, expect } from "playwright/test";
import { createTestApi, root, base, password } from "./test-api.mjs";

const qa = new URL(process.env.MONGO_TEST_URL ?? "");
assert.ok(
  ["localhost", "127.0.0.1"].includes(qa.hostname) &&
    qa.port === (process.env.TEST_MONGO_PORT ?? "57017") &&
    qa.searchParams.get("replicaSet") === "rs-test",
  "Dedicated QA replica required",
);
const origin = "http://127.0.0.1:5293";
const req = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(req.resolve("vite")).href);
const artifacts = path.join(
  root,
  "apps/admin-web/test-results/simulator-topup",
);
let fixture, browser, page, vite;
const errors = [];
try {
  Object.assign(process.env, {
    PAYMENT_SIMULATOR_SECRET: "simulator-topup-browser-qa-only-secret-00000000",
    VNPAY_SANDBOX_ENABLED: "false",
    AUTH_MAIL_PROVIDER: "local",
  });
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 0 });
  const users = fixture.db.collection("users");
  const member = await users.findOne({ _id: fixture.member.user.id });
  const operatorId = randomUUID();
  await users.insertOne({
    ...member,
    _id: operatorId,
    emailNormalized: "operator@operations.test",
    displayName: "Người vận hành QA",
    roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
  });
  await users.updateOne(
    { _id: member._id },
    { $set: { displayName: "Member nhận tiền QA" } },
  );
  process.env.VITE_API_BASE_URL = base;
  process.chdir(path.join(root, "apps/admin-web"));
  vite = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5293, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/simulator/events/topups");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("operator@operations.test");
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("heading", { name: "Nạp tiền mô phỏng", exact: true })
    .waitFor();
  await expect(
    page
      .getByLabel("Member nhận tiền", { exact: true })
      .locator("option")
      .filter({ hasText: "Member nhận tiền QA" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Kiểm tra khoản nạp", exact: true })
    .click();
  await expect(
    page.getByText("Chọn một Member khác tài khoản vận hành.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Tìm Member", { exact: true })
    .fill("does-not-exist-qa");
  await page
    .getByRole("button", { name: "Tìm người nhận", exact: true })
    .click();
  await expect(
    page.getByText(/Không tìm thấy Member đủ điều kiện/),
  ).toBeVisible();
  await page.route("**/operations/simulator/topup-recipients?*", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "UNAVAILABLE", message: "QA unavailable" },
    }),
  );
  await page.getByLabel("Tìm Member", { exact: true }).fill("Member");
  await page
    .getByRole("button", { name: "Tìm người nhận", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tải lại danh sách Member", exact: true }),
  ).toBeVisible();
  await page.unroute("**/operations/simulator/topup-recipients?*");
  await page
    .getByRole("button", { name: "Tải lại danh sách Member", exact: true })
    .click();
  await expect(
    page
      .getByLabel("Member nhận tiền", { exact: true })
      .locator("option")
      .filter({ hasText: "Member nhận tiền QA" }),
  ).toHaveCount(1);
  await page
    .getByLabel("Member nhận tiền", { exact: true })
    .selectOption(member._id);
  await page.getByRole("button", { name: "1.000.000", exact: false }).click();
  await page
    .getByRole("button", { name: "Kiểm tra khoản nạp", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Xác nhận nạp tiền mô phỏng?",
  });
  await expect(dialog.getByText(member._id, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Quay lại", exact: true }).click();
  assert.equal(
    await fixture.db
      .collection("topup_intents")
      .countDocuments({ ownerId: member._id }),
    0,
  );
  const attempts = [];
  let drop = true;
  await page.route("**/operations/simulator/topups", async (route) => {
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
        json: { code: "UNAVAILABLE", message: "QA lost ACK" },
      });
    }
    return route.fulfill({ response });
  });
  await page
    .getByRole("button", { name: "Kiểm tra khoản nạp", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  const retry = page.getByRole("button", {
    name: "Thử lại thao tác vừa gửi",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(retry).toBeEnabled();
  await expect(page.getByLabel("Số tiền nạp (đồng)")).toBeDisabled();
  assert.equal(
    await fixture.db
      .collection("topup_intents")
      .countDocuments({ ownerId: member._id }),
    1,
  );
  await retry.click();
  await expect(
    page.getByText("Nạp tiền mô phỏng thành công.", { exact: true }),
  ).toBeVisible();
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    1000000,
  );
  const [intent] = await fixture.db
    .collection("topup_intents")
    .find({ ownerId: member._id })
    .toArray();
  assert.equal(
    await fixture.db
      .collection("ledger_journals")
      .countDocuments({ topupId: intent._id }),
    1,
  );
  assert.equal(
    await fixture.db
      .collection("vnpay_payments")
      .countDocuments({ _id: intent._id }),
    0,
  );
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({
    path: path.join(artifacts, "desktop-receipt.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Nạp cho lượt tiếp theo", exact: true })
    .click();
  await expect(page.getByLabel("Số tiền nạp (đồng)")).toHaveValue("");
  await page.screenshot({
    path: path.join(artifacts, "desktop-form.png"),
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "130%";
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal overflow",
    );
    await page.screenshot({
      path: path.join(artifacts, `mobile-${width}.png`),
      fullPage: true,
    });
  }
  // A normal Admin can enter the workspace but cannot use simulator commands.
  const other = await browser.newPage();
  await other.goto(origin + "/simulator/events/topups");
  await other
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("admin@operations.test");
  await other.getByLabel(/^Mật khẩu/).fill(password);
  await other.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    other.getByRole("button", { name: "Kiểm tra khoản nạp", exact: true }),
  ).toHaveCount(0);
  await expect(other.getByText(/không có quyền/i).first()).toBeVisible();
  assert.equal(errors.length, 0);
  console.log(
    "PASS: operator search/loading/empty/error/retry, validation, cancel no-write, real QA topup, lost ACK exact retry and one journal, Member wallet/history, role restriction, desktop/mobile320/390 with 130% text.",
  );
} catch (error) {
  await mkdir(artifacts, { recursive: true });
  await page?.screenshot({
    path: path.join(artifacts, "failure.png"),
    fullPage: true,
  });
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  await fixture?.close();
}
