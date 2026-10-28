import { z } from "zod";
import type { components } from "@used-books/api-contract";
const count = z.number().int().nonnegative();
export const moderationOverview = z
  .object({
    days: z.union([z.literal(7), z.literal(30)]),
    timezone: z.literal("Asia/Ho_Chi_Minh"),
    startAt: z.string().datetime(),
    serverTime: z.string().datetime(),
    pending: z.object({ listings: count, catalog: count.nullable() }),
    daily: z
      .array(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          listingSubmitted: count,
          listingApproved: count,
          listingRejected: count,
          catalogSubmitted: count.nullable(),
          catalogConfirmed: count.nullable(),
          catalogRejected: count.nullable(),
        }),
      )
      .min(7)
      .max(30),
  })
  .refine(
    (value) => value.daily.length === value.days,
    "Calendar series must cover the requested period",
  ) satisfies z.ZodType<components["schemas"]["ModerationOverview"]>;
export type Overview = z.infer<typeof moderationOverview>;
export function overviewSeries(
  data: Overview,
  scope: "all" | "listings" | "catalog",
) {
  return data.daily.map((day) => ({
    date: day.date,
    submitted:
      (scope === "catalog" ? 0 : day.listingSubmitted) +
      (scope === "listings" ? 0 : (day.catalogSubmitted ?? 0)),
    approved:
      (scope === "catalog" ? 0 : day.listingApproved) +
      (scope === "listings" ? 0 : (day.catalogConfirmed ?? 0)),
    rejected:
      (scope === "catalog" ? 0 : day.listingRejected) +
      (scope === "listings" ? 0 : (day.catalogRejected ?? 0)),
    processed:
      (scope === "catalog" ? 0 : day.listingApproved + day.listingRejected) +
      (scope === "listings"
        ? 0
        : (day.catalogConfirmed ?? 0) + (day.catalogRejected ?? 0)),
  }));
}
