import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { ReviewEntry } from "../../../features/reviews/ReviewEntry";
export function ReviewCard({ detail }: { detail: ExchangeDetail }) {
  return (!!detail.viewerShipping.receivedAt || detail.status === "COMPLETED") ? <ReviewEntry type="Exchange" id={detail.id} version={detail.revision} /> : null;
}
