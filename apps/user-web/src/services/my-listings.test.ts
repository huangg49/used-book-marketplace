import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("./api", () => ({ session: { request: vi.fn() } }));
import { session } from "./api";
import { getMyBookIdentity, getMyListings } from "./my-listings";

const request = vi.mocked(session.request);
beforeEach(() => {
  request.mockReset();
});

describe("owner shelf reads", () => {
  it("bounds the overview read without changing the default full shelf size", async () => {
    request.mockResolvedValue({ items: [], nextCursor: "more" });
    await getMyListings(undefined, undefined, 4);
    expect(request.mock.calls[0]![0]).toBe("/me/listings?limit=4");
    await getMyListings();
    expect(request.mock.calls[1]![0]).toBe("/me/listings?limit=20");
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
});
