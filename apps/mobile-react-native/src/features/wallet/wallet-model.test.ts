import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type { components } from "@used-books/api-contract";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { ApiError, SessionClient } from "../../core/api/session-client";
import {
  walletHistoryItem,
  walletHistoryPage,
  walletSummary,
} from "./contracts";
import {
  accessDenied,
  createVNPayTopup,
  historyOptions,
  queryVNPayTopup,
  signedAmount,
  summaryOptions,
  topupsOptions,
} from "./wallet-model";

const ownerA = "00000000-0000-4000-8000-000000000001";
const ownerB = "00000000-0000-4000-8000-000000000002";
const journalA = "00000000-0000-4000-8000-000000000003";
const journalB = "00000000-0000-4000-8000-000000000004";
const demo = {
  demoOnly: true,
  label: "Mô phỏng đồ án",
  currency: "VND",
} as const;
const summary = {
  ...demo,
  available: 690000,
  transactionHeld: 310000,
  withdrawalHeld: 0,
  total: 1000000,
  serverTime: "2026-09-30T04:40:00.000Z",
  topupEnabled: true,
  paymentsEnabled: true,
  withdrawalsEnabled: false,
};
const payment = {
  ...demo,
  journalId: journalA,
  topupId: null,
  orderId: ownerA,
  type: "OrderPayment",
  amount: -155000,
  balanceAfter: 690000,
  postedAt: "2026-09-30T04:40:00.000Z",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function session(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
) {
  return new SessionClient(
    "http://wallet.test/api/v1",
    {
      read: async () => null,
      write: async () => {},
      clear: async () => {},
    },
    (url, init) => fetcher(url, init ?? {}),
  );
}
const tokens = (id: string) => ({
  accessToken: id,
  refreshToken: id.padEnd(43, "r"),
  expiresIn: 900,
  user: {
    id,
    email: "member@example.test",
    displayName: "Member fixture",
    status: "ACTIVE",
    roles: ["MEMBER"],
  },
});

describe("wallet response compatibility", () => {
  it("matches the generated contract", () => {
    expectTypeOf<z.infer<typeof walletSummary>>().toEqualTypeOf<
      components["schemas"]["WalletSummary"]
    >();
    expectTypeOf<z.infer<typeof walletHistoryItem>>().toEqualTypeOf<
      components["schemas"]["WalletHistoryItem"]
    >();
    expectTypeOf<z.infer<typeof walletHistoryPage>>().toEqualTypeOf<
      components["schemas"]["WalletHistoryPage"]
    >();
  });
  it("keeps held funds and server totals separate from a partial history page", () => {
    const value = walletSummary.parse(summary);
    const page = walletHistoryPage.parse({
      items: [payment],
      nextCursor: journalB,
    });
    expect(value.available).toBe(690000);
    expect(value.transactionHeld).toBe(310000);
    expect(value.total).toBe(1000000);
    expect(page.items[0].balanceAfter).toBe(690000);
    expect(page.nextCursor).toBe(journalB);
  });
  it("accepts an empty wallet for a locked member without new-payment capabilities", () => {
    expect(
      walletSummary.parse({
        ...summary,
        available: 0,
        transactionHeld: 0,
        total: 0,
        topupEnabled: false,
        paymentsEnabled: false,
      }).available,
    ).toBe(0);
    expect(
      walletHistoryPage.parse({ items: [], nextCursor: null }).items,
    ).toEqual([]);
  });
  it.each([-1, 100000001, 0.5])(
    "rejects invalid available amount %s",
    (available) => {
      expect(walletSummary.safeParse({ ...summary, available }).success).toBe(
        false,
      );
    },
  );
  it("rejects real-money or malformed history responses", () => {
    expect(
      walletSummary.safeParse({ ...summary, demoOnly: false }).success,
    ).toBe(false);
    expect(
      walletHistoryItem.safeParse({ ...payment, type: "PendingRefund" })
        .success,
    ).toBe(false);
    expect(
      walletHistoryItem.safeParse({ ...payment, postedAt: "invalid" }).success,
    ).toBe(false);
    expect(
      walletHistoryItem.safeParse({ ...payment, balanceAfter: -1 }).success,
    ).toBe(false);
  });
  it("retains debit, credit and zero signs without treating a debit as a price", () => {
    expect(signedAmount(-155000)).toBe("−155.000 ₫");
    expect(signedAmount(1000000)).toBe("+1.000.000 ₫");
    expect(signedAmount(0)).toBe("0 ₫");
  });
});

describe("private wallet queries", () => {
  it("keeps loaded history on a page failure and retries the same cursor", async () => {
    const cursors: string[] = [];
    let failNext = true;
    const client = session(async (url) => {
      const cursor = new URL(url).searchParams.get("cursor");
      if (!cursor) return json({ items: [payment], nextCursor: journalB });
      cursors.push(cursor);
      if (failNext) {
        failNext = false;
        return json({ code: "SERVICE_UNAVAILABLE" }, 503);
      }
      return json({
        items: [{ ...payment, journalId: journalB }],
        nextCursor: null,
      });
    });
    const cache = new QueryClient();
    const observer = new InfiniteQueryObserver(
      cache,
      historyOptions(client, ownerA),
    );
    const stop = observer.subscribe(() => {});
    await observer.refetch();
    const failed = await observer.fetchNextPage();
    expect(failed.isFetchNextPageError).toBe(true);
    expect(failed.data?.pages).toHaveLength(1);
    expect(failed.data?.pages[0].items[0]).toEqual(payment);
    const recovered = await observer.fetchNextPage();
    expect(recovered.isFetchNextPageError).toBe(false);
    expect(recovered.data?.pages).toHaveLength(2);
    expect(recovered.hasNextPage).toBe(false);
    expect(cursors).toEqual([journalB, journalB]);
    stop();
    observer.destroy();
    cache.clear();
  });
  it("uses only GETs and follows the opaque server cursor", async () => {
    const requests: { path: string; method: string }[] = [];
    const client = session(async (url, init) => {
      const path = new URL(url).pathname + new URL(url).search;
      requests.push({ path, method: init.method ?? "GET" });
      if (path === "/api/v1/me/wallet") return json(summary);
      return json({
        items: [payment],
        nextCursor: path.includes("cursor=") ? null : journalB,
      });
    });
    const cache = new QueryClient();
    const balance = await cache.fetchQuery(summaryOptions(client, ownerA));
    const options = historyOptions(client, ownerA);
    const page = await options.queryFn({ pageParam: null });
    await options.queryFn({ pageParam: options.getNextPageParam(page)! });
    expect(balance.available).toBe(690000);
    expect(requests).toEqual([
      { path: "/api/v1/me/wallet", method: "GET" },
      { path: "/api/v1/me/wallet/history?limit=10", method: "GET" },
      {
        path: `/api/v1/me/wallet/history?limit=10&cursor=${journalB}`,
        method: "GET",
      },
    ]);
    cache.clear();
  });
  it("rejects a late balance from the previous session and isolates the next owner's cache", async () => {
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const client = session(async (url, init) => {
      if (url.endsWith("/auth/login"))
        return json(
          tokens(
            JSON.parse(String(init.body)).email === "a@example.test"
              ? ownerA
              : ownerB,
          ),
        );
      if (first) {
        first = false;
        await barrier;
        return json(summary);
      }
      return json({
        ...summary,
        available: 5000,
        transactionHeld: 0,
        total: 5000,
      });
    });
    await client.login({ email: "a@example.test", password: "fixture-only" });
    const cache = new QueryClient();
    const pending = cache.fetchQuery(summaryOptions(client, ownerA));
    const rejected = expect(pending).rejects.toMatchObject({
      status: 401,
      code: "SESSION_CHANGED",
    });
    await client.login({ email: "b@example.test", password: "fixture-only" });
    release();
    await rejected;
    const current = await cache.fetchQuery(summaryOptions(client, ownerB));
    expect(current.available).toBe(5000);
    expect(
      cache.getQueryData(summaryOptions(client, ownerA).queryKey),
    ).toBeUndefined();
    expect(cache.getQueryData(summaryOptions(client, ownerB).queryKey)).toEqual(
      current,
    );
    cache.clear();
  });
  it("marks an explicit permission denial for hiding old amounts, while a network failure keeps them stale", async () => {
    const client = session(async () => json({ code: "FORBIDDEN" }, 403));
    const failure = await summaryOptions(client, ownerA)
      .queryFn()
      .catch((error: unknown) => error);
    expect(accessDenied(failure)).toBe(true);
    expect(accessDenied(new ApiError(0, "NETWORK", "Offline"))).toBe(false);
  });
  it("creates a vnpay topup intent and queries its status", async () => {
    const topupId = "00000000-0000-4000-8000-000000000010";
    const calls: { url: string; method: string }[] = [];
    const client = session(async (url, init) => {
      calls.push({
        url,
        method: init.method ?? "GET",
      });
      if (url.endsWith("/me/topups/vnpay")) {
        return json({
          entityId: topupId,
          paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?test=1",
          expiresAt: "2026-10-19T22:30:00.000Z",
        });
      }
      if (url.endsWith(`/me/topups/${topupId}/vnpay-query`)) {
        return json({
          ...demo,
          id: topupId,
          version: 1,
          amount: 100000,
          state: "Succeeded",
          credited: true,
          journalId: journalA,
          createdAt: "2026-10-19T22:20:00.000Z",
          updatedAt: "2026-10-19T22:25:00.000Z",
          expiresAt: "2026-10-19T22:30:00.000Z",
          serverTime: "2026-10-19T22:25:00.000Z",
        });
      }
      return json({});
    });

    const receipt = await createVNPayTopup(client, 100000, "idem-key-1");
    expect(receipt.entityId).toBe(topupId);
    expect(calls[0]?.url).toBe("http://wallet.test/api/v1/me/topups/vnpay");
    expect(calls[0]?.method).toBe("POST");

    const status = await queryVNPayTopup(client, topupId);
    expect(status.state).toBe("Succeeded");
    expect(status.credited).toBe(true);
    expect(calls[1]?.url).toBe(
      `http://wallet.test/api/v1/me/topups/${topupId}/vnpay-query`,
    );
  });
  it("applies typeFilter to historyOptions when provided", () => {
    const client = session(async () => json({ items: [], nextCursor: null }));
    const optsAll = historyOptions(client, ownerA);
    expect(optsAll.queryKey).toEqual(["wallet", ownerA, "history", "all"]);

    const optsTopup = historyOptions(client, ownerA, "Topup");
    expect(optsTopup.queryKey).toEqual(["wallet", ownerA, "history", "Topup"]);

    const optsTopups = topupsOptions(client, ownerA);
    expect(optsTopups.queryKey).toEqual(["wallet", ownerA, "topups"]);
  });
});
