import { z } from "zod";
import type { components } from "@used-books/api-contract";
import { formatVnd } from "./revenue";

const nonNegInt = z.number().int().nonnegative();
const signedInt = z.number().int();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const financeTotals = z.object({
  directCommission: nonNegInt,
  auctionCommission: nonNegInt,
  forfeitedDeposits: nonNegInt,
  depositShare: nonNegInt,
  legacyListingFees: nonNegInt,
  netRevenue: signedInt,
  passThroughShipping: nonNegInt,
  incidentCompensation: nonNegInt,
  profit: signedInt,
  gmv: nonNegInt,
  settledOrders: nonNegInt,
  takeRateBps: nonNegInt.nullable(),
}) satisfies z.ZodType<components["schemas"]["FinanceTotals"]>;

export const financeOverview = z.object({
  from: isoDate,
  to: isoDate,
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  serverTime: z.string().datetime(),
  simulated: z.literal(true),
  current: financeTotals,
  previous: z.object({
    from: isoDate,
    to: isoDate,
    totals: financeTotals,
  }),
  daily: z
    .array(
      z.object({
        date: isoDate,
        directCommission: nonNegInt,
        auctionCommission: nonNegInt,
        forfeitedDeposits: nonNegInt,
        depositShare: nonNegInt,
        netRevenue: signedInt,
        incidentCompensation: nonNegInt,
        profit: signedInt,
        gmv: nonNegInt,
        settledOrders: nonNegInt,
      }),
    )
    .min(1)
    .max(366),
  exchange: z.object({
    completed: nonNegInt,
    initiatorValue: nonNegInt,
    recipientValue: nonNegInt,
  }),
  notes: z.array(z.string()).max(6),
}) satisfies z.ZodType<components["schemas"]["FinanceOverview"]>;

export const financeCashflow = z.object({
  from: isoDate,
  to: isoDate,
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  serverTime: z.string().datetime(),
  simulated: z.literal(true),
  conservation: z.object({
    balanced: z.boolean(),
    capitalTarget: nonNegInt,
    accountedTotal: nonNegInt,
    discrepancy: signedInt,
    sourceRemaining: nonNegInt,
    memberAvailable: nonNegInt,
    transactionHeld: nonNegInt,
    auctionHeld: nonNegInt,
    withdrawalHeld: nonNegInt,
    platformCommission: nonNegInt,
    listingFeeHeld: nonNegInt,
    incidentFundBalance: nonNegInt,
  }),
  period: z.object({
    topupTotal: nonNegInt,
    topupCount: nonNegInt,
    withdrawalTotal: nonNegInt,
    withdrawalCount: nonNegInt,
    netCashflow: signedInt,
  }),
  daily: z
    .array(
      z.object({
        date: isoDate,
        topupAmount: nonNegInt,
        topupCount: nonNegInt,
        withdrawalAmount: nonNegInt,
        withdrawalCount: nonNegInt,
        netCashflow: signedInt,
      }),
    )
    .min(1)
    .max(366),
  withdrawalQueue: z.object({
    pendingCount: nonNegInt,
    pendingAmount: nonNegInt,
    oldestRequestedAt: z.string().datetime().nullable(),
  }),
}) satisfies z.ZodType<components["schemas"]["FinanceCashflow"]>;

export const operationsAnalytics = z.object({
  from: isoDate,
  to: isoDate,
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  serverTime: z.string().datetime(),
  sales: z.object({
    created: nonNegInt,
    completed: nonNegInt,
    active: nonNegInt,
    cancelled: nonNegInt,
    completionRateBps: nonNegInt.nullable(),
  }),
  exchanges: z.object({
    proposed: nonNegInt,
    completed: nonNegInt,
    active: nonNegInt,
    disputed: nonNegInt,
    cancelled: nonNegInt,
    completionRateBps: nonNegInt.nullable(),
  }),
  auctions: z.object({
    created: nonNegInt,
    active: nonNegInt,
    sold: nonNegInt,
    paymentExpired: nonNegInt,
    cancelled: nonNegInt,
    sellThroughRateBps: nonNegInt.nullable(),
  }),
  risk: z.object({
    openExchangeDisputes: nonNegInt,
    openPointIncidents: nonNegInt,
    incidentFundBalance: nonNegInt,
    incidentCompensationInPeriod: nonNegInt,
    underfundedIncidents: nonNegInt,
  }),
  users: z.object({
    totalMembers: nonNegInt,
    newInPeriod: nonNegInt,
    activeMembers: nonNegInt,
    restrictedMembers: nonNegInt,
    lockedMembers: nonNegInt,
  }),
}) satisfies z.ZodType<components["schemas"]["OperationsAnalytics"]>;

export type FinanceOverview = z.infer<typeof financeOverview>;
export type FinanceCashflow = z.infer<typeof financeCashflow>;
export type OperationsAnalytics = z.infer<typeof operationsAnalytics>;

export function formatSignedVnd(value: number) {
  if (value < 0) return `-${formatVnd(Math.abs(value))}`;
  if (value > 0) return `+${formatVnd(value)}`;
  return formatVnd(0);
}

export function formatBps(bps: number | null) {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(2).replace(".", ",")}%`;
}

export function formatDelta(current: number, previous: number): {
  label: string;
  direction: "up" | "down" | "flat";
} {
  const diff = current - previous;
  if (diff === 0) return { label: "Không đổi", direction: "flat" };
  if (previous === 0) {
    return diff > 0
      ? { label: "Tăng mới", direction: "up" }
      : { label: "Giảm mới", direction: "down" };
  }
  const pct = Math.round((Math.abs(diff) / Math.abs(previous)) * 100);
  return diff > 0
    ? { label: `Tăng ${pct}%`, direction: "up" }
    : { label: `Giảm ${pct}%`, direction: "down" };
}

