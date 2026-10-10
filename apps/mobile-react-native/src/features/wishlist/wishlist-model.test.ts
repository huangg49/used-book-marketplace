import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { SessionClient } from "../../core/api/session-client";
import { wishlistOptions, wishlistMembershipOptions } from "./wishlist-model";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function session(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
) {
  return new SessionClient(
    "http://wishlist.test/api/v1",
    {
      read: async () => null,
      write: async () => {},
      clear: async () => {},
    },
    (url, init) => fetcher(url, init ?? {}),
  );
}

const mockItem = {
  id: "00000000-0000-4000-8000-000000000001",
  subjectType: "CATALOG_BOOK",
  subjectId: "00000000-0000-4000-8000-000000000002",
  wantsToExchange: true,
  receiveNotifications: true,
  createdAt: "2026-09-30T04:40:00.000Z",
  updatedAt: "2026-09-30T04:40:00.000Z",
  book: {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Test Book",
    authors: ["Test Author"],
    publisher: "Test Publisher",
    publicationYear: 2026,
    language: "vi",
    edition: null,
    category: "Test",
    isbn: null,
  },
};

describe("wishlist model queries", () => {
  it("fetches the first page and follows cursor", async () => {
    const requests: { path: string; method: string }[] = [];
    const client = session(async (url, init) => {
      const path = new URL(url).pathname + new URL(url).search;
      requests.push({ path, method: init.method ?? "GET" });

      const cursor = new URL(url).searchParams.get("cursor");
      if (!cursor) {
        return json({
          items: [mockItem],
          nextCursor: "next-cursor",
        });
      }
      return json({
        items: [],
        nextCursor: null,
      });
    });

    const cache = new QueryClient();
    const options = wishlistOptions(client);
    const page1 = await options.queryFn({ pageParam: null });
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).toBe("next-cursor");

    const page2 = await options.queryFn({
      pageParam: options.getNextPageParam(page1) as any,
    });
    expect(page2.items).toHaveLength(0);
    expect(page2.nextCursor).toBe(null);

    expect(requests).toEqual([
      { path: "/api/v1/me/wishlist?limit=10", method: "GET" },
      {
        path: "/api/v1/me/wishlist?limit=10&cursor=next-cursor",
        method: "GET",
      },
    ]);

    cache.clear();
  });
});

describe("saved membership across pages", () => {
  const target = mockItem.subjectId;
  it("finds a saved book beyond the first page without treating it as unsaved", async () => {
    const paths: string[] = [];
    const client = session(async (url) => {
      const parsed = new URL(url);
      paths.push(parsed.search);
      return json(
        parsed.searchParams.has("cursor")
          ? { items: [mockItem], nextCursor: "unused" }
          : { items: [], nextCursor: "next/page+2" },
      );
    });
    const saved = await wishlistMembershipOptions(
      client,
      "CATALOG_BOOK",
      target,
    ).queryFn();
    expect(saved?.subjectId).toBe(target);
    expect(paths).toEqual([
      "?limit=50&subjectType=CATALOG_BOOK",
      "?limit=50&subjectType=CATALOG_BOOK&cursor=next%2Fpage%2B2",
    ]);
  });

  it("reports unsaved only when the final page has been read", async () => {
    let calls = 0;
    const client = session(async () =>
      json({ items: [], nextCursor: ++calls === 1 ? "next" : null }),
    );
    expect(
      await wishlistMembershipOptions(client, "LISTING", target).queryFn(),
    ).toBeNull();
    expect(calls).toBe(2);
  });

  it("does not mistake a saved catalog book for a particular listing", async () => {
    const client = session(async () =>
      json({ items: [mockItem], nextCursor: null }),
    );
    expect(
      await wishlistMembershipOptions(client, "LISTING", target).queryFn(),
    ).toBeNull();
  });

  it("rejects an incomplete scan instead of exposing an unsaved state", async () => {
    let calls = 0;
    const client = session(async () => {
      if (++calls === 2) throw new TypeError("offline");
      return json({ items: [], nextCursor: "next" });
    });
    await expect(
      wishlistMembershipOptions(client, "LISTING", target).queryFn(),
    ).rejects.toBeTruthy();
    expect(calls).toBe(2);
  });

  it("stops a repeated cursor rather than hanging with an enabled mutation", async () => {
    let calls = 0;
    const client = session(async () => {
      calls++;
      return json({ items: [], nextCursor: "repeat" });
    });
    await expect(
      wishlistMembershipOptions(client, "LISTING", target).queryFn(),
    ).rejects.toThrow("cursor");
    expect(calls).toBe(2);
  });
});
