import type { Exchange } from "./contracts";
import { ReviewEntry } from "../reviews/review-entry";
export function ExchangeReviewsCard({exchange}:{exchange:Exchange}) {
  return ['InTransit','Delivered','Completed'].includes(exchange.status) ? <ReviewEntry type="Exchange" id={exchange.id} version={exchange.revision} /> : null;
}
