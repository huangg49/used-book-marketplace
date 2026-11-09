import { describe, expect, it } from 'vitest';
import type { AuctionDoc } from '../../database/mongo/documents.js';
import { DomainError } from '../commands/domain-error.js';
import {
  buyNowEndAt,
  buyNowOffered,
  commitmentCap,
  reachesBuyNow,
  lifecyclePublish,
  lifecycleReschedule,
  phaseOf,
  publishSchedule,
  lateOpening,
  reachedFields,
  registrationExpired,
  reschedule,
  staffLifecycleOpen,
} from './auction-schedule.js';

const HOUR = 3_600_000;
const now = new Date('2026-10-27T03:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);
const auction = (over: Partial<AuctionDoc> = {}) =>
  ({
    state: 'Active',
    startAt: at(-HOUR),
    endAt: at(23 * HOUR),
    plannedEndAt: at(23 * HOUR),
    buyNowPrice: 100_000,
    buyNowAt: null,
    currentPrice: null,
    bidderCount: 0,
    scheduleRevision: 0,
    ...over,
  }) as AuctionDoc;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof DomainError ? (e.getResponse() as { code: string }).code : 'other';
  }
  return null;
};

describe('phaseOf', () => {
  it('is Scheduled before startAt, Live from startAt and Ended at endAt', () => {
    const a = auction({ startAt: at(HOUR), endAt: at(2 * HOUR) });
    expect(phaseOf(a, at(HOUR - 1))).toBe('Scheduled');
    expect(phaseOf(a, at(HOUR))).toBe('Live');
    expect(phaseOf(a, at(2 * HOUR))).toBe('Ended');
    expect(phaseOf({ ...a, state: 'OnHold' }, at(HOUR))).toBe('Ended');
  });
});

describe('buyNowOffered', () => {
  it('stays offered after bids while the price is below Buy Now', () => {
    expect(buyNowOffered(auction(), now)).toBe(true);
    expect(
      buyNowOffered(auction({ bidderCount: 2, currentPrice: 90_000 }), now),
    ).toBe(true);
  });
  it('is withdrawn at the Buy Now price, after use, without a price or before start', () => {
    expect(buyNowOffered(auction({ currentPrice: 100_000 }), now)).toBe(false);
    expect(buyNowOffered(auction({ buyNowAt: now }), now)).toBe(false);
    expect(buyNowOffered(auction({ buyNowPrice: null }), now)).toBe(false);
    expect(buyNowOffered(auction({ startAt: at(1) }), now)).toBe(false);
  });
});

describe('publishSchedule', () => {
  it('starts now or at a future time with the chosen length', () => {
    expect(publishSchedule({ startAt: null, durationSeconds: 24 * 3600 }, now)).toEqual({
      startAt: now,
      plannedEndAt: at(24 * HOUR),
    });
    const later = at(2 * HOUR).toISOString();
    expect(publishSchedule({ startAt: later, durationSeconds: 1 * 3600 }, now)).toEqual({
      startAt: at(2 * HOUR),
      plannedEndAt: at(3 * HOUR),
    });
  });
  it('keeps second precision inside the bounds (ADR 0069)', () => {
    // 1 hour 30 minutes 15 seconds.
    expect(
      publishSchedule({ startAt: null, durationSeconds: 5415 }, now)
        .plannedEndAt,
    ).toEqual(at(5_415_000));
    expect(
      publishSchedule({ startAt: null, durationSeconds: 3600 }, now)
        .plannedEndAt,
    ).toEqual(at(HOUR));
    expect(
      publishSchedule({ startAt: null, durationSeconds: 604_800 }, now)
        .plannedEndAt,
    ).toEqual(at(168 * HOUR));
  });
  it('refuses lengths and starts outside the limits', () => {
    for (const durationSeconds of [0, 3599, 604_801, 3600.5])
      expect(code(() => publishSchedule({ durationSeconds }, now))).toBe(
        'VALIDATION_ERROR',
      );
    for (const ms of [-1, 5 * 60_000 - 1, 7 * 24 * HOUR + 1])
      expect(
        code(() =>
          publishSchedule(
            { startAt: at(ms).toISOString(), durationSeconds: 24 * 3600 },
            now,
          ),
        ),
      ).toBe('VALIDATION_ERROR');
    expect(
      publishSchedule(
        { startAt: at(7 * 24 * HOUR).toISOString(), durationSeconds: 168 * 3600 },
        now,
      ).plannedEndAt,
    ).toEqual(at(14 * 24 * HOUR));
  });
});

describe('reschedule', () => {
  it('moves start and length before the start', () => {
    const a = auction({ startAt: at(HOUR), endAt: at(25 * HOUR) });
    expect(reschedule(a, { startAt: null, durationSeconds: 6 * 3600 }, now)).toEqual({
      startAt: now,
      plannedEndAt: at(6 * HOUR),
    });
  });
  it('moves only the end once live and keeps an hour left', () => {
    const a = auction({ startAt: at(-3 * HOUR) });
    expect(reschedule(a, { startAt: null, durationSeconds: 48 * 3600 }, now)).toEqual({
      startAt: a.startAt,
      plannedEndAt: at(45 * HOUR),
    });
    expect(
      code(() => reschedule(a, { startAt: null, durationSeconds: 3 * 3600 }, now)),
    ).toBe('VALIDATION_ERROR');
    expect(
      code(() =>
        reschedule(
          a,
          { startAt: at(HOUR).toISOString(), durationSeconds: 24 * 3600 },
          now,
        ),
      ),
    ).toBe('VALIDATION_ERROR');
  });
  it('is locked after a bid, a Buy Now, the end or five edits', () => {
    const input = { startAt: null, durationSeconds: 24 * 3600 };
    for (const over of [
      { bidderCount: 1, currentPrice: 50_000 },
      { buyNowAt: now, bidderCount: 1 },
      { endAt: now },
      { scheduleRevision: 5 },
    ])
      expect(code(() => reschedule(auction(over), input, now))).toBe(
        'InvalidState',
      );
  });
});

describe('ADR 0074 Buy Now mode', () => {
  const MIN = 60_000;
  it('ends at the Buy Now moment for Instant', () => {
    const a = auction({ buyNowMode: 'Instant' });
    expect(buyNowEndAt(a, false, now)).toEqual(now);
    expect(buyNowEndAt(a, true, now)).toEqual(now);
  });
  it('keeps the 60 s / 5 min window for Challenge', () => {
    const a = auction({ buyNowMode: 'Challenge' });
    expect(buyNowEndAt(a, true, now)).toEqual(at(MIN));
    expect(buyNowEndAt(a, false, now)).toEqual(at(5 * MIN));
  });
  it('never extends past endAt', () => {
    const a = auction({ buyNowMode: 'Challenge', endAt: at(30_000) });
    expect(buyNowEndAt(a, false, now)).toEqual(at(30_000));
  });
  it('treats a decided price at or above Buy Now as reaching it', () => {
    const a = auction();
    expect(reachesBuyNow(a, 90_000)).toBe(false);
    expect(reachesBuyNow(a, 100_000)).toBe(true);
    expect(reachesBuyNow(a, 120_000)).toBe(true);
    expect(reachesBuyNow(a, null)).toBe(false);
  });
  it('does not re-trigger once Buy Now was used or without a Buy Now price', () => {
    expect(reachesBuyNow(auction({ buyNowAt: at(-MIN) }), 120_000)).toBe(false);
    expect(reachesBuyNow(auction({ buyNowPrice: null }), 120_000)).toBe(false);
  });
  it('caps commitments at the Buy Now price only for Instant', () => {
    expect(commitmentCap(auction({ buyNowMode: 'Instant' }))).toBe(100_000);
    expect(commitmentCap(auction({ buyNowMode: 'Challenge' }))).toBeNull();
    expect(
      commitmentCap(auction({ buyNowMode: 'Instant', buyNowPrice: null })),
    ).toBeNull();
  });
});

// ADR 0081: the seller always picks the open time; the auction opens there
// only with enough registrants, waits 24 h more otherwise, then is cancelled.
describe('scheduled open with a 24 h grace', () => {
  const opensAt = at(2 * HOUR);
  const published = (over: Partial<AuctionDoc> = {}) =>
    ({
      ...lifecyclePublish({ startAt: opensAt.toISOString(), durationSeconds: 3 * 3600 }, now),
      endAt: at(2 * HOUR + 27 * HOUR),
      state: 'Active',
      publishedAt: now,
      minBidders: 4,
      registeredCount: 0,
      biddingOpenedAt: null,
      scheduleRevision: 0,
      ...over,
    }) as AuctionDoc;

  it('publishing needs a time; the deadline is the open time + 24 h; the length is kept', () => {
    expect(code(() => lifecyclePublish({ startAt: null, durationSeconds: 3600 }, now))).toBe('VALIDATION_ERROR');
    expect(code(() => lifecyclePublish({ startAt: at(30 * 24 * HOUR + 1).toISOString(), durationSeconds: 3600 }, now))).toBe('VALIDATION_ERROR');
    expect(lifecyclePublish({ startAt: at(30 * 24 * HOUR).toISOString(), durationSeconds: 3600 }, now).opensAt).toEqual(at(30 * 24 * HOUR));
    const a = published();
    expect(a).toMatchObject({ openMode: 'ScheduledGrace', opensAt, startAt: at(26 * HOUR), plannedEndAt: at(29 * HOUR) });
  });

  it('reached before the open time opens there; reached in the grace opens after the ADR 0085 notice; never reached expires at the deadline', () => {
    const a = published();
    expect(reachedFields(a, at(HOUR))).toEqual({ startAt: opensAt, endAt: at(5 * HOUR), plannedEndAt: at(5 * HOUR), biddingOpenedAt: opensAt });
    // ADR 0085: 10 minutes after the reach, moved out of 23:00-07:00 Vietnam time.
    const late = lateOpening(at(10 * HOUR));
    expect(late.getTime()).toBeGreaterThanOrEqual(at(10 * HOUR + 10 * 60_000).getTime());
    expect(reachedFields(a, at(10 * HOUR))).toEqual({ startAt: late, endAt: new Date(late.getTime() + 3 * HOUR), plannedEndAt: new Date(late.getTime() + 3 * HOUR), biddingOpenedAt: late });
    expect(phaseOf(a, at(10 * HOUR))).toBe('Scheduled');
    expect(registrationExpired(a, at(26 * HOUR - 1))).toBe(false);
    expect(registrationExpired(a, at(26 * HOUR))).toBe(true);
    expect(phaseOf(a, at(26 * HOUR))).toBe('Ended');
  });

  it('a reschedule moves the open time before it passes, never in the last 30 minutes or the grace', () => {
    const a = published();
    expect(lifecycleReschedule(a, { startAt: at(5 * HOUR).toISOString(), durationSeconds: 3600 }, now)).toMatchObject({
      opensAt: at(5 * HOUR),
      startAt: at(29 * HOUR),
      plannedEndAt: at(30 * HOUR),
    });
    expect(code(() => lifecycleReschedule(a, { startAt: null, durationSeconds: 3600 }, now))).toBe('VALIDATION_ERROR');
    expect(code(() => lifecycleReschedule(a, { startAt: at(5 * HOUR).toISOString(), durationSeconds: 3600 }, at(2 * HOUR - 60_000)))).toBe('InvalidState');
    expect(code(() => lifecycleReschedule(a, { startAt: at(5 * HOUR).toISOString(), durationSeconds: 3600 }, at(3 * HOUR)))).toBe('InvalidState');
    // ADR 0082: at most two changes, up to 30 days after publishing.
    const move = { startAt: at(5 * HOUR).toISOString(), durationSeconds: 3600 };
    expect(lifecycleReschedule({ ...a, scheduleRevision: 1 }, move, now).opensAt).toEqual(at(5 * HOUR));
    expect(code(() => lifecycleReschedule({ ...a, scheduleRevision: 2 }, move, now))).toBe('InvalidState');
    expect(code(() => lifecycleReschedule(a, { startAt: at(30 * 24 * HOUR + 1).toISOString(), durationSeconds: 3600 }, now))).toBe('VALIDATION_ERROR');
  });

  it('a Staff open waits for registrants from now', () => {
    expect(staffLifecycleOpen(now, 24 * HOUR)).toEqual({ openMode: 'ScheduledGrace', opensAt: now, startAt: at(24 * HOUR), plannedEndAt: at(48 * HOUR) });
  });
});
