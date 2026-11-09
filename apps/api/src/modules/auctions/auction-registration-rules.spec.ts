import { describe, expect, it } from 'vitest';
import type { AuctionDoc } from '../../database/mongo/documents.js';
import { AUCTION_NIGHT_ALLOWANCE_MS } from '../../database/mongo/migrations/auction-constants.js';
import { DomainError } from '../commands/domain-error.js';
import {
  fullWithdrawUntil,
  lateOpening,
  lifecycleReschedule,
  outsideNight,
  reachedFields,
  unreachedFields,
} from './auction-schedule.js';

// ADR 0085: registration and deposits (H4, N1, M3).
const H = 3_600_000;
const MIN = 60_000;
// Vietnam time is UTC+7: 10:00 local is 03:00Z.
const local = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 7, minute));

describe('outsideNight (M3)', () => {
  it('keeps a daytime moment and moves 23:00-07:00 to 07:00', () => {
    expect(outsideNight(local(10, 7))).toEqual(local(10, 7));
    expect(outsideNight(local(10, 22, 59))).toEqual(local(10, 22, 59));
    expect(outsideNight(local(10, 23))).toEqual(local(11, 7));
    expect(outsideNight(local(11, 3))).toEqual(local(11, 7));
    expect(outsideNight(local(11, 6, 59))).toEqual(local(11, 7));
  });

  it('opens a late-reached auction 10 minutes later, at most the validator allowance', () => {
    expect(lateOpening(local(10, 14))).toEqual(local(10, 14, 10));
    expect(lateOpening(local(10, 22, 49))).toEqual(local(10, 22, 59));
    const worst = local(10, 22, 50);
    expect(lateOpening(worst)).toEqual(local(11, 7));
    expect(lateOpening(worst).getTime() - worst.getTime()).toBe(AUCTION_NIGHT_ALLOWANCE_MS);
  });
});

const waiting = (over: Partial<AuctionDoc> = {}) => {
  const opensAt = local(12, 9);
  const startAt = new Date(opensAt.getTime() + 24 * H);
  return {
    state: 'Active',
    openMode: 'ScheduledGrace',
    publishedAt: local(10, 9),
    pausedMs: 0,
    opensAt,
    startAt,
    plannedEndAt: new Date(startAt.getTime() + 2 * H),
    endAt: new Date(startAt.getTime() + 2 * H),
    minBidders: 4,
    registeredCount: 3,
    scheduleRevision: 0,
    biddingOpenedAt: null,
    ...over,
  } as AuctionDoc;
};

describe('reachedFields (M3)', () => {
  it('opens at the open time when reached before it', () => {
    const a = waiting();
    const r = reachedFields(a, local(11, 9));
    expect(r).toMatchObject({ startAt: a.opensAt, biddingOpenedAt: a.opensAt });
    expect(r.endAt.getTime() - r.startAt.getTime()).toBe(2 * H);
  });

  it('opens 10 minutes after a late reach, or at 07:00 at night, with the same length', () => {
    const a = waiting();
    const day = reachedFields(a, local(12, 15));
    expect(day.startAt).toEqual(local(12, 15, 10));
    expect(day.endAt.getTime() - day.startAt.getTime()).toBe(2 * H);
    const night = reachedFields(a, local(13, 1));
    expect(night).toMatchObject({ startAt: local(13, 7), biddingOpenedAt: local(13, 7) });
  });

  it('keeps older WhenReady rows opening at once', () => {
    const a = waiting({ openMode: 'WhenReady', opensAt: null });
    expect(reachedFields(a, local(12, 1)).startAt).toEqual(local(12, 1));
  });
});

describe('withdrawing from a full auction (N1)', () => {
  it('is open until 72 h before the open time, only for a full ScheduledGrace auction', () => {
    const full = waiting({ registeredCount: 4 });
    expect(fullWithdrawUntil(full)).toEqual(new Date(full.opensAt!.getTime() - 72 * H));
    expect(fullWithdrawUntil(waiting())).toBeNull();
    expect(fullWithdrawUntil({ ...full, openMode: 'Scheduled' })).toBeNull();
    expect(fullWithdrawUntil({ ...full, state: 'OnHold' })).toBeNull();
  });

  it('a drop below the minimum waits for registrants again until opensAt + 24 h', () => {
    const opensAt = local(20, 9);
    const reached = waiting({
      opensAt,
      startAt: opensAt,
      plannedEndAt: new Date(opensAt.getTime() + 2 * H),
      endAt: new Date(opensAt.getTime() + 2 * H),
      registeredCount: 4,
      biddingOpenedAt: opensAt,
    });
    expect(unreachedFields(reached)).toEqual({
      startAt: new Date(opensAt.getTime() + 24 * H),
      plannedEndAt: new Date(opensAt.getTime() + 26 * H),
      endAt: new Date(opensAt.getTime() + 26 * H),
      biddingOpenedAt: null,
    });
  });
});

describe('rescheduling a full auction (H4)', () => {
  const now = local(10, 10);
  const full = waiting({
    opensAt: local(15, 9),
    startAt: local(15, 9),
    registeredCount: 4,
    biddingOpenedAt: local(15, 9),
  });
  const move = (a: AuctionDoc, at: Date) =>
    lifecycleReschedule(a, { startAt: at.toISOString(), durationSeconds: 7200 }, now);

  it('only moves the open time earlier', () => {
    expect(move(full, local(14, 9)).opensAt).toEqual(local(14, 9));
    for (const later of [local(15, 9), local(16, 9)]) {
      const e = (() => {
        try {
          move(full, later);
        } catch (err) {
          return err;
        }
      })() as DomainError;
      expect(e).toBeInstanceOf(DomainError);
      expect(JSON.stringify(e.fieldErrors)).toMatch(/sớm hơn/);
    }
  });

  it('still moves a waiting auction either way', () => {
    const open = waiting({ opensAt: local(15, 9), startAt: local(16, 9) });
    expect(move(open, local(16, 9)).opensAt).toEqual(local(16, 9));
    expect(move(open, local(14, 9)).opensAt).toEqual(local(14, 9));
  });

  it('the earliest move is still at least 5 minutes ahead', () => {
    expect(() => move(full, new Date(now.getTime() + MIN))).toThrow(DomainError);
  });
});
