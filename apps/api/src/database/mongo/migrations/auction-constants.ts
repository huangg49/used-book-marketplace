// Auction policy constants shared by migrations 0008/0009 and the auction
// module. No imports: application code can read them without loading the
// migration chain (which would form an import cycle through index.ts).
const HOUR_MS = 3_600_000;
export const HANDOVER_POINT_A = '00000000-0000-4000-8000-0000000000a1';
export const HANDOVER_POINT_B = '00000000-0000-4000-8000-0000000000b2';
export const AUCTION_DURATION_MS = 24 * HOUR_MS;
export const AUCTION_DROPOFF_MS = 72 * HOUR_MS;
export const AUCTION_PAYMENT_MS = 24 * HOUR_MS;
export const BUY_NOW_PAYMENT_MS = 15 * 60_000;
export const AUCTION_MIN_PRICE = 10_000;
export const AUCTION_MAX_PRICE = 1_000_000;
export const POINT_ORDER_COMMISSION_BPS = 500;
export const RECIPIENT_DECISION_MS = 72 * HOUR_MS;
export const COLLECTION_WINDOW_MS = 72 * HOUR_MS;
export const COLLECTION_CODE_TTL_MS = 10 * 60_000;
export const COLLECTION_ATTEMPT_WINDOW_MS = 15 * 60_000;
export const COLLECTION_MAX_WRONG_ATTEMPTS = 5;
export const INSPECTION_WINDOW_MS = 72 * HOUR_MS;
// Completion and returns (migration 0012).
export const RETURN_WINDOW_MS = 72 * HOUR_MS;
export const CLAIM_MIN_LENGTH = 30;
export const PLATFORM_COMMISSION_ACCOUNT_ID =
  '00000000-0000-4000-8000-0000000000c1';
// POL-09: the seller answers a NeedsEvidence inspection within 48 hours.
export const EVIDENCE_WINDOW_MS = 48 * 3_600_000;
// POL-42: simulated incident fund opening balance (no automatic top-up).
export const INCIDENT_FUND_OPENING = 2_000_000;
export const INCIDENT_FUND_OPENING_ID = '00000000-0000-4000-8000-0000000000f1';
// N4-14 deadlines (LOCAL-AUCTION-01 §2). Overdue items are derived at read
// time from stored timestamps; nothing passes or confiscates automatically.
export const POINT_INSPECTION_MS = 24 * 3_600_000; // POL-31
export const EVIDENCE_DECISION_MS = 48 * 3_600_000; // POL-09, after the answer
export const OWNER_RECLAIM_MS = 72 * 3_600_000; // POL-34
export const RECLAIM_ESCALATION_MS = 14 * 24 * 3_600_000; // POL-34, after Overdue
