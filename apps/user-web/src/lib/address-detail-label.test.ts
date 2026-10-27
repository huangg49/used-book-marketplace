import { describe, expect, it } from "vitest";
import { addressDetailLabel } from "./address-detail-label";

describe("legacy demo address labels", () => {
  it("shortens known seeded zones, including historical snapshots", () => {
    for (const [source, label] of [
      ["TP.HCM", "TPHCM"],
      ["Bình Dương", "Bình Dương"],
      ["Vũng Tàu", "Vũng Tàu"],
    ]) {
      expect(
        addressDetailLabel(
          `DEMO — Nơi gửi sách mô phỏng tại ${source}; không phải địa chỉ giao nhận thật.`,
        ),
      ).toBe(label);
    }
  });
  it("preserves actual addresses and user-edited text verbatim", () => {
    for (const detail of [
      "TPHCM",
      "12 Đường số 1, TP.HCM",
      "DEMO — Nơi gửi sách mô phỏng tại TP.HCM; ghi chú riêng",
      "",
    ])
      expect(addressDetailLabel(detail)).toBe(detail);
  });
});
