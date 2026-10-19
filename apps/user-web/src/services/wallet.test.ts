import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("../lib/session", () => ({ session: { request: vi.fn() } }));
import { session } from "../lib/session";
import {
  getWalletSummary,
  walletSummarySchema,
  getWalletHistory,
  walletHistoryPageSchema,
} from "./wallet";
beforeEach(() => vi.resetAllMocks());

const summary = {
  demoOnly: true,
  label: "Mô phỏng đồ án",
  currency: "VND",
  available: 0,
  transactionHeld: 120_000,
  withdrawalHeld: 0,
  total: 120_000,
  serverTime: "2026-10-12T03:00:00.000Z",
  topupEnabled: false,
  paymentsEnabled: false,
  withdrawalsEnabled: false,
};
describe("read-only simulated wallet", () => {
  it("reads the authenticated endpoint and preserves zero and held amounts", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(summary),
    );
    expect(await getWalletSummary()).toEqual(summary);
    expect(vi.mocked(session.request).mock.calls[0]?.[0]).toBe("/me/wallet");
    expect(vi.mocked(session.request).mock.calls[0]).toHaveLength(2);
  });
  it.each([
    { demoOnly: false },
    { available: -1 },
    { transactionHeld: 0.5 },
    { withdrawalsEnabled: true },
    { label: "Tiền thật" },
    { serverTime: "invalid" },
  ])("rejects incompatible wallet data %j", (change) => {
    expect(
      walletSummarySchema.safeParse({ ...summary, ...change }).success,
    ).toBe(false);
  });
});

describe("private wallet transaction history", () => {
  const item = {
    journalId: "10000000-0000-4000-8000-000000000001",
    orderId: "10000000-0000-4000-8000-000000000002",
    topupId: null,
    type: "OrderPayment",
    amount: -50_000,
    balanceAfter: 0,
    postedAt: "2026-10-19T01:00:00.000Z",
    demoOnly: true,
    label: "Mô phỏng đồ án",
    currency: "VND",
  };
  it("reads filtered cursor pages while preserving debit signs and zero balance", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse({ items: [item], nextCursor: null }),
    );
    expect(
      await getWalletHistory({ type: "OrderPayment", cursor: item.journalId }),
    ).toEqual({ items: [item], nextCursor: null });
    expect(vi.mocked(session.request).mock.calls[0]?.[0]).toBe(
      `/me/wallet/history?limit=20&type=OrderPayment&cursor=${item.journalId}`,
    );
    expect(vi.mocked(session.request).mock.calls[0]).toHaveLength(2);
  });
  it.each([
    { amount: 0.5 },
    { balanceAfter: -1 },
    { type: "Withdrawal" },
    { demoOnly: false },
  ])("rejects unsupported or invalid history %j", (change) => {
    expect(
      walletHistoryPageSchema.safeParse({
        items: [{ ...item, ...change }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});
