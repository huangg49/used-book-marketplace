import { describe, expect, it } from "vitest";
import { signedMediaRemainingMs, signedMediaStaleTime } from "./media-lifetime";

describe("signed media lifetime", () => {
  const receivedAt = Date.parse("2026-10-20T00:00:00Z");
  const expiresAt = "2026-10-20T00:02:00Z";
  it("reuses media only until five seconds before the server expiry", () => {
    expect(signedMediaRemainingMs(expiresAt, receivedAt)).toBe(115_000);
    expect(signedMediaRemainingMs(expiresAt, receivedAt + 115_000)).toBe(0);
  });
  it.each([undefined, "", "invalid", "2026-10-19T00:00:00Z"])(
    "never reuses missing, invalid or expired timestamps: %s",
    (value) => {
      expect(signedMediaRemainingMs(value, receivedAt)).toBe(0);
    },
  );
  it("computes freshness from receipt time rather than shortening the TTL on every render", () => {
    const freshFor = signedMediaStaleTime(expiresAt, receivedAt);
    expect(freshFor).toBe(115_000);
    expect(signedMediaRemainingMs(expiresAt, receivedAt + 60_000)).toBe(55_000);
    expect(signedMediaStaleTime(expiresAt, receivedAt)).toBe(freshFor);
  });
});
