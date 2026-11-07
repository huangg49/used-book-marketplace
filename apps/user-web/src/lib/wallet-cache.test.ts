import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
const auth = vi.hoisted(() => ({ owner: "a" as string | undefined }));
vi.mock("./session", () => ({ session: { getSnapshot: () => auth.owner
  ? { status: "authenticated", user: { id: auth.owner } } : { status: "anonymous" } } }));
import { invalidateMemberWalletViews } from "./wallet-cache";
const clients: QueryClient[] = [];
const client = () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(cache); return cache;
};
beforeEach(() => { auth.owner = "a"; });
afterEach(() => clients.splice(0).forEach(cache => cache.clear()));

describe("wallet view invalidation after a command ACK", () => {
  it("marks the owner's real view families stale without changing cached money", () => {
    const cache = client();
    const owned = [["wallet-summary", "a"], ["member-wallet-mini", "a"],
      ["wallet-history", "a", "Topup"], ["wallet-history-overview", "a"], ["wallet-summary"], ["wallet"]];
    const unrelated = [["wallet-summary", "b"], ["member-wallet-mini", "b"], ["wallet-history", "b"],
      ["wallet-checkout", "a", "checkout"], ["other", "a"]];
    for (const key of [...owned, ...unrelated]) cache.setQueryData(key, 100000);
    invalidateMemberWalletViews(cache, "a");
    for (const key of owned) expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of unrelated) expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
    for (const key of [...owned, ...unrelated]) expect(cache.getQueryData(key)).toBe(100000);
  });

  it("ignores an old actor, an absent actor and a logged-out session", () => {
    const cache = client();
    cache.setQueryData(["wallet-summary", "a"], 100000);
    cache.setQueryData(["wallet-summary"], 100000);
    for (const [current, captured] of [["b", "a"], ["a", undefined], [undefined, "a"]]) {
      auth.owner = current;
      invalidateMemberWalletViews(cache, captured);
      expect(cache.getQueryState(["wallet-summary", "a"])?.isInvalidated).toBe(false);
      expect(cache.getQueryState(["wallet-summary"])?.isInvalidated).toBe(false);
    }
  });

  it("replaces a pre-ACK read and ignores its late stale result", async () => {
    const cache = client(), key = ["wallet-summary", "a"];
    cache.setQueryData(key, 100000);
    let resolveOld!: (value: number) => void, reads = 0;
    const observer = new QueryObserver(cache, { queryKey: key, staleTime: Infinity,
      queryFn: () => ++reads === 1 ? new Promise<number>(resolve => { resolveOld = resolve; }) : Promise.resolve(50000) });
    const release = observer.subscribe(() => {});
    try {
      const old = observer.refetch();
      await vi.waitFor(() => expect(reads).toBe(1));
      invalidateMemberWalletViews(cache, "a");
      await vi.waitFor(() => expect(cache.getQueryData(key)).toBe(50000));
      resolveOld(100000); await old;
      expect(cache.getQueryData(key)).toBe(50000);
      expect(reads).toBe(2);
    } finally { release(); }
  });
});
