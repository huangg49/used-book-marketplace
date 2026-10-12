import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("../lib/session", () => ({ session: { request: vi.fn() } }));
import { session } from "../lib/session";
import { getWalletSummary, walletSummarySchema } from "./wallet";

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
