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
let fixture, server, browser, page;
const topupResponses = [];
const browserMessages = [];
const historyReads = [];
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
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  await page.addInitScript(() => {
    const open = window.open;
    window.__qaPaymentWindows = [];
    window.open = (...args) => {
      const payment = window.__qaBlockPayment ? null : open.apply(window, args);
      if (payment) window.__qaPaymentWindows.push(payment);
      return payment;
    };
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "warning" ||
      message.type() === "error" ||
      message.text().includes("[vite]")
    ) {
      browserMessages.push({ type: message.type(), message: message.text() });
    }
  });
  page.on("response", async (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!/\/me\/topups\/[a-f0-9-]+(?:\/vnpay-query)?$/.test(pathname)) return;
    const body = await response.json().catch(() => ({}));
    topupResponses.push({
      path: pathname,
      method: response.request().method(),
      status: response.status(),
      state: body.state,
      expiresAt: body.expiresAt,
      serverTime: body.serverTime,
    });
  });
  await page.goto(origin + "/login?returnUrl=%2Fwallet");
  await page.getByLabel(/^Email/).fill(fixture.member.user.email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page
    .getByRole("heading", { name: "Ví của tôi", exact: true })
    .waitFor();
  const header = page.locator("header").first();
  const walletIcon = header.getByRole("link", {
    name: "Ví của tôi",
    exact: true,
  });
  const chatIcon = header.getByRole("link", {
    name: "Chat, hội thoại của bạn",
    exact: true,
  });
  assert.equal((await walletIcon.textContent()).trim(), "");
  assert.equal((await chatIcon.textContent()).trim(), "");
  assert.equal(await walletIcon.getAttribute("href"), "/wallet");
  const walletBounds = await walletIcon.boundingBox();
  const chatBounds = await chatIcon.boundingBox();
  assert.ok(walletBounds.width >= 44 && walletBounds.height >= 44);
  assert.ok(walletBounds.x + walletBounds.width <= chatBounds.x);
  await page.getByRole("button", { name: /^Tài khoản của .+$/, exact: true }).click();
  await page
    .getByRole("navigation", { name: "Tài khoản cá nhân", exact: true })
    .getByRole("link", { name: "Ví của tôi", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Ví của tôi", exact: true })
    .waitFor();
  const ledgerHistory = page.getByRole("region", {
    name: "Lịch sử giao dịch",
    exact: true,
  });
  await ledgerHistory.getByText(/Chưa có giao dịch ví/).waitFor();
  const topupButton = page.getByRole("button", {
    name: "Nạp tiền",
    exact: true,
  });
  const withdrawalButton = page.getByRole("button", {
    name: "Rút tiền",
    exact: true,
  });
  const topupDialog = page.getByRole("dialog", {
    name: "Nạp tiền",
    exact: true,
  });
  const withdrawalDialog = page.getByRole("dialog", {
    name: "Rút tiền",
    exact: true,
  });
  async function settleDialog(dialog) {
    await dialog.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations()
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
  }
  async function openTopup() {
    await topupButton.click();
    await topupDialog.waitFor();
    await settleDialog(topupDialog);
  }
  async function checkDialogKeyboard(dialog) {
    const close = dialog.getByRole("button", { name: "Đóng popup" });
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await dialog.evaluate((node) => node.contains(document.activeElement)),
      true,
      "Reverse Tab must stay inside the modal",
    );
    assert.equal(
      await close.evaluate((node) => node === document.activeElement),
      false,
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await close.evaluate((node) => node === document.activeElement),
      true,
    );
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
    );
  }
  assert.equal(await topupButton.count(), 1);
  assert.equal(await withdrawalButton.count(), 1);
  assert.equal(
    await page
      .getByRole("link", { name: "Lịch sử giao dịch", exact: true })
      .count(),
    0,
  );
  const walletBanner = page.locator("header").filter({
    has: page.getByRole("heading", { name: "Ví của tôi", exact: true }),
  });
  async function expectAvailableBalance(amount) {
    await walletBanner.getByText("Số dư khả dụng", { exact: true }).waitFor();
    await walletBanner.getByText(
      new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(amount),
      { exact: true },
    ).waitFor();
  }
  await expectAvailableBalance(0);
  assert.equal(
    await walletBanner.getByRole("group", { name: "Thao tác ví", exact: true })
      .getByRole("button").count(),
    2,
  );
  assert.equal(
    await page.getByText("Đang giữ cho giao dịch", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("dialog").count(), 0);
  const previousOverflow = await page.evaluate(
    () => document.body.style.overflow,
  );
  const withdrawalWrites = [];
  const trackWithdrawalWrite = (request) => {
    if (request.method() === "POST" && request.url().includes("/api/v1/me/"))
      withdrawalWrites.push(request.url());
  };
  page.on("request", trackWithdrawalWrite);
  await withdrawalButton.click();
  await withdrawalDialog.waitFor();
  await settleDialog(withdrawalDialog);
  await withdrawalDialog.getByText(/50\.000/).waitFor();
  assert.equal(
    await withdrawalDialog
      .getByRole("button", { name: "Gửi yêu cầu rút", exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: path.join(evidence, "wallet-withdrawal-modal-desktop.png"),
    fullPage: true,
  });
  await withdrawalDialog.getByLabel("Số tiền rút (đồng)").fill("50000");
  await withdrawalDialog.getByLabel("Số tiền rút (đồng)").press("Enter");
  await checkDialogKeyboard(withdrawalDialog);
  await page.keyboard.press("Escape");
  await withdrawalDialog.waitFor({ state: "hidden" });
  assert.equal(
    await withdrawalButton.evaluate((node) => node === document.activeElement),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    previousOverflow,
  );
  assert.deepEqual(
    withdrawalWrites,
    [],
    "Withdrawal preview must not create a command",
  );
  page.off("request", trackWithdrawalWrite);
  await openTopup();
  await topupDialog.getByText(/5\.000.*10\.000\.000/).waitFor();
  await page.screenshot({
    path: path.join(evidence, "wallet-topup-modal-desktop.png"),
    fullPage: true,
  });
  await topupDialog.getByLabel("Số tiền nạp (đồng)").fill("75000");
  await checkDialogKeyboard(topupDialog);
  await page.keyboard.press("Escape");
  await topupDialog.waitFor({ state: "hidden" });
  assert.equal(
    await topupButton.evaluate((node) => node === document.activeElement),
    true,
  );
  assert.equal(
    await page.evaluate(() => document.body.style.overflow),
    previousOverflow,
  );
  await openTopup();
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").inputValue(),
    "75000",
  );
  await topupDialog.getByRole("button", { name: "Đóng popup" }).click();
  await topupDialog.waitFor({ state: "hidden" });
  assert.equal(
    await topupButton.evaluate((node) => node === document.activeElement),
    true,
  );
  await openTopup();
  await page.getByLabel("Số tiền nạp (đồng)").fill("4999");
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
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
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
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
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
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
      .getByRole("heading", { name: "Ví của tôi", exact: true })
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
      .getByRole("heading", { name: "Ví của tôi", exact: true })
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
  await openTopup();
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
    .waitFor();
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").inputValue(),
    "50000",
  );
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").isDisabled(),
    true,
  );
  await page.screenshot({
    path: path.join(evidence, "desktop-pending.png"),
    fullPage: true,
  });
  await topupDialog.getByRole("button", { name: "Đóng popup" }).click();
  await topupDialog.waitFor({ state: "hidden" });
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
  await expectAvailableBalance(50000);
  // A successful Return closes only the payment tab, preserves the wallet
  // session and automatically shows the confirmed credit without another login.
  await openTopup();
  await page.getByLabel("Số tiền nạp (đồng)").fill("40000");
  const happyPopupCreated = page.context().waitForEvent("page");
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
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
  await expectAvailableBalance(90000);
  // The settled payment has two query observers (result + owned checkout).
  // Wait for checkout release and its actual invalidations, not the page's
  // already-fired networkidle navigation event, before the pagination fixture.
  await page.waitForFunction(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    const cache = queryClient.getQueryCache();
    const owned = cache.findAll({ queryKey: ["wallet-checkout"] })
      .filter((query) => query.queryKey[2]);
    const reads = cache.getAll().filter((query) =>
      ["wallet-summary", "wallet-history", "wallet-checkout", "topup", "topups"].includes(query.queryKey[0]),
    );
    return owned.every((query) => query.getObserversCount() === 0) &&
      reads.every((query) => query.state.fetchStatus === "idle");
  });
  // Small real API pages exercise pagination and retries without fabricated rows.
  let failNextPage = true;
  let failRefundRead = true;
  await page.route("**/api/v1/me/wallet/history?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("cursor") && failNextPage) {
      failNextPage = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "UNAVAILABLE",
          message: "QA history unavailable",
        }),
      });
    }
    if (url.searchParams.get("type") === "OrderRefund" && failRefundRead) {
      failRefundRead = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "UNAVAILABLE",
          message: "QA history unavailable",
        }),
      });
    }
    url.searchParams.set("limit", "1");
    const response = await route.fetch({ url: url.toString() });
    const body = await response.json();
    historyReads.push({
      type: url.searchParams.get("type"),
      cursor: url.searchParams.has("cursor"),
      status: response.status(),
      items: body.items?.length,
      next: !!body.nextCursor,
    });
    await route.fulfill({ response });
  });
  await page
    .getByLabel("Loại giao dịch", { exact: true })
    .selectOption("Topup");
  await ledgerHistory.locator("li").first().waitFor();
  assert.equal(await ledgerHistory.locator("li").count(), 1);
  await ledgerHistory
    .getByRole("button", { name: "Xem thêm giao dịch", exact: true })
    .click();
  await ledgerHistory
    .getByRole("alert")
    .filter({ hasText: "Chưa tải được các giao dịch tiếp theo" })
    .waitFor();
  assert.equal(await ledgerHistory.locator("li").count(), 1);
  await ledgerHistory
    .getByRole("button", { name: "Thử tải thêm giao dịch", exact: true })
    .click();
  await ledgerHistory.locator("li").nth(1).waitFor();
  assert.equal(await ledgerHistory.locator("li").count(), 2);
  await page
    .getByLabel("Loại giao dịch", { exact: true })
    .selectOption("OrderPayment");
  await ledgerHistory
    .getByText("Chưa có giao dịch thuộc loại này.", { exact: true })
    .waitFor();
  await page
    .getByLabel("Loại giao dịch", { exact: true })
    .selectOption("OrderRefund");
  await ledgerHistory
    .getByRole("alert")
    .filter({ hasText: "Chưa tải được lịch sử giao dịch" })
    .waitFor();
  await ledgerHistory
    .getByRole("button", { name: "Thử lại lịch sử", exact: true })
    .click();
  await ledgerHistory
    .getByText("Chưa có giao dịch thuộc loại này.", { exact: true })
    .waitFor();
  await page
    .getByLabel("Loại giao dịch", { exact: true })
    .selectOption("Topup");
  await ledgerHistory.locator("li").nth(1).waitFor();
  const realHistory = await fixture.api(
    "/me/wallet/history?limit=20&type=Topup",
    fixture.member.accessToken,
  );
  assert.equal(realHistory.items.length, 2);
  for (const item of realHistory.items) {
    await ledgerHistory
      .getByText(new RegExp(item.balanceAfter.toLocaleString("vi-VN")))
      .first()
      .waitFor();
  }
  for (const width of [320, 390, 768, 1024, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "130%";
      window.scrollTo(0, 0);
    });
    assert.equal(await walletIcon.isVisible(), true);
    assert.equal(await chatIcon.isVisible(), true);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Wallet overflows ${width}px`,
    );
    for (const offset of [0, 500]) {
      await page.evaluate((y) => window.scrollTo(0, y), offset);
      await page.waitForFunction(
        (expected) =>
          document.querySelector("header").dataset.floating ===
          String(expected),
        offset > 48,
      );
      await header.evaluate(async (node) => {
        await Promise.all(
          node
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        );
      });
      const headerBounds = await header.boundingBox();
      for (const control of await header
        .locator("a:visible, button:visible")
        .all()) {
        const bounds = await control.boundingBox();
        assert.ok(
          bounds.x >= headerBounds.x - 1 &&
            bounds.x + bounds.width <= headerBounds.x + headerBounds.width + 1,
          `Navbar control exceeds header at ${width}px, scroll ${offset}`,
        );
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(
      () => document.querySelector("header").dataset.floating === "false",
    );
    await header.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    await page.screenshot({
      path: path.join(evidence, `wallet-history-nav-${width}.png`),
      fullPage: true,
    });
    if (width === 320 || width === 390) {
      for (const [trigger, dialog, name] of [
        [topupButton, topupDialog, "topup"],
        [withdrawalButton, withdrawalDialog, "withdrawal"],
      ]) {
        await trigger.click();
        await dialog.waitFor();
        await settleDialog(dialog);
        assert.equal(
          await dialog.evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            return (
              bounds.left >= 0 &&
              bounds.right <= innerWidth + 1 &&
              bounds.top >= 0 &&
              bounds.bottom <= innerHeight + 1 &&
              node.scrollWidth <= node.clientWidth + 1
            );
          }),
          true,
          `${name} dialog overflows ${width}px at 130% type`,
        );
        await checkDialogKeyboard(dialog);
        await page.screenshot({
          path: path.join(evidence, `wallet-${name}-modal-${width}.png`),
          fullPage: true,
        });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(
          await trigger.evaluate((node) => node === document.activeElement),
          true,
        );
      }
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
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
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: /^Tài khoản của .+$/, exact: true }).click();
  await page
    .getByRole("navigation", { name: "Tài khoản cá nhân", exact: true })
    .getByRole("link", { name: "Tổng quan", exact: true })
    .click();
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
  await page
    .getByRole("heading", { name: "Ví của tôi", exact: true })
    .waitFor();
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
  await openTopup();
  await page.getByLabel("Số tiền nạp (đồng)").fill("20000");
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
    .click();
  await page.getByText(/Chưa xác nhận được yêu cầu nạp/).waitFor();
  await topupDialog.getByRole("button", { name: "Đóng popup" }).click();
  await topupDialog.waitFor({ state: "hidden" });
  await openTopup();
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").inputValue(),
    "20000",
  );
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").isDisabled(),
    true,
  );
  const retryPopupCreated = page.context().waitForEvent("page");
  await page.getByRole("button", { name: "Thử lại yêu cầu nạp" }).click();
  const retryPopup = await retryPopupCreated;
  await retryPopup.waitForURL("https://sandbox.vnpayment.vn/**");
  assert.equal(new URL(page.url()).pathname, "/wallet");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
  await page.unroute("**/api/v1/me/topups/vnpay");

  // Keep Mongo's real server clock: accelerate only the disposable fixture's
  // persisted deadline after proving checkout originally grants exactly 5 min.
  // Browser timers remain real, so provider-window/reload behaviour uses the
  // server deadline rather than a client-only countdown or optimistic cancel.
  const timer = page.getByRole("timer", {
    name: "Thời gian thanh toán còn lại",
    exact: true,
  });
  const parseProviderDate = (value) => {
    assert.match(value, /^\d{14}$/);
    const parts = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    return Date.UTC(
      Number(parts[1]),
      Number(parts[2]) - 1,
      Number(parts[3]),
      Number(parts[4]) - 7,
      Number(parts[5]),
      Number(parts[6]),
    );
  };
  async function checkFiveMinuteCheckout(payment) {
    const query = new URL(payment.url()).searchParams;
    const topupId = query.get("vnp_TxnRef");
    assert.equal(
      parseProviderDate(query.get("vnp_ExpireDate")) -
        parseProviderDate(query.get("vnp_CreateDate")),
      5 * 60_000,
      "Signed provider checkout must expire exactly five minutes after creation",
    );
    const topup = await fixture.api(
      `/me/topups/${topupId}`,
      fixture.member.accessToken,
    );
    assert.equal(topup.state, "Pending");
    assert.equal(topup.credited, false);
    assert.equal(
      Date.parse(topup.expiresAt) - Date.parse(topup.createdAt),
      300_000,
    );
    assert.ok(Date.parse(topup.serverTime) < Date.parse(topup.expiresAt));
    await timer.waitFor();
    assert.match(await timer.textContent(), /^0[45]:\d{2}$/);
    return topup;
  }
  async function shortenDisposableDeadline(topupId) {
    // Uses the serverTime projection so local/browser clock skew is irrelevant.
    const before = await fixture.api(
      `/me/topups/${topupId}`,
      fixture.member.accessToken,
    );
    const expiresAt = new Date(Date.parse(before.serverTime) + 15_000);
    const changed = await fixture.db
      .collection("vnpay_payments")
      .updateOne({ _id: topupId }, { $set: { expiresAt } });
    assert.equal(changed.modifiedCount, 1);
    return expiresAt;
  }
  async function checkCancelledWithoutLedger(topupId) {
    await page
      .getByText("Đã hết 5 phút thanh toán. Bạn có thể tạo yêu cầu nạp mới.", {
        exact: true,
      })
      .waitFor({ timeout: 20_000 });
    await page.getByText(/Đã hủy ·/).waitFor();
    assert.equal(await timer.count(), 0);
    const topup = await fixture.api(
      `/me/topups/${topupId}`,
      fixture.member.accessToken,
    );
    assert.equal(topup.state, "Cancelled");
    assert.equal(topup.credited, false);
    assert.equal(topup.journalId, null);
    assert.equal(
      (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
      90_000,
    );
    const history = await fixture.api(
      "/me/wallet/history?limit=20",
      fixture.member.accessToken,
    );
    assert.equal(history.items.length, 2);
    assert.equal(
      history.items.some((item) => item.topupId === topupId),
      false,
    );
    assert.equal(
      await fixture.db
        .collection("ledger_journals")
        .countDocuments({ topupId }),
      0,
    );
    await openTopup();
    assert.equal(
      await topupDialog.getByLabel("Số tiền nạp (đồng)").isDisabled(),
      false,
    );
    await topupDialog
      .locator(`a[href="/wallet?topup=${topupId}"]`)
      .filter({ hasText: "Đã hủy" })
      .waitFor();
  }

  const retryTopup = await checkFiveMinuteCheckout(retryPopup);
  await openTopup();
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").isDisabled(),
    true,
  );
  await topupDialog.getByRole("button", { name: "Đóng popup" }).click();
  await shortenDisposableDeadline(retryTopup.id);
  await page.getByText(/Còn 00:1\d để thanh toán/).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "130%";
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
    "Payment countdown must fit mobile at 130% type",
  );
  await page.screenshot({
    path: path.join(evidence, "wallet-expiring-mobile.png"),
    fullPage: true,
  });
  // Selecting a historical successful request must not abandon the active
  // checkout, renew its deadline, or leave its form locked after expiry.
  await openTopup();
  await topupDialog.locator(`a[href="/wallet?topup=${happyId}"]`).click();
  await topupDialog.waitFor({ state: "hidden" });
  await page.getByText(/Đã nạp ví · 40/).waitFor();
  assert.equal(retryPopup.isClosed(), false);
  await openTopup();
  const cancelledRecent = topupDialog
    .locator(`a[href="/wallet?topup=${retryTopup.id}"]`)
    .filter({ hasText: "Đã hủy" });
  await cancelledRecent.waitFor({ timeout: 20_000 });
  assert.equal(new URL(page.url()).searchParams.get("topup"), happyId);
  assert.equal(
    await topupDialog.getByLabel("Số tiền nạp (đồng)").isDisabled(),
    false,
  );
  await cancelledRecent.click();
  await topupDialog.waitFor({ state: "hidden" });
  await checkCancelledWithoutLedger(retryTopup.id);
  // Chromium may refuse parent close() after the provider is isolated with
  // opener=null. Server cancellation still holds while its tab remains open.
  if (!retryPopup.isClosed()) await retryPopup.close();
  await page.screenshot({
    path: path.join(evidence, "wallet-cancelled-mobile.png"),
    fullPage: true,
  });

  // A fresh request after cancellation receives a new deadline. Reload keeps
  // the same intent/deadline; signing back in cannot renew an expired checkout.
  await topupDialog.getByLabel("Số tiền nạp (đồng)").fill("35000");
  const resumedPopupCreated = page.context().waitForEvent("page");
  await page
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
    .click();
  const resumedPopup = await resumedPopupCreated;
  await resumedPopup.waitForURL("https://sandbox.vnpayment.vn/**");
  const resumedTopup = await checkFiveMinuteCheckout(resumedPopup);
  assert.notEqual(resumedTopup.id, retryTopup.id);
  const resumedUrl = page.url();
  await resumedPopup.close();
  await page.reload();
  await page.getByLabel(/^Email/).fill(fixture.member.user.email);
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByText(/Chờ thanh toán · 35/).waitFor();
  assert.equal(page.url(), resumedUrl);
  assert.equal(
    (
      await fixture.api(
        `/me/topups/${resumedTopup.id}`,
        fixture.member.accessToken,
      )
    ).expiresAt,
    resumedTopup.expiresAt,
  );
  await shortenDisposableDeadline(resumedTopup.id);
  await checkCancelledWithoutLedger(resumedTopup.id);
  await page.screenshot({
    path: path.join(evidence, "wallet-cancelled-after-reload-mobile.png"),
    fullPage: true,
  });
  await topupDialog.getByRole("button", { name: "Đóng popup" }).click();

  // Expiring during a lost ACK must not let a same-key receipt replay reopen
  // its stale provider URL or silently turn the retry into a new payment.
  const expiredAckRequests = [];
  let expiredAckId;
  await page.route("**/api/v1/me/topups/vnpay", async (route) => {
    expiredAckRequests.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (expiredAckRequests.length === 1) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      expiredAckId = (await response.json()).entityId;
      await route.abort("failed");
    } else await route.continue();
  });
  const checkoutCountBeforeExpiredReplay = checkoutAmounts.size;
  await openTopup();
  await topupDialog.getByLabel("Số tiền nạp (đồng)").fill("45000");
  await topupDialog
    .getByRole("button", { name: "Tiếp tục thanh toán", exact: true })
    .click();
  await page.getByText(/Chưa xác nhận được yêu cầu nạp/).waitFor();
  const committedButUnacknowledged = await fixture.api(
    `/me/topups/${expiredAckId}`,
    fixture.member.accessToken,
  );
  await fixture.db
    .collection("vnpay_payments")
    .updateOne(
      { _id: expiredAckId },
      { $set: { expiresAt: new Date(committedButUnacknowledged.serverTime) } },
    );
  const expiredAckPopupCreated = page.context().waitForEvent("page");
  await topupDialog
    .getByRole("button", { name: "Thử lại yêu cầu nạp", exact: true })
    .click();
  const expiredAckPopup = await expiredAckPopupCreated;
  await checkCancelledWithoutLedger(expiredAckId);
  assert.equal(expiredAckPopup.isClosed(), true);
  assert.equal(checkoutAmounts.size, checkoutCountBeforeExpiredReplay);
  assert.equal(expiredAckRequests.length, 2);
  assert.deepEqual(expiredAckRequests[0], expiredAckRequests[1]);
  await page.unroute("**/api/v1/me/topups/vnpay");
  await topupDialog.getByRole("button", { name: "Đóng popup" }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: wallet banner shows server-confirmed balance and both actions, wallet action dialogs, withdrawal preview minimum with no command, keyboard focus/escape/close, preserved amounts, 320/390px dialogs at 130% type; icon wallet/chat navigation, account wallet entry, real history filters/pagination/retry; blocked provider tab creates no intent, provider has no opener, original tab stays signed in through Return, forged Return denied, QueryDR outage/retry/credit, lost-ACK modal-close same-key retry; signed checkout deadline exactly five minutes, live mobile countdown, server cancellation while provider tab stays open and an older request is selected, reload preserves server deadline, expired lost-ACK receipt cannot reopen provider, cancelled requests unlock new topup and produce no ledger/history entry; real API/Mongo with accelerated disposable fixture deadlines, fake provider navigation and signed QueryDR responses.",
  );
} catch (error) {
  await page
    ?.screenshot({
      path: path.join(evidence, "wallet-failure.png"),
      fullPage: true,
    })
    .catch(() => {});
  if (page && !page.isClosed()) {
    console.log("QA failure URL:", page.url());
    console.log(
      "QA payment WindowProxy state:",
      await page.evaluate(() =>
        window.__qaPaymentWindows?.map((payment) => {
          try {
            return { closed: payment.closed };
          } catch (error) {
            return { error: error.message };
          }
        }),
      ),
    );
    console.log(
      "QA failure visible wallet:",
      await page.locator("main, #account-content").allTextContents(),
    );
  }
  console.log("QA latest topup responses:", topupResponses.slice(-12));
  console.log("QA history page responses:", historyReads.slice(-16));
  console.log("QA browser warnings/errors/HMR:", browserMessages.slice(-16));
  if (fixture) {
    console.log(
      "QA persisted topup states:",
      await fixture.db
        .collection("topup_intents")
        .find(
          {},
          {
            projection: { _id: 1, state: 1, version: 1, updatedAt: 1 },
          },
        )
        .toArray(),
    );
  }
  throw error;
} finally {
  globalThis.fetch = realFetch;
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
