import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer as httpServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cartFixture, base, password } from "./qa-member-cart.mjs";
import { root } from "../apps/admin-web/tests/test-api.mjs";
const req = createRequire(
    new URL("../apps/admin-web/package.json", import.meta.url),
  ),
  webReq = createRequire(
    new URL("../apps/user-web/package.json", import.meta.url),
  );
const { chromium, expect } = req("playwright/test"),
  { createServer } = await import(pathToFileURL(webReq.resolve("vite")).href);
const webOrigin = "http://127.0.0.1:5194",
  rnOrigin = "http://127.0.0.1:8087",
  artifacts = path.join(root, ".tmp/member-cart-evidence");
const button = (p, name) => p.getByRole("button", { name, exact: true }),
  nav = (p, url) =>
    p.evaluate((url) => {
      history.pushState({}, "", url);
      dispatchEvent(new PopStateEvent("popstate"));
    }, url);
const openWebCart = async (p) => {
  await p.getByRole("button", { name: /^Tài khoản của/ }).click();
  await p.getByRole("link", { name: "Giỏ sách", exact: true }).first().click();
  await p.waitForURL(webOrigin + "/cart");
};
let f, vite, staticServer, browser;
const errors = [];
try {
  await mkdir(artifacts, { recursive: true });
  f = await cartFixture(webOrigin + "," + rnOrigin);
  process.env.VITE_API_BASE_URL = base;
  process.chdir(path.join(root, "apps/user-web"));
  vite = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5194, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  const dist = path.join(root, "apps/mobile-react-native/dist");
  staticServer = httpServer(async (req, res) => {
    try {
      let file = path.resolve(
        dist,
        "." + decodeURIComponent(new URL(req.url, rnOrigin).pathname),
      );
      if (file !== dist && !file.startsWith(dist + path.sep))
        return res.writeHead(403).end();
      file =
        file === dist
          ? path.join(dist, "index.html")
          : !path.extname(file)
            ? file + ".html"
            : file;
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
      };
      res
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] ?? "application/octet-stream",
        })
        .end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => staticServer.listen(8087, "127.0.0.1", r));
  browser = await chromium.launch({ headless: true });
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.setDefaultTimeout(12000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(webOrigin + "/login");
  await p.getByLabel(/^Email/).fill("admin@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
  await p.getByRole("button", { name: /^Tài khoản của/ }).click();
  await p.getByRole("link", { name: "Giỏ sách", exact: true }).first().click();
  await p
    .getByRole("heading", { name: "Giỏ sách đang trống", exact: true })
    .waitFor();
  const [id, second] = f.listings,
    owner = f.buyer.user.id,
    token = f.buyer.accessToken;
  await nav(p, "/books/" + id);
  await button(p, "Thêm vào giỏ sách").waitFor();
  const adds = [];
  let lost = true;
  await p.route("**/me/cart/add", async (route) => {
    const request = route.request();
    adds.push({
      key: request.headers()["idempotency-key"],
      body: request.postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (lost) {
      lost = false;
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "QA lost ACK" },
      });
    }
    return route.fulfill({ response });
  });
  await button(p, "Thêm vào giỏ sách").click();
  await button(p, "Xác minh thao tác giỏ trước").waitFor();
  await openWebCart(p);
  await expect(
    p.getByRole("link", { name: "Mua bài đăng này", exact: true }),
  ).toHaveCount(0);
  await button(p, "Xác minh thao tác giỏ trước").click();
  await p
    .getByRole("link", { name: "Mua bài đăng này", exact: true })
    .waitFor();
  assert.equal(adds.length, 2);
  assert.equal(adds[0].key, adds[1].key);
  assert.equal(
    adds[0].body === adds[1].body,
    true,
    "Exact original add intent",
  );
  await p.unroute("**/me/cart/add");
  assert.equal(
    await f.db
      .collection("exclusive_commitments")
      .countDocuments({ listingId: id }),
    0,
  );
  assert.equal(
    await f.db.collection("direct_orders").countDocuments({ buyerId: owner }),
    0,
  );
  await nav(p, "/books/" + second);
  await button(p, "Thêm vào giỏ sách").click();
  await p
    .getByText("Đã cập nhật giỏ sách. Sách chưa được giữ chỗ.", { exact: true })
    .waitFor();
  await openWebCart(p);
  await p.getByText("2/50 bài đăng trong giỏ.", { exact: false }).waitFor();
  // Current price is read again, while original add price remains informational.
  const l = await f.api(`/me/listings/${id}`, f.seller.accessToken);
  await f.api(`/listings/${id}/revision`, f.seller.accessToken, {
    expectedVersion: l.version,
    ownershipDeclared: true,
    content: { ...l.currentRevision.content, salePrice: 140000 },
  });
  await f.approve(id);
  await button(p, "Cập nhật giỏ sách").click();
  await expect(p.getByText(/Chưa tải được giỏ/)).toHaveCount(0);
  await p
    .getByText(/Giá đã thay đổi; kiểm tra giá mới trước khi mua/)
    .waitFor();
  await p.route("**/me/cart", (route) =>
    route.fulfill({
      status: 503,
      json: { code: "UNAVAILABLE", message: "QA read error" },
    }),
  );
  await button(p, "Cập nhật giỏ sách").click();
  await p.getByText(/Chưa tải được giỏ/).waitFor();
  await expect(
    p.getByRole("heading", { name: "Giỏ sách đang trống", exact: true }),
  ).toHaveCount(0);
  await expect(
    p.getByRole("link", { name: "Mua bài đăng này", exact: true }),
  ).toHaveCount(0);
  await p.unroute("**/me/cart");
  await button(p, "Cập nhật giỏ sách").click();
  await expect(p.getByRole("alert")).toHaveCount(0);
  for (const width of [1440, 390, 320]) {
    await p.setViewportSize({ width, height: 1000 });
    if (width === 320)
      await p.addStyleTag({ content: ":root {font-size:130%}" });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await p.screenshot({
      path: path.join(artifacts, `web-${width}.png`),
      fullPage: true,
    });
  }
  // Select one of two rows. Reuse the actual single-listing quote/create journey.
  await p.setViewportSize({ width: 1440, height: 1000 });
  const creates = [];
  p.on("response", async (response) => {
    if (
      response.url().endsWith("/orders/buy-now") &&
      response.request().method() === "POST" &&
      response.status() === 200
    )
      creates.push(await response.json());
  });
  await p
    .locator("li")
    .filter({ has: p.locator(`a[href="/books/${id}"]`) })
    .getByRole("link", { name: "Mua bài đăng này", exact: true })
    .click();
  await p.getByRole("dialog").waitFor();
  await button(p, "Xem tổng thanh toán").click();
  await button(p, "Đặt mua và đến thanh toán").click();
  await expect.poll(() => creates.length).toBe(1);
  const webOrder = await f.api("/me/orders/" + creates[0].entityId, token);
  assert.equal(webOrder.item.listingId, id);
  assert.equal((await f.api("/me/cart", token)).items.length, 2);
  await f.api(`/orders/${webOrder.id}/cancel`, token, {
    expectedVersion: webOrder.version,
  });
  // RN-web uses the same cart persisted by the real API, independently signed in.
  const rn = await browser.newPage({ viewport: { width: 390, height: 1000 } });
  rn.setDefaultTimeout(12000);
  rn.on("pageerror", (e) => errors.push(e.message));
  await rn.goto(rnOrigin + "/account");
  await rn
    .getByLabel("Email", { exact: true })
    .last()
    .fill("admin@operations.test");
  await rn.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await button(rn, "Đăng nhập").click();
  await button(rn, "Giỏ sách").click();
  await rn.getByText(/2\/50 bài đăng trong giỏ/).waitFor();
  const removes = [];
  let removalHandlers = 0;
  let dropRemove = true;
  await rn.route("**/me/cart/remove", async (route) => {
    removalHandlers++;
    try {
      removes.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      if (dropRemove) {
        dropRemove = false;
        return await route.fulfill({
          // Chromium may automatically retry HTTP408 on a reused connection.
          // Use a JS-visible 503 for UI intent recovery; helper unit tests cover408.
          status: 503,
          json: { code: "UNAVAILABLE", message: "QA lost remove ACK" },
        });
      }
      return await route.fulfill({ response });
    } catch (error) {
      errors.push("QA remove interception failed: " + error.name);
      await route.abort().catch(() => {});
    } finally {
      removalHandlers--;
    }
  });
  await button(rn, "Xóa khỏi giỏ").first().click();
  await button(rn, "Xác minh thao tác giỏ trước").waitFor();
  await expect(button(rn, "Xác minh thao tác giỏ trước")).toBeEnabled();
  await button(rn, "Về Tài khoản").click();
  await button(rn, "Giỏ sách").click();
  await button(rn, "Xác minh thao tác giỏ trước").click();
  await expect(button(rn, "Xác minh thao tác giỏ trước")).toHaveCount(0);
  assert.equal(removes.length, 2);
  assert.equal(removes[0].key, removes[1].key);
  assert.equal(removes[0].body === removes[1].body, true);
  await expect.poll(() => removalHandlers).toBe(0);
  await rn.unroute("**/me/cart/remove");
  await rn.getByText(/1\/50 bài đăng trong giỏ/).waitFor();
  for (const width of [390, 320]) {
    await rn.setViewportSize({ width, height: 1000 });
    assert.equal(
      await rn.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await rn.screenshot({
      path: path.join(artifacts, `rn-web-${width}.png`),
      fullPage: true,
    });
    await button(rn, "Mua bài đăng này").scrollIntoViewIfNeeded();
    await rn.screenshot({
      path: path.join(artifacts, `rn-web-${width}-actions.png`),
    });
  }
  const rnCreates = [];
  rn.on("response", async (response) => {
    if (
      response.url().endsWith("/orders/buy-now") &&
      response.request().method() === "POST" &&
      response.status() === 200
    )
      rnCreates.push(await response.json());
  });
  await button(rn, "Mua bài đăng này").click();
  await button(rn, "Xác nhận đặt mua").click();
  await expect.poll(() => rnCreates.length).toBe(1);
  const rnOrder = await f.api("/me/orders/" + rnCreates[0].entityId, token);
  assert.equal(rnOrder.item.listingId, second);
  await f.api(`/orders/${rnOrder.id}/cancel`, token, {
    expectedVersion: rnOrder.version,
  });
  assert.equal(
    await f.db.collection("direct_orders").countDocuments({ buyerId: owner }),
    2,
  );
  assert.equal(
    await f.db
      .collection("exclusive_commitments")
      .countDocuments({ listingId: { $in: [id, second] }, status: "Active" }),
    0,
  );
  assert.equal(errors.length, 0, "No page errors: " + errors.join("; "));
  console.log(
    "PASS: Member cart web/RN-web from real entry, persisted parity, add/remove lost ACK+Back/remount exact intent, current price/error recovery, quantity1/two rows→single chosen Order each client, no cart reservation, responsive320px. API/Mongo real, storage fake; native NOT RUN.",
  );
} catch (error) {
  if (browser)
    for (const [i, p] of browser
      .contexts()
      .flatMap((c) => c.pages())
      .entries())
      await p
        .screenshot({
          path: path.join(artifacts, `failure-${i}.png`),
          fullPage: true,
        })
        .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  if (staticServer) await new Promise((r) => staticServer.close(r));
  await f?.close();
}
