import { describe, expect, it } from "vitest";
import { DEFAULT_SALE_COMMISSION_BPS } from "./sale-fees";
import {
  PLATFORM_CONTACT_CHANNELS,
  PLATFORM_CONTACT_EMAIL,
  PLATFORM_POLICY_SECTIONS,
} from "./platform-policy";

describe("public policy and contact copy", () => {
  it("uses the agreed contact address", () => {
    expect(PLATFORM_CONTACT_EMAIL).toBe("latlai@example.com");
    expect(PLATFORM_CONTACT_CHANNELS.find((c) => c.id === "email")?.detail).toBe(PLATFORM_CONTACT_EMAIL);
  });
  it("quotes the commission from the shared fee constant", () => {
    const fees = PLATFORM_POLICY_SECTIONS.find((s) => s.id === "fees")!;
    expect(DEFAULT_SALE_COMMISSION_BPS).toBe(500);
    expect(fees.points.join(" ")).toContain("5%");
  });
  it("has unique anchors with content", () => {
    const ids = PLATFORM_POLICY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of PLATFORM_POLICY_SECTIONS) expect(s.points.length).toBeGreaterThan(0);
  });
});
