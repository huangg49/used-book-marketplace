import { describe, expect, it } from "vitest";
import {
  archiveListingBlock,
  buildRevisionContent,
  canArchiveListing,
  canEditApproved,
  canToggleVisibility,
  codePoints,
  editApprovedBlock,
  formFromListing,
  parsePrice,
  shouldExplainEditBlock,
  validateRevision,
  type RevisionFormValue,
} from "./owner-listing-edit";

type Item = Parameters<typeof editApprovedBlock>[0];

const item = (
  state: Partial<Item["state"]> = {},
  channel: Item["channel"] = "Marketplace",
): Item =>
  ({
    channel,
    state: {
      moderation: "Approved",
      visibility: "Visible",
      trade: "Available",
      ...state,
    },
  }) as Item;

const valid = (over: Partial<RevisionFormValue> = {}): RevisionFormValue => ({
  condition: "Good",
  pages: "Sạch",
  coverNote: "Bìa tốt",
  notes: "Không có",
  accessories: "Không có",
  description: "Sách còn mới, đọc một lần, không ghi chú bên trong.",
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  mode: "Sale",
  salePrice: "50000",
  exchangeValue: "",
  originAddressId: "addr-1",
  photoCount: 2,
  ownershipDeclared: true,
  ...over,
});

describe("editApprovedBlock", () => {
  it("allows an approved, available, visible marketplace listing", () => {
    expect(editApprovedBlock(item())).toBeNull();
    expect(canEditApproved(item())).toBe(true);
  });
  it("allows a hidden approved listing", () => {
    expect(canEditApproved(item({ visibility: "Hidden" }))).toBe(true);
  });
  it("blocks reserved, sold and exchanged", () => {
    expect(editApprovedBlock(item({ trade: "Reserved" }))).toMatch(/giao dịch/);
    expect(canEditApproved(item({ trade: "Sold" }))).toBe(false);
    expect(canEditApproved(item({ trade: "Exchanged" }))).toBe(false);
  });
  it("blocks pending, draft and rejected", () => {
    expect(editApprovedBlock(item({ moderation: "PendingReview" }))).toMatch(
      /chờ duyệt/,
    );
    expect(canEditApproved(item({ moderation: "Draft" }))).toBe(false);
    expect(canEditApproved(item({ moderation: "Rejected" }))).toBe(false);
  });
  it("blocks removed and auction listings", () => {
    expect(canEditApproved(item({ visibility: "Removed" }))).toBe(false);
    expect(canEditApproved(item({}, "Auction"))).toBe(false);
  });
});

describe("shouldExplainEditBlock", () => {
  it("explains approved or pending blocks only", () => {
    expect(shouldExplainEditBlock(item({ trade: "Reserved" }))).toBe(true);
    expect(shouldExplainEditBlock(item({ moderation: "PendingReview" }))).toBe(
      true,
    );
    expect(shouldExplainEditBlock(item({ moderation: "Draft" }))).toBe(false);
    expect(shouldExplainEditBlock(item({}, "Auction"))).toBe(false);
    expect(shouldExplainEditBlock(item())).toBe(false);
  });
});

describe("formFromListing", () => {
  it("maps current revision content to form strings", () => {
    const form = formFromListing({
      currentRevision: {
        content: {
          condition: "Fair",
          pages: "p",
          mode: "Both",
          salePrice: 50000,
          exchangeValue: 40000,
          readable: true,
          hasMissingPages: false,
          missingEssentialContent: false,
          mediaIds: ["a", "b", "c"],
          fulfillment: { originAddressId: "addr-9" },
        },
      },
    } as never);
    expect(form).toMatchObject({
      condition: "Fair",
      mode: "Both",
      salePrice: "50000",
      exchangeValue: "40000",
      originAddressId: "addr-9",
      photoCount: 3,
      ownershipDeclared: false,
    });
  });
});

describe("parsePrice", () => {
  it("accepts the contract bounds", () => {
    expect(parsePrice("10000").value).toBe(10000);
    expect(parsePrice("1000000").value).toBe(1000000);
  });
  it("rejects out of range, decimals and formatted text", () => {
    expect(parsePrice("9999").error).toBeTruthy();
    expect(parsePrice("1000001").error).toBeTruthy();
    expect(parsePrice("50.000").error).toBeTruthy();
    expect(parsePrice("50000.5").error).toBeTruthy();
  });
  it("treats empty as null without error", () => {
    expect(parsePrice("  ")).toEqual({ value: null });
  });
});

describe("validateRevision", () => {
  it("passes a valid form", () => {
    expect(validateRevision(valid())).toEqual({});
  });
  it("counts code points with diacritics", () => {
    expect(codePoints("Việt")).toBe(4);
    const thirty = "ế".repeat(30);
    expect(validateRevision(valid({ description: thirty })).description).toBe(
      undefined,
    );
    expect(
      validateRevision(valid({ description: "ế".repeat(29) })).description,
    ).toBeTruthy();
    expect(
      validateRevision(valid({ description: "a".repeat(5001) })).description,
    ).toBeTruthy();
  });
  it("enforces detail field limits", () => {
    expect(validateRevision(valid({ pages: "" })).pages).toBeTruthy();
    expect(
      validateRevision(valid({ notes: "a".repeat(1001) })).notes,
    ).toBeTruthy();
  });
  it("requires readable and no missing essential content", () => {
    expect(validateRevision(valid({ readable: false })).readable).toBeTruthy();
    expect(
      validateRevision(valid({ missingEssentialContent: true }))
        .missingEssentialContent,
    ).toBeTruthy();
  });
  it("requires prices by mode and origin unless Exchange", () => {
    expect(validateRevision(valid({ salePrice: "" })).salePrice).toBeTruthy();
    const ex = validateRevision(
      valid({ mode: "Exchange", salePrice: "", exchangeValue: "", originAddressId: "" }),
    );
    expect(ex.exchangeValue).toBeTruthy();
    expect(ex.salePrice).toBeUndefined();
    expect(ex.originAddressId).toBeUndefined();
    expect(
      validateRevision(valid({ originAddressId: "" })).originAddressId,
    ).toBeTruthy();
  });
  it("requires 1-8 photos and ownership", () => {
    expect(validateRevision(valid({ photoCount: 0 })).photoCount).toBeTruthy();
    expect(validateRevision(valid({ photoCount: 9 })).photoCount).toBeTruthy();
    expect(validateRevision(valid({ photoCount: 8 })).photoCount).toBeUndefined();
    expect(
      validateRevision(valid({ ownershipDeclared: false })).ownershipDeclared,
    ).toBeTruthy();
  });
});

describe("buildRevisionContent", () => {
  const origin = { id: "addr-1", version: 3 };
  it("takes bookId from the argument and nulls prices outside the mode", () => {
    const sale = buildRevisionContent(
      valid({ exchangeValue: "20000" }),
      "book-1",
      ["m1"],
      origin,
    );
    expect(sale.bookId).toBe("book-1");
    expect(sale.exchangeValue).toBeNull();
    expect(sale.salePrice).toBe(50000);
    expect(sale.fulfillment).toEqual({
      originAddressId: "addr-1",
      originAddressVersion: 3,
      method: "DirectDelivery",
    });
    const exchange = buildRevisionContent(
      valid({ mode: "Exchange", exchangeValue: "30000" }),
      "book-1",
      ["m1"],
      origin,
    );
    expect(exchange.salePrice).toBeNull();
    expect(exchange.exchangeValue).toBe(30000);
    expect(exchange.fulfillment).toBeNull();
  });
});

describe("canToggleVisibility", () => {
  it("allows toggling visibility only on approved, available, non-removed marketplace listings", () => {
    expect(canToggleVisibility(item())).toBe(true);
    expect(canToggleVisibility(item({ visibility: "Hidden" }))).toBe(true);
    expect(canToggleVisibility(item({ moderation: "PendingReview" }))).toBe(false);
    expect(canToggleVisibility(item({ trade: "Reserved" }))).toBe(false);
    expect(canToggleVisibility(item({ visibility: "Removed" }))).toBe(false);
    expect(canToggleVisibility(item({}, "Auction"))).toBe(false);
  });
});

describe("canArchiveListing & archiveListingBlock", () => {
  it("allows archiving available, non-removed marketplace listings", () => {
    expect(canArchiveListing(item())).toBe(true);
    expect(archiveListingBlock(item())).toBeNull();
  });
  it("blocks archiving reserved, sold, removed and auction listings", () => {
    expect(canArchiveListing(item({ trade: "Reserved" }))).toBe(false);
    expect(archiveListingBlock(item({ trade: "Reserved" }))).toMatch(/giao dịch/);
    expect(canArchiveListing(item({ trade: "Sold" }))).toBe(false);
    expect(archiveListingBlock(item({ trade: "Sold" }))).toMatch(/hoàn tất/);
    expect(canArchiveListing(item({ visibility: "Removed" }))).toBe(false);
    expect(archiveListingBlock(item({ visibility: "Removed" }))).toMatch(/bị gỡ/);
    expect(canArchiveListing(item({}, "Auction"))).toBe(false);
    expect(archiveListingBlock(item({}, "Auction"))).toMatch(/đấu giá/);
  });
});

