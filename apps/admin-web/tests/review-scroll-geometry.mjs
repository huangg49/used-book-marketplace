import assert from "node:assert/strict";

// Exercise native scrolling against rendered content, without mocking geometry.
export async function assertReviewScrollOwnership(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const reader = page.getByRole("region", { name: "Nội dung và bằng chứng", exact: true });
  const decision = page.getByRole("region", { name: "Phiếu quyết định", exact: true });
  const dossier = page.getByRole("region", { name: "Bàn đọc hồ sơ", exact: true });
  const heading = page.getByRole("heading", { name: "Bài đăng sách", exact: true });
  const geometry = await reader.evaluate((element) => {
    const dossier = element.closest("[data-review-dossier]");
    const decision = dossier.querySelector('[aria-label="Phiếu quyết định"]');
    const ownScroll = getComputedStyle(element).overflowY === "auto";
    const rect = (el) => { const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
    return {
      ownScroll,
      reader: rect(element), decision: rect(decision), dossier: rect(dossier),
      documentFits: document.documentElement.scrollHeight <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
      dossierOverflow: dossier.scrollHeight - dossier.clientHeight,
    };
  });
  assert(geometry.documentFits, "Review must fit the viewport without document scrolling");
  assert(geometry.dossier.top >= 0 && geometry.dossier.bottom <= await page.evaluate(() => innerHeight) + 1, "Dossier must stay within the viewport: " + JSON.stringify(geometry));
  if (geometry.ownScroll) {
    assert(Math.abs(geometry.reader.top - geometry.decision.top) <= 1, "Reader and decision must share their top boundary");
    assert(Math.abs(geometry.reader.bottom - geometry.decision.bottom) <= 1, "Reader and decision must share their bottom boundary");
    assert(geometry.dossierOverflow <= 1, "Desktop dossier must not add a second nested scrollbar");
  } else {
    assert.equal(await decision.evaluate(el => getComputedStyle(el).overflowY), "visible", "Narrow mode must have one dossier scroller");
  }
  const scroller = geometry.ownScroll ? reader : dossier;
  await scroller.evaluate(el => el.scrollTo({ top: 0, behavior: "instant" }));
  const fixedHeading = await heading.boundingBox();
  const decisionStart = await decision.boundingBox();
  const scrollBounds = await scroller.boundingBox();
  await page.mouse.move(scrollBounds.x + Math.min(40, scrollBounds.width / 2), scrollBounds.y + scrollBounds.height / 2);
  await page.mouse.wheel(0, 480);
  await page.waitForFunction(({ label, own }) => {
    const el = document.querySelector(own ? `[aria-label="${label}"]` : "[data-review-dossier]");
    return el.scrollTop > 0;
  }, { label: "Nội dung và bằng chứng", own: geometry.ownScroll });
  assert(Math.abs((await heading.boundingBox()).y - fixedHeading.y) <= 1, "Wheel must not move the page header");
  if (geometry.ownScroll) assert(Math.abs((await decision.boundingBox()).y - decisionStart.y) <= 1, "Reader wheel must not move the decision pane");
  // At the lower boundary, wheel input stays in the active pane.
  await scroller.evaluate(el => el.scrollTo({ top: el.scrollHeight, behavior: "instant" }));
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => scrollY), 0, "Wheel must not chain to the document");
  assert(Math.abs((await heading.boundingBox()).y - fixedHeading.y) <= 1);
  await scroller.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Control+Home");
  await scroller.evaluate(el => el.scrollTo({ top: 0, behavior: "instant" }));
  await page.keyboard.press("PageDown");
  await page.waitForFunction(({ label, own }) => document.querySelector(own ? `[aria-label="${label}"]` : "[data-review-dossier]").scrollTop > 0, { label: "Nội dung và bằng chứng", own: geometry.ownScroll });
  if (geometry.ownScroll) {
    const before = await reader.evaluate(el => el.scrollTop);
    await decision.focus();
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(180);
    assert(await decision.evaluate(el => el.scrollTop > 0), "Decision must support keyboard scrolling");
    assert.equal(await reader.evaluate(el => el.scrollTop), before, "Decision keyboard scrolling must not move the reader");
    await decision.evaluate(el => el.scrollTo({ top: 0, behavior: "instant" }));
  }
  await scroller.evaluate(el => el.scrollTo({ top: 0, behavior: "instant" }));
  return geometry;
}
