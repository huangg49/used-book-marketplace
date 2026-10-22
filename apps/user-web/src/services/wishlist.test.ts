import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("../lib/session", () => ({ session: { request: vi.fn() } }));
import { session } from "../lib/session";
import { getSavedListingIds, setListingSaved } from "./wishlist";

beforeEach(() => vi.resetAllMocks());

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const listing = (subjectId: string) => ({ subjectType: "LISTING", subjectId });

describe("saved listing pages", () => {
  it("loads every page, deduplicates IDs and safely encodes the cursor", async () => {
    const cursor = "2026-10-22T08:30:00.000+07:00";
    const pages = [
      { items: [listing(firstId), listing(firstId)], nextCursor: cursor },
      { items: [listing(firstId), listing(secondId)], nextCursor: null },
    ];
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(pages.shift()),
    );

    expect(await getSavedListingIds()).toEqual([firstId, secondId]);
    const calls = vi.mocked(session.request).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe("/me/wishlist?subjectType=LISTING&limit=50");
    expect(calls[1][0]).toBe(
      "/me/wishlist?subjectType=LISTING&limit=50&cursor=2026-10-22T08%3A30%3A00.000%2B07%3A00",
    );
    expect(
      new URL(calls[1][0], "https://latlai.test").searchParams.get("cursor"),
    ).toBe(cursor);
    expect(calls.every((call) => call.length === 2)).toBe(true);
  });

  it("returns an empty saved set without requesting another page", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({ items: [], nextCursor: null }),
    );
    expect(await getSavedListingIds()).toEqual([]);
    expect(session.request).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 42, {}])(
    "rejects an incompatible cursor %j instead of accepting partial state",
    async (nextCursor) => {
      vi.mocked(session.request).mockImplementation(async (_path, schema) =>
        (schema as z.ZodType).parse({ items: [listing(firstId)], nextCursor }),
      );
      await expect(getSavedListingIds()).rejects.toThrow();
      expect(session.request).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["same", "same"],
    ["first", "second", "first"],
  ])("rejects repeated cursor cycles %j", async (...cursors) => {
    const remaining = [...cursors];
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({
        items: [listing(firstId)],
        nextCursor: remaining.shift(),
      }),
    );
    await expect(getSavedListingIds()).rejects.toThrow(
      "Repeated wishlist cursor",
    );
    expect(session.request).toHaveBeenCalledTimes(cursors.length);
  });

  it.each([
    { subjectType: "CATALOG_BOOK", subjectId: firstId },
    { subjectType: "LISTING", subjectId: "not-a-listing-id" },
  ])("rejects incompatible saved subjects %j", async (item) => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({ items: [item], nextCursor: null }),
    );
    await expect(getSavedListingIds()).rejects.toThrow();
  });
});

describe("saved listing changes", () => {
  it("saves the listing without opting into notifications or exchange", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(listing(firstId)),
    );

    await setListingSaved(firstId, true);

    expect(session.request).toHaveBeenCalledExactlyOnceWith(
      `/me/wishlist/listings/${firstId}`,
      expect.anything(),
      {
        method: "PUT",
        body: JSON.stringify({
          wantsToExchange: false,
          receiveNotifications: false,
        }),
      },
    );
  });

  it("removes the listing with DELETE and accepts the empty 204 response", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(undefined),
    );

    await setListingSaved(firstId, false);

    expect(session.request).toHaveBeenCalledExactlyOnceWith(
      `/me/wishlist/listings/${firstId}`,
      expect.anything(),
      { method: "DELETE" },
    );
  });

  it("does not acknowledge a malformed successful save response", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({ subjectType: "LISTING" }),
    );
    await expect(setListingSaved(firstId, true)).rejects.toThrow();
  });
});
