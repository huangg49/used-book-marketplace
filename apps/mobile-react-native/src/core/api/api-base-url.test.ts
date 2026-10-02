import { describe, expect, it } from "vitest";
import { apiBaseUrl } from "./api-base-url";

describe("public API platform configuration", () => {
  const shared = "http://127.0.0.1:3046/api/v1";
  it("preserves the explicit shared QA URL on every platform", () => {
    for (const platform of ["android", "web", "ios"])
      expect(apiBaseUrl(platform, { shared })).toBe(shared);
  });
  it("selects only the current platform override", () => {
    const android = "http://10.0.2.2:3000/api/v1/";
    expect(apiBaseUrl("android", { shared, android })).toBe(
      android.slice(0, -1),
    );
    expect(apiBaseUrl("web", { shared, android })).toBe(shared);
  });
  it("rejects missing configuration and credentials in client URLs", () => {
    expect(() => apiBaseUrl("android", {})).toThrow();
    for (const url of [
      "file:///api/v1",
      "https://user:secret@example.test/api/v1",
      "https://example.test/api/v1?token=test",
    ])
      expect(() => apiBaseUrl("web", { shared: url })).toThrow();
  });
});
