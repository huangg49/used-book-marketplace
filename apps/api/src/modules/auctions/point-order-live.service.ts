import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';

export type PointOrderPublish = (orderId: string) => Promise<void> | void;
export const pointOrderRoom = (id: string) => `point-order:${id}`;
export const POINT_ORDER_POLL_MS = 400;

type VersionRow = { _id: string; version: number };

// Pushes committed PointOrder changes to authenticated buyer/seller WebSocket
// watchers. Realtime is supplementary: payloads are always re-authorized per
// subscriber via PointOrdersService.read() (preserving ADR 0044 role privacy),
// and REST stays the source of truth on reconnect.
// Commands in this process nudge immediately after commit. A bounded
// 400 ms fallback runs while at least one watcher is connected so worker
// transitions (expiry / auto-completion) also reach clients without needing a
// MongoDB change-stream privilege.
@Injectable()
export class PointOrderLiveService implements OnModuleDestroy {
  private readonly log = new Logger(PointOrderLiveService.name);
  private publish: PointOrderPublish | null = null;
  private readonly watchers = new Map<string, number>();
  private readonly known = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private pendingIds: Set<string> | null = null;
  private pendingAll = false;

  constructor(private readonly mongo: MongoService) {}

  attach(publish: PointOrderPublish) {
    this.publish = publish;
  }

  onModuleDestroy() {
    this.stop();
  }

  async watch(id: string) {
    this.watchers.set(id, (this.watchers.get(id) ?? 0) + 1);
    if (!this.known.has(id)) {
      const row = (await this.mongo.c.point_orders.findOne(
        { _id: id },
        { projection: { version: 1 } },
      )) as VersionRow | null;
      if (row && this.watchers.has(id)) this.known.set(id, row.version);
    }
    this.start();
  }

  unwatch(id: string) {
    const left = (this.watchers.get(id) ?? 0) - 1;
    if (left > 0) this.watchers.set(id, left);
    else {
      this.watchers.delete(id);
      this.known.delete(id);
    }
    this.stopIfIdle();
  }

  /** Check now right after a PointOrder command commits in this process. */
  nudge(id?: string) {
    if (this.watchers.size === 0) return;
    if (id && !this.watchers.has(id)) return;
    void this.tick(id ? [id] : null);
  }

  /** One detection pass; concurrent calls coalesce cleanly without losing IDs. */
  tick(only: string[] | null = null): Promise<void> {
    if (this.running) {
      if (!only) this.pendingAll = true;
      else {
        this.pendingIds ??= new Set();
        for (const id of only) this.pendingIds.add(id);
      }
      return this.running;
    }
    this.running = this.check(only)
      .catch((error: unknown) =>
        this.log.warn(`Point order live check failed: ${String(error)}`),
      )
      .finally(() => {
        this.running = null;
        if (this.pendingAll) {
          this.pendingAll = false;
          this.pendingIds = null;
          void this.tick(null);
        } else if (this.pendingIds && this.pendingIds.size > 0) {
          const next = [...this.pendingIds];
          this.pendingIds = null;
          void this.tick(next);
        }
      });
    return this.running;
  }

  private async check(only: string[] | null) {
    const ids = (only ?? [...this.watchers.keys()]).filter((id) =>
      this.watchers.has(id),
    );
    if (!ids.length) return;
    const rows = (await this.mongo.c.point_orders
      .find({ _id: { $in: ids } }, { projection: { version: 1 } })
      .toArray()) as VersionRow[];
    for (const row of rows) {
      if (!this.watchers.has(row._id)) continue;
      const seen = this.known.get(row._id);
      if (seen === row.version) continue;
      this.known.set(row._id, row.version);
      await this.publish?.(row._id);
    }
  }

  private start() {
    if (this.timer || this.watchers.size === 0) return;
    this.timer = setInterval(() => void this.tick(null), POINT_ORDER_POLL_MS);
    this.timer.unref();
  }

  private stopIfIdle() {
    if (this.watchers.size === 0) this.stop();
  }

  private stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
