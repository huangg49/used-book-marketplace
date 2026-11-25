import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerClock } from '@used-books/session-client';
import { startServerCountdown } from './server-countdown';

const server = Date.parse('2026-11-04T03:00:00.000Z');
const iso = (offset: number) => new Date(server + offset).toISOString();
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(server + 10 * 86400000); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('server countdown lifecycle', () => {
  it('keeps server offset and one-second ticks, then stops at zero', () => {
    const ticks: number[] = [];
    startServerCountdown(iso(3000), iso(0), value => ticks.push(value));
    expect(ticks).toEqual([3000]);
    vi.advanceTimersByTime(3000);
    expect(ticks).toEqual([3000, 2000, 1000, 0]);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60000);
    expect(ticks).toHaveLength(4);
  });

  it.each([-1000, 0])('does not schedule an already expired deadline (%i)', offset => {
    const update = vi.fn();
    startServerCountdown(iso(offset), iso(0), update);
    expect(update).toHaveBeenCalledExactlyOnceWith(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up without a late tick after unmount/replacement', () => {
    const update = vi.fn();
    const stop = startServerCountdown(iso(60000), iso(0), update);
    stop(); stop();
    vi.advanceTimersByTime(60000);
    expect(update).toHaveBeenCalledExactlyOnceWith(60000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the device date when no server clock was supplied', () => {
    vi.setSystemTime(server);
    const update = vi.fn();
    const stop = startServerCountdown(iso(2000), undefined, update);
    vi.advanceTimersByTime(1000);
    expect(update).toHaveBeenLastCalledWith(1000);
    stop();
  });

  it('uses elapsed time rather than tick count after a delayed callback', () => {
    let mono = 0;
    const update = vi.fn();
    startServerCountdown(iso(5000), iso(0), update, new ServerClock(() => mono));
    mono += 30000;
    vi.advanceTimersByTime(1000);
    expect(update.mock.calls.map(call => call[0])).toEqual([5000, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts again from a new server deadline after the old one expired', () => {
    const update = vi.fn();
    const stop = startServerCountdown(iso(1000), iso(0), update);
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
    stop();
    const next = startServerCountdown(iso(13000), iso(1000), update);
    expect(update).toHaveBeenLastCalledWith(12000);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(update).toHaveBeenLastCalledWith(11000);
    next();
  });

  it('follows the synced server clock, not the age of cached data', () => {
    let mono = 0
    const clock = new ServerClock(() => mono, () => Date.now())
    clock.observe(iso(0), 0, 0) // synced: server is at iso(0) now
    const update = vi.fn()
    // Cached response stamped 20 s ago; the old offset would add 20 s.
    const stop = startServerCountdown(iso(30000), iso(-20000), update, clock)
    expect(update).toHaveBeenLastCalledWith(30000)
    mono += 1000; vi.advanceTimersByTime(1000)
    expect(update).toHaveBeenLastCalledWith(29000)
    stop()
  });

  it.each([-1, 1])('keeps counting when the device date moves in direction %s', (direction) => {
    let mono = 0
    const clock = new ServerClock(() => mono, () => Date.now())
    clock.observe(iso(0), 0, 0)
    const update = vi.fn()
    const stop = startServerCountdown(iso(10000), iso(0), update, clock)
    vi.setSystemTime(Date.now() + direction * 3600000)
    mono += 1000; vi.advanceTimersByTime(1000)
    expect(update).toHaveBeenLastCalledWith(9000)
    stop()
  });
});
