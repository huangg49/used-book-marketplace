// Real Nest/MongoDB HTTP integration on a disposable *_test DB; storage is fake.
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
const artifacts = path.join(root, "apps/user-web/test-results");
await mkdir(artifacts, { recursive: true });
process.env.VITE_API_BASE_URL = base;
let fixture, server, browser, mediaTimer;
try {
  fixture = await createTestApi({ corsOrigin: origin, listingCount: 13 });
  const admin = await fixture.api("/auth/login", null, {
    email: "admin@operations.test",
    password,
  });
  const catalog = await fixture.api(
    `/operations/catalog-requests/${fixture.catalogId}`,
    admin.accessToken,
  );
  if (catalog.status !== "Confirmed")
    await fixture.api(
      `/operations/catalog-requests/${fixture.catalogId}/decision`,
      admin.accessToken,
      {
        expectedVersion: catalog.version,
        revisionId: catalog.currentRevision.id,
        decision: "Confirm",
      },
    );
  for (const id of fixture.listings) {
    const listing = await fixture.api(
      `/operations/listings/${id}`,
      admin.accessToken,
    );
    await fixture.api(
      `/operations/listings/${id}/decision`,
      admin.accessToken,
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
  }
  // The denser UI page fits this fixture; retain server cursor coverage separately.
  const firstPage = await fixture.api("/listings?limit=12");
  assert.equal(firstPage.items.length, 12);
  assert.ok(firstPage.nextCursor);
  const lastPage = await fixture.api(
    "/listings?limit=12&cursor=" + encodeURIComponent(firstPage.nextCursor),
  );
  assert.equal(lastPage.items.length, 1);
  assert.equal(
    new Set([...firstPage.items, ...lastPage.items].map((book) => book.id))
      .size,
    13,
  );
  process.chdir(path.join(root, "apps/user-web"));
  server = await createServer({
    root: path.join(root, "apps/user-web"),
    server: { host: "127.0.0.1", port: 5184, strictPort: true },
    logLevel: "error",
  });
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  p.on("pageerror", (error) => errors.push(error.message));
  const button = (name) => p.getByRole("button", { name, exact: true });
  const step = (name) =>
    p
      .getByRole("navigation", { name: "Các bước đăng sách" })
      .getByRole("button", { name });
  await p.goto(origin);
  console.log("QA: home/search");
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  // Covers below the Home hero now request signing only near the viewport.
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().scrollIntoViewIfNeeded();
  await p
    .getByRole("img", { name: /^Bìa sách/ })
    .first()
    .waitFor();
  await p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await p.screenshot({
    path: path.join(artifacts, "home-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.getByLabel("Bạn muốn tìm cuốn nào?").fill("khong-co-sach-nay");
  await button("Tìm sách").click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Tìm sách", { exact: true }).fill("");
  await p.getByText("13 tin đăng trên trang này").waitFor();
  assert.equal(await button("Trang tiếp theo").count(), 0);
  await p.getByRole("radio", { name: "Cũ nhiều", exact: true }).click();
  await button("Áp dụng").click();
  await p.waitForURL((url) => url.searchParams.has("condition"));
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p
    .getByRole("radio", { name: "Tất cả tình trạng", exact: true })
    .click();
  await button("Áp dụng").click();
  await p.waitForURL((url) => !url.searchParams.has("condition"));
  await p.getByText("13 tin đăng trên trang này").waitFor();
  await button("Đổi sách").click();
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  assert.equal(new URL(p.url()).searchParams.get("mode"), "Exchange");
  await p.getByRole("button", { name: /^Sắp xếp / }).click();
  await p.getByRole("menuitemradio", { name: "Giá bán giảm dần" }).click();
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await p
    .getByRole("heading", { level: 1, name: fixture.metadata.title })
    .waitFor();
  await p.getByText(/125\.000\s*₫/).waitFor();
  await p.getByText(/150\.000\s*₫/).waitFor();
  await p.getByRole("link", { name: "Về kệ sách", exact: true }).click();
  // Search failure/retry against the same real data.
  await p.route("**/api/v1/listings?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ code: "Unavailable", message: "QA outage" }),
    }),
  );
  const failedSearch = p.waitForResponse(
    (response) =>
      response.status() === 503 &&
      new URL(response.url()).searchParams.get("q") === "QA-failure",
  );
  await p.getByLabel("Tìm sách", { exact: true }).fill("QA-failure");
  await p.waitForURL("**q=QA-failure");
  await failedSearch;
  await p.getByRole("alert").waitFor();
  await button("Thử lại").waitFor();
  await p.unroute("**/api/v1/listings?*");
  await button("Thử lại").click();
  await p.getByText("Chưa có cuốn sách nào phù hợp.").waitFor();
  await p.getByLabel("Tìm sách", { exact: true }).fill("");
  await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .waitFor();
  await p.setViewportSize({ width: 390, height: 844 });
  for (const scale of [100, 130]) {
    await p.evaluate(
      (scale) => (document.documentElement.style.fontSize = `${scale}%`),
      scale,
    );
    await p.screenshot({
      path: path.join(artifacts, `search-390-${scale}.png`),
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Search overflow at ${scale}%`,
    );
  }
  await p.setViewportSize({ width: 320, height: 844 });
  await p
    .getByRole("link", { name: "Trang chủ Lật lại", exact: true })
    .first()
    .click();
  await p.getByLabel("Bạn muốn tìm cuốn nào?").waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Home overflow at320px130%",
  );
  await p.screenshot({
    path: path.join(artifacts, "home-320-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  await button("Chat với người bán").waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Detail overflow at320px130%",
  );
  await p.screenshot({
    path: path.join(artifacts, "detail-320-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.getByRole("link", { name: "Về kệ sách", exact: true }).click();
  await p.getByLabel("Tìm sách", { exact: true }).waitFor();
  assert.ok(
    await p.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Search overflow at320px130%",
  );
  await p.screenshot({
    path: path.join(artifacts, "search-320-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await p.setViewportSize({ width: 390, height: 844 });
  console.log("QA: public shelf/detail/states passed; sell journey");
  await p.locator(`a[href="/books/${fixture.listings[0]}"]`).first().click();
  await button("Chat với người bán").click();
  await p.waitForURL("**/login?returnUrl=*");
  const returnPath = new URL(p.url()).searchParams.get("returnUrl");
  assert.equal(returnPath, `/chat/start/${fixture.listings[0]}?intent=Negotiation`);
  await p.getByLabel(/^Email/).fill("member@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button("Đăng nhập").click();
  // Returning to one's own listing must not create a self-conversation.
  await p.waitForURL(`${origin}/books/${fixture.listings[0]}`);
  await p
    .getByRole("heading", { name: "Đây là bài đăng của bạn", exact: true })
    .waitFor();
  assert.equal(await button("Chat với người bán").count(), 0);
  await p
    .getByRole("link", { name: "Trang chủ Lật lại", exact: true })
    .first()
    .click();
  // Both the closing invitation and the footer have this label. Wait for the
  // footer too so this journey covers the fully rendered page, then scope the
  // click to the invitation instead of depending on which link renders first.
  await p
    .getByRole("contentinfo")
    .getByRole("link", { name: "Đăng sách của bạn", exact: true })
    .waitFor();
  await p
    .getByRole("region", {
      name: "Đọc xong rồi? Để sách đi tiếp.",
      exact: true,
    })
    .getByRole("link", { name: "Đăng sách của bạn", exact: true })
    .click();
  await p.waitForURL(origin + "/sell");
  await step(/Kiểm tra/).click();
  await p.getByText(/Đăng bài miễn phí/).waitFor();
  assert.equal(await p.getByText(/Phí gửi duyệt:/).count(), 0);
  assert.equal(
    await p.getByRole("link", { name: "Nạp ví", exact: true }).count(),
    0,
  );
  await button("Gửi duyệt").click();
  await p.getByRole("alert").waitFor();
  await step(/Thông tin sách/).click();
  if (await button("Không thấy sách? Tự nhập theo bìa").count())
    await button("Không thấy sách? Tự nhập theo bìa").click();
  await p
    .getByLabel("Tên sách", { exact: true })
    .fill("QA — Một cuốn sách cũ qua nhiều người đọc với tên dài");
  await p.getByLabel("Tác giả", { exact: true }).fill("Tác giả QA");
  await p
    .getByRole("combobox", { name: "Danh mục sách", exact: true })
    .selectOption({ label: "Sách khác" });
  await step(/Ảnh bản sách/).click();
  const coverFileInput = p.locator("#cover-file");
  const fileInput = p.locator("#support-images");
  for (const input of [coverFileInput, fileInput]) {
    const pickerBox = await input.boundingBox();
    assert.ok(
      pickerBox.width <= 1 && pickerBox.height <= 1,
      "Native file controls must not occupy a separate visible row",
    );
  }
  const photo = (name) => ({
    name,
    mimeType: "image/png",
    buffer: fixture.photo,
  });
  const thumbnails = p.getByRole("img", {
    name: /^(Ảnh bìa bản sách|Ảnh phụ \d+)$/,
  });
  const selectedPhotos = p.getByRole("group", {
    name: "Ảnh bản sách",
    exact: true,
  });
  const coverGroup = p.getByRole("group", { name: "Ảnh bìa", exact: true });
  const supportGroup = p.getByRole("group", { name: "Ảnh phụ", exact: true });
  const chooserPromise = p.waitForEvent("filechooser");
  await button("Chọn ảnh bìa").click();
  const chooser = await chooserPromise;
  assert.equal(chooser.isMultiple(), false);
  await chooser.setFiles([photo("qa-cover.png")]);
  await thumbnails.first().waitFor();
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    const coverBox = await coverGroup.boundingBox();
    const supportBox = await supportGroup.boundingBox();
    if (width === 1440) {
      assert.ok(coverBox.x + coverBox.width < supportBox.x);
      assert.ok(Math.abs(coverBox.y - supportBox.y) < 1);
    } else {
      assert.ok(coverBox.y + coverBox.height <= supportBox.y);
    }
    await selectedPhotos.screenshot({
      path: path.join(artifacts, `sell-cover-support-${width}.png`),
    });
  }
  const multiChooserPromise = p.waitForEvent("filechooser");
  await button("Thêm ảnh phụ").click();
  const multiChooser = await multiChooserPromise;
  assert.equal(multiChooser.isMultiple(), true);
  await multiChooser.setFiles([photo("qa-spine.png"), photo("qa-pages.png")]);
  await thumbnails.nth(2).waitFor();
  const supportsBefore = await supportGroup
    .locator("img")
    .evaluateAll((nodes) => nodes.map((node) => node.src));
  await button("Xóa ảnh bìa").click();
  assert.deepEqual(
    await supportGroup
      .locator("img")
      .evaluateAll((nodes) => nodes.map((node) => node.src)),
    supportsBefore,
  );
  await button("Tiếp tục").click();
  await p
    .getByRole("alert")
    .filter({ hasText: "Thêm ảnh bìa bản sách" })
    .first()
    .waitFor();
  await coverFileInput.setInputFiles(photo("qa-new-cover.png"));
  await p.getByRole("img", { name: "Ảnh bìa bản sách", exact: true }).waitFor();
  assert.deepEqual(
    await supportGroup
      .locator("img")
      .evaluateAll((nodes) => nodes.map((node) => node.src)),
    supportsBefore,
  );
  const oldCover = await p
    .getByRole("img", { name: "Ảnh bìa bản sách", exact: true })
    .getAttribute("src");
  const coverReplacePromise = p.waitForEvent("filechooser");
  await button("Thay ảnh bìa").click();
  const coverReplace = await coverReplacePromise;
  assert.equal(coverReplace.isMultiple(), false);
  await coverReplace.setFiles(photo("qa-replaced-cover.png"));
  assert.notEqual(
    await p
      .getByRole("img", { name: "Ảnh bìa bản sách", exact: true })
      .getAttribute("src"),
    oldCover,
  );
  assert.equal(await thumbnails.count(), 3);
  const beforeReplace = await thumbnails.evaluateAll((nodes) =>
    nodes.map((node) => node.src),
  );
  const supportReplacePromise = p.waitForEvent("filechooser");
  await button("Thay ảnh phụ 2").click();
  const supportReplace = await supportReplacePromise;
  assert.equal(supportReplace.isMultiple(), false);
  await supportReplace.setFiles(photo("qa-replaced-pages.png"));
  const afterReplace = await thumbnails.evaluateAll((nodes) =>
    nodes.map((node) => node.src),
  );
  assert.deepEqual(afterReplace.slice(0, 2), beforeReplace.slice(0, 2));
  assert.notEqual(afterReplace[2], beforeReplace[2]);
  assert.equal(
    await button("Thay ảnh phụ 2").evaluate(
      (node) => node === document.activeElement,
    ),
    true,
  );
  const addSupport = button("Thêm ảnh phụ");
  await addSupport.focus();
  const keyboardChooserPromise = p.waitForEvent("filechooser");
  await addSupport.press("Enter");
  const keyboardChooser = await keyboardChooserPromise;
  assert.equal(keyboardChooser.isMultiple(), true);
  await keyboardChooser.setFiles([]);
  assert.equal(await thumbnails.count(), 3);
  const initialPreviews = await thumbnails.evaluateAll((nodes) =>
    nodes.map((node) => node.src),
  );
  await button("Xóa ảnh phụ 1").click();
  assert.deepEqual(
    await thumbnails.evaluateAll((nodes) => nodes.map((node) => node.src)),
    [initialPreviews[0], initialPreviews[2]],
  );
  // Invalid batches preserve both the selected files and their preview order.
  for (const invalid of [
    { name: "wrong.gif", mimeType: "image/gif", buffer: fixture.photo },
    {
      name: "oversized.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(10_000_001),
    },
  ]) {
    await fileInput.setInputFiles([photo("valid.png"), invalid]);
    await p
      .getByRole("alert")
      .filter({ hasText: /JPEG, PNG hoặc WebP và không quá 10 MB/ })
      .waitFor();
    assert.equal(await thumbnails.count(), 2);
    assert.equal(await fileInput.inputValue(), "");
  }
  await fileInput.setInputFiles(
    Array.from({ length: 7 }, (_, i) => photo(`overflow-${i}.png`)),
  );
  await p
    .getByRole("alert")
    .filter({ hasText: /chọn thêm 6 ảnh/ })
    .waitFor();
  assert.equal(await thumbnails.count(), 2);
  await fileInput.setInputFiles(
    Array.from({ length: 6 }, (_, i) => photo(`extra-${i}.png`)),
  );
  await thumbnails.nth(7).waitFor();
  assert.equal(await fileInput.isDisabled(), true);
  assert.equal(
    await button("Xóa ảnh phụ 7").evaluate(
      (node) => node === document.activeElement,
    ),
    true,
  );
  // Replacement remains available at capacity and never appends a ninth photo.
  const atCapacity = await thumbnails.evaluateAll((nodes) =>
    nodes.map((node) => node.src),
  );
  const capacityReplacePromise = p.waitForEvent("filechooser");
  await button("Thay ảnh phụ 7").press("Enter");
  const capacityReplace = await capacityReplacePromise;
  await capacityReplace.setFiles(photo("qa-capacity-replacement.png"));
  const replacedCapacity = await thumbnails.evaluateAll((nodes) =>
    nodes.map((node) => node.src),
  );
  assert.equal(replacedCapacity.length, 8);
  assert.deepEqual(replacedCapacity.slice(0, 7), atCapacity.slice(0, 7));
  assert.notEqual(replacedCapacity[7], atCapacity[7]);
  const desktopPreview = p.getByRole("complementary", {
    name: "Tóm tắt bản nháp",
  });
  for (const [width, height, scale] of [
    [1440, 720, 100],
    [1440, 900, 130],
    [1200, 600, 130],
  ]) {
    await p.setViewportSize({ width, height });
    await p.evaluate((scale) => {
      document.documentElement.style.fontSize = `${scale}%`;
      window.scrollTo(0, 0);
    }, scale);
    assert.equal(
      await desktopPreview.evaluate((node) => getComputedStyle(node).position),
      "sticky",
    );
    const startY = await desktopPreview.evaluate(
      (node) => node.getBoundingClientRect().top + window.scrollY,
    );
    const maxOffset = await desktopPreview.evaluate(
      (node) =>
        node.parentElement.getBoundingClientRect().height -
        node.clientHeight -
        112,
    );
    for (const offset of [
      Math.min(120, maxOffset / 3),
      Math.min(220, (maxOffset * 2) / 3),
    ]) {
      await p.evaluate((y) => window.scrollTo(0, y), startY + offset);
      await p.waitForFunction(
        () =>
          Math.abs(
            document
              .querySelector('aside[aria-label="Tóm tắt bản nháp"]')
              .getBoundingClientRect().top - 112,
          ) < 1,
      );
    }
    const metrics = await desktopPreview.evaluate((node) => ({
      height: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }));
    assert.ok(metrics.height <= height - 136 + 1);
    if (metrics.scrollHeight > metrics.height) {
      await desktopPreview.focus();
      await p.keyboard.press("End");
      await p.waitForFunction(() => {
        const node = document.querySelector(
          'aside[aria-label="Tóm tắt bản nháp"]',
        );
        return node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      });
    }
    await desktopPreview.evaluate((node) => {
      node.scrollTop = 0;
    });
    await p.screenshot({
      path: path.join(
        artifacts,
        `sell-sticky-preview-${width}-${height}-${scale}.png`,
      ),
      fullPage: false,
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  await p.evaluate(() => {
    document.documentElement.style.fontSize = "130%";
  });
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    if (width === 390) assert.equal(await desktopPreview.count(), 0);
    assert.equal(await button("Thêm ảnh phụ").count(), 0);
    assert.equal(
      await selectedPhotos.evaluate(
        (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
      ),
      width === 390 ? 1 : 2,
    );
    await p.screenshot({
      path: path.join(artifacts, `sell-multiple-images-${width}.png`),
      fullPage: true,
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  for (let index = 7; index >= 2; index--)
    await button(`Xóa ảnh phụ ${index}`).click();
  assert.equal(await fileInput.isDisabled(), false);
  assert.deepEqual(
    await thumbnails.evaluateAll((nodes) => nodes.map((node) => node.src)),
    [initialPreviews[0], initialPreviews[2]],
  );
  // Draft thumbnails follow photo edits and open a read-only detail viewer.
  const draftViewer = p.getByRole("dialog", {
    name: "Ảnh bản sách của bạn",
    exact: true,
  });
  for (const width of [1440, 390]) {
    await p.setViewportSize({ width, height: 900 });
    if (width === 390)
      await p.locator("summary").filter({ hasText: "Xem bản nháp" }).click();
    const draft = p.getByRole("region", {
      name: "Bản xem trước bài đăng",
      exact: true,
    });
    const miniatures = draft.getByRole("group", {
      name: "Ảnh thu nhỏ bản nháp",
      exact: true,
    });
    assert.deepEqual(
      await miniatures
        .locator("img")
        .evaluateAll((nodes) => nodes.map((node) => node.src)),
      [initialPreviews[0], initialPreviews[2]],
    );
    const miniButtons = miniatures.getByRole("button");
    assert.equal(await miniButtons.count(), 2);
    const thumbBounds = await miniButtons.first().boundingBox();
    assert.ok(thumbBounds.width >= 44 && thumbBounds.height >= 44);
    const coverBounds = await draft
      .getByRole("button", { name: "Xem ảnh bìa chi tiết", exact: true })
      .first()
      .boundingBox();
    assert.ok(thumbBounds.y >= coverBounds.y + coverBounds.height);
    await draft.screenshot({
      path: path.join(artifacts, `sell-draft-thumbnails-${width}.png`),
    });
    const secondThumb = miniatures.getByRole("button", {
      name: "Xem ảnh phụ 1 chi tiết",
      exact: true,
    });
    const oldOverflow = await p.evaluate(
      () => document.documentElement.style.overflowY,
    );
    await secondThumb.click();
    await draftViewer.waitFor();
    assert.equal(
      await draftViewer.locator("img").getAttribute("src"),
      initialPreviews[2],
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.style.overflowY),
      "hidden",
    );
    await draftViewer
      .getByRole("button", { name: "Ảnh trước", exact: true })
      .click();
    assert.equal(
      await draftViewer.locator("img").getAttribute("src"),
      initialPreviews[0],
    );
    await p.keyboard.press("ArrowRight");
    assert.equal(
      await draftViewer.locator("img").getAttribute("src"),
      initialPreviews[2],
    );
    await draftViewer.screenshot({
      path: path.join(artifacts, `sell-draft-photo-detail-${width}.png`),
    });
    await p.keyboard.press("Tab");
    assert.equal(
      await draftViewer.evaluate((node) =>
        node.contains(document.activeElement),
      ),
      true,
    );
    await p.keyboard.press("Escape");
    await draftViewer.waitFor({ state: "hidden" });
    assert.equal(
      await secondThumb.evaluate((node) => node === document.activeElement),
      true,
    );
    await p.waitForFunction(
      (expected) => document.documentElement.style.overflowY === expected,
      oldOverflow,
    );
    // The full cover opens the same viewer, without changing the actual cover.
    await draft
      .getByRole("button", { name: "Xem ảnh bìa chi tiết", exact: true })
      .first()
      .click();
    await draftViewer.waitFor();
    assert.equal(
      await draftViewer.locator("img").getAttribute("src"),
      initialPreviews[0],
    );
    await draftViewer
      .getByRole("button", { name: "Đóng ảnh chi tiết", exact: true })
      .click();
    await draftViewer.waitFor({ state: "hidden" });
    assert.equal(await thumbnails.count(), 2);
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    if (width === 390)
      await p.locator("summary").filter({ hasText: "Xem bản nháp" }).click();
  }
  await p.setViewportSize({ width: 1440, height: 900 });
  await step(/Tình trạng/).click();
  await p.getByLabel("Mức độ đã qua sử dụng").selectOption("Worn");
  await p
    .getByLabel("Ruột sách")
    .fill("Đủ nội dung, thiếu một trang trắng cuối sách.");
  await p.getByLabel("Bìa và gáy").fill("Gáy sờn, bìa có nếp gấp.");
  await p.getByLabel("Ghi chú, đánh dấu").fill("Không có");
  for (const [name, index] of [
    ["readable", 0],
    ["hasMissingPages", 0],
    ["missingEssentialContent", 1],
  ]) {
    const input = p.locator(`input[name=${name}]`).nth(index);
    await input.locator("..").click();
    assert.equal(await input.isChecked(), true);
  }
  await p.getByLabel("Phụ kiện").fill("Không có");
  await p
    .getByLabel("Mô tả chung")
    .fill("DỮ LIỆU QA. Bản sách cũ có gáy sờn, đủ nội dung để đọc.");
  await step(/Bán hoặc đổi/).click();
  const both = p.getByRole("radio", { name: "Bán hoặc đổi", exact: true });
  if (!(await both.isChecked())) await both.locator("..").click();
  assert.equal(await both.isChecked(), true);
  await p.getByLabel("Giá bán (VNĐ)").fill("35000");
  await p.getByLabel("Giá trị đổi (VNĐ)").fill("45000");
  // Regression: validation's address link must open the portalled form.
  await p.setViewportSize({ width: 1440, height: 900 });
  await button("Tiếp tục").click();
  await p.screenshot({
    path: path.join(artifacts, "origin-validation-error-desktop.png"),
    fullPage: false,
  });
  const originErrorLink = p.getByRole("alert").getByRole("button", {
    name: "Chọn địa chỉ đã lưu hoặc nhập đủ nơi gửi sách và khu vực luân chuyển.",
    exact: true,
  });
  await originErrorLink.click();
  await p
    .getByRole("dialog", { name: "Nơi gửi sách", exact: true })
    .waitFor({ timeout: 5000 });
  await p.locator("dialog[open]").evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished),
    );
  });
  await p.screenshot({
    path: path.join(artifacts, "origin-validation-popup-desktop.png"),
    fullPage: false,
  });
  await p.getByRole("button", { name: "Đóng popup", exact: true }).click();
  assert.equal(
    await originErrorLink.evaluate((node) => node === document.activeElement),
    true,
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await originErrorLink.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog", { name: "Nơi gửi sách", exact: true }).waitFor();
  await p.getByLabel("Họ tên người gửi", { exact: true }).fill("Người gửi QA");
  await p.getByRole("button", { name: "Đóng popup", exact: true }).click();
  await originErrorLink.click();
  assert.equal(
    await p.getByLabel("Họ tên người gửi", { exact: true }).inputValue(),
    "Người gửi QA",
  );
  await p
    .getByLabel("Số điện thoại người gửi", { exact: true })
    .fill("0901234567");
  const regionSelect = p.getByLabel("Khu vực luân chuyển sách", {
    exact: true,
  });
  assert.deepEqual(await regionSelect.locator("option").allTextContents(), [
    "Chọn khu vực",
    "TP.HCM",
    "Bình Dương",
    "Vũng Tàu",
  ]);
  await regionSelect.selectOption("DEMO-C");
  await p.getByLabel("Địa chỉ chi tiết", { exact: true }).fill("123 Đường QA");

  await p.locator("dialog[open]").evaluate(async (node) => {
    await document.fonts.ready;
    await Promise.all(
      node.getAnimations().map((animation) => animation.finished),
    );
    node.querySelector("h2")?.focus();
    node.scrollTo({ top: 0 });
  });
  const originBorders = await p
    .locator("dialog[open] input")
    .evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderTopColor),
    );
  for (const border of originBorders)
    assert.equal(border, "rgb(142, 117, 100)");
  await p.screenshot({
    path: path.join(artifacts, "origin-popup-mobile.png"),
    fullPage: false,
  });
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.screenshot({
    path: path.join(artifacts, "origin-popup-desktop.png"),
    fullPage: false,
  });
  await p.setViewportSize({ width: 390, height: 844 });
  await p
    .getByRole("button", { name: "Dùng nơi gửi này", exact: true })
    .click();
  await step(/Kiểm tra/).click();
  await button("Chỉnh sửa thông tin sách").click();
  await p
    .getByLabel("Tác giả", { exact: true })
    .fill("Tác giả QA đã chỉnh sửa");
  await step(/Kiểm tra/).click();
  await p
    .getByText("Tác giả QA đã chỉnh sửa", { exact: true })
    .last()
    .waitFor();
  await p
    .getByLabel("Tôi có quyền sở hữu và đăng bán hoặc trao đổi cuốn sách này.")
    .check();
  for (const scale of [100, 130]) {
    await p.evaluate(
      (scale) => (document.documentElement.style.fontSize = `${scale}%`),
      scale,
    );
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({
      path: path.join(artifacts, `sell-review-390-${scale}.png`),
      fullPage: true,
      animations: "disabled",
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Sell overflow at ${scale}%`,
    );
  }
  let lost = false;
  const attempts = [];
  await p.route("**/api/v1/listings/*/submit", async (route) => {
    attempts.push({
      headers: route.request().headers(),
      body: route.request().postData(),
    });
    const response = await route.fetch();
    if (!lost && response.status() === 200) {
      lost = true;
      await route.abort("failed");
    } else await route.fulfill({ response });
  });
  let processing = false;
  mediaTimer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      await fixture.processMedia();
    } finally {
      processing = false;
    }
  }, 250);
  const before = await fixture.db.collection("listings").countDocuments();
  const addressesBefore = await fixture.db
    .collection("member_addresses")
    .countDocuments();
  const submittedAuthors = [];
  p.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith("/catalog/requests")
    )
      submittedAuthors.push(request.postDataJSON().metadata.authors);
  });
  const addressAttempts = [];
  let addressAckLost = false;
  await p.route("**/api/v1/me/addresses", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    addressAttempts.push({
      key: route.request().headers()["idempotency-key"],
      bodyHash: createHash("sha256")
        .update(route.request().postData() ?? "")
        .digest("hex"),
    });
    const response = await route.fetch();
    if (!addressAckLost && response.status() === 200) {
      addressAckLost = true;
      return route.fulfill({
        status: 502,
        contentType: "text/plain",
        body: "Bad Gateway",
      });
    }
    await route.fulfill({ response });
  });
  await button("Gửi duyệt").click();
  await p
    .getByRole("alert")
    .filter({ hasText: /Yêu cầu chưa thực hiện được/ })
    .waitFor();
  assert.equal(
    await fixture.db.collection("member_addresses").countDocuments(),
    addressesBefore + 1,
  );
  // A focus refresh can see the committed address while the POST ACK is unknown.
  const refreshAddress = p.waitForResponse(
    (response) =>
      response.url().endsWith("/me/addresses") &&
      response.request().method() === "GET",
  );
  await p.evaluate(async () => {
    const { queryClient } = await import("/src/lib/session.ts");
    await queryClient.invalidateQueries({ queryKey: ["address-book"] });
  });
  await refreshAddress;
  await step(/Thông tin sách/).click();
  await p
    .getByLabel("Tác giả", { exact: true })
    .fill("Tác giả QA sau lỗi kết nối");
  await step(/Kiểm tra/).click();
  await button("Gửi duyệt").click();
  await button("Thử gửi lại").waitFor({ timeout: 45000 });
  await p.getByRole("alert").waitFor();
  await p
    .getByText(/Bạn đã có tối đa 5 bài đang hiển thị hoặc chờ admin duyệt/)
    .waitFor();
  assert.equal(
    await fixture.db.collection("listings").countDocuments(),
    before + 1,
  );
  for (const width of [390, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    await p.screenshot({
      path: path.join(artifacts, `listing-quota-${width}.png`),
      fullPage: true,
    });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
  }
  // Free one actual slot, then retry the pinned request through a lost ACK.
  const toHide = await fixture.api(
    `/me/listings/${fixture.listings[0]}`,
    fixture.member.accessToken,
  );
  await fixture.api(
    `/listings/${toHide.id}/visibility`,
    fixture.member.accessToken,
    { expectedVersion: toHide.version, visibility: "Hidden" },
    "PUT",
  );
  await button("Thử gửi lại").click();
  await p
    .getByRole("alert")
    .filter({ hasText: /Thông tin đang được giữ nguyên/ })
    .waitFor();
  await button("Thử gửi lại").waitFor();
  await button("Thử gửi lại").click();
  await p
    .getByRole("heading", { name: "Đã gửi duyệt", exact: true })
    .waitFor({ timeout: 45000 });
  assert.deepEqual(submittedAuthors, [["Tác giả QA sau lỗi kết nối"]]);
  assert.equal(addressAttempts.length, 2);
  assert.deepEqual(addressAttempts[0], addressAttempts[1]);
  assert.equal(
    await fixture.db.collection("member_addresses").countDocuments(),
    addressesBefore + 1,
  );
  assert.equal(attempts.length, 3);
  for (const attempt of attempts.slice(1)) {
    assert.equal(
      attempts[0].headers["idempotency-key"],
      attempt.headers["idempotency-key"],
    );
    assert.equal(attempts[0].body, attempt.body);
  }
  assert.equal(
    await fixture.db.collection("listings").countDocuments(),
    before + 1,
  );
  assert.equal(
    await fixture.db.collection("member_addresses").countDocuments(),
    addressesBefore + 1,
  );
  const latest = await fixture.api("/me/listings", fixture.member.accessToken);
  const id = latest.items.find(
    (item) => !fixture.listings.includes(item.id),
  ).id;
  const posted = await fixture.api(
    `/me/listings/${id}`,
    fixture.member.accessToken,
  );
  assert.equal(posted.state.moderation, "PendingReview");
  assert.equal(posted.currentRevision.content.mediaIds.length, 2);
  assert.equal(await fixture.db.collection("listing_fees").countDocuments(), 0);
  assert.equal(
    (await fixture.api("/me/wallet", fixture.member.accessToken)).available,
    0,
  );
  assert.equal(posted.currentRevision.content.hasMissingPages, true);
  assert.equal(posted.currentRevision.content.condition, "Worn");
  assert.equal(posted.currentRevision.content.exchangeValue, 45000);
  assert.equal(posted.currentRevision.fulfillmentStatus, "Current");
  assert.equal(
    posted.currentRevision.content.fulfillment.method,
    "DirectDelivery",
  );
  // Another authenticated Member opens chat for a real fixture listing. The server
  // commits the first request but its response is lost; retry must replay it.
  await p.goto(origin + "/login");
  await p.getByLabel(/^Email/).fill("admin@operations.test");
  await p.getByLabel(/^Mật khẩu/).fill(password);
  await button("Đăng nhập").click();
  await p.waitForURL(origin + "/");
  const selectedPath = await p
    .getByRole("link", { name: "Xem sách", exact: true })
    .first()
    .getAttribute("href");
  const selectedListing = selectedPath.split("/").at(-1);
  await p.getByRole("link", { name: "Xem sách", exact: true }).first().click();
  const reserveAttempts = [];
  let reserveLost = false;
  await p.route(
    "**/api/v1/listings/*/purchase-conversations",
    async (route) => {
      reserveAttempts.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      if (!reserveLost) {
        reserveLost = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await button("Chat với người bán").click();
  await p.getByRole("heading", { name: "Chưa mở được cuộc trao đổi", exact: true }).waitFor();
  await p.screenshot({
    path: path.join(artifacts, "chat-start-retry-390-130.png"),
    fullPage: true,
    animations: "disabled",
  });
  await button("Thử lại").click();
  await p.waitForURL((url) => /^\/chat\/[a-f0-9-]+$/.test(url.pathname));
  assert.equal(reserveAttempts.length, 2);
  assert.equal(reserveAttempts[0].key, reserveAttempts[1].key);
  assert.equal(reserveAttempts[0].body, reserveAttempts[1].body);
  const buyerConversations = await fixture.api(
    "/me/purchase-conversations",
    admin.accessToken,
  );
  assert.equal(
    buyerConversations.filter((item) => item.listingId === selectedListing)
      .length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS user-web: real shelf/filter/pagination/detail; empty/error/retry; login return and owner guard; five tabs/data retention; multi-file picker/add/remove/max8/validation, draft thumbnail/detail viewer/keyboard/focus, review-author edit/address502 replay, two-photo upload/submit replay; chat lost-response replay with one conversation; 390px100/130%, Home/Detail/Search320px130%. Fake storage, no native acceptance.",
  );
} catch (error) {
  const pages = browser?.contexts().flatMap((context) => context.pages()) ?? [];
  if (pages[0])
    await pages[0].screenshot({
      path: path.join(artifacts, "failure.png"),
      fullPage: true,
      animations: "disabled",
    });
  throw error;
} finally {
  clearInterval(mediaTimer);
  await browser?.close();
  await server?.close();
  await fixture?.close();
}
