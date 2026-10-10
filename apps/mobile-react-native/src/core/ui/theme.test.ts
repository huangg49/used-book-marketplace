import { expect, it } from "vitest";
import { colors, feedbackColors, colorRoles, metrics } from "./theme";

const luminance = (hex: string) => {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
it("keeps actual text/control color combinations above their contrast thresholds", () => {
  for (const bg of [colors.paper, colors.surface]) {
    for (const fg of [colors.ink, colors.muted, colors.forest, colors.rustText])
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.border, bg)).toBeGreaterThanOrEqual(3);
  }
  for (const pair of Object.values(feedbackColors))
    expect(contrast(pair.text, pair.surface)).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(colorRoles.onAction, colorRoles.action),
  ).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.paper, colors.error)).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(colorRoles.navigationText, colorRoles.navigationBackground),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(colorRoles.navigationSelectedText, colorRoles.navigationSelected),
  ).toBeGreaterThanOrEqual(4.5);
  expect(
    contrast(colorRoles.navigationFocus, colorRoles.navigationBackground),
  ).toBeGreaterThanOrEqual(3);
  expect(contrast(colors.paper, colors.terracotta)).toBeLessThan(4.5);
});
it("preserves minimum target sizes even for compact controls", () => {
  expect(metrics.touch).toBeGreaterThanOrEqual(48);
  expect(metrics.control).toBeGreaterThanOrEqual(metrics.touch);
});
