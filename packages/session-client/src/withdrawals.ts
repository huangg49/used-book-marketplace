import { z } from "zod";
import type { components } from "@used-books/api-contract";

export const withdrawalLabels = {
  Requested: "Chờ duyệt",
  Approved: "Đã duyệt",
  Processing: "Đang xử lý / đối soát",
  Completed: "Thành công",
  Rejected: "Bị từ chối",
  FailedVerified: "Chờ hoàn tiền",
  Refunded: "Đã hoàn tiền",
} as const;
export const withdrawalReasons = {
  SaleProceeds: "Rút tiền bán sách",
  Personal: "Nhu cầu cá nhân",
  Leaving: "Không còn nhu cầu sử dụng ví",
  Other: "Lý do khác",
} as const;
export const withdrawalStateSchema = z.enum(
  Object.keys(withdrawalLabels) as [
    keyof typeof withdrawalLabels,
    ...(keyof typeof withdrawalLabels)[],
  ],
);
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const withdrawalSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  ownerName: z.string(),
  amount: money,
  fee: z.literal(0),
  reason: z.enum(["SaleProceeds", "Personal", "Leaving", "Other"]),
  reasonDetail: z.string(),
  recipient: z.object({
    bankName: z.string(),
    accountNumber: z.string(),
    accountHolder: z.string(),
  }),
  state: withdrawalStateSchema,
  version: z.number().int().positive(),
  approverId: z.uuid().nullable(),
  payoutRef: z.uuid().nullable(),
  proofId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  history: z.array(
    z.object({
      state: withdrawalStateSchema,
      at: z.iso.datetime(),
      note: z.string(),
    }),
  ),
  processingMode: z.enum(["Manual", "Simulator"]),
  demoOnly: z.literal(true),
});
export const withdrawalPageSchema = z.object({
  items: z.array(withdrawalSchema),
  nextCursor: z.uuid().nullable(),
});
export const withdrawalReceiptSchema: z.ZodType<
  components["schemas"]["WithdrawalReceipt"]
> = z.object({
  id: z.uuid(),
  entityType: z.literal("Withdrawal"),
  entityId: z.uuid(),
  version: z.number().int().positive(),
  state: withdrawalStateSchema,
  serverTime: z.iso.datetime(),
  demoOnly: z.literal(true),
});
export const withdrawalProofReceiptSchema = z.object({
  id: z.uuid(),
  entityType: z.literal("WithdrawalProof"),
  entityId: z.uuid(),
  version: z.number().int().positive(),
  state: z.enum(["Pending", "Ready"]),
  serverTime: z.iso.datetime(),
  demoOnly: z.literal(true),
});
export const withdrawalProofReadSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Withdrawal = z.infer<typeof withdrawalSchema>;
export type CreateWithdrawal = components["schemas"]["CreateWithdrawal"];
