import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { CurrentUser } from "@used-books/session-client";
import { z } from "zod";
import {
  dashboardKeys,
  invalidateDashboard,
  refreshDashboard,
  dashboardInterval,
} from "../../core/dashboard-cache";
import { createCommand, runCommand, type Request } from "../../core/command";
import { dashboardOverviewQuery, dashboardSourceQuery } from "./queries";
import type { DashboardSource } from "./sources";

const user: CurrentUser = {
  id: "reviewer-A",
  email: "qa@example.test",
  displayName: "QA",
  status: "ACTIVE",
  roles: ["ADMIN", "STAFF"],
};
const request: Request = async () => {
  throw new Error("Unexpected request");
};
const clients: QueryClient[] = [];
const client = () => {
  const value = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(value);
  return value;
};
const source = (): DashboardSource => ({
  id: "points",
  title: "Điểm",
  path: "/operations/points",
  to: "/operations/points",
  note: "",
  load: vi.fn(async () => ({ value: 2, rows: [] })),
});
const overview = (days: 7 | 30) => ({
  days,
  timezone: "Asia/Ho_Chi_Minh",
  startAt: "2026-10-01T17:00:00.000Z",
  serverTime: "2026-10-27T10:00:00.000Z",
  pending: { listings: 2, catalog: 1 },
  daily: Array.from({ length: days }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    listingSubmitted: 1,
    listingApproved: 0,
    listingRejected: 0,
    catalogSubmitted: 0,
    catalogConfirmed: 0,
    catalogRejected: 0,
  })),
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T10:00:00.000Z"));
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  vi.useRealTimers();
});

describe("dashboard request budget", () => {
  it("keeps a remount's next poll anchored to the last successful response without rapid failure retries", async () => {
    const cache = client(),
      s = source(),
      options = dashboardSourceQuery(user, s, request);
    await cache.fetchQuery(options);
    const query = cache.getQueryCache().find({ queryKey: options.queryKey })!;
    vi.setSystemTime(Date.now() + 29_000);
    expect(dashboardInterval(query)).toBe(1_000);
    vi.setSystemTime(Date.now() + 2_000);
    expect(dashboardInterval(query)).toBe(30_000);
    vi.mocked(s.load).mockRejectedValueOnce(new Error("offline"));
    await expect(cache.fetchQuery(options)).rejects.toThrow("offline");
    expect(dashboardInterval(query)).toBe(30_000);
  });
  it("reuses a recent source on remount, then refetches at 30 seconds", async () => {
    const cache = client(),
      s = source(),
      options = dashboardSourceQuery(user, s, request);
    await cache.fetchQuery(options);
    const observer = new QueryObserver(cache, options),
      stop = observer.subscribe(() => {});
    await Promise.resolve();
    stop();
    vi.setSystemTime(Date.now() + 29_999);
    await cache.fetchQuery(options);
    expect(s.load).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 1);
    await cache.fetchQuery(options);
    expect(s.load).toHaveBeenCalledTimes(2);
  });
  it("shares an in-flight GET for the same source", async () => {
    const cache = client(),
      s = source();
    let resolve!: (data: { value: number; rows: [] }) => void;
    vi.mocked(s.load).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const options = dashboardSourceQuery(user, s, request);
    const a = cache.fetchQuery(options),
      b = cache.fetchQuery(options);
    expect(s.load).toHaveBeenCalledTimes(1);
    resolve({ value: 2, rows: [] });
    await Promise.all([a, b]);
  });
  it("keeps both periods cached through 7→30→7 and allows an explicit refresh", async () => {
    const cache = client();
    const calls = vi.fn();
    const fetcher: Request = async (path, schema) => {
      calls(path);
      return schema.parse(overview(path.endsWith("30") ? 30 : 7));
    };
    const seven = dashboardOverviewQuery(user, 7, fetcher),
      thirty = dashboardOverviewQuery(user, 30, fetcher);
    await cache.fetchQuery(seven);
    await cache.fetchQuery(thirty);
    await cache.fetchQuery(seven);
    expect(calls).toHaveBeenCalledTimes(2);
    const stop = new QueryObserver(cache, seven).subscribe(() => {});
    await refreshDashboard(cache);
    expect(calls).toHaveBeenCalledTimes(3);
    expect(cache.getQueryState(thirty.queryKey)?.isInvalidated).toBe(true);
    await cache.fetchQuery(thirty);
    expect(calls).toHaveBeenCalledTimes(4);
    stop();
  });
  it("retains the last real data on a failed refresh and stays recoverable", async () => {
    const cache = client(),
      s = source(),
      options = dashboardSourceQuery(user, s, request);
    await cache.fetchQuery(options);
    vi.mocked(s.load).mockRejectedValueOnce(new Error("offline"));
    await cache.refetchQueries({ queryKey: options.queryKey, exact: true });
    expect(cache.getQueryData(options.queryKey)).toEqual({
      value: 2,
      rows: [],
    });
    expect(cache.getQueryState(options.queryKey)?.error).toBeInstanceOf(Error);
    await cache.refetchQueries({ queryKey: options.queryKey, exact: true });
    expect(cache.getQueryState(options.queryKey)?.error).toBeNull();
  });
  it("isolates account/capability scopes while treating role order as equivalent", async () => {
    const cache = client(),
      s = source();
    await cache.fetchQuery(dashboardSourceQuery(user, s, request));
    await cache.fetchQuery(
      dashboardSourceQuery({ ...user, roles: ["STAFF", "ADMIN"] }, s, request),
    );
    expect(s.load).toHaveBeenCalledTimes(1);
    await cache.fetchQuery(
      dashboardSourceQuery({ ...user, roles: ["STAFF"] }, s, request),
    );
    await cache.fetchQuery(
      dashboardSourceQuery({ ...user, id: "reviewer-B" }, s, request),
    );
    expect(s.load).toHaveBeenCalledTimes(3);
    for (const roles of [
      ["MEMBER"],
      ["TEST_OPERATOR"],
    ] as CurrentUser["roles"][])
      expect(
        dashboardOverviewQuery({ ...user, roles }, 7, request).enabled,
      ).toBe(false);
  });
});

describe("dashboard and acknowledged commands", () => {
  it("marks sources and both periods stale without eagerly firing GETs, even with an active observer", async () => {
    const cache = client(),
      s = source(),
      options = dashboardSourceQuery(user, s, request);
    await cache.fetchQuery(options);
    const stop = new QueryObserver(cache, options).subscribe(() => {});
    const seven = dashboardKeys.overview(user, 7),
      thirty = dashboardKeys.overview(user, 30);
    cache.setQueryData(seven, overview(7));
    cache.setQueryData(thirty, overview(30));
    cache.setQueryData(["profile"], user);
    await invalidateDashboard(cache);
    expect(s.load).toHaveBeenCalledTimes(1);
    for (const key of [options.queryKey, seven, thirty])
      expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    expect(cache.getQueryState(["profile"])?.isInvalidated).toBe(false);
    await cache.fetchQuery(options);
    expect(s.load).toHaveBeenCalledTimes(2);
    stop();
  });
  it("keeps key/body after lost ACK, invalidates only during reconciliation and never reposts an acknowledged command", async () => {
    const cache = client(),
      key = dashboardKeys.overview(user, 7);
    cache.setQueryData(key, overview(7));
    const intent = createCommand("/test-command", { expectedVersion: 2 });
    const receipt = z.object({ recorded: z.literal(true) }),
      sent: RequestInit[] = [];
    let reloadFails = true;
    const commandRequest: Request = async (_path, schema, init) => {
      sent.push(init!);
      if (sent.length === 1) throw new Error("Lost ACK");
      return schema.parse({ recorded: true });
    };
    const reconcile = async () => {
      await invalidateDashboard(cache);
      if (reloadFails) throw new Error("GET offline");
    };
    await expect(
      runCommand(intent, receipt, commandRequest, reconcile),
    ).rejects.toThrow("Lost ACK");
    expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
    await expect(
      runCommand(intent, receipt, commandRequest, reconcile),
    ).rejects.toThrow("GET offline");
    expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
    expect(intent.acknowledged).toBe(true);
    reloadFails = false;
    await expect(
      runCommand(intent, receipt, commandRequest, reconcile),
    ).resolves.toEqual({ recorded: true });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual(sent[1]);
  });
});
