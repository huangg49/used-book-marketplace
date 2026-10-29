import type { TransactionReviewDoc } from '../../database/mongo/documents.js';
export const REVIEW_SUBMISSION_MS = 168 * 3_600_000;
export const REVIEW_EDIT_MS = 48 * 3_600_000;
export type ReviewType = TransactionReviewDoc['transactionType'];
export const REVIEW_TYPES: ReviewType[] = [
  'Exchange',
  'DirectOrder',
  'PointOrder',
];
export function publicationTime(
  completedAt: Date | null,
  reviews: TransactionReviewDoc[],
): Date | null {
  if (!completedAt || !reviews.length) return null;
  const times = reviews.map((r) => r.editDeadline.getTime());
  if (reviews.length < 2)
    times.push(completedAt.getTime() + REVIEW_SUBMISSION_MS);
  return new Date(Math.max(...times));
}
export function reviewIsPublic(
  review: TransactionReviewDoc,
  publication: Date | null,
  now: Date,
) {
  return Boolean(
    publication && now >= publication && !review.deletedAt && !review.hiddenAt,
  );
}
export function reviewIsEditable(review: TransactionReviewDoc, now: Date) {
  return (
    now < review.editDeadline &&
    !review.deletedAt &&
    !review.evidenceHeld &&
    !review.legacyDisclosed
  );
}
