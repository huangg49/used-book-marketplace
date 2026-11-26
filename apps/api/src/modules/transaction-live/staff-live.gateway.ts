import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { AuthService } from '../auth/auth.service.js';
import { socketCorsOptions } from '../../common/socket-cors.js';
import { TransactionChanges } from '../commands/transaction-changes.js';

type StaffRole = 'STAFF' | 'ADMIN';

// Each topic is one admin screen family. Roles mirror the REST reads it
// refreshes; REST still decides what each person may see.
export const STAFF_TOPICS = {
  'work-items': { roles: ['STAFF', 'ADMIN'] },
  support: { roles: ['ADMIN'] },
  listings: { roles: ['STAFF', 'ADMIN'] },
  catalog: { roles: ['ADMIN'] },
  withdrawals: { roles: ['ADMIN'] },
  operations: { roles: ['STAFF', 'ADMIN'] },
} as const satisfies Record<string, { roles: readonly StaffRole[] }>;
export type StaffTopic = keyof typeof STAFF_TOPICS;

// Committed command entity types → the staff screens that list them.
const ENTITY_TOPICS: Record<string, StaffTopic[]> = {
  SupportCase: ['support', 'work-items'],
  Listing: ['listings', 'work-items'],
  Media: ['listings'],
  Catalog: ['catalog', 'work-items'],
  Withdrawal: ['withdrawals', 'work-items'],
  WithdrawalProof: ['withdrawals'],
  Exchange: ['operations', 'work-items'],
  ExchangeEvidence: ['operations', 'work-items'],
  Auction: ['operations', 'work-items'],
  AuctionIntake: ['operations', 'work-items'],
  PointOrder: ['operations', 'work-items'],
  PointIncident: ['operations', 'work-items'],
  HandoverPoint: ['operations'],
  PointAssignment: ['operations'],
  Order: ['operations', 'work-items'],
  Shipment: ['operations', 'work-items'],
  CarrierEvent: ['operations'],
  OrderPackagingEvidence: ['operations'],
  TransactionReview: ['operations', 'work-items'],
  UserAccount: ['operations', 'work-items'],
};

// Pushes for one topic coalesce in this window during bursts of commands.
export const STAFF_COALESCE_MS = 250;
const roomOf = (topic: StaffTopic) => `staff:${topic}`;
const isTopic = (value: unknown): value is StaffTopic =>
  typeof value === 'string' && Object.hasOwn(STAFF_TOPICS, value);

interface StaffSocket {
  id: string;
  handshake: { auth?: { token?: unknown } };
  data: { token?: string };
  join(room: string): unknown;
  leave(room: string): unknown;
  emit(event: 'staff:changed', payload: { topic: StaffTopic }): void;
  disconnect(close?: boolean): void;
}

interface Namespace {
  use(middleware: (socket: StaffSocket, next: (error?: Error) => void) => void): void;
  in(room: string): { fetchSockets(): Promise<StaffSocket[]> };
}

// Invalidation hints for admin screens. No queue data crosses the socket; the
// role is rechecked against the current session before every push.
@WebSocketGateway({ namespace: '/staff', cors: socketCorsOptions() })
export class StaffLiveGateway implements OnGatewayInit, OnModuleDestroy {
  private readonly log = new Logger(StaffLiveGateway.name);
  private readonly timers = new Map<StaffTopic, NodeJS.Timeout>();
  private namespace?: Namespace;
  private unsubscribe?: () => void;

  constructor(
    private readonly auth: AuthService,
    private readonly changes: TransactionChanges,
  ) {}

  afterInit(namespace: Namespace) {
    this.namespace = namespace;
    this.unsubscribe = this.changes.subscribeEntities(entityType => {
      for (const topic of ENTITY_TOPICS[entityType] ?? []) this.schedule(topic);
    });
    namespace.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (typeof token !== 'string' || !token || !(await this.roles(token)).length)
        return next(new Error('Unauthorized.'));
      socket.data.token = token;
      next();
    });
  }

  @SubscribeMessage('staff:watch')
  async watch(@ConnectedSocket() socket: StaffSocket, @MessageBody() topic: unknown) {
    if (!isTopic(topic) || !(await this.allowed(socket, topic))) return { ok: false };
    await socket.join(roomOf(topic));
    return { ok: true };
  }

  @SubscribeMessage('staff:unwatch')
  async unwatch(@ConnectedSocket() socket: StaffSocket, @MessageBody() topic: unknown) {
    if (!isTopic(topic)) return { ok: false };
    await socket.leave(roomOf(topic));
    return { ok: true };
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.unsubscribe?.();
  }

  private schedule(topic: StaffTopic) {
    if (this.timers.has(topic)) return;
    this.timers.set(topic, setTimeout(() => {
      this.timers.delete(topic);
      void this.publish(topic).catch(() => this.log.warn('Staff live push did not complete.'));
    }, STAFF_COALESCE_MS).unref());
  }

  private async publish(topic: StaffTopic) {
    const sockets = (await this.namespace?.in(roomOf(topic)).fetchSockets()) ?? [];
    await Promise.all(sockets.map(async socket => {
      const roles = await this.roles(socket.data.token);
      if (!roles.length) return socket.disconnect();
      if (!STAFF_TOPICS[topic].roles.some(role => roles.includes(role)))
        return void socket.leave(roomOf(topic));
      socket.emit('staff:changed', { topic });
    }));
  }

  private async allowed(socket: StaffSocket, topic: StaffTopic) {
    const roles = await this.roles(socket.data.token);
    return STAFF_TOPICS[topic].roles.some(role => roles.includes(role));
  }

  private async roles(token?: string): Promise<StaffRole[]> {
    if (!token) return [];
    try {
      const { user } = await this.auth.authenticate(token);
      return user.roles.filter((role): role is StaffRole => role === 'STAFF' || role === 'ADMIN');
    } catch {
      return [];
    }
  }
}
