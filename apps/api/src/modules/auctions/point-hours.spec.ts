import { isPointOpen, pointDeadline } from './point-hours.js';

// Local Asia/Ho_Chi_Minh time written as UTC+07:00 offsets.
const at = (local: string) => new Date(`${local}+07:00`);
const H72 = 72 * 3_600_000;

describe('point hours (POL-29)', () => {
  it('is open from 09:00 up to, not including, 18:00 local time', () => {
    expect(isPointOpen(at('2026-10-08T08:59:59'))).toBe(false);
    expect(isPointOpen(at('2026-10-08T09:00:00'))).toBe(true);
    expect(isPointOpen(at('2026-10-08T17:59:59'))).toBe(true);
    expect(isPointOpen(at('2026-10-08T18:00:00'))).toBe(false);
    expect(isPointOpen(at('2026-10-08T23:30:00'))).toBe(false);
  });

  it('keeps a deadline that falls within opening hours', () => {
    expect(pointDeadline(at('2026-10-08T10:15:00'), H72)).toEqual(
      at('2026-10-11T10:15:00'),
    );
  });

  it('moves a deadline before opening to that day closing time', () => {
    expect(pointDeadline(at('2026-10-08T03:00:00'), H72)).toEqual(
      at('2026-10-11T18:00:00'),
    );
  });

  it('moves a deadline at or after closing to the next day closing time', () => {
    expect(pointDeadline(at('2026-10-08T18:00:00'), H72)).toEqual(
      at('2026-10-12T18:00:00'),
    );
    expect(pointDeadline(at('2026-10-08T22:40:00'), H72)).toEqual(
      at('2026-10-12T18:00:00'),
    );
  });

  it('handles local midnight and month ends in UTC+7', () => {
    // 2026-10-31 23:30 local is 16:30Z; +72h is 2026-11-03 23:30 local.
    expect(pointDeadline(at('2026-10-31T23:30:00'), H72)).toEqual(
      at('2026-11-04T18:00:00'),
    );
  });
});
