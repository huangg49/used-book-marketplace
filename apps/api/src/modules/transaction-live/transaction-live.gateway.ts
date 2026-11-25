import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AuthService } from '../auth/auth.service.js';
import {
  TransactionChanges,
  transactionKinds,
  type TransactionTarget,
} from '../commands/transaction-changes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WATCHES = 8;
export const TRANSACTION_FALLBACK_MS = 400;
// Notification writes and reads signal the inbox after commit, so its stored
// version is re-read only as a backstop for another process or a missed signal.
export const INBOX_FALLBACK_MS = 5_000;

interface LiveSocket {
  connected: boolean;
  handshake: { auth?: { token?: unknown } };
  data: { token?: string };
  emit(event: 'transaction:changed', payload: TransactionTarget): void;
  disconnect(close?: boolean): void;
}

interface Namespace {
  use(middleware: (socket: LiveSocket, next: (error?: Error) => void) => void): void;
}

type Snapshot = { members: string[]; version: string };
type Subscription = { socket: LiveSocket; version?: string };
type Watch = { target: TransactionTarget; subscribers: Set<Subscription>; checkedAt: number };

function parseTarget(value: unknown): TransactionTarget | undefined {
  if (!value || typeof value !== 'object' || !('kind' in value) || !('id' in value))
    return;
  const kind = transactionKinds.find(candidate => candidate === value.kind);
  if (kind && typeof value.id === 'string' && UUID.test(value.id))
    return { kind, id: value.id.toLowerCase() };
}

const keyOf = (target: TransactionTarget) => `${target.kind}:${target.id}`;

// Sends an invalidation hint only. REST remains the source of member data.
@WebSocketGateway({ namespace: '/transactions', cors: { origin: true, credentials: false } })
export class TransactionLiveGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleDestroy {
  private readonly log = new Logger(TransactionLiveGateway.name);
  private readonly watches = new Map<string, Watch>();
  private readonly subscriptions = new Map<LiveSocket, Map<string, Subscription>>();
  private readonly checking = new Set<string>();
  private readonly pending = new Map<string, boolean>();
  private timer?: NodeJS.Timeout;
  private unsubscribe?: () => void;

  constructor(
    private readonly mongo: MongoService,
    private readonly auth: AuthService,
    private readonly changes: TransactionChanges,
  ) {}

  afterInit(namespace: Namespace) {
    this.unsubscribe = this.changes.subscribe(target => {
      // A notification was written or read: tell every open screen of that member.
      if (target.kind === 'inbox') return this.check(keyOf(target), true, true);
      this.check(keyOf(target));
      if ([...this.watches.values()].some(watch => watch.target.kind === 'inbox')) {
        void this.notifyInboxes(target)
          .catch(() => this.log.warn('Transaction inbox refresh did not complete.'));
      }
    });
    namespace.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token || !(await this.memberId(token)))
        return next(new Error('Unauthorized.'));
      socket.data.token = token;
      next();
    });
  }

  @SubscribeMessage('transaction:watch')
  async watch(@ConnectedSocket() socket: LiveSocket, @MessageBody() value: unknown) {
    const target = parseTarget(value);
    if (!target) return { ok: false };
    const key = keyOf(target);
    const subscriptions = this.subscriptions.get(socket) ?? new Map<string, Subscription>();
    if (subscriptions.has(key)) return { ok: subscriptions.get(key)?.version !== undefined };
    if (subscriptions.size >= MAX_WATCHES) return { ok: false };
    this.subscriptions.set(socket, subscriptions);
    const subscription: Subscription = { socket };
    subscriptions.set(key, subscription);
    try {
      const userId = await this.memberId(socket.data.token);
      if (!userId) return { ok: false };
      const current = await this.snapshot(target, userId);
      if (!current || subscriptions.get(key) !== subscription || !socket.connected)
        return { ok: false };
      subscription.version = current.version;
      const watch = this.watches.get(key) ?? { target, subscribers: new Set<Subscription>(), checkedAt: Date.now() };
      watch.subscribers.add(subscription);
      this.watches.set(key, watch);
      this.timer ??= setInterval(() => {
        const now = Date.now();
        for (const [watchedKey, watched] of this.watches) {
          if (watched.target.kind === 'inbox' && now - watched.checkedAt < INBOX_FALLBACK_MS) continue;
          watched.checkedAt = now;
          this.check(watchedKey, false);
        }
      }, TRANSACTION_FALLBACK_MS).unref();
      return { ok: true };
    } finally {
      if (subscriptions.get(key) === subscription && subscription.version === undefined)
        this.remove(socket, key);
    }
  }

  @SubscribeMessage('transaction:unwatch')
  unwatch(@ConnectedSocket() socket: LiveSocket, @MessageBody() value: unknown) {
    const target = parseTarget(value);
    if (target) this.remove(socket, keyOf(target));
  }

  handleDisconnect(socket: LiveSocket) {
    for (const key of this.subscriptions.get(socket)?.keys() ?? []) this.remove(socket, key);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    this.unsubscribe?.();
    this.watches.clear();
    this.subscriptions.clear();
  }

  private remove(socket: LiveSocket, key: string) {
    const subscriptions = this.subscriptions.get(socket);
    const subscription = subscriptions?.get(key);
    subscriptions?.delete(key);
    if (!subscriptions?.size) this.subscriptions.delete(socket);
    const watch = this.watches.get(key);
    if (subscription) watch?.subscribers.delete(subscription);
    if (watch && !watch.subscribers.size) this.watches.delete(key);
    if (!this.watches.size) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private check(key: string, queueIfBusy = true, force = false) {
    const watch = this.watches.get(key);
    if (!watch) return;
    if (this.checking.has(key)) {
      if (queueIfBusy) this.pending.set(key, force || this.pending.get(key) === true);
      return;
    }
    this.checking.add(key);
    void this.publish(watch, force)
      .catch(() => this.log.warn('Transaction live check did not complete.'))
      .finally(() => {
        this.checking.delete(key);
        const next = this.pending.get(key);
        if (this.pending.delete(key)) this.check(key, true, next);
      });
  }

  private async notifyInboxes(target: TransactionTarget) {
    const current = await this.snapshot(target);
    if (!current) return;
    for (const id of current.members) this.check(keyOf({ kind: 'inbox', id }), true, true);
  }

  private async publish(watch: Watch, force = false) {
    const current = await this.snapshot(watch.target);
    if (!current) return;
    await Promise.all([...watch.subscribers].map(async subscription => {
      if (!force && current.version === subscription.version) return;
      const { socket } = subscription;
      const userId = await this.memberId(socket.data.token);
      if (!watch.subscribers.has(subscription) || !socket.connected) return;
      if (!userId || !current.members.includes(userId)) {
        this.remove(socket, keyOf(watch.target));
        if (!userId) socket.disconnect();
        return;
      }
      subscription.version = current.version;
      socket.emit('transaction:changed', watch.target);
    }));
  }

  private async memberId(token?: string) {
    if (!token) return;
    try {
      const { user } = await this.auth.authenticate(token);
      return user.roles.includes('MEMBER') ? user.id : undefined;
    } catch {
      return;
    }
  }

  private async snapshot({ kind, id }: TransactionTarget, userId?: string): Promise<Snapshot | undefined> {
    const collections = this.mongo.c;
    if (kind === 'inbox') {
      if (userId && userId !== id) return;
      const latest = await collections.member_notifications.findOne(
        { userId: id }, { sort: { createdAt: -1, _id: -1 }, projection: { _id: 1 } },
      );
      // Reading in another tab changes the unread badge without a new row.
      const unread = await collections.member_notifications.countDocuments({ userId: id, readAt: null });
      return { members: [id], version: `${latest?._id ?? ''}:${unread}` };
    }
    if (kind === 'exchange') {
      const exchange = await collections.exchanges.findOne(
        { _id: id, ...(userId ? { $or: [{ initiatorId: userId }, { recipientId: userId }] } : {}) },
        { projection: { initiatorId: 1, recipientId: 1, revision: 1 } },
      );
      if (!exchange) return;
      const latest = await collections.exchange_messages.findOne(
        { exchangeId: id },
        { sort: { sentAt: -1, _id: -1 }, projection: { _id: 1 } },
      );
      return { members: [exchange.initiatorId, exchange.recipientId], version: `${exchange.revision}:${latest?._id ?? ''}` };
    }

    const where = { _id: id, ...(userId ? { $or: [{ buyerId: userId }, { sellerId: userId }] } : {}) };
    const options = { projection: { buyerId: 1, sellerId: 1, version: 1 } };
    if (kind === 'order') {
      const order = await collections.direct_orders.findOne(where, options);
      if (!order) return;
      const shipment = await collections.direct_shipments.findOne(
        { orderId: id }, { projection: { version: 1 } },
      );
      return { members: [order.buyerId, order.sellerId], version: `${order.version}:${shipment?.version ?? ''}` };
    }
    const row = await collections.purchase_conversations.findOne(where, options);
    if (row) return { members: [row.buyerId, row.sellerId], version: String(row.version) };
  }
}
