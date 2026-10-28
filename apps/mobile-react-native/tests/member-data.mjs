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
    assert.equal(await page.getByRole("button", { name: "Tìm kiếm giọng nói", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Đặt lại tiêu chí", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "Ô tìm kiếm sách" }).inputValue(), "");
    await page.getByRole("button", { name: /^Xem sách:/ }).first().waitFor();

    await page.getByRole("tab", { name: "Chế độ: Sách như mới", exact: true }).click();
    await page.getByRole("button", { name: "Bỏ lọc Sách như mới", exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => {
      const entries = [...document.querySelectorAll('[dir="auto"],input')].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
      for (const [node, size] of entries) node.style.fontSize = `${size * 1.3}px`;
    });
    const chip = page.getByRole("button", { name: "Bỏ lọc Sách như mới", exact: true });
    const chipBox = await chip.boundingBox();
    assert.ok(chipBox.height >= 48 && chipBox.x >= 0 && chipBox.x + chipBox.width <= 321);
    for (const name of ["Thông báo", "Tin nhắn"]) {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(box.width >= 48 && box.height >= 48 && box.x >= 0 && box.x + box.width <= 321, `${name} remains reachable at 320px`);
    }
    const accountLabel = page.getByRole("tab", { name: "Tài khoản", exact: true }).getByText("Tài khoản", { exact: true });
    assert.ok(await accountLabel.evaluate(node => node.getBoundingClientRect().height <= parseFloat(getComputedStyle(node).lineHeight) * 2 + 2), "account label keeps whole words on at most two lines at 130%");
    await page.screenshot({ path: path.join(artifacts, "search-filters-320.png"), fullPage: true });
    await page.getByRole("button", { name: "Xóa toàn bộ bộ lọc", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();

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
