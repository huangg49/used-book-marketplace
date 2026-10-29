import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";
export const reviewTypeSchema = z.enum([
  "Exchange",
  "DirectOrder",
  "PointOrder",
]);
export type ReviewType = z.infer<typeof reviewTypeSchema>;
export const reviewTypes = [
  ["Exchange", "Đổi sách"],
  ["DirectOrder", "Đơn mua trực tiếp"],
  ["PointOrder", "Đơn đấu giá"],
] as const;
export const reviewStatusLabels = {
  Pending: "Chờ công bố",
  Published: "Đã công bố",
  Hidden: "Đã ẩn",
  Deleted: "Đã xóa công khai",
};
export const transactionReviewSchema = z.object({
  id: z.uuid(),
  transactionType: reviewTypeSchema,
  transactionId: z.uuid(),
  exchangeId: z.uuid().optional(),
  authorId: z.uuid(),
  authorName: z.string(),
  targetUserId: z.uuid(),
  bookRating: z.number().int().min(1).max(5).nullable(),
  partnerRating: z.number().int().min(1).max(5),
  tags: z.array(z.string()),
  comment: z.string(),
  version: z.number().int().positive(),
  status: z.enum(["Pending", "Published", "Hidden", "Deleted"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  editDeadline: z.string(),
  publishedAt: z.string().nullable(),
  evidenceHeld: z.boolean(),
  legacyDisclosed: z.boolean(),
  reply: z
    .object({
      text: z.string(),
      status: z.enum(["Pending", "Approved", "Hidden"]),
      createdAt: z.string(),
    })
    .nullable(),
});
export type TransactionReview = z.infer<typeof transactionReviewSchema>;
export const transactionReviewsSchema = z.object({
  partnerId: z.uuid(),
  canReview: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  canReply: z.boolean(),
  bookRatingRequired: z.boolean(),
  deadline: z.string().nullable(),
  serverTime: z.string(),
  myReview: transactionReviewSchema.nullable(),
  partnerReview: transactionReviewSchema.nullable(),
});
export const reviewTransactionsSchema = z.object({
  items: z.array(
    z.object({
      transactionType: reviewTypeSchema,
      transactionId: z.uuid(),
      partnerId: z.uuid(),
      partnerName: z.string(),
      completedAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
  serverTime: z.string(),
});
export const memberReputationSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  completedTransactions: z.number().int(),
  verifiedViolations: z.number().int(),
  reviewCount: z.number().int(),
  partnerRatingCount: z.number().int().nonnegative(),
  bookRatingCount: z.number().int().nonnegative(),
  partnerRating: z.number().nullable(),
  bookRating: z.number().nullable(),
  items: z.array(transactionReviewSchema),
  nextCursor: z.string().nullable(),
  serverTime: z.string(),
});
export const reviewRevisionSchema = z.object({
  version: z.number().int(),
  action: z.string(),
  actorId: z.string().nullable(),
  at: z.string(),
  snapshot: z.record(z.string(), z.unknown()),
  reason: z.string().nullable(),
});
export const reviewRevisionPageSchema = z.object({
  items: z.array(reviewRevisionSchema),
  nextCursor: z.string().nullable(),
  serverTime: z.string(),
});
export type ReviewRevisionPage = z.infer<typeof reviewRevisionPageSchema>;
export const operationsReviewsSchema = z.object({
  items: z.array(
    z.object({
      review: transactionReviewSchema,
      revisions: z.array(reviewRevisionSchema),
      nextRevisionCursor: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
  serverTime: z.string(),
});
export type ReviewTransactionsPage = z.infer<typeof reviewTransactionsSchema>;
export type MemberReputation = z.infer<typeof memberReputationSchema>;
export type OperationsReviewsPage = z.infer<typeof operationsReviewsSchema>;

type Intent = { path: string; body: string; key: string };
type Store = { owner: string | null; intents: Map<string, Intent> };
const stores = new WeakMap<SessionClient, Store>();
function store(client: SessionClient) {
  let s = stores.get(client);
  if (!s) {
    const identity = () => {
      const state = client.getSnapshot();
      return state.status === "authenticated" ? state.user.id : null;
    };
    s = { owner: identity(), intents: new Map() };
    stores.set(client, s);
    const active = s;
    client.subscribe(() => {
      const next = identity();
      if (next !== active.owner) {
        active.intents.clear();
        active.owner = next;
      }
    });
  }
  return s;
}
export function pendingReviewIntent(client: SessionClient, scope: string) {
  return store(client).intents.has(scope);
}
// Memory only, scoped to the existing session and resource. Navigating away and
// back cannot silently replace an uncertain intent with a new key or version.
export async function sendReviewIntent(
  client: SessionClient,
  scope: string,
  path: string,
  body: unknown,
  keyFactory: () => string,
) {
  const s = store(client),
    owner = s.owner;
  if (!owner)
    throw new ApiError(401, "SESSION_EXPIRED", "Đăng nhập để gửi đánh giá.");
  let intent = s.intents.get(scope);
  if (!intent) {
    intent = { path, body: JSON.stringify(body), key: keyFactory() };
    s.intents.set(scope, intent);
  }
  try {
    const result = await client.request(intent.path, transactionReviewSchema, {
      method: "POST",
      headers: { "Idempotency-Key": intent.key },
      body: intent.body,
    });
    if (s.owner !== owner)
      throw new ApiError(
        401,
        "SESSION_EXPIRED",
        "Phiên tài khoản đã thay đổi.",
      );
    s.intents.delete(scope);
    return result;
  } catch (error) {
    // Schema/network/5xx errors may follow a committed command. Retain exactly
    // the original intent; only a definite 4xx response releases it.
    if (error instanceof ApiError && error.status >= 400 && error.status < 500)
      s.intents.delete(scope);
    throw error;
  }
}
