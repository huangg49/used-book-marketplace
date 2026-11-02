// Real Member web + HTTP/Mongo QA; no main DB or live providers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";

const qa = new URL(process.env.MONGO_TEST_URL ?? "");
assert(
  qa.protocol === "mongodb:" &&
    qa.hostname === "127.0.0.1" &&
    qa.port === "57017" &&
    // CI connects through admin; createTestApi generates its own random *_test DB.
    (qa.pathname.endsWith("_test") || qa.pathname === "/admin") &&
    qa.searchParams.get("replicaSet") === "rs-test",
  "Dedicated QA replica set required; fixture creates a random *_test database.",
);
Object.assign(process.env, {
  AUTH_MAIL_PROVIDER: "local",
  VITE_API_BASE_URL: base,
  PAYMENT_SIMULATOR_SECRET: crypto.randomUUID() + crypto.randomUUID(),
});
const out = path.join(root, ".tmp/exchange-evidence");
await mkdir(out, { recursive: true });
const result = {
  storage: "fake",
  mail: "local",
  native: "NOT RUN",
  checks: [],
};
let fixture, vite, browser, adminVite, rnServer;
const evidenceObjects = new Map();
const evidenceStorage = {
  async check() {},
  async put(key, bytes) {
    const old = evidenceObjects.get(key);
    assert(
      !old ||
        createHash("sha256").update(old).digest("hex") ===
          createHash("sha256").update(bytes).digest("hex"),
    );
    evidenceObjects.set(key, Buffer.from(bytes));
  },
  async attachment(key) {
    assert(evidenceObjects.has(key));
    return {
      url: "https://storage.invalid/qa-attachment",
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    };
  },
};
const save = () =>
  writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2));
try {
  fixture = await createTestApi({
    corsOrigin:
      "http://127.0.0.1:5194,http://127.0.0.1:5195,http://127.0.0.1:8087",
    listingCount: 3,
    evidenceStorageAdapter: evidenceStorage,
  });
  const api = fixture.api,
    b = fixture.member;
  const req = createRequire(path.join(root, "apps/user-web/package.json"));
  const { chromium } = createRequire(
    path.join(root, "apps/admin-web/package.json"),
  )("playwright");
  const { createServer } = await import(
    pathToFileURL(req.resolve("vite")).href
  );
  vite = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5194, strictPort: true },
    logLevel: "error",
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true });

  const spa = (page, url) =>
    page.evaluate((url) => {
      history.pushState({}, "", url);
      dispatchEvent(new PopStateEvent("popstate"));
    }, url);
  const web = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  web.setDefaultTimeout(12000);
  await web.goto(
    "http://127.0.0.1:5194/login?returnUrl=" + encodeURIComponent("/account"),
  );
  const initialLogin = web.waitForResponse(
    (r) => r.url().endsWith("/auth/login") && r.request().method() === "POST",
  );
  await web.getByLabel(/^Email/).fill("admin@operations.test");
  await web.getByLabel(/^Mật khẩu/).fill(password);
  await web.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const initialAuth = await initialLogin;
  assert.equal(initialAuth.status(), 200);
  const a = await initialAuth.json();
  await web.waitForURL("**/account");
  const staff = await api("/auth/login", null, {
    email: "staff@operations.test",
    password,
  });
  const cat = await api(
    "/operations/catalog-requests/" + fixture.catalogId,
    a.accessToken,
  );
  await api(
    "/operations/catalog-requests/" + fixture.catalogId + "/decision",
    a.accessToken,
    {
      expectedVersion: cat.version,
      revisionId: cat.currentRevision.id,
      decision: "Confirm",
    },
  );
  const approve = async (id) => {
    const listing = await api("/operations/listings/" + id, staff.accessToken);
    await api("/operations/listings/" + id + "/decision", staff.accessToken, {
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
    });
  };
  for (const id of fixture.listings) await approve(id);
  const template = await api(
    "/me/listings/" + fixture.listings[0],
    b.accessToken,
  );
  const own = async (value) => {
    const content = {
      ...template.currentRevision.content,
      exchangeValue: value,
      mediaIds: [],
    };
    const draft = await api("/listings", a.accessToken, { content });
    const media = await api(
      "/listings/" + draft.entityId + "/media",
      a.accessToken,
      {
        expectedVersion: draft.version,
        mimeType: "image/png",
        byteSize: fixture.photo.length,
        sha256: createHash("sha256").update(fixture.photo).digest("hex"),
      },
    );
    const ticket = await api(
      "/listings/" +
        draft.entityId +
        "/media/" +
        media.entityId +
        "/upload-ticket",
      a.accessToken,
    );
    await api(ticket.path, a.accessToken, fixture.photo, "PUT", ticket.headers);
    const uploaded = await api(
      "/me/listings/" + draft.entityId + "/media/" + media.entityId,
      a.accessToken,
    );
    await api(
      "/listings/" + draft.entityId + "/media/" + media.entityId + "/finalize",
      a.accessToken,
      { expectedVersion: uploaded.version },
    );
    await fixture.processMedia();
    const fresh = await api("/me/listings/" + draft.entityId, a.accessToken);
    const saved = await api(
      "/listings/" + draft.entityId + "/draft",
      a.accessToken,
      {
        expectedVersion: fresh.version,
        content: { ...content, mediaIds: [media.entityId] },
      },
      "PUT",
    );
    await api("/listings/" + draft.entityId + "/submit", a.accessToken, {
      expectedVersion: saved.version,
      ownershipDeclared: true,
    });
    await approve(draft.entityId);
    return draft.entityId;
  };

  const al = await own(100000),
    bl = fixture.listings[0];
  const addresses = await api("/me/addresses", a.accessToken);
  const adr = await api("/me/addresses", a.accessToken, {
    expectedBookVersion: addresses.version,
    makeDefault: true,
    address: {
      recipientName: "QA evidence",
      phone: "0900000000",
      detail: "Địa chỉ mô phỏng QA",
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: "DEMO-A",
    },
  });
  const book = await api("/listings/" + bl, a.accessToken);
  const started = await api(
    "/listings/" + bl + "/purchase-conversations",
    a.accessToken,
    { expectedVersion: book.version, intent: "Exchange" },
  );
  let room = await api(
    "/me/purchase-conversations/" + started.entityId,
    a.accessToken,
  );
  if (room.terms.pendingProposal) {
    await api(
      "/me/purchase-conversations/" + room.id + "/terms/respond",
      b.accessToken,
      {
        expectedVersion: room.version,
        proposalId: room.terms.pendingProposal.id,
        accept: true,
      },
    );
    room = await api("/me/purchase-conversations/" + room.id, a.accessToken);
  }
  const ex = await api("/exchanges", a.accessToken, {
    conversationId: room.id,
    expectedConversationVersion: room.version,
    initiatorListingIds: [al],
    recipientListingId: bl,
    deliveryAddressId: adr.addressId,
  });
  const id = ex.id;
  // Explicit fixture state only: not proof of real pickup/delivery/funding acceptance.
  await fixture.db
    .collection("exchanges")
    .updateOne(
      { _id: id },
      {
        $set: {
          status: "InTransit",
          initiatorShippedAt: new Date(),
          recipientShippedAt: new Date(),
        },
      },
    );
  await spa(web, "/chat/" + room.id);
  await web
    .getByRole("button", { name: "Báo sự cố / Khiếu nại", exact: true })
    .click();
  await web
    .locator("#dispute-detail")
    .fill("Sách có vết rách lớn ở bìa sau. Xin kiểm tra giúp.");
  assert.equal(await web.getByText(/Dùng dữ liệu mẫu/).count(), 0);
  await web
    .getByRole("button", { name: "Gửi biên bản khiếu nại", exact: true })
    .click();
  const panel = web.getByRole("region", {
    name: "Bằng chứng sự cố",
    exact: true,
  });
  await panel.waitFor();
  const stored = await fixture.db.collection("exchanges").findOne({ _id: id });
  assert.equal(stored.status, "ResolutionPending");
  assert(!stored.disputeReason.includes("sample-"));
  const original = await fixture.db
    .collection("ledger_journals")
    .countDocuments();
  const creates = [],
    uploads = [];
  let dropCreate = true,
    dropUpload = true;
  await web.route("**/api/v1/exchanges/" + id + "/evidence", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    creates.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    if (dropCreate) {
      dropCreate = false;
      return route.fulfill({
        status: 503,
        json: { code: "UNAVAILABLE", message: "QA lost create ACK" },
      });
    }
    return route.fulfill({ response });
  });
  await web.route(
    "**/api/v1/exchanges/" + id + "/evidence/*/content",
    async (route) => {
      uploads.push({
        key: route.request().headers()["idempotency-key"],
        hash: createHash("sha256")
          .update(route.request().postDataBuffer())
          .digest("hex"),
      });
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      if (dropUpload) {
        dropUpload = false;
        return route.fulfill({
          status: 503,
          json: { code: "UNAVAILABLE", message: "QA lost upload ACK" },
        });
      }
      return route.fulfill({ response });
    },
  );
  await panel
    .getByLabel("Chọn bằng chứng")
    .setInputFiles({
      name: "qa-damage.png",
      mimeType: "image/png",
      buffer: fixture.photo,
    });
  await panel
    .getByRole("button", { name: "Gửi bằng chứng", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Thử lại gửi bằng chứng", exact: true })
    .waitFor();
  await web
    .getByRole("link", { name: "Về danh sách hội thoại", exact: true })
    .click();
  await web
    .locator('a[href="/chat/' + room.id + '"]')
    .first()
    .click();
  await panel
    .getByRole("button", { name: "Thử lại gửi bằng chứng", exact: true })
    .click();
  await panel.getByRole("alert").waitFor();
  await panel
    .getByRole("button", { name: "Thử lại gửi bằng chứng", exact: true })
    .click();
  await panel.getByText("Máy chủ đã ghi nhận tệp.", { exact: false }).waitFor();
  assert.equal(creates.length, 2);
  assert.deepEqual(creates[0], creates[1]);
  assert.equal(uploads.length, 2);
  assert.deepEqual(uploads[0], uploads[1]);
  assert.equal(
    await fixture.db
      .collection("exchange_evidence")
      .countDocuments({ exchangeId: id }),
    1,
  );
  assert.equal(evidenceObjects.size, 1);
  assert.equal(
    await fixture.db.collection("ledger_journals").countDocuments(),
    original,
  );
  await panel
    .getByRole("button", { name: "Tải tệp qa-damage.png", exact: true })
    .click();
  await panel
    .getByRole("link", { name: "Tải tệp đã được cấp quyền", exact: true })
    .waitFor();
  await panel.evaluate(node => node.scrollIntoView({block:"start",behavior:"instant"}));
  await web.screenshot({
    path: path.join(out, "member-desktop.png"),
    fullPage: true,
  });
  await web.setViewportSize({ width: 320, height: 900 });
  await web.evaluate(() => (document.documentElement.style.fontSize = "130%"));
  await panel.evaluate(node => node.scrollIntoView({block:"start",behavior:"instant"}));
  await web.screenshot({
    path: path.join(out, "member-320.png"),
    fullPage: true,
  });
  assert(
    await web.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  adminVite = await createServer({
    root: path.join(root, "apps/admin-web"),
    server: { host: "127.0.0.1", port: 5195, strictPort: true },
    define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(base) },
    logLevel: "error",
  });
  await adminVite.listen();
  const ops = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  ops.setDefaultTimeout(15000);
  await ops.goto("http://127.0.0.1:5195/login");
  await ops.getByLabel(/Email/).fill("staff@operations.test");
  await ops.getByLabel(/Mật khẩu/).fill(password);
  await ops.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await ops
    .getByRole("link", { name: /Khiếu nại trao đổi/ })
    .first()
    .click();

  await ops.getByText("Xem ảnh & video bằng chứng", { exact: true }).first().click();
  const review = ops.getByRole("region", {
    name: "Bằng chứng riêng của hồ sơ",
    exact: true,
  });
  await review.waitFor();
  await review
    .getByLabel("Lý do tiếp nhận / xem tệp")
    .fill("Kiểm tra ảnh gốc để tiếp nhận sự cố.");
  await review
    .getByRole("button", { name: "Nhận phụ trách bằng chứng", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Cấp quyền tải qa-damage.png", exact: true })
    .click();
  await review
    .getByRole("link", {
      name: "Tải tệp đã được cấp quyền: qa-damage.png",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await fixture.db
      .collection("audit_events")
      .countDocuments({
        actorId: staff.user.id,
        action: "readExchangeEvidence",
      }),
    1,
  );
  await ops.screenshot({
    path: path.join(out, "staff-desktop.png"),
    fullPage: true,
  });

  const { createServer: serve } = await import("node:http");
  const dist = path.join(root, "apps/mobile-react-native/dist");
  rnServer = serve(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://127.0.0.1:8087").pathname,
      );
      let file = path.resolve(dist, "." + pathname);
      if (file !== dist && !file.startsWith(dist + path.sep))
        return res.writeHead(403).end();
      file =
        file === dist
          ? path.join(dist, "index.html")
          : !path.extname(file)
            ? file + ".html"
            : file;
      const types = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".ttf": "font/ttf",
      };
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] ?? "application/octet-stream",
        })
        .end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => rnServer.listen(8087, "127.0.0.1", r));
  const rn = await browser.newPage({ viewport: { width: 390, height: 844 } });
  rn.setDefaultTimeout(18000);
  await rn.goto("http://127.0.0.1:8087/account");
  await rn
    .getByLabel("Email", { exact: true })
    .last()
    .fill("member@operations.test");
  await rn.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await rn.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await rn
    .getByRole("heading", { name: "Việc của tôi", exact: true })
    .waitFor();
  await rn.evaluate((url) => {
    history.pushState({}, "", url);
    dispatchEvent(new PopStateEvent("popstate"));
  }, "/exchange?id=" + id);
  await rn.getByText("Bằng chứng sự cố", { exact: true }).waitFor();
  const chooser = rn.waitForEvent("filechooser");
  await rn
    .getByRole("button", { name: "Chọn và gửi bằng chứng", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "rn-damage.png",
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  await rn
    .getByText(
      "Máy chủ đã ghi nhận tệp. Nhóm vận hành có thể xem sau khi nhận phụ trách.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await fixture.db
      .collection("exchange_evidence")
      .countDocuments({ exchangeId: id, status: "Ready" }),
    2,
  );
  await rn.screenshot({
    path: path.join(out, "rn-expo-web390.png"),
    fullPage: true,
  });
  result.checks.push(
    "real claim accepted without files",
    "Back + lost create/upload ACK exact retry",
    "one immutable original / no ledger change",
    "participant authorized attachment",
    "independent staff assignment + audit",
    "RN Expo web document picker + original binary upload",
  );
  await save();
  console.log(
    "PASS Exchange evidence Member web → real API/Mongo → assigned Staff; isolated storage and synthetic state.",
  );
} catch (error) {
  for (const context of browser?.contexts() ?? [])
    for (const page of context.pages()) {
      await page
        .screenshot({
          path: path.join(
            out,
            "failure-" + browser.contexts().indexOf(context) + ".png",
          ),
          fullPage: true,
        })
        .catch(() => {});
      await writeFile(
        path.join(out, "failure.txt"),
        JSON.stringify(
          { url: page.url(), text: await page.locator("body").innerText() },
          null,
          2,
        ),
      );
    }
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  await adminVite?.close();
  if (rnServer?.listening) await new Promise((r) => rnServer.close(r));
  await fixture?.close();
}
