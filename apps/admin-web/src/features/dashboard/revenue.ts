import { z } from "zod";
import type { components } from "@used-books/api-contract";

const money = z.number().int().nonnegative();
export const revenueOverview = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  serverTime: z.string().datetime(),
  total: money,
  orderSettlements: z.number().int().nonnegative(),
  daily: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: money,
        orderSettlements: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(366),
  page: z.number().int().positive(),
  pageSize: z.literal(10),
  totalTransactions: z.number().int().nonnegative(),
  transactions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["OrderSettlement", "ListingFeeSettlement"]),
      label: z.string(),
      amount: money,
      postedAt: z.string().datetime(),
      referenceId: z.string().nullable(),
    }),
  ),
}) satisfies z.ZodType<components["schemas"]["RevenueOverview"]>;

export type RevenueOverview = z.infer<typeof revenueOverview>;

export function dateInputInHcm(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

export function subtractDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function formatVnd(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatRevenueDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
