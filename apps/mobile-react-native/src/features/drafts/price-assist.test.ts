import { describe, expect, it } from "vitest";
import { ApiError } from "../../core/api/session-client";
import { emptyContent } from "./contracts";
import { listingIntent } from "./listing-command";
import { fromContent } from "./listing-form";
import {
  acceptResponse,
  assistError,
  decisionFor,
  failLoading,
  finishLoading,
  isStale,
  startLoading,
  pricePoints,
  suggestionInput,
  suggestionKey,
  type AssistState,
  type PriceSuggestion,
} from "./price-assist";

const listing = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const book = "33333333-3333-4333-8333-333333333333";
const form = {
  ...fromContent(emptyContent),
  bookId: book,
  mode: "Sale" as const,
  condition: "Good" as const,
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  pages: "Ố nhẹ ",
  notes: " có chữ ký",
};
const suggestion = (over: Partial<PriceSuggestion> = {}): PriceSuggestion => ({
  id: "44444444-4444-4444-8444-444444444444",
  listingId: listing,
  bookId: book,
  inputFingerprint: "a".repeat(64),
  status: "Suggested",
  evidenceLevel: "Limited",
  rules: [],
  range: { low: 40000, high: 60000 },
  factors: [],
  sources: [],
  missing: [],
  dataAsOf: null,
  generatedAt: "2026-10-05T00:00:00.000Z",
  expiresAt: "2026-10-06T00:00:00.000Z",
  model: "m",
  cached: false,
  ...over,
});

describe("price suggestion client rules", () => {
  it("sends only book and condition fields, joining condition notes", () => {
    expect(suggestionInput(form)).toEqual({
      bookId: book,
      condition: "Good",
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      conditionNote: "Ố nhẹ · có chữ ký",
    });
  });

  it("marks a suggestion stale when book or condition inputs change, not when the price changes", () => {
    const key = suggestionKey(listing, form);
    const state: AssistState = {
      status: "ready",
      key,
      suggestion: suggestion(),
      appliedPrice: null,
    };
    expect(isStale(state, suggestionKey(listing, { ...form, salePrice: "50000" }))).toBe(false);
    expect(isStale(state, suggestionKey(listing, { ...form, condition: "Worn" }))).toBe(true);
    expect(isStale(state, suggestionKey(listing, { ...form, bookId: other }))).toBe(true);
  });

  it("drops late responses from an older request or another listing", () => {
    const loading: AssistState = { status: "loading", key: "k", token: 2 };
    expect(acceptResponse(loading, 2, listing, suggestion())).toBe(true);
    expect(acceptResponse(loading, 1, listing, suggestion())).toBe(false);
    expect(acceptResponse(loading, 2, other, suggestion())).toBe(false);
    expect(acceptResponse({ status: "idle" }, 2, listing, suggestion())).toBe(false);
  });

  it("records applied only when the saved price is the picked value", () => {
    const key = suggestionKey(listing, form);
    const ready = (appliedPrice: number | null): AssistState => ({
      status: "ready",
      key,
      suggestion: suggestion(),
      appliedPrice,
    });
    expect(decisionFor(ready(50000), key, { ...form, salePrice: "50000" })).toEqual({
      suggestionId: suggestion().id,
      applied: true,
    });
    expect(decisionFor(ready(50000), key, { ...form, salePrice: "52000" })?.applied).toBe(false);
    expect(decisionFor(ready(null), key, { ...form, salePrice: "52000" })?.applied).toBe(false);
    // Stale, refused or exchange-only suggestions are never attached.
    expect(decisionFor(ready(50000), "other", form)).toBeUndefined();
    expect(
      decisionFor(
        { status: "ready", key, suggestion: suggestion({ status: "Refused", range: null }), appliedPrice: null },
        key,
        form,
      ),
    ).toBeUndefined();
    expect(decisionFor(ready(50000), key, { ...form, mode: "Exchange" })).toBeUndefined();
  });

  it("keeps the delivered suggestion and the seller's pick when a refresh fails", () => {
    const key = suggestionKey(listing, form);
    const ready: AssistState = { status: "ready", key, suggestion: suggestion(), appliedPrice: 43000 };
    const loading = startLoading(ready, key, 5);
    const failed = failLoading(loading, 5, "offline");
    expect(failed).toMatchObject({ status: "ready", appliedPrice: 43000, message: "offline" });
    expect(decisionFor(failed, key, { ...form, salePrice: "43000" })).toEqual({
      suggestionId: suggestion().id,
      applied: true,
    });
    // A cached answer with the same id keeps the pick; a new one resets it.
    expect(finishLoading(startLoading(ready, key, 6), 6, listing, suggestion())).toMatchObject({
      appliedPrice: 43000,
    });
    expect(
      finishLoading(startLoading(ready, key, 7), 7, listing, suggestion({ id: other })),
    ).toMatchObject({ appliedPrice: null });
    // Changed inputs never carry an old suggestion forward.
    const changed = startLoading(ready, "other-key", 8);
    expect(failLoading(changed, 8, "offline")).toEqual({
      status: "error",
      key: "other-key",
      message: "offline",
    });
    // A stale token cannot overwrite a newer request.
    expect(failLoading(startLoading(ready, key, 9), 4, "late")).toMatchObject({ status: "loading" });
  });

  it("offers low/middle/high picks rounded to 1000 without duplicates", () => {
    expect(pricePoints({ low: 40000, high: 61000 })).toEqual([40000, 51000, 61000]);
    expect(pricePoints({ low: 40000, high: 40000 })).toEqual([40000]);
  });

  it("keeps manual pricing available in every failure message", () => {
    for (const status of [0, 409, 422, 429, 503, 500])
      expect(assistError(new ApiError(status, "X", "server text"))).not.toContain(
        "server text",
      );
    expect(assistError(new ApiError(503, "UNAVAILABLE", ""))).toContain("tự nhập giá");
  });

  it("puts the decision in the frozen save body so a retry resends the same payload", () => {
    const intent = listingIntent(listing, 3, emptyContent, false, () => "k", false, {
      suggestionId: suggestion().id,
      applied: true,
    });
    expect(JSON.parse(intent.saveBody).priceAssist).toEqual({
      suggestionId: suggestion().id,
      applied: true,
    });
    expect(JSON.parse(listingIntent(listing, 3, emptyContent, false, () => "k").saveBody)).not.toHaveProperty(
      "priceAssist",
    );
  });
});
