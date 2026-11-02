import { describe, it, expect } from "vitest";
import { QueryClient, InfiniteQueryObserver } from "@tanstack/react-query";
import {
  notificationKeys,
  notificationPath,
  notificationSchema,
} from "./notifications";
const id = "1101d28c-80c3-4223-b289-e9446ba940be";
describe("durable inbox cache and targets", () => {
  it("keeps flat unread summary separate from infinite pages and account identity", () => {
    const cache = new QueryClient();
    cache.setQueryData(notificationKeys.summary(id), {
      items: [],
      unreadCount: 1,
      nextCursor: null,
    });
    const observer = new InfiniteQueryObserver(cache, {
      queryKey: notificationKeys.pages(id),
      queryFn: async () => ({
        items: [],
        unreadCount: 1,
        nextCursor: null as string | null,
      }),
      initialPageParam: undefined,
      getNextPageParam: (p) => p.nextCursor ?? undefined,
      enabled: false,
    });
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(
      cache.getQueryData(notificationKeys.summary("another-account")),
    ).toBeUndefined();
    observer.destroy();
    cache.clear();
  });
  it("accepts support, review moderation and existing ExchangeDisputed notices and opens exact targets", () => {
    for (const [kind, targetType, path] of [
      ["SupportUpdated", "SupportCase", `/support/${id}`],
      ["ReviewModerated", "TransactionReview", `/reviews?reviewId=${id}`],
      ["ExchangeDisputed", "Exchange", `/exchange/${id}`],
    ] as const) {
      const notice = notificationSchema.parse({
        id,
        kind,
        title: "QA",
        body: "QA only",
        targetType,
        targetId: id,
        createdAt: new Date().toISOString(),
        readAt: null,
      });
      expect(notificationPath(notice)).toBe(path);
    }
    expect(
      notificationPath({ targetType: "Unknown" as never, targetId: id }),
    ).toBe("/notifications");
  });
});
