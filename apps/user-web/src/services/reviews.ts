import {
  transactionReviewSchema,
  transactionReviewsSchema,
  sendReviewIntent,
} from "@used-books/session-client";
import { session } from "./api";
export const exchangeReviewItemSchema = transactionReviewSchema;
export const exchangeReviewsResponseSchema = transactionReviewsSchema;
export type { TransactionReview as ExchangeReviewItem } from "@used-books/session-client";
export interface CreateExchangeReviewInput {
  bookRating: number;
  partnerRating: number;
  tags?: string[];
  comment?: string;
}
export function getExchangeReviews(id: string) {
  return session.request(
    `/exchanges/${encodeURIComponent(id)}/reviews`,
    transactionReviewsSchema,
  );
}
export function createExchangeReview(
  id: string,
  body: CreateExchangeReviewInput,
) {
  return sendReviewIntent(
    session,
    `reviews:${id}`,
    `/exchanges/${encodeURIComponent(id)}/reviews`,
    body,
    () => crypto.randomUUID(),
  );
}
