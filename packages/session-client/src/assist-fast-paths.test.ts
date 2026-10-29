import { describe, expect, it, vi } from "vitest";
import {
  currentReference,
  findPriceReference,
  findIsbnMatches,
  type PriceReferenceState,
} from "./assist-fast-paths";
import type { SessionClient } from "./session-client";
import { clearAiPriceAttribution } from "./assist-fast-paths";
import {
  finishLoading,
  startLoading,
  decisionFor,
  type AssistState,
  type AssistForm,
} from "./listing-assist";
const state: PriceReferenceState = {
  key: "current",
  value: {
    listingId: "listing",
    bookId: "book",
    inputFingerprint: "fingerprint",
    status: "Ready",
    evidenceLevel: "Limited",
    rules: [],
    range: { low: 40000, high: 60000 },
    sources: [],
    missing: [],
    dataAsOf: null,
    generatedAt: "2026-10-29T00:00:00Z",
    expiresAt: "2026-10-29T00:05:00Z",
  },
};
describe("assist fast paths remain read-only and separate from AI decisions", () => {
  it("keeps a rule pick manual after a refresh replays the previously applied AI suggestion", () => {
    const suggestion = {
      ...state.value,
      id: "suggestion",
      status: "Suggested" as const,
      model: "fake/model",
      factors: [],
      cached: false,
    };
    const previous: AssistState = {
      status: "ready",
      key: "current",
      suggestion,
      appliedPrice: 40000,
    };
    const pending = clearAiPriceAttribution(
      startLoading(previous, "current", 1),
    );
    const delivered = finishLoading(pending, 1, "listing", {
      ...suggestion,
      expiresAt: "2099-10-29T00:00:00Z",
    });
    expect(
      decisionFor(delivered, "current", {
        mode: "Sale",
        salePrice: "40000",
      } as AssistForm)?.applied,
    ).toBe(false);
  });
  it("rejects expired or mismatched local form keys", () => {
    expect(
      currentReference(state, "current", Date.parse("2026-10-29T00:01:00Z")),
    ).toBe(state.value);
    expect(currentReference(state, "changed", 0)).toBeNull();
    expect(
      currentReference(state, "current", Date.parse(state.value.expiresAt)),
    ).toBeNull();
  });
  it("sends no AI command/idempotency key and validates response targets", async () => {
    const client = {
      getSnapshot: () => ({ status: "authenticated", user: { id: "owner" } }),
      request: vi.fn().mockResolvedValue(state.value),
    } as unknown as SessionClient;
    await findPriceReference(client, "listing", { bookId: "book" });
    expect(client.request).toHaveBeenCalledWith(
      "/listings/listing/price-reference",
      expect.anything(),
      { method: "POST", body: '{"bookId":"book"}' },
    );
    await expect(
      findPriceReference(client, "another", { bookId: "book" }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("rejects a late result after account switch and a barcode response for another listing", async () => {
    let user = "owner";
    const client = {
      getSnapshot: () => ({ status: "authenticated", user: { id: user } }),
      request: vi.fn(async () => {
        user = "other";
        return {
          listingId: "listing",
          isbns: [],
          status: "NotFound",
          catalog: null,
          serverTime: "now",
        };
      }),
    } as unknown as SessionClient;
    await expect(findIsbnMatches(client, "listing", [])).rejects.toMatchObject({
      code: "SESSION_CHANGED",
    });
    client.request = vi.fn().mockResolvedValue({ listingId: "another" });
    await expect(findIsbnMatches(client, "listing", [])).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
