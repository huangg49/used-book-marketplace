import { describe, expect, it } from "vitest";
import { calculateCoverCrop } from "./image-crop";

describe("calculateCoverCrop", () => {
  it("calculates center crop coordinates for landscape (16:9) cover images", () => {
    // 1600x900 ratio is ~1.777 > 0.75
    const crop = calculateCoverCrop(1600, 900, "center");
    expect(crop.aspectRatio).toBeCloseTo(16 / 9, 2);
    expect(crop.top).toBe(0);
    expect(crop.height).toBe(100);
    expect(crop.width).toBeCloseTo(42.1875, 2);
    expect(crop.left).toBeCloseTo(28.90625, 2);
    expect(crop.align).toBe("center");
  });

  it("calculates left, right and custom position for landscape cover images", () => {
    const leftCrop = calculateCoverCrop(1600, 900, "left");
    expect(leftCrop.left).toBe(0);
    expect(leftCrop.align).toBe("left");

    const rightCrop = calculateCoverCrop(1600, 900, "right");
    expect(rightCrop.left).toBeCloseTo(100 - (0.75 / (16 / 9)) * 100, 2);
    expect(rightCrop.align).toBe("right");

    // Custom 25% offset
    const customCrop = calculateCoverCrop(1600, 900, 25);
    const maxShift = 100 - (0.75 / (16 / 9)) * 100;
    expect(customCrop.left).toBeCloseTo(0.25 * maxShift, 2);
    expect(customCrop.align).toBe("custom");
  });

  it("calculates center crop coordinates for square (1:1) cover images", () => {
    const crop = calculateCoverCrop(1000, 1000, 50);
    expect(crop.top).toBe(0);
    expect(crop.height).toBe(100);
    expect(crop.width).toBeCloseTo(75, 2);
    expect(crop.left).toBeCloseTo(12.5, 2);
  });

  it("calculates center crop coordinates for tall portrait (9:16) cover images", () => {
    const crop = calculateCoverCrop(900, 1600, 50);
    expect(crop.left).toBe(0);
    expect(crop.width).toBe(100);
    expect(crop.height).toBeCloseTo(75, 2);
    expect(crop.top).toBeCloseTo(12.5, 2);
  });

  it("handles exact 3:4 portrait cover images without cropping", () => {
    const crop = calculateCoverCrop(600, 800, 50);
    expect(crop.left).toBe(0);
    expect(crop.top).toBe(0);
    expect(crop.width).toBe(100);
    expect(crop.height).toBe(100);
  });
});
