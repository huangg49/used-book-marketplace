import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Wire } from '../commands/domain-error.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AuctionBiddingService } from './auction-bidding.service.js';

export type LiveEmit = (room: string, event: string, payload: unknown) => void;
export const auctionRoom = (id: string) => `auction:${id}`;
export const LIST_ROOM = 'auctions';
export const POLL_MS = 2_000;
// ADR 0088 (M6): a watched auction inside a Buy Now challenge window (60 s or
// 5 min) is re-read this often, so a counter-bid from the worker or another
// instance reaches its watchers within half a second instead of two.
export const FAST_POLL_MS = 500;

type LiveRow = { _id: string; version: number; state?: string; buyNowAt?: Date | null; endAt?: Date };
const LIVE_FIELDS = { version: 1, state: 1, buyNowAt: 1, endAt: 1 } as const;
/** ADR 0088: open Challenge window (an Instant Buy Now ends at once). */
export const inBuyNowWindow = (row: LiveRow, now: number) =>
  row.state === 'Active' && !!row.buyNowAt && !!row.endAt && row.endAt.getTime() > now;

// Pushes committed auction changes to WebSocket watchers (ADR 0031). Realtime is
// a supplementary channel: payloads are the same public projections as the REST
// reads, and clients still read REST on (re)connect. Changes are detected by
// the auction document version, so commands from this process (nudged right
// after commit), the order worker and other API instances (seen by the poll)
// all reach watchers without a change-stream privilege for the app role.
// ADR 0088 (M6): the full pass runs every 2 s; watched auctions inside a Buy
// Now window also get a 0.5 s pass that reads only those rows.
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
  /** ADR 0088: watched auctions inside a Buy Now window, and their timer. */
  private readonly urgent = new Set<string>();
  private fast: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;

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
      if (row) this.known.set(id, row.version);
    }
    this.start();
  }
  unwatch(id: string) {
    const left = (this.watchers.get(id) ?? 0) - 1;
    if (left > 0) this.watchers.set(id, left);
    else {
      this.watchers.delete(id);
      this.urgent.delete(id);
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
  nudge() {
    if (!this.idle()) void this.tick();
  }

  /** One detection pass; concurrent calls coalesce into one follow-up pass. */
  tick(): Promise<void> {
    return this.run(null);
  }
  /** ADR 0088: the 0.5 s pass over watched auctions in a Buy Now window. */
  fastTick(): Promise<void> {
    if (this.running) return this.running; // the next fast pass is 0.5 s away
    return this.run([...this.urgent]);
  }

  private run(only: string[] | null): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.check(only)
      .catch((error: unknown) =>
        this.log.warn(`Auction live check failed: ${String(error)}`),
      )
      .finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          void this.tick();
        }
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
    const now = Date.now();
    for (const id of ids) {
      const row = found.get(id);
      if (row && this.watchers.has(id) && inBuyNowWindow(row, now))
        this.urgent.add(id);
      else this.urgent.delete(id);
    }
    const rows = new Map([...found].map(([id, row]) => [id, row.version]));

    for (const [id, version] of rows) {
      const seen = this.known.get(id);
      const isNewToList = this.listWatchers > 0 && !this.listed.has(id);
      if (seen === version && !isNewToList) continue;
      this.known.set(id, version);
      const snapshot = await this.bidding.readPublic(id);
      if (this.watchers.has(id))
        this.emit?.(auctionRoom(id), 'auction:update', snapshot);
      if (this.listWatchers > 0) this.publishToList(snapshot.auction);
    }
    this.syncFast();
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

  private async activeVersions() {
    return (await this.mongo.c.auctions
      .find({ state: 'Active' }, { projection: LIVE_FIELDS, limit: 200 })
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
    this.urgent.clear();
    this.syncFast();
  }
  /** ADR 0088: run the fast pass only while some watched auction needs it. */
  private syncFast() {
    if (this.urgent.size > 0 && !this.fast) {
      this.fast = setInterval(() => void this.fastTick(), FAST_POLL_MS);
      this.fast.unref();
    } else if (this.urgent.size === 0 && this.fast) {
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
