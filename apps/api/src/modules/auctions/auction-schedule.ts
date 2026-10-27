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
  AUCTION_SCHEDULE_HORIZON_MS,
} from '../../database/mongo/migrations/auction-constants.js';
import { DomainError, invalidField } from '../commands/domain-error.js';

const HOUR_MS = 3_600_000;
export type AuctionPhase = 'Scheduled' | 'Live' | 'Ended';

export const phaseOf = (
  a: Pick<AuctionDoc, 'state' | 'startAt' | 'endAt'>,
  now: Date,
): AuctionPhase =>
  a.state !== 'Active' || now >= a.endAt
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

export interface ScheduleInput {
  startAt?: string | null;
  durationHours: number;
}

function durationMs(hours: number) {
  if (
    !Number.isInteger(hours) ||
    hours * HOUR_MS < AUCTION_MIN_DURATION_MS ||
    hours * HOUR_MS > AUCTION_MAX_DURATION_MS
  )
    invalidField('durationHours', 'Thời lượng phiên từ 1 đến 168 giờ.');
  return hours * HOUR_MS;
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
  const length = durationMs(input.durationHours);
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
    a.startAt.getTime() + durationMs(input.durationHours),
  );
  if (plannedEndAt.getTime() < now.getTime() + AUCTION_MIN_REMAINING_MS)
    invalidField(
      'durationHours',
      'Phiên đang mở phải còn ít nhất 1 giờ sau khi đổi.',
    );
  return { startAt: a.startAt, plannedEndAt };
}
