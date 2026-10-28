import assert from "node:assert/strict";
import path from "node:path";

// Run against the public-shelf fixture's real Nest/Mongo API. Fault injection is
// only for client error states; no invented products replace empty server data.
export async function memberDataJourney(browser, origin, artifacts) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(`${origin}/search?q=QA-no-book-matches-20261028`);
    await page
      .getByText("Không tìm thấy cuốn sách phù hợp", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Xem sách:/ }).count(),
      0,
    );
    assert.equal(
      await page.locator('img[src*="googleusercontent.com"]').count(),
      0,
    );
    await page.screenshot({
      path: path.join(artifacts, "search-empty-real-390.png"),
      fullPage: true,
    });

    await page.route("**/api/v1/listings?**", (route) => route.abort("failed"));
    await page.goto(`${origin}/search?q=QA-fault-empty-20261028`);
    await page
      .getByText("Chưa tải được kết quả tìm kiếm", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Xem sách:/ }).count(),
      0,
    );
    await page.unroute("**/api/v1/listings?**");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page
      .getByText("Không tìm thấy cuốn sách phù hợp", { exact: true })
      .waitFor();

    await page.goto(`${origin}/search`);
    await page
      .getByRole("button", { name: /^Xem sách:/ })
      .first()
      .waitFor();
    const codes = new Set();
    for (let i = 0; i < 5; i++) {
      for (const label of await page
        .getByRole("button", { name: /^Xem sách:/ })
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label"))))
        codes.add(label);
      const more = page.getByRole("button", {
        name: "Xem thêm sách xưa và trao đổi",
        exact: true,
      });
      if (!(await more.count())) break;
      await more.click();
      await page
        .getByText("Đang tải thêm…", { exact: true })
        .waitFor({ state: "hidden" });
    }
    await page
      .getByText("Đã hiển thị toàn bộ kết quả tìm kiếm", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole("button", { name: /^Xem sách:/ }).count(),
      13,
    );
    assert.ok(codes.size > 0);
    await page.screenshot({
      path: path.join(artifacts, "search-pagination-real-390.png"),
      fullPage: true,
    });

    await page.goto(origin);
    await page
      .getByText("Chưa có phiên đang diễn ra", { exact: true })
      .waitFor();
    assert.equal(
      await page.getByText("14 lượt đấu", { exact: true }).count(),
      0,
    );
    assert.equal(
      await page.locator('img[src*="googleusercontent.com"]').count(),
      0,
    );
    assert.deepEqual(
      errors.filter((e) => !e.includes("Minified React error #418")),
      [],
    );
    console.log(
      "PASS Member data: real empty/error/retry and server pagination; no sample listings/auctions/photos. RN web, 390px.",
    );
  } finally {
    await context.close();
  }
}
