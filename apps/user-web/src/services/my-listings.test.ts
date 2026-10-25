import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("./api", () => ({ session: { request: vi.fn() } }));
import { session } from "./api";
import {
  getMyBookIdentity,
  getMyListings,
  getMyListing,
  setListingVisibility,
  archiveListing,
} from "./my-listings";

const request = vi.mocked(session.request);
beforeEach(() => {
  request.mockReset();
});

describe("owner shelf reads", () => {
  it("bounds the overview read without changing the default full shelf size", async () => {
    request.mockResolvedValue({ items: [], nextCursor: "more" });
    await getMyListings(undefined, undefined, 4);
    // ADR 0042: shelf reads are marketplace-only unless the auction flow asks.
    expect(request.mock.calls[0]![0]).toBe(
      "/me/listings?limit=4&channel=Marketplace",
    );
    await getMyListings();
    expect(request.mock.calls[1]![0]).toBe(
      "/me/listings?limit=20&channel=Marketplace",
    );
    await getMyListings(undefined, undefined, 50, "Auction");
    expect(request.mock.calls[2]![0]).toBe(
      "/me/listings?limit=50&channel=Auction",
    );
  });
  it("encodes the opaque cursor without changing the moderation scope", async () => {
    request.mockResolvedValue({ items: [], nextCursor: null });
    await getMyListings("Rejected", "opaque+/=&");
    const url = new URL(
      String(request.mock.calls[0]![0]),
      "https://local.test",
    );
    expect(url.pathname).toBe("/me/listings");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: "20",
      channel: "Marketplace",
      moderation: "Rejected",
      cursor: "opaque+/=&",
    });
  });
  it("reads pending owner metadata from currentRevision.metadata", async () => {
    request.mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({
        currentRevision: {
          metadata: { title: "Sách chờ duyệt", authors: ["Tác giả"] },
        },
      }),
    );
    expect(await getMyBookIdentity("book-id", "Pending")).toEqual({
      title: "Sách chờ duyệt",
      authors: ["Tác giả"],
    });
    expect(request.mock.calls[0]![0]).toBe("/me/catalog-requests/book-id");
  });
  it("uses the public confirmed book read rather than requiring request ownership", async () => {
    request.mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({
        title: "Sách đã xác nhận",
        authors: ["Tác giả"],
      }),
    );
    expect(await getMyBookIdentity("confirmed-id", "Confirmed")).toEqual({
      title: "Sách đã xác nhận",
      authors: ["Tác giả"],
    });
    expect(request.mock.calls[0]![0]).toBe("/catalog/books/confirmed-id");
  });
  it("requests a single listing by id with the owner listing schema", async () => {
    request.mockResolvedValue({ id: "list-1", version: 1 });
    await getMyListing("list-1");
    expect(request.mock.calls[0]![0]).toBe("/me/listings/list-1");
  });
  it("puts visibility with expected version and idempotency key", async () => {
    request.mockResolvedValue({ entityId: "list-1", version: 2 });
    await setListingVisibility("list-1", 1, "Hidden", "test-key");
    const [path, , init] = request.mock.calls[0]!;
    expect(path).toBe("/listings/list-1/visibility");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toEqual({ "Idempotency-Key": "test-key" });
    expect(JSON.parse(String(init?.body))).toEqual({
      expectedVersion: 1,
      visibility: "Hidden",
    });
  });
  it("posts archive with expected version and idempotency key", async () => {
    request.mockResolvedValue({ entityId: "list-1", version: 2 });
    await archiveListing("list-1", 1, "test-key");
    const [path, , init] = request.mock.calls[0]!;
    expect(path).toBe("/listings/list-1/archive");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Idempotency-Key": "test-key" });
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 1 });
  });
});

