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
    platformNetRevenueBalance: nonNegInt,
    platformShippingPassThrough: nonNegInt,
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

export const financeHoldKind = z.enum([
  "Exchange",
  "AuctionBid",
  "DirectOrder",
  "PointOrder",
  "Withdrawal",
]);

export const financeHolds = z.object({
  serverTime: z.string().datetime(),
  simulated: z.literal(true),
  summary: z.object({
    totalHeld: nonNegInt,
    totalAccounts: nonNegInt,
    byKind: z
      .array(
        z.object({
          kind: financeHoldKind,
          label: z.string(),
          count: nonNegInt,
          amount: nonNegInt,
        }),
      )
      .max(5),
  }),
  page: z.number().int().positive(),
  pageSize: z.literal(15),
  totalItems: nonNegInt,
  items: z
    .array(
      z.object({
        accountId: z.string(),
        kind: financeHoldKind,
        kindLabel: z.string(),
        holderId: z.string().nullable(),
        holderName: z.string(),
        holderEmail: z.string().nullable(),
        amount: z.number().int().positive(),
        referenceId: z.string().nullable(),
        status: z.string(),
        updatedAt: z.string().datetime().nullable(),
      }),
    )
    .max(15),
}) satisfies z.ZodType<components["schemas"]["FinanceHolds"]>;

export const financeHoldHistoryKind = z.enum([
  "AuctionRelease",
  "AuctionForfeit",
  "OrderRefund",
  "WithdrawalRefund",
  "ExchangeCompensation",
]);

export const financeHoldHistory = z.object({
  serverTime: z.string().datetime(),
  simulated: z.literal(true),
  summary: z.object({
    totalRefunded: nonNegInt,
    totalForfeited: nonNegInt,
    totalCompensated: nonNegInt.optional(),
    totalEvents: nonNegInt,
    byKind: z
      .array(
        z.object({
          kind: financeHoldHistoryKind,
          label: z.string(),
          count: nonNegInt,
          amount: nonNegInt,
        }),
      )
      .max(5),
  }),
  page: z.number().int().positive(),
  pageSize: z.literal(15),
  totalItems: nonNegInt,
  items: z
    .array(
      z.object({
        journalId: z.string(),
        kind: financeHoldHistoryKind,
        kindLabel: z.string(),
        outcome: z.enum(["ReturnedToWallet", "Forfeited", "TransferredToCounterparty"]),
        holderId: z.string().nullable(),
        holderName: z.string(),
        holderEmail: z.string().nullable(),
        amount: z.number().int().positive(),
        referenceId: z.string().nullable(),
        detail: z.string(),
        postedAt: z.string().datetime(),
      }),
    )
    .max(15),
}) satisfies z.ZodType<components["schemas"]["FinanceHoldHistory"]>;

export const financeHoldLocks = z.object({
  serverTime: z.string().datetime(),
  simulated: z.literal(true),
  summary: z.object({
    totalLocked: nonNegInt,
    totalEvents: nonNegInt,
    byKind: z
      .array(
        z.object({
          kind: financeHoldKind,
          label: z.string(),
          count: nonNegInt,
          amount: nonNegInt,
        }),
      )
      .max(5),
  }),
  page: z.number().int().positive(),
  pageSize: z.literal(15),
  totalItems: nonNegInt,
  items: z
    .array(
      z.object({
        journalId: z.string(),
        kind: financeHoldKind,
        kindLabel: z.string(),
        holderId: z.string().nullable(),
        holderName: z.string(),
        holderEmail: z.string().nullable(),
        amount: z.number().int().positive(),
        referenceId: z.string().nullable(),
        detail: z.string(),
        postedAt: z.string().datetime(),
      }),
    )
    .max(15),
}) satisfies z.ZodType<components["schemas"]["FinanceHoldLocks"]>;

export const financeTransferKind = z.enum(["Topup", "WithdrawalPayout"]);

export const financeTransfers = z.object({
  serverTime: z.string().datetime(),
  simulated: z.literal(true),
  summary: z.object({
    totalTopup: nonNegInt,
    topupCount: nonNegInt,
    totalWithdrawal: nonNegInt,
    withdrawalCount: nonNegInt,
    netFlow: z.number().int(),
  }),
  page: z.number().int().positive(),
  pageSize: z.literal(15),
  totalItems: nonNegInt,
  items: z
    .array(
      z.object({
        journalId: z.string(),
        kind: financeTransferKind,
        kindLabel: z.string(),
        userId: z.string().nullable(),
        userName: z.string(),
        userEmail: z.string().nullable(),
        amount: z.number().int().positive(),
        referenceId: z.string().nullable(),
        detail: z.string(),
        postedAt: z.string().datetime(),
      }),
    )
    .max(15),
}) satisfies z.ZodType<components["schemas"]["FinanceTransfers"]>;

export type FinanceOverview = z.infer<typeof financeOverview>;
export type FinanceCashflow = z.infer<typeof financeCashflow>;
export type FinanceHoldKind = z.infer<typeof financeHoldKind>;
export type FinanceHolds = z.infer<typeof financeHolds>;
export type FinanceHoldHistoryKind = z.infer<typeof financeHoldHistoryKind>;
export type FinanceHoldHistory = z.infer<typeof financeHoldHistory>;
export type FinanceHoldLocks = z.infer<typeof financeHoldLocks>;
export type FinanceTransferKind = z.infer<typeof financeTransferKind>;
export type FinanceTransfers = z.infer<typeof financeTransfers>;
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

