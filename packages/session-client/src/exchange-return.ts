import { z } from "zod";
import type { components } from "@used-books/api-contract";

const date = z.iso.datetime({ offset: true }).nullable();
const money = z.number().int().nonnegative();
export const exchangeReturnResolutionSchema = z.object({
  phase: z.enum(["Evidence", "ReturnOrdered", "ReturnInProgress", "CheckingReturn", "ReturnIssue", "CompensationOrdered", "NeedsReview", "Closed"]),
  ownerId: z.uuid(),
  holderId: z.uuid(),
  listingId: z.uuid(),
  note: z.string(),
  evidenceDueAt: date,
  appealDueAt: date,
  effectiveAt: date,
  appeals: z.array(z.object({ by: z.uuid(), note: z.string() })).max(2),
  returnDueAt: date,
  trackingCode: z.string().nullable(),
  returnedAt: date,
  checkDueAt: date,
  outcome: z.enum(["Returned", "Compensated"]).nullable(),
  compensation: money,
  ownerDeposit: money,
  holderDeposit: money,
  differenceAmount: money,
  differencePayerId: z.uuid().nullable(),
}) satisfies z.ZodType<components["schemas"]["ExchangeReturnResolution"]>;

export type ExchangeReturnResolution = z.infer<typeof exchangeReturnResolutionSchema>;
export type ExchangeReturnAction = components["schemas"]["ExchangeReturnCommand"]["action"];

export const exchangeReturnPhase: Record<ExchangeReturnResolution["phase"], string> = {
  Evidence: "Đang bổ sung bằng chứng",
  ReturnOrdered: "Đã có quyết định trả sách",
  ReturnInProgress: "Đang chờ sách hoàn",
  CheckingReturn: "Đang kiểm tra sách hoàn",
  ReturnIssue: "Đang xử lý sự cố trả sách",
  CompensationOrdered: "Đã có quyết định bồi thường",
  NeedsReview: "Đang xem xét lại",
  Closed: "Đã xử lý xong",
};
