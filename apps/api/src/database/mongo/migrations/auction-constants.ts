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
export const BUY_NOW_CHALLENGE_MS = 60_000; // ADR 0043: Buy Now by the current leader
export const BUY_NOW_RIVAL_CHALLENGE_MS = 5 * 60_000; // ADR 0070: Buy Now by a non-leader
// ADR 0047: the seller publishes a Passed intake now or schedules it.
export const AUCTION_MIN_DURATION_MS = HOUR_MS;
export const AUCTION_MAX_DURATION_MS = 168 * HOUR_MS;
export const AUCTION_MIN_LEAD_MS = 5 * 60_000;
export const AUCTION_SCHEDULE_HORIZON_MS = 7 * 24 * HOUR_MS;
export const AUCTION_MIN_REMAINING_MS = HOUR_MS;
export const AUCTION_MAX_SCHEDULE_EDITS = 5;
export const AUCTION_MIN_PRICE = 10_000;
// ADR 0068: preset bid steps (frozen in migration 0056's checksum). Sellers may
// also enter any step on the AUCTION_STEP_UNIT grid within the bounds below.
export const AUCTION_STEPS = [10_000, 20_000, 50_000, 100_000] as const;
export const AUCTION_STEP_MIN = 1_000;
export const AUCTION_STEP_MAX = 10_000_000;
export const AUCTION_STEP_UNIT = 1_000;
export type AuctionStep = number;
// Frozen ceiling of migrations 0008/0009 (their checksums depend on it).
// Migration 0054 lifts it: application code checks MONEY_MAX instead.
export const AUCTION_MAX_PRICE = 1_000_000;
// ADR 0067: auction prices and declared values have no business ceiling; only
// the largest integer JavaScript and the validators represent exactly.
export const MONEY_MAX = Number.MAX_SAFE_INTEGER;
export const POINT_ORDER_COMMISSION_BPS = 500;
export const RECIPIENT_DECISION_MS = 72 * HOUR_MS;
export const COLLECTION_WINDOW_MS = 72 * HOUR_MS;
export const COLLECTION_CODE_TTL_MS = 10 * 60_000;
export const COLLECTION_ATTEMPT_WINDOW_MS = 15 * 60_000;
export const COLLECTION_MAX_WRONG_ATTEMPTS = 5;
export const INSPECTION_WINDOW_MS = 72 * HOUR_MS;
// Completion and returns (migration 0012).
export const RETURN_WINDOW_MS = 72 * HOUR_MS;
// ADR 0044: the carrier delivers within 240 hours of the point hand-off,
// the same bound as carrier pickups of ordinary deliveries.
export const POINT_DELIVERY_MS = 240 * HOUR_MS;
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
// ADR 0077: registration before bidding. The seller picks how many registered
// bidders the auction needs; the refundable deposit is 10% of the start price
// (the Dutch floor), rounded up to 1.000đ and at least 10.000đ.
// ADR 0079 raised the default and floor from 2 to 4 (0066 rows keep theirs).
export const AUCTION_DEFAULT_MIN_BIDDERS = 4;
export const AUCTION_MAX_MIN_BIDDERS = 10;
export const auctionDeposit = (startPrice: number) =>
  Math.max(AUCTION_MIN_PRICE, Math.ceil(startPrice / 10 / 1000) * 1000);
// ADR 0079: bounded registration lifecycle. Every waiting or held auction has a
// fixed ceiling measured from a stored timestamp that never moves.
export const AUCTION_MIN_BIDDERS_FLOOR = 4;
// Technical guard only (no business maximum); validators need a bound.
export const AUCTION_MIN_BIDDERS_CAP = 1000;
// "Mở khi đủ người": registration closes publish + 24 h.
export const AUCTION_READY_WINDOW_MS = 24 * HOUR_MS;
// "Hẹn giờ mở": the start is at most publish + 72 h, rescheduling included.
export const AUCTION_START_CEILING_MS = 72 * HOUR_MS;
// ADR 0082: a registration auction's open time is at most publish + 30 days
// and changes at most twice (the 72 h and 5 changes above stay for older rows).
export const AUCTION_OPEN_CEILING_MS = 30 * 24 * HOUR_MS;
export const AUCTION_MAX_OPEN_CHANGES = 2;
// ADR 0081: a scheduled open waits at most 24 h more for registrants.
export const AUCTION_OPEN_GRACE_MS = 24 * HOUR_MS;
// No reschedule in the last 30 minutes before the start.
export const AUCTION_RESCHEDULE_FREEZE_MS = 30 * 60_000;
// OnHold auto-cancels 48 h after it was held.
export const AUCTION_HOLD_MAX_MS = 48 * HOUR_MS;
// ADR 0084: one pause model. All pauses of an auction together are bounded by
// a budget; a resume gives the time back, at least 10 minutes of bidding.
export const AUCTION_PAUSE_BUDGET_MS = 72 * HOUR_MS;
export const AUCTION_RESUME_MIN_MS = 10 * 60_000;
// ADR 0085: registration and deposits.
// A full auction's registrants may still withdraw until 72 h before its open
// time (it then waits for registrants again when below the minimum).
export const AUCTION_FULL_WITHDRAW_MS = 72 * HOUR_MS;
// Reaching the minimum after the open time opens the auction 10 minutes later,
// moved to 07:00 when that falls between 23:00 and 07:00 (Vietnam time).
export const AUCTION_REACHED_NOTICE_MS = 10 * 60_000;
export const AUCTION_NIGHT_START_HOUR = 23;
export const AUCTION_NIGHT_END_HOUR = 7;
export const AUCTION_LOCAL_OFFSET_MS = 7 * HOUR_MS; // Asia/Ho_Chi_Minh, no DST
// The longest delay that rule adds past the 24 h deadline (validator bound).
export const AUCTION_NIGHT_ALLOWANCE_MS =
  AUCTION_REACHED_NOTICE_MS +
  (24 - AUCTION_NIGHT_START_HOUR + AUCTION_NIGHT_END_HOUR) * HOUR_MS;
