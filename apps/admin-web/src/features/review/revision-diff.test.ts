import { describe, expect, it } from "vitest";
import { revision, type Revision } from "./contracts";
import { compareRevisions } from "./revision-diff";

const before = revision.parse({
  id: crypto.randomUUID(),
  number: 1,
  submittedAt: "2026-10-26T10:00:00Z",
  ownershipDeclaredAt: null,
  decision: null,
  fulfillmentStatus: "NotConfigured",
  content: {
    bookId: crypto.randomUUID(),
    mode: "Both",
    condition: "Good",
    pages: "Đủ trang",
    coverNote: "Gáy có nếp",
    notes: "",
    accessories: "",
    description: "Mô tả ban đầu",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    salePrice: 125000,
    exchangeValue: 150000,
    mediaIds: [crypto.randomUUID(), crypto.randomUUID()],
  },
});
const change = (content: Partial<Revision["content"]>): Revision =>
  revision.parse({
    ...before,
    id: crypto.randomUUID(),
    number: 2,
    content: { ...before.content, ...content },
  });
const changed = (after: Revision) =>
  compareRevisions(before, after).filter((r) => r.changed);

describe("immutable submitted revision comparison", () => {
  it("compares content rather than revision identity, dates or later decision", () => {
    const after = {
      ...change({}),
      submittedAt: "2026-10-27T10:00:00Z",
      fulfillmentStatus: "NeedsUpdate" as const,
    };
    expect(changed(after)).toEqual([]);
  });
  it("detects replacement photos with the same count and reordered photos", () => {
    expect(
      changed(
        change({ mediaIds: [crypto.randomUUID(), crypto.randomUUID()] }),
      ).map((r) => r.label),
    ).toEqual(["Ảnh gửi kèm"]);
    expect(
      changed(change({ mediaIds: [...before.content.mediaIds].reverse() })),
    ).toHaveLength(1);
    expect(before.content.mediaIds).toHaveLength(2);
  });
  it("preserves money, accents and multiline text exactly for a reviewer", () => {
    const rows = changed(
      change({ salePrice: 0, description: "Bìa mới\nTrang 25 bị rách." }),
    );
    expect(rows.map((r) => r.label)).toEqual(["Giá bán", "Mô tả"]);
    expect(rows[0].before).toContain("125.000");
    expect(rows[0].after).toContain("0");
    expect(rows[1].after).toBe("Bìa mới\nTrang 25 bị rách.");
  });
  it("distinguishes undeclared from false and true condition declarations", () => {
    const rows = changed(change({ readable: null, hasMissingPages: true }));
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Còn đọc được",
          before: "Có",
          after: "Chưa khai báo",
        }),
        expect.objectContaining({
          label: "Thiếu trang",
          before: "Không",
          after: "Có",
        }),
      ]),
    );
  });
  it("does not call a condition, description or book change unchanged", () => {
    expect(
      changed(
        change({
          condition: "Worn",
          bookId: crypto.randomUUID(),
          pages: "Thiếu trang",
          notes: "Có viết tay",
          accessories: "Bookmark",
          coverNote: "Gáy rách",
        }),
      ),
    ).toHaveLength(6);
  });
  it("includes every bundle item's condition, note and order", () => {
    const bundle = {
      title: "Bộ hai tập",
      wholeOnly: true as const,
      exclusiveOwnershipDeclared: true as const,
      items: [
        { label: "Tập 1", condition: "Good" as const, notes: "Gáy gãy" },
        { label: "Tập 2", condition: "Fair" as const, notes: "" },
      ],
    };
    const first = change({ bundle });
    const second = change({
      bundle: {
        ...bundle,
        items: [{ ...bundle.items[0], notes: "Gáy nguyên" }, bundle.items[1]],
      },
    });
    const row = compareRevisions(first, second).find(
      (r) => r.label === "Bộ sách",
    )!;
    expect(row.changed).toBe(true);
    expect(row.before).toContain("Gáy gãy");
    expect(row.after).toContain("Gáy nguyên");
    expect(
      compareRevisions(
        first,
        change({ bundle: { ...bundle, items: [...bundle.items].reverse() } }),
      ).find((r) => r.label === "Bộ sách")?.changed,
    ).toBe(true);
  });
  it("detects origin identity and version changes without displaying a street address", () => {
    const address = crypto.randomUUID();
    const first = change({
      fulfillment: {
        originAddressId: address,
        originAddressVersion: 1,
        method: "DirectDelivery",
      },
    });
    const after = change({
      fulfillment: {
        originAddressId: address,
        originAddressVersion: 2,
        method: "DirectDelivery",
      },
    });
    expect(
      compareRevisions(first, after)
        .filter((r) => r.changed)
        .map((r) => r.label),
    ).toEqual(["Lựa chọn giao nhận"]);
  });
  it("treats absent optional data and null as the same unconfigured choice", () => {
    expect(changed(change({ bundle: null, fulfillment: null }))).toEqual([]);
  });
});
