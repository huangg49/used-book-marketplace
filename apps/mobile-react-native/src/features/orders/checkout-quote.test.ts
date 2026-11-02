import { describe, expect, it, vi } from "vitest";
import { ApiError, type SessionClient } from "@used-books/session-client";
import {
  CheckoutQuote,
  quoteRemaining,
  quoteSignature,
  quoteUsable,
} from "./checkout-quote";

const listing = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const quote = (assessment = "Current") => ({
  id,
  version: 1,
  listingVersion: 2,
  listingRevisionId: listing,
  expiresAt: "2026-11-02T00:15:00.000Z",
  serverTime: "2026-11-02T00:00:00.000Z",
  assessment,
  amounts: { bookPrice: 50000, shippingFee: 15000, buyerTotal: 65000 },
});
const body = JSON.stringify({
  destinationAddressId: listing,
  expectedDestinationAddressVersion: 1,
});
function setup() {
  const request = vi
    .fn()
    .mockResolvedValueOnce({ entityId: id })
    .mockResolvedValueOnce(quote());
  return {
    request,
    client: { request } as unknown as SessionClient,
    flow: new CheckoutQuote(),
    key: vi.fn(() => "first"),
  };
}

describe("checkout quote recovery", () => {
  it("recovers the pinned address version even when it can no longer be reselected", async () => {
    const f = setup();
    f.request
      .mockReset()
      .mockResolvedValueOnce({ entityId: id })
      .mockRejectedValueOnce(new Error("lost private read"));
    await expect(f.flow.read(f.client, listing, body, f.key)).rejects.toThrow();
    const changedBody = JSON.stringify({
      destinationAddressId: listing,
      expectedDestinationAddressVersion: 2,
    });
    await expect(
      f.flow.read(f.client, listing, changedBody, () => "wrong"),
    ).rejects.toThrow("Thử lại báo giá đã yêu cầu");
    f.request.mockResolvedValueOnce(quote("Changed"));
    const recovered = await f.flow.retry(f.client);
    expect(recovered.signature).toBe(quoteSignature(listing, body));
    expect(quoteUsable(recovered, quoteSignature(listing, changedBody))).toBe(
      false,
    );
    expect(
      f.request.mock.calls.filter((c) => c[2]?.method === "POST"),
    ).toHaveLength(1);
    f.request
      .mockResolvedValueOnce({ entityId: id })
      .mockResolvedValueOnce(quote());
    await f.flow.read(f.client, listing, changedBody, () => "new-selection");
    expect(f.request.mock.calls.at(-2)?.[2]).toEqual({
      method: "POST",
      headers: { "Idempotency-Key": "new-selection" },
      body: changedBody,
    });
  });
  it("re-reads the same quote on Back/reopen, then renews explicitly after confirmed expiry", async () => {
    const f = setup();
    await f.flow.read(f.client, listing, body, f.key);
    expect(f.flow.renew()).toBe(false);
    f.request.mockResolvedValueOnce(quote("Expired"));
    const expired = await f.flow.read(f.client, listing, body, f.key);
    expect(quoteUsable(expired, quoteSignature(listing, body))).toBe(false);
    expect(
      f.request.mock.calls.filter((c) => c[2]?.method === "POST"),
    ).toHaveLength(1);
    expect(f.flow.renew()).toBe(true);
    f.request
      .mockResolvedValueOnce({ entityId: id })
      .mockResolvedValueOnce(quote());
    await f.flow.read(f.client, listing, body, () => "renewed");
    expect(f.request.mock.calls[3]?.[2]).toEqual({
      method: "POST",
      headers: { "Idempotency-Key": "renewed" },
      body,
    });
  });
  it.each([
    new TypeError("offline"),
    new ApiError(401, "SESSION_EXPIRED", "expired"),
    new ApiError(429, "LIMIT", "busy"),
    new ApiError(503, "UNAVAILABLE", "unknown"),
  ])("pins key/body across an uncertain quote creation (%s)", async (error) => {
    const f = setup();
    f.request.mockReset().mockRejectedValueOnce(error);
    await expect(f.flow.read(f.client, listing, body, f.key)).rejects.toBe(
      error,
    );
    expect(f.flow.renew()).toBe(false);
    await expect(
      f.flow.read(f.client, listing, body + " ", () => "wrong"),
    ).rejects.toThrow("Thử lại báo giá đã yêu cầu");
    f.request
      .mockResolvedValueOnce({ entityId: id })
      .mockResolvedValueOnce(quote());
    await f.flow.read(f.client, listing, body, () => "wrong");
    expect(f.request.mock.calls[0]).toEqual(f.request.mock.calls[1]);
    expect(f.key).toHaveBeenCalledTimes(1);
  });
  it("recovers a failed private GET by ID without repeating POST", async () => {
    const f = setup();
    f.request
      .mockReset()
      .mockResolvedValueOnce({ entityId: id })
      .mockRejectedValueOnce(new Error("lost GET"));
    await expect(f.flow.read(f.client, listing, body, f.key)).rejects.toThrow(
      "lost GET",
    );
    expect(f.flow.renew()).toBe(false);
    f.request.mockResolvedValueOnce(quote());
    await f.flow.read(f.client, listing, body, () => "wrong");
    expect(f.request.mock.calls.map((c) => c[0])).toEqual([
      `/listings/${listing}/quotes`,
      `/me/quotes/${id}`,
      `/me/quotes/${id}`,
    ]);
  });
  it.each(["Changed", "Unavailable"])(
    "never buys or renews %s without review",
    async (assessment) => {
      const f = setup();
      f.request
        .mockReset()
        .mockResolvedValueOnce({ entityId: id })
        .mockResolvedValueOnce(quote(assessment));
      const read = await f.flow.read(f.client, listing, body, f.key);
      expect(quoteUsable(read, read.signature)).toBe(false);
      expect(f.flow.renew()).toBe(false);
    },
  );
  it("uses server time despite a skewed phone date and blocks exactly at expiry or a different address", async () => {
    const f = setup(),
      read = await f.flow.read(f.client, listing, body, f.key);
    expect(quoteRemaining(read, read.receivedAt)).toBe(15 * 60000);
    expect(
      quoteUsable(read, read.signature, read.receivedAt + 15 * 60000 - 1),
    ).toBe(true);
    expect(
      quoteUsable(read, read.signature, read.receivedAt + 15 * 60000),
    ).toBe(false);
    expect(quoteUsable(read, "different-address", read.receivedAt)).toBe(false);
    expect(f.flow.renew(read.receivedAt + 15 * 60000)).toBe(true);
  });
  it("allows a deliberate address/version change only after the previous quote was read", async () => {
    const f = setup();
    await f.flow.read(f.client, listing, body, f.key);
    f.request
      .mockResolvedValueOnce({ entityId: id })
      .mockResolvedValueOnce(quote());
    await f.flow.read(f.client, listing, body + " ", () => "new-address");
    expect(f.request.mock.calls[2]?.[2]?.headers).toEqual({
      "Idempotency-Key": "new-address",
    });
  });
  it("coalesces repeated taps/reopen while a POST is in flight and refuses renewal", async () => {
    const f = setup();
    let finish!: (value: unknown) => void;
    f.request
      .mockReset()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValueOnce(quote());
    const first = f.flow.read(f.client, listing, body, f.key);
    const second = f.flow.read(f.client, listing, body, () => "wrong");
    expect(f.flow.renew()).toBe(false);
    finish({ entityId: id });
    expect(await first).toEqual(await second);
    expect(f.request).toHaveBeenCalledTimes(2);
  });
});
