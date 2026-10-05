import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { SessionClient } from "../../core/api/session-client";
import { wishlistOptions } from "./wishlist-model";
import { wishlistPage } from "./contracts";

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
  }
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
    
    const page2 = await options.queryFn({ pageParam: options.getNextPageParam(page1) as any });
    expect(page2.items).toHaveLength(0);
    expect(page2.nextCursor).toBe(null);

    expect(requests).toEqual([
      { path: "/api/v1/me/wishlist?limit=10", method: "GET" },
      { path: "/api/v1/me/wishlist?limit=10&cursor=next-cursor", method: "GET" },
    ]);
    
    cache.clear();
  });
});
