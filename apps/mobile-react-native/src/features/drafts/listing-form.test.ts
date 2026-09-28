import { describe, expect, it } from "vitest";
import { emptyContent, type Media } from "./contracts";
import {
  errorStep,
  fromContent,
  price,
  toContent,
  validateForm,
} from "./listing-form";
const ready = [{ id: "photo", status: "Ready" }] as Media[];
const valid = () =>
  fromContent({
    ...emptyContent,
    bookId: "book",
    mode: "Both",
    salePrice: 10000,
    exchangeValue: 1000000,
    condition: "Good",
    pages: "Đủ trang",
    coverNote: "Bìa hơi sờn",
    notes: "Không có",
    accessories: "Không có",
    description: "Một cuốn sách đầy đủ nội dung và còn đọc được rõ từng trang.",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    mediaIds: ["photo"],
  });
describe("member listing form", () => {
  it.each([false, true])(
    "checks trimmed Unicode maximums even for draft save (submit=%s)",
    (submit) => {
      for (const field of [
        "pages",
        "coverNote",
        "notes",
        "accessories",
        "description",
      ] as const) {
        const max = field === "description" ? 5000 : 1000;
        expect(
          validateForm(
            { ...valid(), [field]: "  " + "📚".repeat(max) + "  " },
            ready,
            true,
            submit,
          )[field],
        ).toBeUndefined();
        expect(
          validateForm(
            { ...valid(), [field]: "📚".repeat(max + 1) },
            ready,
            true,
            submit,
          )[field],
        ).toBeTruthy();
      }
    },
  );
  it("rejects too many and duplicate selected images before sending", () => {
    const images = Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      status: "Ready",
    })) as Media[];
    expect(
      validateForm(
        { ...valid(), mediaIds: images.map((i) => i.id) },
        images,
        true,
        true,
      ).mediaIds,
    ).toBeTruthy();
    expect(
      validateForm(
        { ...valid(), mediaIds: ["photo", "photo"] },
        ready,
        true,
        true,
      ).mediaIds,
    ).toBeTruthy();
  });
  it("allows incomplete drafts, validates integer prices before JSON can coerce NaN to null", () => {
    expect(validateForm(fromContent(emptyContent), [], false, false)).toEqual(
      {},
    );
    for (const s of [
      "12.5",
      "1e5",
      "125,000",
      "Infinity",
      "-100",
      "1000001",
      "9999",
    ])
      expect(
        validateForm({ ...valid(), salePrice: s }, ready, true, false)
          .salePrice,
      ).toBeTruthy();
    expect(price(" 10000 ")).toBe(10000);
  });
  it("supports both price boundaries and strips the unused price when changing mode", () => {
    expect(validateForm(valid(), ready, true, true)).toEqual({});
    expect(
      toContent({ ...valid(), mode: "Exchange", salePrice: "invalid" }),
    ).toMatchObject({ salePrice: null, exchangeValue: 1000000 });
    expect(toContent({ ...valid(), mode: "Sale" }).exchangeValue).toBeNull();
  });
  it("blocks unfinished/unavailable photos and requires the ownership declaration", () => {
    expect(validateForm(valid(), [], true, true).mediaIds).toBeTruthy();
    expect(
      validateForm(valid(), [{ ...ready[0], status: "Processing" }], true, true)
        .mediaIds,
    ).toBeTruthy();
    expect(
      validateForm(valid(), ready, false, true).ownershipDeclared,
    ).toBeTruthy();
  });
  it("requires explicit answers, readable content and no missing essential content", () => {
    for (const field of [
      "readable",
      "hasMissingPages",
      "missingEssentialContent",
    ] as const)
      expect(
        validateForm({ ...valid(), [field]: null }, ready, true, true)[field],
      ).toBeTruthy();
    expect(
      validateForm(
        { ...valid(), readable: false, missingEssentialContent: true },
        ready,
        true,
        true,
      ),
    ).toMatchObject({
      readable: expect.any(String),
      missingEssentialContent: expect.any(String),
    });
    expect(
      validateForm(
        {
          ...valid(),
          hasMissingPages: true,
          pages: "Thiếu trang trắng cuối sách; phần nội dung còn đủ.",
        },
        ready,
        true,
        true,
      ),
    ).toEqual({});
  });
  it("counts Unicode code points and directs users to the first invalid step", () => {
    expect(
      validateForm(
        { ...valid(), description: "📚".repeat(15) },
        ready,
        true,
        true,
      ).description,
    ).toBeTruthy();
    expect(errorStep({ bookId: "missing", salePrice: "bad" })).toBe(0);
    expect(errorStep({ mediaIds: "pending" })).toBe(1);
    expect(errorStep({ salePrice: "bad" })).toBe(2);
    expect(errorStep({ ownershipDeclared: "missing" })).toBe(3);
  });
});
