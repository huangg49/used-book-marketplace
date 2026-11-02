import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { LocalDemoCompletionPolicy } from '../wallet/local-demo-completion.policy.js';
import { OrdersService } from './orders.service.js';

/** Durable due-time scan; multiple API/worker processes safely race on one command receipt. */
@Injectable()
export class LocalDemoCompletionWorker implements OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(LocalDemoCompletionWorker.name);
  private warned = false;
  constructor(private readonly mongo: MongoService, private readonly orders: OrdersService, private readonly policy: LocalDemoCompletionPolicy) {}
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (!this.running) this.running = this.tick().catch(() => {
        if (!this.warned) this.logger.warn('Local demo settlement is pending; funds remain held.');
        this.warned = true;
      }).finally(() => { this.running = undefined; });
    }, 250);
    this.timer.unref();
  }
  async onModuleDestroy() { clearInterval(this.timer); await this.running; }
  async tick() {
    if (!this.policy.enabled()) return;
    const now = await this.mongo.now();
    const rows = await this.mongo.c.local_demo_order_completions.find({
      status: 'Pending', dueAt: { $lte: now },
    }, { sort: { dueAt: 1, _id: 1 }, limit: 10 }).toArray();
    for (const row of rows) {
      await this.orders.completeLocalDemo(row._id); this.warned = false;
    }
  }
}
