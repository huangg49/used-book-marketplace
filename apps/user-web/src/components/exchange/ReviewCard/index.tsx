import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { TransactionReviewPanel } from "../../../features/reviews/TransactionReviewPanel";
export function ReviewCard({ detail }: { detail: ExchangeDetail }) {
  return detail.status === "COMPLETED" ? (
    <TransactionReviewPanel type="Exchange" id={detail.id} />
  ) : null;
}
