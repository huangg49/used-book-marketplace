// Run against a normal Expo web export (EXPO_PUBLIC_DESIGN_PREVIEW=0).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(repo, "apps/mobile-react-native/dist");
const require = createRequire(
  new URL("../apps/admin-web/package.json", import.meta.url),
);
const { chromium } = require("playwright");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
};
let browser;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    let target = path.resolve(
      dist,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!target.startsWith(dist + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!path.extname(target)) target += ".html";
    const body = await readFile(target);
    response
      .writeHead(200, {
        "Content-Type":
          mime[path.extname(target)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
});
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // The gate must work without calling the real API or relying on local accounts.
  await page.route("**/api/v1/**", (route) => route.abort());
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const route of [
    "showcase",
    "showcase-book?id=10000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(`${origin}/${route}`);
    await page.waitForURL(`${origin}/`);
    assert.equal(
      await page
        .getByText("BẢN XEM THỬ · DỮ LIỆU MẪU", { exact: true })
        .count(),
      0,
    );
    await page.getByLabel("Tìm sách", { exact: true }).waitFor();
  }
  console.log(
    "PASS normal export: showcase routes redirect to the real shelf; no demo banner rendered.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
