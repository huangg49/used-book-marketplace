import { describe, expect, it } from 'vitest';
import type { AuctionDoc } from '../../database/mongo/documents.js';
import { DomainError } from '../commands/domain-error.js';
import {
  buyNowOffered,
  phaseOf,
  publishSchedule,
  reschedule,
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
    expect(publishSchedule({ startAt: null, durationHours: 24 }, now)).toEqual({
      startAt: now,
      plannedEndAt: at(24 * HOUR),
    });
    const later = at(2 * HOUR).toISOString();
    expect(publishSchedule({ startAt: later, durationHours: 1 }, now)).toEqual({
      startAt: at(2 * HOUR),
      plannedEndAt: at(3 * HOUR),
    });
  });
  it('refuses lengths and starts outside the limits', () => {
    for (const durationHours of [0, 169, 1.5])
      expect(code(() => publishSchedule({ durationHours }, now))).toBe(
        'VALIDATION_ERROR',
      );
    for (const ms of [-1, 5 * 60_000 - 1, 7 * 24 * HOUR + 1])
      expect(
        code(() =>
          publishSchedule(
            { startAt: at(ms).toISOString(), durationHours: 24 },
            now,
          ),
        ),
      ).toBe('VALIDATION_ERROR');
    expect(
      publishSchedule(
        { startAt: at(7 * 24 * HOUR).toISOString(), durationHours: 168 },
        now,
      ).plannedEndAt,
    ).toEqual(at(14 * 24 * HOUR));
  });
});

describe('reschedule', () => {
  it('moves start and length before the start', () => {
    const a = auction({ startAt: at(HOUR), endAt: at(25 * HOUR) });
    expect(reschedule(a, { startAt: null, durationHours: 6 }, now)).toEqual({
      startAt: now,
      plannedEndAt: at(6 * HOUR),
    });
  });
  it('moves only the end once live and keeps an hour left', () => {
    const a = auction({ startAt: at(-3 * HOUR) });
    expect(reschedule(a, { startAt: null, durationHours: 48 }, now)).toEqual({
      startAt: a.startAt,
      plannedEndAt: at(45 * HOUR),
    });
    expect(
      code(() => reschedule(a, { startAt: null, durationHours: 3 }, now)),
    ).toBe('VALIDATION_ERROR');
    expect(
      code(() =>
        reschedule(
          a,
          { startAt: at(HOUR).toISOString(), durationHours: 24 },
          now,
        ),
      ),
    ).toBe('VALIDATION_ERROR');
  });
  it('is locked after a bid, a Buy Now, the end or five edits', () => {
    const input = { startAt: null, durationHours: 24 };
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
