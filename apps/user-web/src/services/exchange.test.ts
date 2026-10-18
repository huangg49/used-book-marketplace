import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@used-books/session-client";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  publicListing: vi.fn(),
  photo: vi.fn(),
  listener: () => {},
  actor: "11111111-1111-4111-8111-111111111111",
  authenticated: true,
}));
vi.mock("./api", () => ({
  session: {
    request: mock.request,
    getSnapshot: () =>
      mock.authenticated
        ? {
            status: "authenticated",
            user: { id: mock.actor, displayName: "QA Reader" },
          }
        : { status: "anonymous" },
    subscribe: (listener: () => void) => {
      mock.listener = listener;
      return () => {};
    },
  },
}));
vi.mock("./public-listings", () => ({
  getPublicListing: mock.publicListing,
  getPublicPhoto: mock.photo,
}));
import {
  exchangeCommand,
  getExchangeCounts,
  mapExchangeStatus,
  exchangeTab,
  retryExchange,
  pendingExchange,
  type Exchange,
} from "./exchange";
import { getExchangeDetail } from "./exchangeDetail";
const row: Exchange = {
  id: "33333333-3333-4333-8333-333333333333",
  initiatorId: "11111111-1111-4111-8111-111111111111",
  recipientId: "22222222-2222-4222-8222-222222222222",
  initiatorListingId: "44444444-4444-4444-8444-444444444444",
  recipientListingId: "55555555-5555-4555-8555-555555555555",
  revision: 7,
  status: "Proposed",
  initiatorDeposit: 150000,
  recipientDeposit: 100000,
  diffAmount: 50000,
  diffPayerId: "11111111-1111-4111-8111-111111111111",
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
};
beforeEach(() => {
  mock.request.mockReset();
  mock.publicListing.mockReset();
  mock.photo.mockReset();
  mock.authenticated = false;
  mock.listener();
  mock.actor = row.initiatorId;
  mock.authenticated = true;
  mock.listener();
});
describe("exchange integration", () => {
  it("retains key, body and stale revision after response loss, including after refresh", async () => {
    const path = `/exchanges/${row.id}/accept`;
    mock.request
      .mockRejectedValueOnce(new ApiError(503, "Unavailable", "Unavailable"))
      .mockResolvedValue(row);
    await expect(exchangeCommand(path, { revision: 7 })).rejects.toBeInstanceOf(
      ApiError,
    );
    const first = mock.request.mock.calls[0][2];
    expect(first.headers["Idempotency-Key"]).toMatch(/^[\da-f-]{36}$/);
    expect(pendingExchange(row.id)).toBeDefined();
    await exchangeCommand(path, { revision: 8 });
    expect(mock.request.mock.calls[1][2]).toEqual(first);
    expect(pendingExchange(row.id)).toBeUndefined();
  });
  it("blocks a different command while the preceding result is unknown", async () => {
    mock.request
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(row);
    await expect(
      exchangeCommand(`/exchanges/${row.id}/funding`, {}),
    ).rejects.toThrow();
    await expect(
      exchangeCommand(`/exchanges/${row.id}/cancel`, { expectedVersion: 9 }),
    ).rejects.toThrow();
    expect(mock.request).toHaveBeenCalledTimes(1);
    await retryExchange(row.id);
    expect(mock.request.mock.calls[1][0]).toBe(`/exchanges/${row.id}/funding`);
  });
  it("clears definite rejection and allows a new intent with fresh version", async () => {
    mock.request
      .mockRejectedValueOnce(new ApiError(409, "VersionConflict", "Conflict"))
      .mockResolvedValue(row);
    await expect(
      exchangeCommand(`/exchanges/${row.id}/cancel`, { expectedVersion: 6 }),
    ).rejects.toThrow();
    await exchangeCommand(`/exchanges/${row.id}/cancel`, {
      expectedVersion: 7,
    });
    expect(mock.request.mock.calls[1][2].headers).not.toEqual(
      mock.request.mock.calls[0][2].headers,
    );
    expect(mock.request.mock.calls[1][2].body).toBe('{"expectedVersion":7}');
  });
  it("does not replay one actor’s intent under another account", async () => {
    mock.request
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(row);
    await expect(
      exchangeCommand(`/exchanges/${row.id}/accept`, { revision: 7 }),
    ).rejects.toThrow();
    mock.actor = row.recipientId;
    mock.listener();
    await exchangeCommand(`/exchanges/${row.id}/accept`, { revision: 8 });
    expect(mock.request.mock.calls[1][2].body).toBe('{"revision":8}');
    expect(mock.request.mock.calls[1][2].headers).not.toEqual(
      mock.request.mock.calls[0][2].headers,
    );
  });
  it("never returns a demo transaction when access is denied", async () => {
    mock.request.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Not found"));
    await expect(getExchangeDetail(row.id)).rejects.toBeInstanceOf(ApiError);
    expect(mock.publicListing).not.toHaveBeenCalled();
  });
  it("preserves real funding/shipping fields even when listings are no longer public", async () => {
    mock.request.mockResolvedValue({
      ...row,
      status: "AcceptedAwaitingFunding",
      initiatorFundedAt: row.createdAt,
    });
    mock.publicListing.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Not found"),
    );
    const detail = await getExchangeDetail(row.id);
    expect(detail.status).toBe("FUNDING");
    expect(detail.revision).toBe(7);
    expect(detail.viewerFundingAmount).toBe(200000);
    expect(detail.viewerFundedAt).toBe(row.createdAt);
    expect(detail.partner.rating).toBeUndefined();
    expect(detail.partner.transactionCount).toBeUndefined();
    expect(detail.deliveryMethod).toBeUndefined();
  });
  it("does not turn a list failure into zero counts", async () => {
    mock.request.mockRejectedValue(
      new ApiError(503, "Unavailable", "Unavailable"),
    );
    await expect(getExchangeCounts()).rejects.toBeInstanceOf(ApiError);
  });
  it("maps direction, funding, cancellation and resolution without claiming completion", () => {
    expect(exchangeTab(row, row.initiatorId)).toBe("sent");
    expect(exchangeTab(row, row.recipientId)).toBe("received");
    expect(mapExchangeStatus({ ...row, status: "Preparing" }, mock.actor)).toBe(
      "WAITING_YOU_SEND",
    );
    expect(
      exchangeTab({ ...row, status: "ResolutionPending" }, mock.actor),
    ).toBe("active");
    expect(
      mapExchangeStatus(
        { ...row, status: "Cancelled", cancelReason: "ProposalExpired" },
        mock.actor,
      ),
    ).toBe("EXPIRED");
    expect(
      mapExchangeStatus(
        {
          ...row,
          status: "Cancelled",
          cancelReason: "CancelledByUser",
          rejectionReason: "Không phù hợp",
        },
        mock.actor,
      ),
    ).toBe("REJECTED");
    expect(mapExchangeStatus({ ...row, status: "Delivered" }, mock.actor)).toBe(
      "WAITING_YOU_CONFIRM",
    );
  });
  it("populates multiple giveBooks when initiator offers multiple books", async () => {
    const multiRow: Exchange = {
      ...row,
      initiatorListingIds: [
        "44444444-4444-4444-8444-444444444444",
        "66666666-6666-4666-8666-666666666666",
      ],
    };
    mock.request.mockResolvedValue(multiRow);
    mock.publicListing.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        book: { title: `Book ${id.slice(0, 4)}`, authors: ["Author"] },
        photos: [],
        condition: "Tốt",
        exchangeValue: 50000,
        seller: { id: "seller", displayName: "Partner" },
      }),
    );
    const detail = await getExchangeDetail(multiRow.id);
    expect(detail.giveBooks).toHaveLength(2);
    expect(detail.receiveBooks).toHaveLength(1);
    expect(detail.giveBooks[0].id).toBe("44444444-4444-4444-8444-444444444444");
    expect(detail.giveBooks[0].price).toBe(50000);
    expect(detail.giveBooks[1].id).toBe("66666666-6666-4666-8666-666666666666");
    expect(detail.giveBooks[1].price).toBe(50000);
    expect(detail.receiveBooks[0].price).toBe(50000);
  });
});
