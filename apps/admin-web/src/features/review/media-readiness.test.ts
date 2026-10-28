import { describe, expect, it } from "vitest";
import { reviewImageReady } from "./media-readiness";

describe("private review image readiness", () => {
  it("never enables approval just because a signed read was cached", () => {
    expect(
      reviewImageReady("https://storage.test/one", undefined, undefined, false),
    ).toBe(false);
    expect(reviewImageReady(undefined, undefined, undefined, false)).toBe(
      false,
    );
  });
  it("invalidates a loaded URL on decode/network failure or a denied renewed read", () => {
    const url = "https://storage.test/one";
    expect(reviewImageReady(url, url, undefined, false)).toBe(true);
    expect(reviewImageReady(url, url, url, false)).toBe(false);
    expect(reviewImageReady(url, url, undefined, true)).toBe(false);
  });
  it("requires a successful new image load after URL renewal", () => {
    expect(
      reviewImageReady(
        "https://storage.test/new",
        "https://storage.test/old",
        undefined,
        false,
      ),
    ).toBe(false);
    expect(
      reviewImageReady(
        "https://storage.test/new",
        "https://storage.test/new",
        "https://storage.test/old",
        false,
      ),
    ).toBe(true);
  });
});
