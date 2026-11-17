import { afterEach, describe, it, expect, vi } from "vitest";
import { QueryClient, QueryObserver, InfiniteQueryObserver } from "@tanstack/react-query";
vi.mock("../lib/session", () => ({ session: { request: vi.fn() } }));
import { session } from "../lib/session";
import {
  notificationKeys,
  notificationPath,
  notificationSchema,
  notificationPreviewQuery,
} from "./notifications";
const id = "1101d28c-80c3-4223-b289-e9446ba940be";
describe("durable inbox cache and targets", () => {
  afterEach(() => vi.resetAllMocks());
  it("keeps the flat preview separate from infinite pages and account identity", () => {
    const cache = new QueryClient();
    cache.setQueryData(notificationKeys.bell(id), {
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
      cache.getQueryData(notificationKeys.bell("another-account")),
    ).toBeUndefined();
    observer.destroy();
    cache.clear();
  });
  it("shares concurrent preview reads and one invalidation across consumers", async () => {
    const cache = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000 } } });
    vi.mocked(session.request).mockResolvedValue({ items: [], unreadCount: 12, nextCursor: null });
    const observers = Array.from({ length: 4 }, () => new QueryObserver(cache, notificationPreviewQuery(id)));
    const release = observers.map(observer => observer.subscribe(() => {}));
    try {
      await vi.waitFor(() => expect(observers.every(o => o.getCurrentResult().isSuccess)).toBe(true));
      expect(session.request).toHaveBeenCalledOnce();
      expect(vi.mocked(session.request).mock.calls[0]?.[0]).toBe('/me/notifications?limit=8');
      vi.mocked(session.request).mockResolvedValue({ items: [], unreadCount: 0, nextCursor: null });
      await cache.invalidateQueries({ queryKey: ['notifications'] });
      expect(session.request).toHaveBeenCalledTimes(2);
      expect(observers.every(o => o.getCurrentResult().data?.unreadCount === 0)).toBe(true);
    } finally { release.forEach(stop => stop()); cache.clear(); }
  });
  it("does not fetch for guests or reuse a different owner's preview", async () => {
    const cache = new QueryClient();
    cache.setQueryData(notificationKeys.bell(id), { items: [], unreadCount: 12, nextCursor: null });
    const guest = new QueryObserver(cache, notificationPreviewQuery(undefined));
    const other = new QueryObserver(cache, notificationPreviewQuery('other-owner'));
    vi.mocked(session.request).mockResolvedValue({ items: [], unreadCount: 3, nextCursor: null });
    const release = [guest.subscribe(() => {}), other.subscribe(() => {})];
    try {
      expect(other.getCurrentResult().data).toBeUndefined();
      await vi.waitFor(() => expect(other.getCurrentResult().data?.unreadCount).toBe(3));
      expect(guest.getCurrentResult().data).toBeUndefined();
      expect(session.request).toHaveBeenCalledOnce();
      expect(cache.getQueryData(notificationKeys.bell(id))).toMatchObject({ unreadCount: 12 });
    } finally { release.forEach(stop => stop()); cache.clear(); }
  });
  it("accepts support, review moderation and existing ExchangeDisputed notices and opens exact targets", () => {
    for (const [kind, targetType, path] of [
      ["SupportUpdated", "SupportCase", `/support/${id}`],
      ["ReviewModerated", "TransactionReview", `/reviews?reviewId=${id}`],
      ["ExchangeDisputed", "Exchange", `/exchange/${id}`],
      ["ExchangeShipped", "Exchange", `/exchange/${id}#nhan-sach`],
      ["ExchangeReceived", "Exchange", `/exchange/${id}#giao-nhan`],
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
