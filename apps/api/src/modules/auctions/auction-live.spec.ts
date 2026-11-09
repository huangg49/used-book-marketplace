import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuctionLiveService, LIST_ROOM } from './auction-live.service.js';

type Row = { _id: string; version: number; state: string; buyNowAt?: Date | null; endAt?: Date };

function setup(initial: Row[]) {
  const rows = new Map(initial.map((r) => [r._id, { ...r }]));
  const matches = (r: Row, q: Record<string, unknown>) => {
    if ('state' in q) return r.state === q.state;
    const ids = (q._id as { $in?: string[] } | string) ?? '';
    return typeof ids === 'string' ? r._id === ids : !!ids.$in?.includes(r._id);
  };
  const auctions = {
    findOne: vi.fn(
      async (q: Record<string, unknown>) =>
        [...rows.values()].find((r) => matches(r, q)) ?? null,
    ),
    find: vi.fn((q: Record<string, unknown>, _options?: unknown) => ({
      toArray: async () => [...rows.values()].filter((r) => matches(r, q)),
    })),
  };
  const readPublic = vi.fn(async (id: string) => {
    const r = rows.get(id)!;
    return {
      auction: { id, state: r.state, currentPrice: r.version * 10_000 },
      leaderAlias: 1,
      history: [],
      serverTime: new Date().toISOString(),
    };
  });
  const live = new AuctionLiveService(
    { c: { auctions } } as never,
    { readPublic } as never,
  );
  const emitted: [string, string, unknown][] = [];
  live.attach((room, event, payload) => emitted.push([room, event, payload]));
  const bump = (id: string, patch: Partial<Row> = {}) => {
    const r = rows.get(id)!;
    Object.assign(r, { version: r.version + 1 }, patch);
  };
  const add = (r: Row) => rows.set(r._id, r);
  return {
    live,
    emitted,
    bump,
    add,
    readPublic,
    find: auctions.find,
    stop: () => live.onModuleDestroy(),
  };
}

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

describe('AuctionLiveService', () => {
  it('emits a watched auction once per committed version change', async () => {
    const t = setup([{ _id: A, version: 1, state: 'Active' }]);
    cleanup = t.stop;
    await t.live.watch(A);
    await t.live.tick();
    expect(t.emitted).toEqual([]); // the watcher read the snapshot on join

    t.bump(A);
    await t.live.tick();
    await t.live.tick();
    expect(t.emitted).toHaveLength(1);
    expect(t.emitted[0]![0]).toBe(`auction:${A}`);
    expect(t.emitted[0]![1]).toBe('auction:update');
  });

  it('coalesces overlapping checks into one follow-up pass', async () => {
    const t = setup([{ _id: A, version: 1, state: 'Active' }]);
    cleanup = t.stop;
    await t.live.watch(A);
    t.bump(A);
    await Promise.all([t.live.tick(), t.live.tick(), t.live.tick()]);
    await t.live.tick();
    expect(t.readPublic).toHaveBeenCalledTimes(1);
    expect(t.emitted).toHaveLength(1);
  });

  it('tells list watchers about new, changed and closed auctions', async () => {
    const t = setup([{ _id: A, version: 1, state: 'Active' }]);
    cleanup = t.stop;
    await t.live.watchList();
    await t.live.tick();
    expect(t.emitted).toEqual([]); // seeded silently

    t.add({ _id: B, version: 1, state: 'Active' });
    t.bump(A, { state: 'AwaitingWinnerPayment' });
    await t.live.tick();
    const summaries = t.emitted.filter(([room]) => room === LIST_ROOM);
    expect(
      summaries
        .map(([, , p]) => (p as { id: string; state: string }).state)
        .sort(),
    ).toEqual(['Active', 'AwaitingWinnerPayment']);
    expect(t.emitted.every(([, event]) => event === 'auction:summary')).toBe(
      true,
    );

    t.emitted.length = 0;
    t.bump(A); // closed auction is no longer tracked by the list
    await t.live.tick();
    expect(t.emitted).toEqual([]);
  });

  it('stops checking once the last watcher leaves', async () => {
    const t = setup([{ _id: A, version: 1, state: 'Active' }]);
    cleanup = t.stop;
    await t.live.watch(A);
    await t.live.watch(A);
    t.live.unwatch(A);
    t.bump(A);
    await t.live.tick();
    expect(t.emitted).toHaveLength(1); // one socket still watches

    t.live.unwatch(A);
    t.bump(A);
    t.live.nudge();
    await t.live.tick();
    expect(t.emitted).toHaveLength(1);
  });

  // ADR 0088 (M6): 0.5 s pass for watched auctions in a Buy Now window.
  const inWindow = () => ({ buyNowAt: new Date(), endAt: new Date(Date.now() + 60_000) });

  it('re-reads only watched auctions inside a Buy Now window on the fast pass', async () => {
    const t = setup([
      { _id: A, version: 1, state: 'Active', ...inWindow() },
      { _id: B, version: 1, state: 'Active' },
    ]);
    cleanup = t.stop;
    await t.live.watch(A);
    await t.live.watch(B);
    expect(t.live.fastPolling).toBe(false);
    await t.live.tick();
    expect(t.live.fastPolling).toBe(true);

    t.find.mockClear();
    t.bump(A);
    t.bump(B);
    await t.live.fastTick();
    expect(t.find).toHaveBeenCalledTimes(1);
    expect(t.find.mock.calls[0]![0]).toEqual({ _id: { $in: [A] } });
    expect(t.emitted.map(([room]) => room)).toEqual([`auction:${A}`]);
    // B's change waits for the full 2 s pass.
    await t.live.tick();
    expect(t.emitted.map(([room]) => room)).toEqual([`auction:${A}`, `auction:${B}`]);
  });

  it('stops the fast pass when the window ends or nobody watches', async () => {
    const t = setup([{ _id: A, version: 1, state: 'Active', ...inWindow() }]);
    cleanup = t.stop;
    await t.live.watch(A);
    await t.live.tick();
    expect(t.live.fastPolling).toBe(true);
    t.bump(A, { state: 'AwaitingWinnerPayment' });
    await t.live.fastTick();
    expect(t.emitted).toHaveLength(1);
    expect(t.live.fastPolling).toBe(false);

    const u = setup([{ _id: B, version: 1, state: 'Active', ...inWindow() }]);
    await u.live.watch(B);
    await u.live.tick();
    expect(u.live.fastPolling).toBe(true);
    u.live.unwatch(B);
    expect(u.live.fastPolling).toBe(false);
    u.stop();
  });

  it('keeps 2 s for an Instant Buy Now, an expired window and list-only auctions', async () => {
    const now = new Date();
    const t = setup([
      { _id: A, version: 1, state: 'Active', buyNowAt: now, endAt: now },
      { _id: B, version: 1, state: 'Active', ...inWindow() },
    ]);
    cleanup = t.stop;
    await t.live.watch(A);
    await t.live.watchList();
    await t.live.tick();
    expect(t.live.fastPolling).toBe(false);
  });
});
