import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@used-books/session-client";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  publicListing: vi.fn(),
  photo: vi.fn(),
  wallet: vi.fn(),
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
vi.mock("../lib/wallet-cache", () => ({ invalidateMemberWalletViews: mock.wallet }));
import {
  exchangeCommand,
  getExchangeCounts,
  mapExchangeStatus,
  exchangeTab,
  retryExchange,
  pendingExchange,
  exchangeAcknowledged,
  type Exchange,
} from "./exchange";
import { getExchangeDetail, getMessages } from "./exchangeDetail";
import { queryClient } from "../lib/session";
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
  queryClient.clear();
  mock.request.mockReset();
  mock.publicListing.mockReset();
  mock.photo.mockReset();
  mock.wallet.mockClear();
  mock.authenticated = false;
  mock.listener();
  mock.actor = row.initiatorId;
  mock.authenticated = true;
  mock.listener();
});
afterEach(() => {
  queryClient.clear();
  vi.useRealTimers();
});
describe("exchange integration", () => {
  it("refreshes wallet views only after a confirmed command or recovery ACK", async () => {
    mock.request.mockRejectedValueOnce(new Error('lost ACK')).mockResolvedValue({
      ...row, status: 'AcceptedAwaitingFunding', initiatorFundedAt: row.createdAt,
    });
    await expect(exchangeCommand(`/exchanges/${row.id}/funding`, {})).rejects.toThrow();
    expect(mock.wallet).not.toHaveBeenCalled();
    await retryExchange(row.id);
    expect(mock.wallet).toHaveBeenCalledOnce();
    expect(mock.wallet).toHaveBeenCalledWith(expect.anything(), row.initiatorId);
  });
  it("does not refresh a different account after a late command response", async () => {
    let resolve!: (value: unknown) => void;
    mock.request.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const sending = exchangeCommand(`/exchanges/${row.id}/funding`, {});
    mock.actor = row.recipientId;
    mock.listener();
    resolve({ ...row, status: 'AcceptedAwaitingFunding', initiatorFundedAt: row.createdAt });
    await expect(sending).rejects.toThrow();
    expect(mock.wallet).not.toHaveBeenCalled();
  });
  it("renders frozen values and scopes photo reuse to owner, revision and lifetime", async () => {
    const book = (id: string, ownerId: string, value: number) => ({
      listingId: id,
      ownerId,
      ownerDisplayName: "Đối tác QA",
      listingVersion: 5,
      revisionId: id,
      bookId: id,
      catalogRevisionId: id,
      book: {
        title: "Ấn bản đã thỏa thuận",
        authors: ["Tác giả"],
        publisher: null,
        publicationYear: 2020,
        language: "vi",
        edition: "Lần 1",
        category: "Văn học",
        isbn: null,
      },
      condition: "Good" as const,
      description: "Mô tả gốc",
      pages: "Đủ",
      coverNote: "",
      notes: "",
      accessories: "",
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      exchangeValue: value,
      mediaIds: [id],
    });
    const agreement = {
      initiatorBooks: [book(row.initiatorListingId, row.initiatorId, 100000)],
      recipientBook: book(row.recipientListingId, row.recipientId, 150000),
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    let photoFailure = false;
    let expiredResponse = false;
    let omitExpiry = false;
    mock.request.mockImplementation((path) => {
      if (!path.includes("/photos/")) return Promise.resolve({ ...row, agreement });
      if (photoFailure) return Promise.reject(new Error("storage unavailable"));
      return Promise.resolve({
        url: "https://storage.test/frozen.png",
        ...(omitExpiry ? {} : { expiresAt: new Date(Date.now() + (expiredResponse ? -1 : 60000)).toISOString() }),
      });
    });
    mock.publicListing.mockResolvedValue({ exchangeValue: 600000 });
    const detail = await getExchangeDetail(row.id);
    expect(detail.receiveBooks[0]).toMatchObject({
      title: "Ấn bản đã thỏa thuận",
      price: 150000,
    });
    expect(detail.giveBooks[0].price).toBe(100000);
    expect(detail.moneyAmount).toBe(50000);
    expect(detail.viewerDeposit).toBe(150000);
    expect(detail.partnerDeposit).toBe(100000);
    expect(detail.viewerFundingAmount).toBe(200000);
    expect(mock.publicListing).not.toHaveBeenCalled();
    expect(mock.photo).not.toHaveBeenCalled();
    expect(
      mock.request.mock.calls.filter(([path]) => path.includes("/photos/")),
    ).toHaveLength(2);
    const photoReads = () => mock.request.mock.calls.filter(([path]) => path.includes("/photos/")).length;
    await getExchangeDetail(row.id);
    expect(photoReads()).toBe(2);
    vi.setSystemTime(Date.now() + 55000);
    photoFailure = true;
    const unavailable = await getExchangeDetail(row.id);
    expect(photoReads()).toBe(4);
    expect(unavailable.receiveBooks[0].coverUrl).toBeUndefined();
    expect(unavailable.receiveBooks[0].title).toBe("Ấn bản đã thỏa thuận");
    photoFailure = false;
    await getExchangeDetail(row.id);
    expect(photoReads()).toBe(6);
    agreement.recipientBook.revisionId = row.id;
    await getExchangeDetail(row.id);
    expect(photoReads()).toBe(7);
    mock.actor = row.recipientId;
    mock.listener();
    await getExchangeDetail(row.id);
    expect(photoReads()).toBe(9);
    await queryClient.invalidateQueries({ queryKey: ["exchange-book-photo"], refetchType: "none" });
    expiredResponse = true;
    const expired = await getExchangeDetail(row.id);
    expect(expired.receiveBooks[0].coverUrl).toBeUndefined();
    expect(photoReads()).toBe(11);
    expiredResponse = false;
    const recovered = await getExchangeDetail(row.id);
    expect(recovered.receiveBooks[0].coverUrl).toBe("https://storage.test/frozen.png");
    expect(photoReads()).toBe(13);
    await queryClient.invalidateQueries({ queryKey: ["exchange-book-photo"], refetchType: "none" });
    omitExpiry = true;
    await getExchangeDetail(row.id);
    await getExchangeDetail(row.id);
    expect(photoReads()).toBe(17);
  });

  it("maps recipient deposit and funding without deducting the compensation they will receive", async () => {
    mock.actor = row.recipientId;
    mock.listener();
    mock.request.mockResolvedValue(row);
    const detail = await getExchangeDetail(row.id);
    expect(detail.viewerDeposit).toBe(100000);
    expect(detail.partnerDeposit).toBe(150000);
    expect(detail.viewerFundingAmount).toBe(100000);
    expect(detail.moneyCompensationType).toBe("other_pays");
  });
  it("labels legacy books without replacing them with today's public content", async () => {
    mock.request.mockResolvedValue({ ...row, agreement: null });
    const detail = await getExchangeDetail(row.id);
    expect(detail.hasAgreementSnapshot).toBe(false);
    expect(detail.receiveBooks[0].title).toContain("thiếu bản chụp");
    expect(detail.receiveBooks[0].price).toBe(150000);
    expect(mock.publicListing).not.toHaveBeenCalled();
  });
  it("keeps authored text as a member message even when it contains system-like prefixes", async () => {
    mock.request.mockResolvedValue({
      items: [
        {
          id: "message",
          exchangeId: row.id,
          senderId: row.recipientId,
          body: "[Hệ thống] nội dung do thành viên nhập",
          sentAt: "2026-10-18T10:00:00Z",
        },
        {
          id: "counter",
          exchangeId: row.id,
          senderId: row.initiatorId,
          body: "[Đề xuất lại điều khoản]",
          sentAt: "2026-10-18T10:01:00Z",
        },
      ],
    });
    const messages = await getMessages(row.id);
    expect(messages.map((message) => message.senderRole)).toEqual([
      "partner",
      "viewer",
    ]);
    expect(messages[0].text).toContain("[Hệ thống]");
  });
  it("surfaces history failures rather than treating them as a successful empty conversation", async () => {
    mock.request.mockRejectedValue(
      new ApiError(503, "Unavailable", "Unavailable"),
    );
    await expect(getMessages(row.id)).rejects.toBeInstanceOf(ApiError);
  });
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
    mock.request.mockRejectedValueOnce(new Error("network")).mockResolvedValue({
      ...row,
      status: "AcceptedAwaitingFunding",
      initiatorFundedAt: "2026-11-02T00:00:00.000Z",
    });
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
  it("retains the exact funding intent through a lost response and rate limit", async () => {
    mock.request
      .mockRejectedValueOnce(new Error("lost ACK"))
      .mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", "limited"))
      .mockResolvedValue({
        ...row,
        status: "AcceptedAwaitingFunding",
        initiatorFundedAt: row.createdAt,
      });
    await expect(
      exchangeCommand(`/exchanges/${row.id}/funding`, {}),
    ).rejects.toThrow();
    await expect(retryExchange(row.id)).rejects.toThrow();
    expect(pendingExchange(row.id)).toBeDefined();
    await retryExchange(row.id);
    expect(mock.request.mock.calls[1][2]).toEqual(
      mock.request.mock.calls[0][2],
    );
    expect(mock.request.mock.calls[2][2]).toEqual(
      mock.request.mock.calls[0][2],
    );
  });
  it("renders the acknowledged funding facts when the following GET fails", async () => {
    mock.request
      .mockResolvedValueOnce({
        ...row,
        status: "AcceptedAwaitingFunding",
        initiatorFundedAt: row.createdAt,
      })
      .mockRejectedValue(new ApiError(503, "UNAVAILABLE", "unavailable"));
    await exchangeCommand(`/exchanges/${row.id}/funding`, {});
    const detail = await getExchangeDetail(row.id);
    expect(detail.viewerFundedAt).toBe(row.createdAt);
    expect(exchangeAcknowledged(row.id)).toBeDefined();
    await expect(
      exchangeCommand(`/exchanges/${row.id}/cancel`, {
        expectedVersion: row.revision,
      }),
    ).rejects.toThrow();
    expect(mock.request).toHaveBeenCalledTimes(2);
  });
  it("rejects late detail mapping after an account change", async () => {
    let resolve!: (value: Exchange) => void;
    mock.request.mockReturnValue(
      new Promise<Exchange>((done) => {
        resolve = done;
      }),
    );
    const reading = getExchangeDetail(row.id);
    mock.actor = row.recipientId;
    mock.listener();
    resolve(row);
    await expect(reading).rejects.toThrow();
    expect(exchangeAcknowledged(row.id)).toBeUndefined();
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
    mock.request.mockResolvedValue({ ...row, revision: 9 });
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
  it("keeps legacy multi-book identities without inventing each book's historical price", async () => {
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
    expect(detail.giveBooks[0].price).toBeUndefined();
    expect(detail.giveBooks[1].id).toBe("66666666-6666-4666-8666-666666666666");
    expect(detail.giveBooks[1].price).toBeUndefined();
    expect(detail.receiveBooks[0].price).toBe(150000);
    expect(mock.publicListing).not.toHaveBeenCalled();
  });
});
