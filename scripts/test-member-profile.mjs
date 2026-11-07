// Real Nest/Mongo/Sharp with explicitly fake private storage and local encrypted
// mail. HTTP faults drop committed responses; no paid provider or main database.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer as httpServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
const req = createRequire(
    new URL("../apps/admin-web/package.json", import.meta.url),
  ),
  webReq = createRequire(
    new URL("../apps/user-web/package.json", import.meta.url),
  );
const { chromium } = req("playwright"),
  { createServer } = await import(pathToFileURL(webReq.resolve("vite")).href);
const webOrigin = "http://127.0.0.1:5194",
  rnOrigin = "http://127.0.0.1:8087",
  evidence = path.join(root, ".tmp/member-profile-evidence");
Object.assign(process.env, {
  VITE_API_BASE_URL: base,
  AUTH_MAIL_PROVIDER: "local",
  AUTH_MAIL_ENCRYPTION_KEY: "member-profile-browser-only-key-000000000",
  AUTH_WEB_ORIGIN: webOrigin,
});
let fixture, vite, staticServer, browser;
const errors = [];
const qaTargetAllowed=()=>{
  try{const u=new URL(process.env.MONGO_TEST_URL??'');return u.protocol==='mongodb:'&&['127.0.0.1','localhost'].includes(u.hostname)&&u.port===(process.env.TEST_MONGO_PORT??'57017')&&u.searchParams.get('replicaSet')==='rs-test';}
  catch{return false;}
};
assert.ok(qaTargetAllowed(),'Use only the dedicated loopback rs-test QA replica set.');
const button = (p, name) => p.getByRole("button", { name, exact: true });
const reopenWebProfile = async (p) => {
  const heading = p.getByRole("heading", { name: "Hồ sơ & Bảo mật", exact: true });
  await p.getByRole("link", { name: "Tổng quan", exact: true }).first().click();
  await p.waitForURL(webOrigin + "/account");
  // Lazy route transitions can still expose the previous screen's sidebar.
  // Prove the editor unmounted before following its persistent navigation back.
  await heading.waitFor({ state: "hidden" });
  await p.getByRole("link", { name: "Hồ sơ & bảo mật", exact: true }).first().click();
  await p.waitForURL(webOrigin + "/profile");
  await heading.waitFor();
};
try {
  await mkdir(evidence, { recursive: true });
  fixture = await createTestApi({
    corsOrigin: webOrigin + "," + rnOrigin,
    listingCount: 0,
  });
  let readToken = fixture.member.accessToken;
  process.chdir(path.join(root, "apps/user-web"));
  vite = await createServer({
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 5194, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  const dist = path.join(root, "apps/mobile-react-native/dist");
  staticServer = httpServer(async (request, response) => {
    try {
      const url = new URL(request.url, rnOrigin);
      let file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
      if (file !== dist && !file.startsWith(dist + path.sep))
        return response.writeHead(403).end();
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
        ".ttf": "font/ttf",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
      };
      response
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] ?? "application/octet-stream",
        })
        .end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    staticServer.once("error", reject);
    staticServer.listen(8087, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(webOrigin + "/login");
  await p.getByLabel(/^Email/).fill("member@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
  await p.getByRole("button", { name: /^Tài khoản của/ }).click();
  await p
    .getByRole("link", { name: "Hồ sơ & bảo mật", exact: true })
    .first()
    .click();
  await p
    .getByRole("heading", { name: "Hồ sơ & Bảo mật", exact: true })
    .waitFor();
  await p
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Người đọc hồ sơ QA");
  await p.getByLabel(/Số điện thoại liên hệ/).fill("+84 900 000 001");
  await button(p, "Lưu thay đổi").click();
  await p.getByRole("status").filter({ hasText: "Đã lưu hồ sơ thành công." }).waitFor();
  const saved = await fixture.api("/me/profile", readToken);
  assert.equal(saved.displayName, "Người đọc hồ sơ QA");
  assert.equal(saved.contactPhone, "+84 900 000 001");
  // Four explicit photo replacements must retire staged assets, not exhaust quota.
  for (let photo = 0; photo < 4; photo++) {
    const uploaded = p.waitForResponse(
      (response) =>
        response.url().endsWith("/content") &&
        response.request().method() === "PUT" &&
        response.status() === 200,
    );
    await p
      .locator("input[type=file]")
      .setInputFiles({
        name: "avatar.png",
        mimeType: "image/png",
        buffer: fixture.photo,
      });
    await uploaded;
    await p
      .getByText("Ảnh đã tải. Chọn Lưu hồ sơ để dùng ảnh này.", { exact: true })
      .waitFor();
    await button(p, "Lưu thay đổi").waitFor();
  }
  assert.equal(
    await fixture.db
      .collection("profile_avatars")
      .countDocuments({ ownerId: fixture.member.user.id, state: "Ready" }),
    1,
  );
  assert.equal(
    await fixture.db
      .collection("profile_avatars")
      .countDocuments({ ownerId: fixture.member.user.id, state: "Retired" }),
    3,
  );
  await button(p, "Lưu thay đổi").click();
  await p.getByRole("status").filter({ hasText: "Đã lưu hồ sơ thành công." }).waitFor();
  const pictured = await fixture.api("/me/profile", readToken);
  assert.ok(pictured.avatarId);
  const calls = [];
  let drop = true;
  await p.route("**/api/v1/me/profile", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (drop) {
      drop = false;
      await route.fetch();
      return route.abort("connectionreset");
    }
    return route.continue();
  });
  await p
    .getByLabel("Tên hiển thị", { exact: true })
    .fill("Tên sau mất phản hồi QA");
  await button(p, "Lưu thay đổi").click();
  await button(p, "Xác minh lần lưu trước").waitFor();
  await reopenWebProfile(p);
  await button(p, "Xác minh lần lưu trước").click();
  await p.getByRole("status").filter({ hasText: "Đã lưu hồ sơ thành công." }).waitFor();
  assert.ok(
    calls.length === 2 &&
      calls[0].key === calls[1].key &&
      calls[0].body === calls[1].body,
    "Retry must preserve original intent",
  );
  await p.unroute("**/api/v1/me/profile");
  // Wrong current password is editable without replacing the business intent.
  const newEmail = "profile-updated@operations.test";
  await p.getByLabel("Email mới", { exact: true }).fill(newEmail);
  await p
    .getByLabel("Mật khẩu hiện tại", { exact: true })
    .fill("wrong-password-42");
  await button(p, "Gửi mã xác nhận").click();
  await p.getByText("Mật khẩu hiện tại chưa đúng.", { exact: true }).waitFor();
  await reopenWebProfile(p);
  assert.equal(
    await p.getByLabel("Mật khẩu hiện tại", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await p.getByLabel("Email mới", { exact: true }).inputValue(),
    newEmail,
  );
  await p.getByLabel("Mật khẩu hiện tại", { exact: true }).fill(password);
  await button(p, "Xác minh yêu cầu gửi mã").click();
  await p.getByLabel("Mã xác nhận", { exact: true }).waitFor();
  const pending = await fixture.api("/me/profile", readToken);
  assert.ok(pending.pendingEmailChange);
  const mail = await fixture.readAccountMail(pending.pendingEmailChange.id);
  assert.ok(mail?.code);
  await p.getByLabel("Mã xác nhận", { exact: true }).fill(mail.code);
  await button(p, "Xác minh & Đổi email").click();
  await p
    .getByRole("status")
    .filter({ hasText: "Đã xác minh và đổi email đăng nhập." })
    .waitFor();
  await assert.rejects(fixture.api("/me/profile", readToken), /HTTP 401/);
  readToken = (
    await fixture.api("/auth/login", null, { email: newEmail, password })
  ).accessToken;
  assert.equal((await fixture.api("/me/profile", readToken)).email, newEmail);
  for (const width of [1440, 768, 390, 320]) {
    await p.setViewportSize({ width, height: 1000 });
    await p.evaluate(() => {
      document.documentElement.style.fontSize = "130%";
      window.scrollTo(0, 0);
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Profile overflow ${width}`,
    );
    await p.screenshot({
      path: path.join(evidence, `web-${width}-130.png`),
      fullPage: true,
    });
  }
  // RN Expo web is a separate consumer and logs in with the changed email.
  await fixture.db.collection("login_attempts").deleteMany({});
  const rn = await browser.newPage({ viewport: { width: 390, height: 900 } });
  rn.setDefaultTimeout(15000);
  rn.on("pageerror", (e) => errors.push(e.message));
  await rn.goto(rnOrigin + "/account");
  await rn.getByLabel("Email", { exact: true }).last().fill(newEmail);
  await rn.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await button(rn, "Đăng nhập").click();
  await button(rn, "Sửa hồ sơ và email").click();
  await rn
    .getByRole("heading", { name: "Hồ sơ của tôi", exact: true })
    .waitFor();
  await rn.getByLabel(/^Tên hiển thị/).fill("Người đọc từ RN QA");
  await button(rn, "Lưu hồ sơ").click();
  await rn.getByText("Đã lưu hồ sơ.", { exact: true }).waitFor();
  assert.equal(
    (await fixture.api("/me/profile", readToken)).displayName,
    "Người đọc từ RN QA",
  );
  await rn.getByLabel(/^Tên hiển thị/).fill("Bản chưa lưu QA");
  await button(rn, "Về tài khoản").click();
  await rn.getByText("Rời hồ sơ chưa lưu?", { exact: true }).waitFor();
  await button(rn, "Quay lại").click();
  assert.equal(
    await rn.getByLabel(/^Tên hiển thị/).inputValue(),
    "Bản chưa lưu QA",
  );
  await button(rn, "Khôi phục bản đang xem").click();
  const rnCalls = [];
  let rnDrop = true;
  await rn.route("**/api/v1/me/profile", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    rnCalls.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    if (rnDrop) {
      rnDrop = false;
      await route.fetch();
      return route.fulfill({
        status: 408,
        json: { code: "HTTP_ERROR", message: "QA uncertain timeout" },
      });
    }
    return route.continue();
  });
  await rn.getByLabel(/^Tên hiển thị/).fill("RN giữ ý định khi timeout QA");
  await button(rn, "Lưu hồ sơ").click();
  await button(rn, "Xác minh lần lưu trước").waitFor();
  await button(rn, "Về tài khoản").click();
  await button(rn, "Sửa hồ sơ và email").click();
  await button(rn, "Xác minh lần lưu trước").click();
  await rn.getByText("Đã lưu hồ sơ.", { exact: true }).waitFor();
  assert.ok(
    rnCalls.length === 2 &&
      rnCalls[0].key === rnCalls[1].key &&
      rnCalls[0].body === rnCalls[1].body,
    "RN timeout retry changed pinned intent",
  );
  await rn.unroute("**/api/v1/me/profile");
  const rnEmail = "profile-rn-verified@operations.test";
  // The independent RN request starts after a simulated 61s QA cooldown. The
  // production 60s refusal is asserted in member-profile.e2e-spec.ts.
  await fixture.db
    .collection("member_email_changes")
    .updateMany(
      { userId: fixture.member.user.id, state: "Verified" },
      { $set: { createdAt: new Date(Date.now() - 61_000) } },
    );
  await rn.getByLabel("Email mới", { exact: true }).fill(rnEmail);
  await rn
    .getByLabel("Mật khẩu hiện tại", { exact: true })
    .fill("wrong-password-42");
  await button(rn, "Gửi mã đến email mới").click();
  await rn.getByText("Mật khẩu hiện tại chưa đúng.", { exact: true }).waitFor();
  await button(rn, "Về tài khoản").click();
  await rn.waitForURL(rnOrigin + "/account");
  await rn.getByRole("heading", { name: "Hồ sơ của tôi", exact: true }).waitFor({ state: "hidden" });
  await button(rn, "Sửa hồ sơ và email").click();
  await rn.waitForURL(rnOrigin + "/profile");
  await rn.getByRole("heading", { name: "Hồ sơ của tôi", exact: true }).waitFor();
  assert.equal(
    await rn.getByLabel("Mật khẩu hiện tại", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await rn.getByLabel("Email mới", { exact: true }).inputValue(),
    rnEmail,
  );
  await rn.getByLabel("Mật khẩu hiện tại", { exact: true }).fill(password);
  await button(rn, "Xác minh yêu cầu gửi mã").click();
  await rn.getByLabel("Mã xác nhận", { exact: true }).waitFor();
  const rnPending = await fixture.api("/me/profile", readToken),
    rnMail = await fixture.readAccountMail(rnPending.pendingEmailChange.id);
  assert.ok(rnMail?.code);
  await rn.getByLabel("Mã xác nhận", { exact: true }).fill(rnMail.code);
  await button(rn, "Xác minh và đổi email").click();
  await rn
    .getByText(
      "Đã xác minh và đổi email. Các phiên đăng nhập khác đã được thu hồi.",
      { exact: true },
    )
    .waitFor();
  await assert.rejects(fixture.api("/me/profile", readToken), /HTTP 401/);
  readToken = (
    await fixture.api("/auth/login", null, { email: rnEmail, password })
  ).accessToken;
  assert.equal((await fixture.api("/me/profile", readToken)).email, rnEmail);
  for (const width of [390, 320]) {
    await rn.setViewportSize({ width, height: 1000 });
    await rn.getByLabel(/^Tên hiển thị/).scrollIntoViewIfNeeded();
    assert.ok(
      await rn.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await rn.screenshot({
      path: path.join(evidence, `rn-web-${width}.png`),
      fullPage: true,
    });
    await button(rn, "Gửi mã đến email mới").scrollIntoViewIfNeeded();
    await rn.screenshot({
      path: path.join(evidence, `rn-web-${width}-email.png`),
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Member profile web/RN-web real API/Mongo, image attach, lost ACK/navigation, current-password retry, verified email, responsive and Back. Storage/mail fake; native NOT RUN.",
  );
} catch (error) {
  if (browser)
    for (const [index, page] of browser
      .contexts()
      .flatMap((c) => c.pages())
      .entries())
      await page
        .screenshot({
          path: path.join(evidence, `failure-${index}.png`),
          fullPage: true,
        })
        .catch(() => {});
  if (errors.length) console.error("Page errors:", errors);
  throw error;
} finally {
  await browser?.close();
  (await staticServer) && new Promise((resolve) => staticServer.close(resolve));
  await vite?.close();
  await fixture?.close();
}
