import assert from "node:assert/strict";

// Read contrast after real pointer/keyboard states. Suppress only the audit click;
// this check must never submit a payment/withdrawal or navigate away.
export async function auditWalletButtons(page, scope, label, report) {
  for (const element of await scope.locator("button").all()) {
    if (!(await element.isVisible()) || !(await element.isEnabled())) continue;
    const name =
      (await element.getAttribute("aria-label")) ||
      (await element.innerText()).trim();
    await page.mouse.move(0, 0);
    await page.keyboard.press("Tab");
    await element.focus();
    await page.waitForTimeout(220);
    report.push(await sample(element, label, name, "focus"));
    await element.hover();
    await page.waitForTimeout(220);
    report.push(await sample(element, label, name, "hover"));
    await page.mouse.down();
    try {
      await page.waitForTimeout(220);
      report.push(await sample(element, label, name, "active"));
    } finally {
      await element.evaluate((node) =>
        node.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
          },
          { capture: true, once: true },
        ),
      );
      await page.mouse.up();
    }
  }
  await page.mouse.move(0, 0);
}

async function sample(element, scope, name, state) {
  const colors = await element.evaluate((node) => {
    const rgba = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
    };
    const layers = [];
    for (let parent = node; parent; parent = parent.parentElement) {
      layers.push(rgba(getComputedStyle(parent).backgroundColor));
    }
    let background = [255, 255, 255];
    for (const layer of layers.reverse()) {
      background = background.map(
        (channel, i) => channel * (1 - layer[3]) + layer[i] * layer[3],
      );
    }
    return { background, foreground: rgba(getComputedStyle(node).color) };
  });
  const luminance = (color) =>
    color
      .slice(0, 3)
      .map((channel) => {
        const c = channel / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce(
        (sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i],
        0,
      );
  const a = luminance(colors.background),
    b = luminance(colors.foreground);
  return {
    scope,
    name,
    state,
    ...colors,
    contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
  };
}

export function assertWalletButtonsReadable(report) {
  assert.deepEqual(
    report.filter((row) => row.contrast < 4.5),
    [],
    "Wallet button text must remain readable in every interactive state",
  );
}
