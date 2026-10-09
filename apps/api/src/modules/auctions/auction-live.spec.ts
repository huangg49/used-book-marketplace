import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuctionLiveService, LIST_ROOM } from './auction-live.service.js';

type Row = { _id: string; version: number; state: string };

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
    find: vi.fn((q: Record<string, unknown>) => ({
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
});
