// Frontend-only fixtures; optional read-only benchmark against a live local API.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const appRoot = path.join(root, "apps/user-web");
const require = createRequire(
  new URL("../../admin-web/package.json", import.meta.url),
);
const webRequire = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = require("playwright");
const { createServer } = await import(
  pathToFileURL(webRequire.resolve("vite")).href
);
const origin = "http://127.0.0.1:5196";
const artifacts = path.join(root, ".tmp/listing-cache-qa");
await mkdir(artifacts, { recursive: true });
process.env.VITE_API_BASE_URL = `${origin}/api/v1`;
process.env.LATLAI_DEV_API_ORIGIN = "http://localhost:3000";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const listings = Array.from({ length: 20 }, (_, i) => ({
  id: uuid(100 + i),
  revisionId: uuid(200 + i),
  version: 1,
  book: {
    id: uuid(300 + i),
    title: `Sách QA ${i + 1}`,
    authors: ["Tác giả QA"],
    publisher: null,
    publicationYear: null,
    language: "vi",
    edition: null,
    category: "Văn học",
    isbn: null,
  },
  mode: "Both",
  condition: "Good",
  pages: "",
  coverNote: "",
  notes: "",
  accessories: "",
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  description: "Dữ liệu QA tổng hợp",
  salePrice: 75000,
  exchangeValue: 80000,
  seller: { id: uuid(1), displayName: "Người đăng QA" },
  photos: [{ id: uuid(400 + i), width: 200, height: 300 }],
  publishedAt: "2026-10-20T00:00:00Z",
  fulfillment: null,
  purchaseAvailability: { status: "Available", expiresAt: null },
}));
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=",
  "base64",
);
const loadedCover = (page) =>
  page.waitForFunction(() =>
    [...document.querySelectorAll('article img, img[alt^="Ảnh 1"]')].some(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
// The result grid slides in (BookSearchPage `pageVariants`, 380 ms). Clicking
// a card mid-slide makes Playwright retry with a forced scroll, which brings
// the next row near the viewport and correctly signs its covers.
const settledShelf = (page) =>
  page.waitForFunction(() => {
    const grid = document.querySelector('[class*="gridContainer"]');
    if (!grid) return false;
    const style = getComputedStyle(grid);
    return (
      style.opacity === "1" &&
      ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(style.transform)
    );
  });
let server, browser;
const results = [];

async function start(overrides = new Map()) {
  server = await createServer({
    root: appRoot,
    plugins: [
      {
        name: "read-only-baseline-source",
        enforce: "pre",
        load(id) {
          return overrides.get(id.split("?")[0]);
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 5196,
      strictPort: true,
      proxy: {
        "/api": { target: "http://localhost:3000", changeOrigin: true },
      },
    },
  });
  await server.listen();
}

async function fixtures(width) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
  });
  const page = await context.newPage();
  let now = Date.now(),
    listReads = 0,
    detailReads = 0,
    deniedReads = 0,
    hold = false,
    deny = false;
  const photoReads = [],
    held = [],
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: now });
  await page.route(`${origin}/qa-cover/**`, (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
  await page.route(`${origin}/api/v1/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/listings") {
      listReads++;
      return route.fulfill({
        json: {
          items: listings,
          nextCursor: null,
          serverTime: new Date(now).toISOString(),
        },
      });
    }
    const media = url.pathname.match(
      /^\/api\/v1\/listings\/([^/]+)\/media\/([^/]+)\/read$/,
    );
    if (media) {
      photoReads.push(media[1]);
      const respond = () => {
        if (deny) {
          deniedReads++;
          return route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
        }
        return route.fulfill({
              json: {
                id: media[2],
                width: 200,
                height: 300,
                url: `${origin}/qa-cover/${media[2]}-${photoReads.length}.png`,
                expiresAt: new Date(now + 120000).toISOString(),
              },
            });
      };
      if (hold) {
        held.push(respond);
        return;
      }
      return respond();
    }
    const listing = listings.find(
      (item) => url.pathname === `/api/v1/listings/${item.id}`,
    );
    if (listing) {
      detailReads++;
      // Detail must revalidate even when the shelf has cached an available book.
      return route.fulfill({
        json: {
          ...listing,
          purchaseAvailability: { status: "InTransaction", expiresAt: null },
        },
      });
    }
    return route.fulfill({ status: 503, json: { code: "QA_UNAVAILABLE" } });
  });
  try {
    await page.goto(`${origin}/books`);
    await loadedCover(page);
    const firstReads = photoReads.length;
    assert.ok(
      firstReads > 0 && firstReads < 20,
      "offscreen covers should not all request signing",
    );
    await settledShelf(page);
    const beforeDetail = photoReads.length;
    await page.locator("article h3 a").first().click();
    await page.waitForURL(`${origin}/books/${listings[0].id}`);
    await page
      .getByRole("heading", { level: 1, name: "Sách QA 1", exact: true })
      .waitFor();
    await loadedCover(page);
    assert.equal(detailReads, 1);
    assert.equal(
      await page.getByRole("link", { name: /^Mua ngay/ }).count(),
      0,
      "fresh detail prevents buying a held book",
    );
    assert.equal(
      photoReads.length,
      beforeDetail,
      "Detail should reuse the card cover",
    );
    await page.getByRole("link", { name: "Về kệ sách" }).click();
    await page.waitForURL(`${origin}/books`);
    await page.locator("article h3 a").first().waitFor();
    await loadedCover(page);
    assert.equal(listReads, 1, "Back should reuse the same filtered page");
    assert.equal(
      photoReads.length,
      beforeDetail,
      "Back should reuse unexpired cover URLs",
    );
    await page.screenshot({
      path: path.join(artifacts, `fixture-${width}.png`),
    });
    if (width === 1440) {
      hold = true;
      now += 120001;
      await page.clock.fastForward(120001);
      await page
        .locator("article")
        .first()
        .locator("img")
        .waitFor({ state: "detached" });
      assert.equal(
        await page.locator("article").first().locator("img").count(),
        0,
        "expired cover is hidden during refresh",
      );
      hold = false;
      await Promise.all(held.splice(0).map((respond) => respond()));
      // Wait for this cover's response and React render, not another card's image.
      // Advancing the clock with the first response still in flight races on CI.
      await page.locator("article").first().locator("img").waitFor();
      await page.waitForLoadState("networkidle");
      deny = true;
      now += 120001;
      await page.clock.fastForward(120001);
      const retry = page.getByRole("button", {
        name: "Tải lại ảnh Sách QA 1",
        exact: true,
      });
      await retry.waitFor();
      assert.ok(deniedReads > 0, "expired cover refresh reached the denial fixture");
      assert.equal(
        await page.locator("article").first().locator("img").count(),
        0,
        "denied refresh must not reveal the cached cover",
      );
      deny = false;
      await retry.click();
      await loadedCover(page);
      await page.locator("article").last().scrollIntoViewIfNeeded();
      await page.locator("article").last().locator("img").waitFor();
      assert.ok(
        photoReads.includes(listings.at(-1).id),
        "scrolling activates later covers",
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      fixtureWidth: width,
      initialSigningRequests: firstReads,
      detailSigningRequests: 0,
      backSigningRequests: 0,
      backListRequests: 0,
      freshDetailHeldCheck: true,
      expiryDenialRetry: width === 1440,
      noPageErrors: true,
    });
  } finally {
    await context.close();
  }
}

async function benchmark(label) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  let mediaReads = 0;
  page.on("request", (r) => {
    if (/\/media\/[^/]+\/read/.test(r.url())) mediaReads++;
  });
  try {
    const started = Date.now();
    await page.goto(`${origin}/books`);
    await loadedCover(page);
    const coldImageMs = Date.now() - started,
      initialSigningRequests = mediaReads;
    await page.locator("article h3 a").first().click();
    await page.getByRole("link", { name: "Về kệ sách" }).waitFor();
    await loadedCover(page);
    const beforeBack = mediaReads,
      backAt = Date.now();
    await page.getByRole("link", { name: "Về kệ sách" }).click();
    await page.locator("article h3 a").first().waitFor();
    await loadedCover(page);
    const warmImageMs = Date.now() - backAt;
    // Requests start immediately on observers mounting; let responses finish.
    await page.waitForLoadState("networkidle");
    results.push({
      label,
      coldImageMs,
      warmImageMs,
      initialSigningRequests,
      backSigningRequests: mediaReads - beforeBack,
    });
  } finally {
    await context.close();
  }
}

try {
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const index = process.argv.indexOf("--baseline");
  if (index >= 0) {
    const ref = process.argv[index + 1];
    assert.ok(ref, "--baseline requires a Git revision");
    const files = [
      "src/components/BookCard.tsx",
      "src/components/ListingGallery.tsx",
      "src/pages/BookSearchPage.tsx",
    ];
    const overrides = new Map(
      files.map((file) => [
        path.join(appRoot, file).replaceAll("\\", "/"),
        execFileSync("git", ["show", `${ref}:apps/user-web/${file}`], {
          cwd: root,
          encoding: "utf8",
        }),
      ]),
    );
    await start(overrides);
    await benchmark("before");
    await server.close();
    server = null;
    await start();
    await benchmark("after");
  } else {
    await start();
    await fixtures(1440);
    await fixtures(390);
  }
  console.log(JSON.stringify(results, null, 2));
  await writeFile(
    path.join(artifacts, index >= 0 ? "live-benchmark.json" : "fixtures.json"),
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser?.close();
  await server?.close();
}
