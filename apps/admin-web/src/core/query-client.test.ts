import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { CurrentUser, SessionState } from "@used-books/session-client";
import { bindSessionCache } from "./query-client";

const user = (id: string): CurrentUser => ({
  id,
  email: "qa@example.test",
  displayName: "QA",
  roles: ["ADMIN"],
  status: "ACTIVE",
});
const authenticated = (id: string): SessionState => ({
  status: "authenticated",
  user: user(id),
});
const cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
});
function fixture(initial: SessionState) {
  let state = initial;
  const listeners = new Set<() => void>();
  const source = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const clear = vi.spyOn(cache, "clear");
  const stop = bindSessionCache(cache, source);
  cleanups.push(() => {
    stop();
    cache.clear();
  });
  return {
    cache,
    clear,
    stop,
    publish: (next: SessionState) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}
describe("deferred workspace cache ownership", () => {
  it("can attach after login and retains data across refreshes of the same identity", () => {
    const f = fixture(authenticated("A"));
    f.cache.setQueryData(["queue"], { private: "A" });
    f.publish(authenticated("A"));
    expect(f.clear).not.toHaveBeenCalled();
    expect(f.cache.getQueryData(["queue"])).toEqual({ private: "A" });
  });
  it("clears all cached queries and mutations immediately on logout", () => {
    const f = fixture(authenticated("A"));
    f.cache.setQueryData(["queue"], { private: "A" });
    f.cache.getMutationCache().build(f.cache, { mutationKey: ["receipt"] });
    f.publish({ status: "anonymous" });
    expect(f.clear).toHaveBeenCalledTimes(1);
    expect(f.cache.getQueryCache().getAll()).toHaveLength(0);
    expect(f.cache.getMutationCache().getAll()).toHaveLength(0);
  });
  it("cannot reuse A's private data when B signs in, even with the same query key", () => {
    const f = fixture(authenticated("A"));
    f.cache.setQueryData(["profile"], user("A"));
    f.publish(authenticated("B"));
    expect(f.cache.getQueryData(["profile"])).toBeUndefined();
    f.cache.setQueryData(["profile"], user("B"));
    f.publish(authenticated("B"));
    expect(f.cache.getQueryData(["profile"])).toEqual(user("B"));
    expect(f.clear).toHaveBeenCalledTimes(1);
  });
  it.each<SessionState>([
    { status: "loading" },
    { status: "unavailable", message: "offline" },
  ])("drops private cache when identity is lost: $status", (state) => {
    const f = fixture(authenticated("A"));
    f.cache.setQueryData(["queue"], { private: "A" });
    f.publish(state);
    expect(f.cache.getQueryData(["queue"])).toBeUndefined();
  });
  it("does not clear repeatedly for anonymous notifications and unsubscribes on disposal", () => {
    const f = fixture({ status: "anonymous" });
    f.publish({ status: "anonymous" });
    expect(f.clear).not.toHaveBeenCalled();
    f.stop();
    f.publish(authenticated("A"));
    expect(f.clear).not.toHaveBeenCalled();
  });
  it("cancels in-flight private queries so a late response cannot repopulate another identity's cache", async () => {
    const f = fixture(authenticated("A"));
    let complete!: (value: string) => void;
    let signal: AbortSignal | undefined;
    const request = f.cache
      .fetchQuery({
        queryKey: ["private"],
        queryFn: (context) => {
          signal = context.signal;
          return new Promise<string>((resolve) => {
            complete = resolve;
          });
        },
      })
      .catch(() => undefined);
    f.publish(authenticated("B"));
    expect(signal?.aborted).toBe(true);
    complete("A private result");
    await request;
    expect(f.cache.getQueryData(["private"])).toBeUndefined();
  });
});
