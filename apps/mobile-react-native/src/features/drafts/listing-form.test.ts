import { describe, expect, it } from "vitest";
import { emptyContent, type Draft, type Media } from "./contracts";
import {
  errorStep,
  firstError,
  fromContent,
  listingSummary,
  stepComplete,
  stillFailing,
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
    expect(errorStep({})).toBe(3);
  });
  it("targets the first error in on-screen order, photos before condition", () => {
    expect(
      firstError({ description: "short", mediaIds: "pending", salePrice: "x" }),
    ).toBe("mediaIds");
    expect(firstError({ readable: "no", pages: "empty" })).toBe("pages");
    expect(firstError({})).toBeNull();
  });
  it("clears fixed errors without surfacing unflagged ones", () => {
    const flagged = { mediaIds: "old", description: "short" };
    expect(stillFailing(flagged, { description: "still short" })).toEqual({
      description: "still short",
    });
    expect(stillFailing(flagged, { pages: "empty" })).toEqual({});
    expect(stillFailing({}, { pages: "empty" })).toEqual({});
  });
  it("derives step progress only from entered data", () => {
    const f = valid();
    expect([0, 1, 2].map((s) => stepComplete(f, ready, s))).toEqual([
      true,
      true,
      true,
    ]);
    expect(stepComplete({ ...f, bookId: null }, ready, 0)).toBe(false);
    // A selected photo that is still processing does not count as done.
    expect(
      stepComplete(f, [{ id: "photo", status: "Processing" }] as Media[], 1),
    ).toBe(false);
    expect(stepComplete({ ...f, description: "ngắn" }, ready, 1)).toBe(false);
    expect(stepComplete({ ...f, salePrice: "" }, ready, 2)).toBe(false);
    // Other steps stay complete when only one step is missing data.
    expect(stepComplete({ ...f, salePrice: "" }, ready, 1)).toBe(true);
    // The ownership declaration is a submit-time confirmation, not progress.
    expect(stepComplete(f, ready, 3)).toBe(true);
  });
});
describe("my books row summary", () => {
  const row = (state: object, extra: object = {}) =>
    ({
      state: {
        moderation: "Draft",
        visibility: "Visible",
        trade: "Available",
        deletedAt: null,
        ...state,
      },
      latestDecision: null,
      removalReason: null,
      catalogStatus: null,
      ...extra,
    }) as unknown as Draft;
  it("names the next action and keeps each label unique by position", () => {
    expect(listingSummary(row({}), 1).action).toBe("Hoàn thiện sách 1");
    expect(listingSummary(row({ moderation: "PendingReview" }), 2).action).toBe(
      "Xem sách 2 đang chờ duyệt",
    );
    expect(listingSummary(row({ moderation: "Approved" }), 3).action).toBe(
      "Quản lý sách 3",
    );
  });
  it("explains state from real fields without claiming shelf presence", () => {
    const rejected = listingSummary(
      row(
        { moderation: "Rejected" },
        { latestDecision: { decision: "Reject", reason: "Ảnh mờ" } },
      ),
      1,
    );
    expect(rejected).toEqual({
      status: "Cần chỉnh sửa",
      note: "Góp ý: Ảnh mờ",
      action: "Sửa sách 1 theo góp ý",
    });
    expect(
      listingSummary(
        row({ moderation: "PendingReview" }, { catalogStatus: "Pending" }),
        1,
      ).note,
    ).toBe("Đầu sách đang chờ xác nhận.");
    const hidden = listingSummary(
      row({ moderation: "Approved", visibility: "Hidden", trade: "Reserved" }),
      1,
    );
    expect(hidden.status).toBe(
      "Đã được duyệt · Đang ẩn · Đang giữ cho một đơn",
    );
    expect(
      JSON.stringify(listingSummary(row({ moderation: "Approved" }), 1)),
    ).not.toContain("trên kệ");
    expect(
      listingSummary(
        row(
          { moderation: "Approved", visibility: "Removed" },
          {
            removalReason: "Vi phạm",
          },
        ),
        4,
      ),
    ).toEqual({
      status: "Đã gỡ",
      note: "Lý do gỡ: Vi phạm",
      action: "Xem sách 4 đã gỡ",
    });
  });
});
