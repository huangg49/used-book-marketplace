import assert from "node:assert/strict";
import path from "node:path";

// Called by the real Exchange fixture. The only injected response is a network
// fault for recovery; screenshots otherwise contain disposable QA data.
export async function frontendUxJourney(page, evidence, chatPath) {
  try {
    // Use the existing session and real navigation. Creating extra logins would
    // exceed the fixture's production login limit and obscure the UI checks.
    await page.getByRole("button", { name: /^Tài khoản của/ }).click();
    await page.getByRole("navigation", { name: "Tài khoản cá nhân", exact: true })
      .getByRole("link", { name: "Trao đổi của tôi", exact: true }).click();
    const sent = page.getByRole("tab", { name: /^Đề nghị đã gửi/ });
    await sent.waitFor();
    await page.locator('[role="tabpanel"] a[href^="/exchange/"]:visible').first().waitFor();
    await sent.focus();
    await sent.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: /^Đề nghị nhận được/ }).evaluate(n => n === document.activeElement), true);
    await page.getByRole("heading", { name: "Chưa có đề nghị nào gửi đến bạn" }).waitFor();
    await page.getByRole("tab", { name: /^Đề nghị nhận được/ }).press("End");
    await page.getByRole("tab", { name: /^Hoàn tất/, selected: true }).waitFor();
    await page.getByRole("tab", { name: /^Hoàn tất/ }).press("Home");
    await page.getByRole("tab", { name: /^Đề nghị đã gửi/, selected: true }).waitFor();
    await page.locator('[role="tabpanel"] a[href^="/exchange/"]:visible').first().waitFor();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(async () => { await document.fonts.ready; });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `exchange overflow at ${width}`);
      for (const box of await page.getByRole("tab").evaluateAll(nodes => nodes.map(n => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height }))))
        assert.ok(box.width >= 44 && box.height >= 48);
      await page.screenshot({ path: path.join(evidence, `exchange-mine-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => document.documentElement.style.fontSize = "130%");
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(evidence, "exchange-mine-320-large.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.style.fontSize = "");
    const menu = page.getByRole("button", { name: "Mở menu", exact: true });
    await menu.click();
    const nav = page.getByRole("navigation", { name: "Điều hướng trên điện thoại" });
    assert.equal(await nav.getByRole("link", { name: "Đổi sách", exact: true }).getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: "Đóng menu", exact: true }).press("Escape");
    assert.equal(await menu.evaluate(n => n === document.activeElement), true);
    await menu.click();
    await nav.getByRole("button", { name: "Đăng xuất", exact: true }).focus();
    await nav.getByRole("button", { name: "Đăng xuất", exact: true }).press("Tab");
    assert.equal(await nav.count(), 0);
    await page.route("**/api/v1/exchanges", route => route.abort("failed"));
    // An unvisited tab exercises a fresh read without changing session semantics.
    await page.getByRole("tab", { name: /^Đang thực hiện/ }).click();
    await page.getByRole("heading", { name: "Chưa tải được trao đổi", exact: true }).waitFor();
    await page.unroute("**/api/v1/exchanges");
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("heading", { name: "Không có giao dịch nào đang thực hiện" }).waitFor();
    await page.getByRole("tab", { name: /^Đề nghị đã gửi/ }).click();
    await page.locator('[role="tabpanel"] a[href^="/exchange/"]:visible').first().waitFor();
    console.log("PASS frontend UX: exchange data/empty/error/retry; tabs Arrow/Home/End; 1440/768/390/320 and large text; mobile menu Escape/focus dismissal.");
  } finally {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.getByRole("link", { name: "Chat, hội thoại của bạn", exact: true }).click();
    await page.locator(`a[href="${chatPath}"]`).first().click();
    await page.getByRole("button", { name: "Hủy đề nghị", exact: true }).waitFor();
  }
}
