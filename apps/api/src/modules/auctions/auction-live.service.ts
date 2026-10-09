import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Wire } from '../commands/domain-error.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AuctionBiddingService } from './auction-bidding.service.js';

export type LiveEmit = (room: string, event: string, payload: unknown) => void;
export const auctionRoom = (id: string) => `auction:${id}`;
export const LIST_ROOM = 'auctions';
const POLL_MS = 2_000;

// Pushes committed auction changes to WebSocket watchers (ADR 0031). Realtime is
// a supplementary channel: payloads are the same public projections as the REST
// reads, and clients still read REST on (re)connect. Changes are detected by
// the auction document version, so commands from this process (nudged right
// after commit), the order worker and other API instances (seen by the poll)
// all reach watchers without a change-stream privilege for the app role.
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
      if (!this.listed.has(id)) this.known.delete(id);
    }
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
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.check()
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

  private async check() {
    const ids = new Set([...this.watchers.keys(), ...this.listed]);
    const rows = new Map<string, number>();
    if (ids.size)
      for (const row of await this.mongo.c.auctions
        .find({ _id: { $in: [...ids] } }, { projection: { version: 1 } })
        .toArray())
        rows.set(row._id, row.version);
    if (this.listWatchers > 0)
      for (const row of await this.activeVersions())
        rows.set(row._id, row.version);

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

  private activeVersions() {
    return this.mongo.c.auctions
      .find({ state: 'Active' }, { projection: { version: 1 }, limit: 200 })
      .toArray();
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
  }
  private stopIfIdle() {
    if (this.idle()) this.stop();
  }
}
