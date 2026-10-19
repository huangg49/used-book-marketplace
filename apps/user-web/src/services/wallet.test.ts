import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("../lib/session", () => ({ session: { request: vi.fn() } }));
import { session } from "../lib/session";
import {
  getWalletSummary,
  walletSummarySchema,
  getWalletHistory,
  walletHistoryPageSchema,
  createVNPayTopup,
  getTopup,
  queryVNPayTopup,
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

describe("VNPay payment deadline", () => {
  const id = "10000000-0000-4000-8000-000000000003";
  const cancelled = {
    id,
    amount: 100_000,
    state: "Cancelled",
    credited: false,
    expiresAt: "2026-10-19T10:05:00.000Z",
    serverTime: "2026-10-19T10:05:01.000Z",
    updatedAt: "2026-10-19T10:05:00.000Z",
  };
  it("reads server cancellation and deadline without inventing a wallet credit", async () => {
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(cancelled),
    );
    expect(await getTopup(id)).toEqual(cancelled);
    expect(await queryVNPayTopup(id)).toEqual(cancelled);
    expect(vi.mocked(session.request).mock.calls[1]).toEqual([
      `/me/topups/${id}/vnpay-query`,
      expect.anything(),
      { method: "POST", headers: { "Idempotency-Key": id } },
    ]);
  });
  it("preserves the creation key and amount on replay", async () => {
    const receipt = {
      entityId: id,
      paymentUrl:
        "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=" + id,
      expiresAt: cancelled.expiresAt,
      serverTime: "2026-10-19T10:00:00.000Z",
    };
    vi.mocked(session.request).mockImplementation(async (_path, schema) =>
      (schema as z.ZodType).parse(receipt),
    );
    expect(await createVNPayTopup(100_000, id)).toEqual(receipt);
    await createVNPayTopup(100_000, id);
    expect(vi.mocked(session.request).mock.calls[0][2]).toEqual(
      vi.mocked(session.request).mock.calls[1][2],
    );
  });
  it.each(["expiresAt", "serverTime"])(
    "rejects an invalid %s deadline field",
    async (field) => {
      vi.mocked(session.request).mockImplementation(async (_path, schema) =>
        (schema as z.ZodType).parse({ ...cancelled, [field]: "invalid" }),
      );
      await expect(getTopup(id)).rejects.toThrow();
    },
  );
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
