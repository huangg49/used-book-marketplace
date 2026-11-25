import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Wire } from '../commands/domain-error.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AuctionBiddingService } from './auction-bidding.service.js';

export type LiveEmit = (room: string, event: string, payload: unknown) => void;
export const auctionRoom = (id: string) => `auction:${id}`;
export const LIST_ROOM = 'auctions';
export const POLL_MS = 2_000;
// Only IDs with open detail subscriptions are queried on the faster pass.
export const FAST_POLL_MS = 300;
/** Open auctions the list pass tracks; covers the 50 that GET /auctions shows. */
export const LIST_TRACKED = 200;

type LiveRow = { _id: string; version: number; state: string };
const LIVE_FIELDS = { version: 1, state: 1 } as const;

// Pushes committed auction changes to WebSocket watchers (ADR 0031). Realtime is
// a supplementary channel: payloads are the same public projections as the REST
// reads, and clients still read REST on (re)connect. Changes are detected by
// the auction document version, so commands from this process (nudged right
// after commit), the order worker and other API instances (seen by the poll)
// all reach watchers without a change-stream privilege for the app role.
// The list pass stays at 2 s; the detail pass reads only watched IDs.
@Injectable()
export class AuctionLiveService implements OnModuleDestroy {
  private readonly log = new Logger(AuctionLiveService.name);
  private emit: LiveEmit | null = null;
  private readonly watchers = new Map<string, number>();
  private listWatchers = 0;
  /** Last version seen per auction tracked for detail or list watchers. */
  private readonly known = new Map<string, number>();
  /** Auctions the list room already knows about (Active, or just left Active). */
  private readonly listed = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private fast: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private pendingFull = false;
  private readonly pendingIds = new Set<string>();

  constructor(
    private readonly mongo: MongoService,
    private readonly bidding: AuctionBiddingService,
  ) {}

  attach(emit: LiveEmit) {
    this.emit = emit;
  }
  onModuleDestroy() {
    this.stop();
  }

  async watch(id: string) {
    this.watchers.set(id, (this.watchers.get(id) ?? 0) + 1);
    if (!this.known.has(id)) {
      const row = await this.mongo.c.auctions.findOne(
        { _id: id },
        { projection: { version: 1 } },
      );
      if (row && this.watchers.has(id) && !this.known.has(id))
        this.known.set(id, row.version);
    }
    this.start();
    this.syncFast();
  }
  unwatch(id: string) {
    const left = (this.watchers.get(id) ?? 0) - 1;
    if (left > 0) this.watchers.set(id, left);
    else {
      this.watchers.delete(id);
      if (!this.listed.has(id)) this.known.delete(id);
    }
    this.syncFast();
    this.stopIfIdle();
  }
  async watchList() {
    if (this.listWatchers++ === 0) {
      // Seed silently: a new list watcher reads GET /auctions itself.
      for (const row of await this.activeVersions()) {
        this.listed.add(row._id);
        if (!this.known.has(row._id)) this.known.set(row._id, row.version);
      }
    }
    this.start();
  }
  unwatchList() {
    this.listWatchers = Math.max(0, this.listWatchers - 1);
    if (this.listWatchers === 0) {
      for (const id of this.listed)
        if (!this.watchers.has(id)) this.known.delete(id);
      this.listed.clear();
    }
    this.stopIfIdle();
  }

  /** Check now, e.g. right after a command committed in this process. */
  nudge(id?: string) {
    if (id) {
      if (this.watchers.has(id) || this.listWatchers > 0) void this.run([id]);
    } else if (!this.idle()) void this.tick();
  }

  /** One detection pass; concurrent calls coalesce into one follow-up pass. */
  tick(): Promise<void> {
    return this.run(null);
  }
  /** Bounded fallback for commands handled by another API instance or worker. */
  fastTick(): Promise<void> {
    return this.running ?? this.run([...this.watchers.keys()]);
  }

  private run(only: string[] | null): Promise<void> {
    if (this.running) {
      if (only) for (const id of only) this.pendingIds.add(id);
      else this.pendingFull = true;
      return this.running;
    }
    this.running = this.check(only)
      .catch((error: unknown) =>
        this.log.warn(`Auction live check failed: ${String(error)}`),
      )
      .finally(() => {
        this.running = null;
        const next = this.pendingFull ? null : [...this.pendingIds];
        this.pendingFull = false;
        this.pendingIds.clear();
        if (next === null || next.length) void this.run(next);
      });
    return this.running;
  }

  private async check(only: string[] | null) {
    const ids = only ?? [...new Set([...this.watchers.keys(), ...this.listed])];
    const found = new Map<string, LiveRow>();
    if (ids.length)
      for (const row of (await this.mongo.c.auctions
        .find({ _id: { $in: ids } }, { projection: LIVE_FIELDS })
        .toArray()) as LiveRow[])
        found.set(row._id, row);
    if (!only && this.listWatchers > 0)
      for (const row of await this.activeVersions()) found.set(row._id, row);
    await Promise.all([...found].map(async ([id, { version, state }]) => {
      const seen = this.known.get(id);
      const publishList = this.listWatchers > 0 && (state === 'Active' || this.listed.has(id));
      const isNewToList = publishList && !this.listed.has(id);
      if ((!this.watchers.has(id) && !publishList) || (seen === version && !isNewToList)) return;
      try {
        const snapshot = await this.bidding.readPublic(id);
        if (this.watchers.has(id) || (publishList && this.listWatchers > 0))
          this.known.set(id, version);
        if (this.watchers.has(id))
          this.emit?.(auctionRoom(id), 'auction:update', snapshot);
        if (publishList && this.listWatchers > 0) this.publishToList(snapshot.auction);
      } catch {
        this.log.warn('Auction live snapshot did not complete.');
      }
    }));
  }

  private publishToList(summary: Wire['PublicAuctionSummary']) {
    this.emit?.(LIST_ROOM, 'auction:summary', summary);
    if (summary.state === 'Active') this.listed.add(summary.id);
    else {
      // The list drops it now; keep tracking only if a detail page still watches.
      this.listed.delete(summary.id);
      if (!this.watchers.has(summary.id)) this.known.delete(summary.id);
    }
  }

  /**
   * Open auctions a list watcher can see. GET /auctions shows the 50 soonest
   * to end, so the bounded pass follows the same order (state+endAt index):
   * with more than LIST_TRACKED open auctions the visible ones stay tracked
   * instead of an arbitrary subset.
   */
  private async activeVersions() {
    return (await this.mongo.c.auctions
      .find(
        { state: 'Active' },
        { projection: LIVE_FIELDS, sort: { endAt: 1, _id: 1 }, limit: LIST_TRACKED },
      )
      .toArray()) as LiveRow[];
  }
  private idle() {
    return this.watchers.size === 0 && this.listWatchers === 0;
  }
  private start() {
    if (this.timer || this.idle()) return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.fast) clearInterval(this.fast);
    this.fast = null;
  }
  private syncFast() {
    if (this.watchers.size > 0 && !this.fast) {
      this.fast = setInterval(() => void this.fastTick(), FAST_POLL_MS);
      this.fast.unref();
    } else if (this.watchers.size === 0 && this.fast) {
      clearInterval(this.fast);
      this.fast = null;
    }
  }
  /** For tests: whether the 0.5 s pass is scheduled. */
  get fastPolling() {
    return this.fast !== null;
  }
  private stopIfIdle() {
    if (this.idle()) this.stop();
  }
}
