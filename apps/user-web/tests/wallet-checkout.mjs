// Real API, Mongo and browser; VNPay navigation/QueryDR responses are simulated.
// Does not claim a live VNPay merchant transaction or native device coverage.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import {
  createTestApi,
  root,
  base,
  password,
} from "../../admin-web/tests/test-api.mjs";
const require = createRequire(
  new URL("../../admin-web/package.json", import.meta.url),
);
const webRequire = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const { createServer } = await import(
  pathToFileURL(webRequire.resolve("vite")).href
);
const origin = "http://127.0.0.1:5193",
  secret = "qa-only-browser-vnpay-key-not-production-0000";
Object.assign(process.env, {
  VITE_API_BASE_URL: "/api/v1",
  LATLAI_DEV_API_ORIGIN: new URL(base).origin,
  AUTH_MAIL_PROVIDER: "local",
  AUTH_WEB_ORIGIN: origin,
  AUTH_MAIL_ENCRYPTION_KEY: "qa-browser-mail-key-not-production-0000000000000",
  LISTING_SUBMISSION_FEE_VND: "20000",
  ORDER_CHECKOUT_MODE: "Wallet",
  VNPAY_SANDBOX_ENABLED: "true",
  VNPAY_TMN_CODE: "TESTDEMO",
  VNPAY_HASH_SECRET: secret,
  VNPAY_RETURN_URL: origin + "/wallet",
});
let fixture, server, browser;
const realFetch = globalThis.fetch;
let queryMode = "pending";
const checkoutAmounts = new Map();
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url !== "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction")
    return realFetch(input, init);
  if (queryMode === "unavailable") throw new Error("QA provider unavailable");
  const request = JSON.parse(init.body);
  const date = new Date(Date.now() + 7 * 3600000)
    .toISOString()
    .slice(0, 19)
    .replace(/[-T:]/g, "");
  const data = {
    vnp_ResponseId: "qa-query-response",
    vnp_Command: "querydr",
    vnp_ResponseCode: "00",
    vnp_Message: "Success",
    vnp_TmnCode: "TESTDEMO",
    vnp_TxnRef: request.vnp_TxnRef,
    vnp_Amount: checkoutAmounts.get(request.vnp_TxnRef) ?? "5000000",
    vnp_BankCode: "NCB",
    vnp_PayDate: date,
    vnp_TransactionNo: String(
      parseInt(
        createHash("sha256")
          .update(request.vnp_TxnRef)
          .digest("hex")
          .slice(0, 12),
        16,
      ) + 1,
    ),
    vnp_TransactionType: "01",
    vnp_TransactionStatus: queryMode === "paid" ? "00" : "01",
    vnp_OrderInfo: "Nap vi",
  };
  const fields = [
    "vnp_ResponseId",
    "vnp_Command",
    "vnp_ResponseCode",
    "vnp_Message",
    "vnp_TmnCode",
    "vnp_TxnRef",
    "vnp_Amount",
    "vnp_BankCode",
    "vnp_PayDate",
    "vnp_TransactionNo",
    "vnp_TransactionType",
    "vnp_TransactionStatus",
    "vnp_OrderInfo",
    "vnp_PromotionCode",
    "vnp_PromotionAmount",
  ];
  const vnp_SecureHash = createHmac("sha512", secret)
    .update(fields.map((f) => data[f] ?? "").join("|"))
    .digest("hex");
  return new Response(JSON.stringify({ ...data, vnp_SecureHash }), {
    headers: { "Content-Type": "application/json" },
  });
};
const evidence = path.join(root, ".tmp/wallet-checkout-browser");
await mkdir(evidence, { recursive: true });
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 0 });
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5193, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage(),
    errors = [];
  await page.addInitScript(() => {
    const open = window.open;
    window.open = (...args) =>
      window.__qaBlockPayment ? null : open.apply(window, args);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin + "/login?returnUrl=%2Fwallet");
  await page.getByLabel(/^Email/).fill(fixture.member.user.email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("heading", { name: "Ví của bạn", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Nạp qua VNPay sandbox", exact: true })
    .waitFor();
  await page.getByLabel("Số tiền nạp (đồng)").fill("4999");
  await page
    .getByRole("button", { name: "Nạp qua VNPay sandbox", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Nhập số tiền từ" })
    .waitFor();
  await page.getByLabel("Số tiền nạp (đồng)").fill("50000");
  await page.evaluate(() => {
    window.__qaBlockPayment = true;
  });
  await page
    .getByRole("button", { name: "Nạp qua VNPay sandbox", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Trình duyệt đã chặn tab thanh toán" })
    .waitFor();
  assert.equal(
    (await fixture.api("/me/topups?limit=10", fixture.member.accessToken)).items
      .length,
    0,
  );
  await page.evaluate(() => {
    window.__qaBlockPayment = false;
  });
  let checkoutUrl;
  await page
    .context()
    .route("https://sandbox.vnpayment.vn/**", async (route) => {
      checkoutUrl = route.request().url();
      const checkout = new URL(checkoutUrl).searchParams;
      checkoutAmounts.set(
        checkout.get("vnp_TxnRef"),
        checkout.get("vnp_Amount"),
      );
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<p>QA intercepted sandbox navigation</p>",
      });
    });
  const popupCreated = page.context().waitForEvent("page");
  await page
    .getByRole("button", { name: "Nạp qua VNPay sandbox", exact: true })
    .click();
  const popup = await popupCreated;
  await popup.waitForURL("https://sandbox.vnpayment.vn/**");
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  assert(checkoutUrl);
  const id = new URL(checkoutUrl).searchParams.get("vnp_TxnRef");
  assert.equal(new URL(page.url()).pathname, "/wallet");
  assert.equal(new URL(page.url()).searchParams.get("topup"), id);
  assert.equal(
    await page
      .getByRole("heading", { name: "Ví của bạn", exact: true })
      .isVisible(),
    true,
  );
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  // A forged browser return is not trusted to credit money.
  const popupClosed = popup.waitForEvent("close");
  await popup.goto(
    `${origin}/wallet?vnp_TxnRef=${id}&vnp_ResponseCode=00&vnp_TransactionStatus=00`,
    { waitUntil: "commit" },
  );
  await popupClosed;
  assert.equal(
    await page
      .getByRole("heading", { name: "Ví của bạn", exact: true })
      .isVisible(),
    true,
  );
  assert.equal(await page.getByLabel(/^Email/).count(), 0);
  await page
    .getByText(/Chờ thanh toán · 50/)
    .waitFor()
    .catch(async (error) => {
      await page.screenshot({
        path: path.join(evidence, "failure.png"),
        fullPage: true,
      });
      console.log(
        "QA visible page:",
        await page.locator("main, #account-content").allTextContents(),
      );
      throw error;
    });
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  assert.equal(new URL(page.url()).searchParams.has("vnp_ResponseCode"), false);
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(evidence, "desktop-pending.png"),
    fullPage: true,
  });
  queryMode = "unavailable";
  await page
    .getByText("Chưa xác minh được yêu cầu nạp này.", { exact: false })
    .waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  queryMode = "paid";
  await page.getByRole("button", { name: "Kiểm tra lại", exact: true }).click();
  await page.getByText(/Đã nạp ví · 50/).waitFor();
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    50000,
  );
  // A successful Return closes only the payment tab, preserves the wallet
  // session and automatically shows the confirmed credit without another login.
  await page.getByLabel("Số tiền nạp (đồng)").fill("40000");
  const happyPopupCreated = page.context().waitForEvent("page");
  await page
    .getByRole("button", { name: "Nạp qua VNPay sandbox", exact: true })
    .click();
  const happyPopup = await happyPopupCreated;
  await happyPopup.waitForURL("https://sandbox.vnpayment.vn/**");
  const happyId = new URL(happyPopup.url()).searchParams.get("vnp_TxnRef");
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    50000,
  );
  const happyClosed = happyPopup.waitForEvent("close");
  await happyPopup.goto(
    `${origin}/wallet?vnp_TxnRef=${happyId}&vnp_ResponseCode=00&vnp_TransactionStatus=00`,
    { waitUntil: "commit" },
  );
  await happyClosed;
  await page.getByText(/Đã nạp ví · 40/).waitFor();
  assert.equal(new URL(page.url()).pathname, "/wallet");
  assert.equal(await page.getByLabel(/^Email/).count(), 0);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    90000,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(evidence, "mobile-credited.png"),
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.getByRole("link", { name: "← Về tài khoản", exact: true }).click();
  await page
    .getByRole("region", { name: "Ví mô phỏng", exact: true })
    .getByText(/90\.000/)
    .waitFor();
  assert.equal(await page.getByLabel(/^Email/).count(), 0);
  // A callback tab without the original wallet never exposes wallet data or
  // inherits credentials; the fallback login URL contains only the intent ID.
  const orphan = await page.context().newPage();
  const privateRequests = [];
  orphan.on("request", (request) => {
    if (request.url().includes("/api/v1/me/"))
      privateRequests.push(request.url());
  });
  await orphan.goto(
    `${origin}/wallet?vnp_TxnRef=00000000-0000-4000-8000-000000000009&vnp_Amount=99999999&vnp_SecureHash=forged&vnp_BankTranNo=private-bank-metadata`,
  );
  await orphan
    .getByRole("heading", { name: "Quay lại ví của bạn", exact: true })
    .waitFor();
  await orphan.waitForURL("**/wallet?payment-return=1&topup=*");
  assert.equal(
    await orphan.getByText("Số dư khả dụng", { exact: true }).count(),
    0,
  );
  assert.equal(privateRequests.length, 0);
  assert.equal(new URL(orphan.url()).searchParams.has("vnp_SecureHash"), false);
  await orphan.getByRole("link", { name: "mở lại ví", exact: true }).click();
  await orphan.getByLabel(/^Email/).waitFor();
  assert.equal(orphan.url().includes("private-bank-metadata"), false);
  await orphan.close();
  await page.goto(origin + "/sell");
  await page.getByRole("heading").first().waitFor();
  // Cash confirmation and backend failure preserve input and the same command.
  await page.goto(origin + "/wallet");
  await page.getByLabel(/^Email/).fill(fixture.member.user.email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const requests = [];
  queryMode = "pending";
  let first = true;
  await page.route("**/api/v1/me/topups/vnpay", async (route) => {
    requests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (first) {
      first = false;
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByLabel("Số tiền nạp (đồng)").fill("20000");
  await page
    .getByRole("button", { name: "Nạp qua VNPay sandbox", exact: true })
    .click();
  await page.getByText(/Chưa xác nhận được yêu cầu nạp/).waitFor();
  const retryPopupCreated = page.context().waitForEvent("page");
  await page.getByRole("button", { name: "Thử lại yêu cầu nạp" }).click();
  const retryPopup = await retryPopupCreated;
  await retryPopup.waitForURL("https://sandbox.vnpayment.vn/**");
  assert.equal(new URL(page.url()).pathname, "/wallet");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/mobile wallet, blocked popup creates no intent, provider has no opener, original tab stays signed in through Return, forged Return denied, QueryDR outage/retry/credit, lost-ACK same-key retry; real API/Mongo, fake provider navigation and signed QueryDR responses.",
  );
} finally {
  globalThis.fetch = realFetch;
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
