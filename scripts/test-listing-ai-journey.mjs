// Browser integration on QA only. Real API/Mongo/Sharp, explicitly FAKE AI and storage.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createServer as httpServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  createAiQa,
  qaMetadata as syntheticMetadata,
} from "./listing-ai-qa.mjs";
import {
  validateDataset,
  insideFile,
} from "../qa-data/listing-ai/validator.mjs";
import { root, password } from "../apps/admin-web/tests/test-api.mjs";
const require = createRequire(
  new URL("../apps/admin-web/package.json", import.meta.url),
);
const webRequire = createRequire(
  new URL("../apps/user-web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const { createServer } = await import(
  pathToFileURL(webRequire.resolve("vite")).href
);
const web = "http://127.0.0.1:5184",
  rn = "http://127.0.0.1:8087";
const artifacts = path.join(root, ".tmp/listing-ai-journey");
const fastPaths = process.env.LISTING_AI_FAST_PATHS === "1";
// Opt-in: validated local cover scan + recorded live output. No paid calls in browser QA.
let sample = null;
if (process.env.LISTING_AI_CORPUS_RESULT) {
  const dir = path.join(root, "qa-data/listing-ai/incoming");
  const checked = await validateDataset({ dir });
  assert.equal(checked.technicalStatus, "PASS");
  const cases = JSON.parse(
    await readFile(path.join(dir, "autofill/cover-scan/cases.json"), "utf8"),
  );
  const c = cases.cases.find((c) => c.id === "case-khong-gia-dinh-kd-2022");
  const run = JSON.parse(
    await readFile(process.env.LISTING_AI_CORPUS_RESULT, "utf8"),
  );
  const row = run.results.find((row) => row.id === c?.id);
  assert.equal(run.summary.source, "cover-scan");
  assert.equal(row?.titleExact, true);
  assert.equal(row?.authorsFound, true);
  assert.deepEqual(
    row.expected,
    c.expected,
    "Recorded output must refer to the current case answers",
  );
  const books = JSON.parse(
    await readFile(path.join(dir, "catalog/books.json"), "utf8"),
  );
  const book = books.books.find((book) => book.bookKey === c.bookKey);
  sample = {
    metadata: {
      ...Object.fromEntries(
        [
          "title",
          "authors",
          "publisher",
          "publicationYear",
          "language",
          "edition",
          "isbn",
        ].map((key) => [key, book.metadata[key]]),
      ),
      category: "Văn học",
    },
    read: row.read,
    photo: await readFile(
      await insideFile(dir, path.join("autofill/cover-scan", c.photos[0])),
    ),
  };
}
if (fastPaths) {
  assert.equal(
    sample,
    null,
    "Fast-path synthetic fixtures must not replace a corpus replay",
  );
  const { isbnImage } = await import("../apps/api/test/helpers/isbn-image.ts");
  const metadata = { ...syntheticMetadata, isbn: "9786041234567" };
  sample = {
    metadata,
    photo: await isbnImage(),
    read: { ...metadata, category: undefined, missing: [] },
  };
}
const qaMetadata = sample?.metadata ?? syntheticMetadata;
await mkdir(artifacts, { recursive: true });
// An interrupted or failed run must never leave an older PASS as its result.
await rm(path.join(artifacts, "result.json"), { force: true });
let fixture, server, rnServer, browser;
const errors = [],
  checkpoints = [],
  timings = [];
const button = (p, name) => p.getByRole("button", { name, exact: true });
function collectFastTimings(page) {
  page.on("response", (response) => {
    const scope = response.url().split("/").pop();
    if (["isbn-matches", "price-reference"].includes(scope))
      timings.push({
        scope,
        http: response.status(),
        stages: response.headers()["server-timing"] ?? null,
      });
  });
}
async function capture(p, name, width) {
  await p.setViewportSize({ width, height: 900 });
  await p.evaluate(async () => {
    await document.fonts.ready;
  });
  // Let the existing authored entry motion settle; keep motion enabled.
  await p.waitForTimeout(800);
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `${name} page overflow`,
  );
  await p.screenshot({
    path: path.join(artifacts, `${name}.png`),
    fullPage: false,
  });
}
function loseFirst(p, suffix, beforeReply) {
  const calls = [];
  let lose = true;
  const handler = async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    calls.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postData(),
    });
    const response = await route.fetch();
    await beforeReply?.();
    if (response.headers()["server-timing"])
      timings.push({
        scope: suffix,
        http: response.status(),
        stages: response.headers()["server-timing"],
      });
    if (lose) {
      lose = false;
      return route.abort("failed");
    }
    await route.fulfill({ response });
  };
  return {
    calls,
    install: () => p.route(`**/${suffix}`, handler),
    uninstall: () => p.unroute(`**/${suffix}`, handler),
  };
}
try {
  fixture = await createAiQa({ sample });
  await fixture.api("/me/addresses", fixture.member.accessToken, {
    expectedBookVersion: 0,
    makeDefault: true,
    address: {
      recipientName: "QA Seller",
      phone: "0900123456",
      serviceAreaCode: "HCM-DEMO-v1",
      localityCode: "DEMO-A",
      detail: "Synthetic QA origin",
    },
  });
  process.env.VITE_API_BASE_URL = fixture.base;
  server = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5184, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  const dist = path.join(root, "apps/mobile-react-native/dist");
  rnServer = httpServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, rn).pathname);
      if (pathname.split("/").some((part) => part.startsWith(".")))
        return response.writeHead(404).end();
      let file = path.resolve(
        dist,
        `.${pathname === "/" ? "/index.html" : pathname}`,
      );
      if (!file.startsWith(dist + path.sep))
        return response.writeHead(403).end();
      if (!path.extname(file)) file += ".html";
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".ttf": "font/ttf",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".json": "application/json",
      };
      response
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(file)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => rnServer.listen(8087, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.setDefaultTimeout(20000);
  collectFastTimings(p);
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(web + "/login?returnUrl=%2Fsell");
  await p.getByLabel(/^Email/).fill("member@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button(p, "Đăng nhập").click();
  await p.waitForURL(web + "/sell");
  await button(p, "Tự nhập thông tin").click();
  await p.locator("#title").fill("Giữ tên đang nhập");
  const photoPanel = p.locator(
    'section[aria-labelledby="photo-autofill-title"]',
  );
  await photoPanel.locator('input[type="file"]').setInputFiles({
    name: "qa-cover.png",
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  const lostPhoto = loseFirst(p, "autofill-suggestions");
  await lostPhoto.install();
  // Process the real upload queue once finalize has committed.
  const finalize = p.waitForResponse(
    (r) => r.url().endsWith("/finalize") && r.request().method() === "POST",
  );
  await button(photoPanel, "Đọc thông tin").click();
  await finalize;
  await fixture.processMedia();
  if (fastPaths) {
    await photoPanel
      .getByRole("heading", { name: "Đối chiếu từ mã vạch ISBN" })
      .waitFor();
    assert.equal(fixture.counters.autofill, 0);
    assert.equal(
      await fixture.db.collection("price_assist_usage").countDocuments(),
      0,
    );
    await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).click();
    assert.equal(await p.locator("#title").inputValue(), "Giữ tên đang nhập");
    await button(p.getByRole("dialog"), "Hủy").click();
    for (const width of [1440, 768, 390, 320]) {
      await photoPanel
        .getByRole("heading", { name: "Đối chiếu từ mã vạch ISBN" })
        .scrollIntoViewIfNeeded();
      await capture(p, `web-isbn-fast-${width}`, width);
    }
    await button(photoPanel, "Đọc chữ bằng AI").click();
    checkpoints.push(
      "Web ISBN: real EAN-13/Sharp/worker to catalog with zero model/quota, explicit confirmation/cancel, then optional AI intent",
    );
  }
  await photoPanel.getByRole("alert").waitFor();
  await button(photoPanel, "Đọc thông tin").click();
  await button(photoPanel, "Dùng Tên sách").waitFor();
  assert.equal(fixture.counters.autofill, 1);
  assert.equal(lostPhoto.calls.length, 2);
  assert.deepEqual(lostPhoto.calls[0], lostPhoto.calls[1]);
  await lostPhoto.uninstall();
  await button(photoPanel, "Dùng Tên sách").click();
  await p
    .getByRole("dialog")
    .filter({
      has: p.getByRole("heading", { name: "Thay thông tin đang nhập?" }),
    })
    .waitFor();
  assert.equal(await p.locator("#title").inputValue(), "Giữ tên đang nhập");
  await button(p, "Dùng gợi ý đã chọn").click();
  assert.equal(await p.locator("#title").inputValue(), qaMetadata.title);
  await button(photoPanel, "Dùng ảnh đầu làm bìa bản sách").click();
  await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).waitFor();
  const aiBeforeRecovery = fixture.counters.autofill;
  await photoPanel
    .getByLabel("Tên sách để tìm", { exact: true })
    .fill(qaMetadata.title + "x");
  assert.equal(
    await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).isDisabled(),
    true,
  );
  // A failed catalog request preserves edited hints and keeps old matches locked.
  const catalogFailure = (route) => route.abort("failed");
  await p.route("**/catalog-matches", catalogFailure);
  await button(photoPanel, "Tìm lại trong danh mục").click();
  await photoPanel.getByText(/Chưa tìm được danh mục/).waitFor();
  assert.equal(
    await photoPanel
      .getByLabel("Tên sách để tìm", { exact: true })
      .inputValue(),
    qaMetadata.title + "x",
  );
  assert.equal(
    await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).isDisabled(),
    true,
  );
  await p.unroute("**/catalog-matches", catalogFailure);
  await photoPanel
    .getByLabel("Tên sách để tìm", { exact: true })
    .fill(qaMetadata.title);
  await Promise.all([
    p.waitForResponse(
      (r) => r.url().endsWith("/catalog-matches") && r.status() === 200,
    ),
    photoPanel.getByLabel("Tên sách để tìm", { exact: true }).press("Enter"),
  ]);
  await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).waitFor();
  assert.equal(await p.locator("#title").inputValue(), qaMetadata.title);
  for (const width of [1440, 768, 390, 320]) {
    await photoPanel
      .getByRole("heading", { name: "Chọn đúng đầu sách" })
      .scrollIntoViewIfNeeded();
    await capture(p, `web-catalog-${width}`, width);
    await button(
      photoPanel,
      `Chọn đầu sách: ${qaMetadata.title}`,
    ).scrollIntoViewIfNeeded();
    await capture(p, `web-catalog-choice-${width}`, width);
  }
  await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).click();
  await button(p.getByRole("dialog"), "Hủy").click();
  await button(photoPanel, `Chọn đầu sách: ${qaMetadata.title}`).click();
  await button(p, "Xác nhận chọn đầu sách").click();
  assert.equal(fixture.counters.autofill, aiBeforeRecovery);
  checkpoints.push(
    "Catalog recovery: failed request retains hints, edited hints lock old choices, Enter searches without submitting, cancel/confirm selection, no extra model call, web 320/390/768/1440",
  );
  await button(p, "Tiếp tục").click();
  await p.locator("#cover-file").waitFor({ state: "attached" });
  await button(p, "Tiếp tục").click();
  for (const key of [
    "pages",
    "coverNote",
    "notes",
    "accessories",
    "description",
  ])
    await p
      .locator(`#${key}`)
      .fill(`QA ${key}: mô tả bản sách tổng hợp dùng riêng cho kiểm thử.`);
  for (const [key, index] of [
    ["readable", 0],
    ["hasMissingPages", 1],
    ["missingEssentialContent", 1],
  ])
    await p.locator(`input[name="${key}"]`).nth(index).locator("..").click();
  await button(p, "Tiếp tục").click();
  await p.locator("#salePrice").fill("125000");
  let releasePriceProof;
  const priceProof = fastPaths
    ? new Promise((resolve) => {
        releasePriceProof = resolve;
      })
    : Promise.resolve();
  const lostPrice = loseFirst(p, "price-suggestions", () => priceProof);
  await lostPrice.install();
  const coverFinalize = p.waitForResponse(
    (r) => r.url().endsWith("/finalize") && r.request().method() === "POST",
  );
  fixture.delays.price = 1500;
  await button(p, "Xem gợi ý giá bán").click();
  await button(p, "Đang lấy gợi ý…").waitFor();
  assert.equal(await button(p, "Đang lấy gợi ý…").isDisabled(), true);
  assert.equal(await p.locator("#salePrice").inputValue(), "125000");
  await coverFinalize;
  await fixture.processMedia();
  const pricePanel = p.locator('section[aria-labelledby="price-assist-title"]');
  if (fastPaths) {
    const ref = pricePanel.getByLabel("Giá tham chiếu theo quy tắc");
    for (const width of [1440, 390, 320]) {
      await ref.scrollIntoViewIfNeeded();
      await capture(p, `web-reference-pending-${width}`, width);
    }
    await ref
      .getByRole("button", { name: /^Chọn mức tham chiếu/ })
      .first()
      .click();
    assert.equal(await p.locator("#salePrice").inputValue(), "125000");
    await button(p, "Dùng giá tham chiếu").click();
    assert.equal(await p.locator("#salePrice").inputValue(), "40000");
    await p.locator("#salePrice").fill("125000");
    releasePriceProof?.();
    checkpoints.push(
      "Rule reference arrives before AI, confirms explicit manual price, never overwrites user price when AI later completes",
    );
  }
  await pricePanel.getByRole("alert").waitFor();
  assert.equal(await p.locator("#salePrice").inputValue(), "125000");
  await button(p, "Xem lại gợi ý giá").click();
  await pricePanel
    .getByRole("button", { name: /^Dùng / })
    .first()
    .waitFor();
  assert.equal(fixture.counters.price, 1);
  assert.deepEqual(lostPrice.calls[0], lostPrice.calls[1]);
  await lostPrice.uninstall();
  fixture.delays.price = 0;
  await pricePanel
    .getByRole("button", { name: /^Dùng / })
    .first()
    .click();
  assert.equal(await p.locator("#salePrice").inputValue(), "125000");
  await button(p, "Dùng giá gợi ý").click();
  assert.equal(await p.locator("#salePrice").inputValue(), "40000");
  await pricePanel.getByText(/^Nguồn giá và nguồn bị loại/).click();
  for (const width of [1440, 768, 390, 320]) {
    await pricePanel.scrollIntoViewIfNeeded();
    await capture(p, `web-price-${width}`, width);
  }
  checkpoints.push(
    "web: photo and price lost ACK each retain key/body; one provider call; explicit overwrite confirmations; responsive source evidence",
  );
  await button(p, "Quay lại").click();
  await p.locator("#coverNote").fill("QA tình trạng đã thay đổi.");
  await button(p, "Tiếp tục").click();
  await pricePanel.getByText(/Gợi ý cũ không được áp dụng/).waitFor();
  assert.equal(await p.locator("#salePrice").inputValue(), "40000");
  await button(p, "Xem lại gợi ý giá").click();
  await pricePanel
    .getByRole("button", { name: /^Dùng / })
    .first()
    .waitFor();
  await pricePanel
    .getByRole("button", { name: /^Dùng / })
    .first()
    .click();
  if (fastPaths) {
    await pricePanel
      .getByText("Khoảng tham chiếu theo quy tắc", { exact: true })
      .click();
    await pricePanel
      .getByRole("button", { name: /^Chọn mức tham chiếu/ })
      .first()
      .click();
    await button(p, "Dùng giá tham chiếu").click();
  }
  await button(p, "Thêm nơi gửi sách").click();
  const originDialog = p.getByRole("dialog").filter({
    has: p.getByRole("heading", { name: "Nơi gửi sách", exact: true }),
  });
  await originDialog.locator("select").first().selectOption({ index: 1 });
  await button(originDialog, "Dùng nơi gửi này").click();
  await button(p, "Tiếp tục").click();
  await p.getByRole("heading", { name: "Kiểm tra", exact: true }).waitFor();
  await p.locator("#ownership").locator("..").click();
  const submitted = p.waitForResponse(
    (response) =>
      response.url().endsWith("/submit") &&
      response.request().method() === "POST",
  );
  await button(p, "Gửi duyệt").click();
  assert.equal((await submitted).status(), 200);
  const outcome = await fixture.db
    .collection("price_suggestions")
    .findOne({ "outcome.applied": !fastPaths });
  assert.ok(outcome);
  assert.equal(outcome.outcome.chosenSalePrice, 40000);
  const listing = await fixture.db
    .collection("listings")
    .findOne({ _id: outcome.listingId });
  assert.equal(listing.moderation, "PendingReview");
  assert.equal(await fixture.db.collection("listings").countDocuments(), 1);
  checkpoints.push(
    fastPaths
      ? "web: same draft to one PendingReview; selected rule reference stored as manual price 40000 with outcome.applied=false"
      : "web: same draft through AI, price evidence and real submit; one PendingReview listing; stored applied price 40000; changed condition invalidates prior suggestion",
  );
  const np = await browser.newPage({ viewport: { width: 390, height: 900 } });
  np.setDefaultTimeout(20000);
  collectFastTimings(np);
  np.on("pageerror", (e) => errors.push(e.message));
  await np.goto(rn + "/account");
  await np
    .getByLabel("Email", { exact: true })
    .last()
    .fill("member@operations.test");
  await np.getByLabel("Mật khẩu", { exact: true }).last().fill(password);
  await button(np, "Đăng nhập").click();
  await button(np, "Kệ sách của tôi").click();
  await button(np, "+ Đăng Sách Mới Ngay").click();
  await np.getByText("Điền nhanh từ ảnh", { exact: true }).waitFor();
  const chooser = np.waitForEvent("filechooser");
  await button(np, "Thêm ảnh để đọc").click();
  await (
    await chooser
  ).setFiles({
    name: "qa-rn.png",
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  await np.getByText(/Ảnh đã tải lên/).waitFor();
  await fixture.processMedia();
  await button(np, "Đọc thông tin từ ảnh").waitFor({ state: "visible" });
  await np.waitForFunction(() =>
    [...document.querySelectorAll('button,[role="button"]')].some(
      (el) =>
        el.textContent === "Đọc thông tin từ ảnh" &&
        el.getAttribute("aria-disabled") !== "true",
    ),
  );
  // A lost 503 is uncertain. First retry must replay it; only the explicit
  // terminal code allows a new key. The third click may call the model again.
  const rnPhoto = loseFirst(np, "autofill-suggestions");
  await rnPhoto.install();
  const beforePhoto = fixture.counters.autofill;
  fixture.modes.autofill = "timeout";
  await button(np, "Đọc thông tin từ ảnh").click();
  if (fastPaths) {
    await np.getByText("Đối chiếu từ mã vạch ISBN", { exact: true }).waitFor();
    assert.equal(fixture.counters.autofill, beforePhoto);
    await button(np, "Đọc chữ bằng AI").click();
    checkpoints.push(
      "RN web ISBN: catalog result without a model call; optional AI preserves the original retry intent",
    );
  }
  await np.getByText(/Chưa đọc được ảnh/).waitFor();
  fixture.modes.autofill = "ok";
  await button(np, "Đọc thông tin từ ảnh").click();
  await np.getByText(/Chưa đọc được ảnh/).waitFor();
  await button(np, "Đọc thông tin từ ảnh").click();
  await button(np, `Chọn đầu sách: ${qaMetadata.title}`).waitFor();
  assert.equal(rnPhoto.calls.length, 3);
  assert.deepEqual(rnPhoto.calls[0], rnPhoto.calls[1]);
  assert.notEqual(rnPhoto.calls[1].key, rnPhoto.calls[2].key);
  assert.equal(fixture.counters.autofill, beforePhoto + 2);
  await rnPhoto.uninstall();
  const rnBeforeRecovery = fixture.counters.autofill;
  await np
    .getByLabel("Tên sách để tìm", { exact: true })
    .fill(qaMetadata.title);
  await Promise.all([
    np.waitForResponse(
      (r) => r.url().endsWith("/catalog-matches") && r.status() === 200,
    ),
    button(np, "Tìm lại trong danh mục").click(),
  ]);
  assert.equal(fixture.counters.autofill, rnBeforeRecovery);
  for (const width of [390, 320]) {
    await button(
      np,
      `Chọn đầu sách: ${qaMetadata.title}`,
    ).scrollIntoViewIfNeeded();
    await capture(np, `rn-photo-${width}`, width);
  }
  await button(np, `Chọn đầu sách: ${qaMetadata.title}`).click();
  await button(np, "Xác nhận chọn đầu sách").click();
  await button(np, "Tiếp theo").click();
  await np.getByText("Ảnh đã sẵn sàng", { exact: true }).waitFor();
  await button(np, "Tiếp theo").click();
  await np.getByText("Tốt (Good)", { exact: true }).click();
  for (const [label, value] of [
    ["Ruột sách và trang thiếu", "Đủ trang QA"],
    ["Bìa và gáy sách", "Bìa QA"],
    ["Ghi chú và đánh dấu", "Không có"],
    ["Phụ kiện đi kèm", "Không có"],
    [
      "Vài dòng gửi người đọc sau (Mô tả chung)",
      "Mô tả QA tổng hợp, không phải một bài đăng thực tế.",
    ],
  ])
    await np.getByLabel(label, { exact: true }).fill(value);
  await np.getByText("Có, còn đọc rõ", { exact: true }).click();
  await np.getByText("Không thiếu trang", { exact: true }).click();
  await np.getByText("Không thiếu nội dung chính", { exact: true }).click();
  await button(np, "Tiếp theo").click();
  await np.getByRole("button", { name: /^Bán trực tiếp/ }).click();
  await np.getByLabel("Giá bán (đồng)", { exact: true }).fill("125000");
  let releaseRnProof;
  const rnProof = fastPaths
    ? new Promise((resolve) => {
        releaseRnProof = resolve;
      })
    : Promise.resolve();
  const rnPrice = loseFirst(np, "price-suggestions", () => rnProof);
  await rnPrice.install();
  const beforePrice = fixture.counters.price;
  await button(np, "Xem gợi ý giá").click();
  if (fastPaths) {
    await np
      .getByRole("button", { name: /^Chọn mức tham chiếu/ })
      .first()
      .scrollIntoViewIfNeeded();
    await capture(np, "rn-reference-pending-390", 390);
    await np
      .getByRole("button", { name: /^Chọn mức tham chiếu/ })
      .first()
      .click();
    assert.equal(
      await np.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
      "125000",
    );
    await button(np, "Dùng giá tham chiếu").click();
    assert.equal(
      await np.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
      "40000",
    );
    await np.getByLabel("Giá bán (đồng)", { exact: true }).fill("125000");
    releaseRnProof?.();
    checkpoints.push(
      "RN web rule reference can be explicitly chosen while the AI response is pending; later AI does not overwrite the typed price",
    );
  }
  await np.getByText(/Chưa kết nối được máy chủ/).waitFor();
  assert.equal(
    await np.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
    "125000",
  );
  await button(np, "Xem lại gợi ý giá").click();
  await np
    .getByRole("button", { name: /^Dùng / })
    .first()
    .waitFor();
  assert.equal(rnPrice.calls.length, 2);
  assert.deepEqual(rnPrice.calls[0], rnPrice.calls[1]);
  assert.equal(fixture.counters.price, beforePrice + 1);
  await rnPrice.uninstall();
  checkpoints.push(
    "RN web: account to draft, real photo/Sharp, lost terminal response replay then explicit new intent; catalog choice and same photo at next step; price lost ACK keeps key/body and typed price",
  );
  for (const width of [390, 320]) {
    await capture(np, `rn-price-${width}`, width);
  }
  // Isolate missing-source behavior after a new explicit input, avoiding cache.
  await fixture.db
    .collection("price_references")
    .deleteMany({ bookId: fixture.catalogId });
  await button(np, "Trước").click();
  await np
    .getByLabel("Bìa và gáy sách", { exact: true })
    .fill("Bìa QA thay đổi; không có nguồn giá.");
  await button(np, "Tiếp theo").click();
  const beforeMissing = fixture.counters.price;
  await button(np, "Xem lại gợi ý giá").click();
  await np
    .getByText(/Chưa có dữ liệu giá có nguồn/)
    .first()
    .waitFor();
  assert.equal(fixture.counters.price, beforeMissing);
  assert.equal(
    await np.getByLabel("Giá bán (đồng)", { exact: true }).inputValue(),
    "125000",
  );
  checkpoints.push(
    "Slow price call disables duplicate request and preserves typed price; missing sources never call AI and keep manual price (RN web)",
  );
  assert.deepEqual(
    errors.filter((error) => !error.includes("Minified React error #418")),
    [],
  );
  await writeFile(
    path.join(artifacts, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        source: fastPaths
          ? "synthetic EAN-13; real local decoder/API/Mongo/Sharp; fake AI/storage; synthetic prices"
          : sample
            ? "real cover scan/API/Mongo/Sharp; replayed live output; synthetic QA prices; fake storage"
            : "real API/Mongo/Sharp; fake AI/storage",
        checkpoints,
        timings,
        native: "NOT_RUN",
        realCameraQuality: "NOT_RUN: no dataset supplied",
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PASS AI listing journey:", checkpoints.join("; "));
} catch (error) {
  for (const [index, context] of (browser?.contexts() ?? []).entries())
    for (const p of context.pages())
      await p
        .screenshot({ path: path.join(artifacts, `failure-${index}.png`) })
        .catch(() => {});
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  if (rnServer) await new Promise((resolve) => rnServer.close(resolve));
  await fixture?.close();
}
