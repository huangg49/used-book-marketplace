// ADR 0047: seller-published and scheduled auctions. Pure rules, no I/O: the
// stored state stays Active and the phase is derived from the server clock,
// so no worker has to open a scheduled auction and no opening can race.
import type { AuctionDoc } from '../../database/mongo/documents.js';
import {
  AUCTION_MAX_DURATION_MS,
  AUCTION_MAX_SCHEDULE_EDITS,
  AUCTION_MIN_DURATION_MS,
  AUCTION_MIN_LEAD_MS,
  AUCTION_MIN_REMAINING_MS,
  AUCTION_READY_WINDOW_MS,
  AUCTION_RESCHEDULE_FREEZE_MS,
  AUCTION_SCHEDULE_HORIZON_MS,
  AUCTION_START_CEILING_MS,
  BUY_NOW_CHALLENGE_MS,
  BUY_NOW_RIVAL_CHALLENGE_MS,
} from '../../database/mongo/migrations/auction-constants.js';
import { DomainError, invalidField } from '../commands/domain-error.js';

export type AuctionPhase = 'Scheduled' | 'Live' | 'Ended';

type Lifecycle = Partial<
  Pick<AuctionDoc, 'openMode' | 'minBidders' | 'registeredCount'>
>;
// ADR 0079: a bounded-lifecycle auction that reached its start with too few
// registrants is over at once; the worker only records the cancellation.
export const registrationExpired = (
  a: Pick<AuctionDoc, 'state' | 'startAt'> & Lifecycle,
  now: Date,
) =>
  a.state === 'Active' &&
  !!a.openMode &&
  a.minBidders != null &&
  (a.registeredCount ?? 0) < a.minBidders &&
  now >= a.startAt;

export const phaseOf = (
  a: Pick<AuctionDoc, 'state' | 'startAt' | 'endAt'> & Lifecycle,
  now: Date,
): AuctionPhase =>
  a.state !== 'Active' || now >= a.endAt || registrationExpired(a, now)
    ? 'Ended'
    : now < a.startAt
      ? 'Scheduled'
      : 'Live';

export const notStarted = () =>
  new DomainError(
    409,
    'AuctionNotStarted',
    'Phiên đấu giá chưa bắt đầu. Hãy quay lại khi phiên mở.',
  );

// Buy Now stays available after bids while the price is still below it and
// nobody has used it (one ADR 0043 window per auction).
export const buyNowOffered = (
  a: Pick<
    AuctionDoc,
    'state' | 'startAt' | 'endAt' | 'buyNowPrice' | 'buyNowAt' | 'currentPrice'
  >,
  now: Date,
) =>
  phaseOf(a, now) === 'Live' &&
  a.buyNowPrice !== null &&
  a.buyNowAt === null &&
  (a.currentPrice === null || a.currentPrice < a.buyNowPrice);

// ADR 0074: a decided price at or above the Buy Now price ends the auction by
// the Buy Now rule even when it came from a bid or an Auto ceiling. Before,
// such a bid only withdrew Buy Now and the auction ran to plannedEndAt (the
// "waiting game"). Also catches auctions already left in that state.
export const reachesBuyNow = (
  a: Pick<AuctionDoc, 'buyNowPrice' | 'buyNowAt'>,
  priceAfter: number | null,
) =>
  a.buyNowPrice !== null &&
  a.buyNowAt === null &&
  priceAfter !== null &&
  priceAfter >= a.buyNowPrice;

// ADR 0074 Instant ends at the Buy Now moment; Challenge keeps ADR 0070:
// 60 s when the actor already led, 5 min for a rival. Never after endAt.
export const buyNowEndAt = (
  a: Pick<AuctionDoc, 'endAt' | 'buyNowMode'>,
  actorLed: boolean,
  now: Date,
) =>
  new Date(
    Math.min(
      a.endAt.getTime(),
      now.getTime() +
        (a.buyNowMode === 'Instant'
          ? 0
          : actorLed
            ? BUY_NOW_CHALLENGE_MS
            : BUY_NOW_RIVAL_CHALLENGE_MS),
    ),
  );

// ADR 0074: with Instant the Buy Now price is the highest commitment; a bid or
// Auto ceiling above it could never be reached because the auction ends there.
export const commitmentCap = (
  a: Pick<AuctionDoc, 'buyNowPrice' | 'buyNowMode'>,
) => (a.buyNowMode === 'Instant' ? a.buyNowPrice : null);

export interface ScheduleInput {
  startAt?: string | null;
  durationSeconds: number;
}

// ADR 0069: any whole number of seconds inside the ADR 0047 bounds, which the
// migration 0037 validator still enforces on plannedEndAt.
function durationMs(seconds: number) {
  if (
    !Number.isInteger(seconds) ||
    seconds * 1000 < AUCTION_MIN_DURATION_MS ||
    seconds * 1000 > AUCTION_MAX_DURATION_MS
  )
    invalidField(
      'durationSeconds',
      'Thời lượng phiên từ 1 giờ đến 7 ngày (tính bằng giây).',
    );
  return seconds * 1000;
}

function futureStart(raw: string, now: Date) {
  const startAt = new Date(raw);
  if (Number.isNaN(startAt.getTime()))
    invalidField('startAt', 'Thời điểm bắt đầu không hợp lệ.');
  if (startAt.getTime() < now.getTime() + AUCTION_MIN_LEAD_MS)
    invalidField(
      'startAt',
      'Hẹn giờ bắt đầu ít nhất 5 phút sau thời điểm hiện tại.',
    );
  if (startAt.getTime() > now.getTime() + AUCTION_SCHEDULE_HORIZON_MS)
    invalidField('startAt', 'Chỉ hẹn giờ bắt đầu trong vòng 7 ngày tới.');
  return startAt;
}

// Publishing: startAt null (or omitted) starts now.
export function publishSchedule(input: ScheduleInput, now: Date) {
  const length = durationMs(input.durationSeconds);
  const startAt = input.startAt ? futureStart(input.startAt, now) : now;
  return { startAt, plannedEndAt: new Date(startAt.getTime() + length) };
}

// Editing: before the first bid and before any Buy Now. Before the start the
// seller may move the start and the length; once live only the end moves
// (the length still counts from the original start).
export function reschedule(a: AuctionDoc, input: ScheduleInput, now: Date) {
  const phase = phaseOf(a, now);
  if (phase === 'Ended' || a.bidderCount > 0 || a.buyNowAt !== null)
    throw new DomainError(
      409,
      'InvalidState',
      'Chỉ đổi được thời gian khi phiên chưa kết thúc và chưa có lượt trả giá.',
    );
  if (a.scheduleRevision >= AUCTION_MAX_SCHEDULE_EDITS)
    throw new DomainError(
      409,
      'InvalidState',
      'Phiên này đã đổi thời gian tối đa 5 lần.',
    );
  if (phase === 'Scheduled') return publishSchedule(input, now);
  if (input.startAt)
    invalidField('startAt', 'Phiên đã bắt đầu; chỉ đổi được thời lượng.');
  const plannedEndAt = new Date(
    a.startAt.getTime() + durationMs(input.durationSeconds),
  );
  if (plannedEndAt.getTime() < now.getTime() + AUCTION_MIN_REMAINING_MS)
    invalidField(
      'durationSeconds',
      'Phiên đang mở phải còn ít nhất 1 giờ sau khi đổi.',
    );
  return { startAt: a.startAt, plannedEndAt };
}

// ---------------------------------------------------------------- ADR 0079
// Bounded registration lifecycle. Every ceiling is measured from the fixed
// publishedAt, so rescheduling can never move it.
const lifecycleError = (message: string) =>
  new DomainError(409, 'InvalidState', message);

/** Publishing a registration auction: null = WhenReady, a time = Scheduled. */
export function lifecyclePublish(input: ScheduleInput, now: Date) {
  const length = durationMs(input.durationSeconds);
  if (!input.startAt) {
    const startAt = new Date(now.getTime() + AUCTION_READY_WINDOW_MS);
    return {
      openMode: 'WhenReady' as const,
      startAt,
      plannedEndAt: new Date(startAt.getTime() + length),
    };
  }
  const startAt = ceilingStart(input.startAt, now, now);
  return {
    openMode: 'Scheduled' as const,
    startAt,
    plannedEndAt: new Date(startAt.getTime() + length),
  };
}

function ceilingStart(raw: string, now: Date, publishedAt: Date) {
  const startAt = new Date(raw);
  if (Number.isNaN(startAt.getTime()))
    invalidField('startAt', 'Thời điểm bắt đầu không hợp lệ.');
  if (startAt.getTime() < now.getTime() + AUCTION_MIN_LEAD_MS)
    invalidField(
      'startAt',
      'Hẹn giờ bắt đầu ít nhất 5 phút sau thời điểm hiện tại.',
    );
  if (startAt.getTime() > publishedAt.getTime() + AUCTION_START_CEILING_MS)
    invalidField(
      'startAt',
      'Giờ mở phải trong vòng 72 giờ kể từ lúc đăng phiên.',
    );
  return startAt;
}

/** The latest start a bounded-lifecycle auction can ever have. */
export const latestStartAt = (a: Pick<AuctionDoc, 'publishedAt'>) =>
  new Date(a.publishedAt.getTime() + AUCTION_START_CEILING_MS);

/** The seller acts on a waiting auction only before its fixed start. */
export function requireWaiting(a: AuctionDoc, now: Date) {
  if (a.state !== 'Active' || phaseOf(a, now) !== 'Scheduled')
    throw lifecycleError(
      'Phiên đã bắt đầu hoặc đã kết thúc; thao tác này chỉ dùng khi phiên đang chờ người đăng ký.',
    );
}

/** Rescheduling a waiting registration auction (WhenReady becomes Scheduled). */
export function lifecycleReschedule(
  a: AuctionDoc,
  input: ScheduleInput,
  now: Date,
) {
  requireWaiting(a, now);
  if (a.scheduleRevision >= AUCTION_MAX_SCHEDULE_EDITS)
    throw lifecycleError('Phiên này đã đổi thời gian tối đa 5 lần.');
  if (now.getTime() >= a.startAt.getTime() - AUCTION_RESCHEDULE_FREEZE_MS)
    throw lifecycleError(
      'Không đổi giờ trong 30 phút cuối trước giờ mở; người đăng ký đã chuẩn bị theo giờ này.',
    );
  if (!input.startAt)
    invalidField(
      'startAt',
      'Chọn giờ mở mới. Muốn mở ngay khi đủ người, dùng "Mở ngay".',
    );
  const length = durationMs(input.durationSeconds);
  const startAt = ceilingStart(input.startAt, now, a.publishedAt);
  return {
    openMode: 'Scheduled' as const,
    startAt,
    plannedEndAt: new Date(startAt.getTime() + length),
  };
}

/** Opening now keeps the length chosen at publish (or the last reschedule). */
export function openNowFields(a: AuctionDoc, now: Date) {
  const length = a.plannedEndAt.getTime() - a.startAt.getTime();
  const end = new Date(now.getTime() + length);
  return { startAt: now, endAt: end, plannedEndAt: end, biddingOpenedAt: now };
}
