// Real merged Nest API, disposable QA DB; local fake storage, no production email.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
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
const origin = "http://127.0.0.1:5184";
process.env.VITE_API_BASE_URL = base;
process.env.AUTH_MAIL_PROVIDER = "local";
const evidence = path.join(root, ".impeccable/review/integration-main");
await mkdir(evidence, { recursive: true });
let fixture, server, browser;
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 1 });
  const admin = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const staff = await fixture.api("/auth/login", null, {
    email: "staff@operations.test",
    password,
  });
  const approve = async (id) => {
    const listing = await fixture.api(
      `/operations/listings/${id}`,
      staff.accessToken,
    );
    await fixture.api(
      `/operations/listings/${id}/decision`,
      staff.accessToken,
      {
        expectedVersion: listing.version,
        revisionId: listing.currentRevision.id,
        decision: "Approve",
        checklist: {
          catalogMatches: true,
          photosClear: true,
          conditionDisclosed: true,
          readable: true,
          pricingValid: true,
          contentAppropriate: true,
        },
      },
    );
  };
  const catalog = await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}`,
    admin.accessToken,
  );
  await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}/decision`,
    admin.accessToken,
    {
      expectedVersion: catalog.version,
      revisionId: catalog.currentRevision.id,
      decision: "Confirm",
    },
  );
  await approve(fixture.listings[0]);
  const memberListing = await fixture.api(
    `/me/listings/${fixture.listings[0]}`,
    fixture.member.accessToken,
  );
  const content = {
    ...memberListing.currentRevision.content,
    exchangeValue: 100000,
    mediaIds: [],
  };
  const draft = await fixture.api("/listings", admin.accessToken, { content });
  const media = await fixture.api(
    `/listings/${draft.entityId}/media`,
    admin.accessToken,
    {
      expectedVersion: draft.version,
      mimeType: "image/png",
      byteSize: fixture.photo.length,
      sha256: createHash("sha256").update(fixture.photo).digest("hex"),
    },
  );
  const ticket = await fixture.api(
    `/listings/${draft.entityId}/media/${media.entityId}/upload-ticket`,
    admin.accessToken,
  );
  await fixture.api(
    ticket.path,
    admin.accessToken,
    fixture.photo,
    "PUT",
    ticket.headers,
  );
  const uploaded = await fixture.api(
    `/me/listings/${draft.entityId}/media/${media.entityId}`,
    admin.accessToken,
  );
  await fixture.api(
    `/listings/${draft.entityId}/media/${media.entityId}/finalize`,
    admin.accessToken,
    { expectedVersion: uploaded.version },
  );
  await fixture.processMedia();
  const fresh = await fixture.api(
    `/me/listings/${draft.entityId}`,
    admin.accessToken,
  );
  const saved = await fixture.api(
    `/listings/${draft.entityId}/draft`,
    admin.accessToken,
    {
      expectedVersion: fresh.version,
      content: { ...content, mediaIds: [media.entityId] },
    },
    "PUT",
  );
  await fixture.api(`/listings/${draft.entityId}/submit`, admin.accessToken, {
    expectedVersion: saved.version,
    ownershipDeclared: true,
  });
  await approve(draft.entityId);
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5184, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  async function capture(page, name) {
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo({ top: 0, behavior: "instant" });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter(animation =>
        animation.effect?.getComputedTiming().iterations !== Infinity
      ).map(animation => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: path.join(evidence, name), fullPage: true });
  }
  async function login(page, email, returnPath) {
    await page.goto(
      `${origin}/login?returnUrl=${encodeURIComponent(returnPath)}`,
    );
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Mật khẩu/).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(origin + returnPath);
  }
  // The current entry is the shared conversation sheet. Both members need a
  // real saved receiving address before choosing books, as required by the API.
  for (const actor of [fixture.member, admin]) {
    const book = await fixture.api("/me/addresses", actor.accessToken);
    await fixture.api("/me/addresses", actor.accessToken, {
      expectedBookVersion: book.version,
      makeDefault: true,
      address: {
        recipientName: "QA exchange reader", phone: "0900123456",
        serviceAreaCode: "HCM-DEMO-v1", localityCode: "DEMO-A",
        detail: "QA exchange destination, simulated only",
      },
    });
  }
  await login(page, "member@operations.test", `/books/${draft.entityId}`);
  await page.getByRole("link", { name: "Gửi đề nghị đổi sách", exact: true }).click();
  await page.waitForURL(/\/chat\/[0-9a-f-]{36}$/);
  const conversationId = new URL(page.url()).pathname.split("/").at(-1);
  const chatPath = `/chat/${conversationId}`;
  const recipientContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const recipient = await recipientContext.newPage();
  await login(recipient, "admin@operations.test", chatPath);
  await recipient.getByRole("button", { name: "Chấp nhận hình thức", exact: true }).click();
  const offer = page.getByRole("region", { name: "Chọn sách đem đổi", exact: true });
  await offer.getByRole("checkbox").first().check();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await capture(page, "exchange-compose-desktop.png");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await capture(page, "exchange-compose-mobile.png");
  await page.setViewportSize({ width: 1366, height: 900 });

  // Delay passive room refresh while checking an unresolved command's own retry.
  // Mutations still use the real API, current auth/version checks and receipts.
  const room = await fixture.api(`/me/purchase-conversations/${conversationId}`, fixture.member.accessToken);
  const rooms = await fixture.api("/me/purchase-conversations", fixture.member.accessToken);
  let holdRefresh = true;
  await page.route("**/api/v1/me/purchase-conversations**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (holdRefresh && route.request().method() === "GET") {
      if (pathname === `/api/v1/me/purchase-conversations/${conversationId}`)
        return route.fulfill({ json: room });
      if (pathname === "/api/v1/me/purchase-conversations")
        return route.fulfill({ json: rooms });
    }
    return route.continue();
  });
  const intents = [];
  let drop = true;
  await page.route("**/api/v1/exchanges", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    intents.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    if (drop) {
      drop = false;
      await route.fulfill({ status: 503, json: { code: "Unavailable", message: "QA response loss" } });
    } else await route.fulfill({ response });
  });
  await offer.getByRole("button", { name: "Gửi đề nghị đổi sách", exact: true }).click();
  await offer.getByRole("alert").waitFor();
  assert.equal(await offer.getByRole("checkbox").first().isChecked(), true);
  assert.equal(await offer.getByRole("checkbox").first().isDisabled(), true);
  await offer.getByRole("button", { name: "Thử lại đề nghị trước", exact: true }).click();
  holdRefresh = false;
  await page.unroute("**/api/v1/me/purchase-conversations**");
  await page.getByRole("button", { name: "Hủy đề nghị", exact: true }).waitFor();
  assert.equal(intents.length, 2);
  assert.deepEqual(intents[0], intents[1]);
  const exchanges = await fixture.api("/exchanges", fixture.member.accessToken);
  assert.equal(exchanges.items.length, 1);
  const id = exchanges.items[0].id;
  const current = await fixture.api(`/me/purchase-conversations/${conversationId}`, fixture.member.accessToken);
  assert.equal(current.terms.activeExchangeId, id);
  // Re-enter through the inbox after the ambiguous result was resolved. The
  // conversation must display the server's one existing proposal.
  await page.getByRole("link", { name: "Về danh sách hội thoại", exact: true }).click();
  await page.locator(`a[href="${chatPath}"]`).first().click();
  await page.getByRole("button", { name: "Hủy đề nghị", exact: true }).waitFor();
  await capture(page, "exchange-proposal-desktop.png");
  await login(page, "member@operations.test", `/exchange/${id}`);
  await page.waitForURL(origin + chatPath);
  await page.getByRole("button", { name: "Hủy đề nghị", exact: true }).waitFor();
  // Keep the recipient's existing session; polling reflects the real proposal.
  await recipient
    .getByRole("button", { name: "Chấp nhận đề nghị", exact: true })
    .click();
  await recipient
    .getByRole("dialog")
    .getByRole("button", { name: "Đồng ý & Khóa giao dịch", exact: true })
    .click();
  await recipient
    .getByRole("button", { name: "Đặt cọc mô phỏng", exact: true })
    .waitFor();
  await capture(recipient, "exchange-funding-mobile.png");
  assert.ok(
    await recipient.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  // Exercise definite API rejection without falsely closing the dialog.
  await recipient
    .getByRole("button", { name: "Đặt cọc mô phỏng", exact: true })
    .click();
  await recipient
    .getByRole("dialog")
    .getByRole("button", { name: "Đặt cọc mô phỏng", exact: true })
    .click();
  await recipient.getByRole("dialog").getByRole("alert").waitFor();
  assert.equal(await recipient.getByRole("dialog").isVisible(), true);
  await recipient
    .getByRole("dialog")
    .getByRole("button", { name: "Hủy", exact: true })
    .click();
  await recipient
    .getByRole("button", { name: "Hủy đề nghị", exact: true })
    .click();
  const cancelled = recipient.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/v1/exchanges/${id}/cancel` &&
    response.request().method() === "POST" && response.ok(),
  );
  await recipient
    .getByRole("alertdialog")
    .getByRole("button", { name: "Hủy đề nghị", exact: true })
    .click();
  await cancelled;
  await recipient.getByText("Các đề nghị đổi sách trong cuộc trao đổi", { exact: true }).click();
  await recipient.getByRole("button", { name: /^Xem đề nghị lần 1/ }).click();
  await recipient.getByText("Đề nghị đã bị hủy.", { exact: true }).waitFor();
  const final = await fixture.api(
    `/exchanges/${id}`,
    fixture.member.accessToken,
  );
  assert.equal(final.status, "Cancelled");
  assert.ok(final.revision > 1);
  await page
    .getByRole("link", { name: "Về danh sách hội thoại", exact: true })
    .click();
  // Install the denial only after leaving the open detail. Its background
  // refresh must not remove the navigation link before this test clicks it.
  await page.locator(`a[href="${chatPath}"]`).first().waitFor();
  await page.route(`**/api/v1/exchanges/${id}`, (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ code: "Forbidden", message: "QA rejection" }),
    }),
  );
  await page
    .locator(`a[href="${chatPath}"]`)
    .first()
    .click();
  await page.getByText("Các đề nghị đổi sách trong cuộc trao đổi", { exact: true }).click();
  await page.getByRole("button", { name: /^Xem đề nghị lần 1/ }).click();
  await page
    .getByRole("heading", {
      name: "Đã có lỗi xảy ra khi tải dữ liệu",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByText("Đối tác trao đổi", { exact: true }).count(),
    0,
  );
  assert.equal(await page.getByRole("heading", { name: "Thông tin sách", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS exchange browser: real create/accept/cancel; lost ACK retains intent; funding rejection stays open; 403 hides data; desktop/mobile.",
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      await page.screenshot({
        path: path.join(
          evidence,
          `failure-${context === browser.contexts()[0] ? "desktop" : "mobile"}.png`,
        ),
        fullPage: true,
      });
      console.log(
        "QA dialog state",
        await page.locator("dialog").evaluateAll((nodes) =>
          nodes.map((node) => ({
            open: node.open,
            text: node.textContent.slice(0, 800),
          })),
        ),
      );
    }
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
