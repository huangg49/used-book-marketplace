import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { HttpException, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import type { Actor } from '../commands/mongo-command.service.js';
import { PointOrdersService } from './point-orders.service.js';
import {
  PointOrderLiveService,
  pointOrderRoom,
} from './point-order-live.service.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WATCHED = 10;

interface LivePointOrderSocket {
  connected: boolean;
  data: {
    auth?: Actor;
    token?: string;
    watching?: Set<string>;
    pending?: Set<string>;
  };
  join(room: string): unknown;
  leave(room: string): unknown;
  emit(event: string, payload: unknown): void;
  disconnect?(close?: boolean): void;
}

type NamespaceServer = {
  use(
    middleware: (
      socket: {
        handshake: {
          auth?: { token?: unknown };
          headers: Record<string, unknown>;
        };
        data: Record<string, unknown>;
      },
      next: (error?: Error) => void,
    ) => void,
  ): void;
  in(room: string): { fetchSockets(): Promise<LivePointOrderSocket[]> };
};

// Authenticated, read-only live channel for ViaPoint auction orders.
// Handshake requires a valid access token; every watch and every push rechecks
// current auth and reads through PointOrdersService.read() so buyer/seller
// ownership and ADR 0044 address privacy are enforced on every message.
@WebSocketGateway({
  namespace: '/point-orders',
  cors: { origin: true, credentials: false },
})
export class PointOrderGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: NamespaceServer;
  private readonly logger = new Logger(PointOrderGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly orders: PointOrdersService,
    private readonly live: PointOrderLiveService,
  ) {}

  afterInit(namespace: NamespaceServer) {
    // Withhold connect ACK until JWT + active session check finishes.
    namespace.use(async (socket, next) => {
      const candidate =
        socket.handshake.auth?.token ??
        (typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : '');
      if (typeof candidate !== 'string' || !candidate)
        return next(new Error('Unauthorized.'));
      try {
        socket.data.auth = await this.auth.authenticate(candidate);
        socket.data.token = candidate;
      } catch {
        return next(new Error('Unauthorized.'));
      }
      next();
    });
    this.live.attach((orderId) => this.publish(orderId));
  }

  /** Subscribes the buyer or seller to live updates; ACK carries fresh snapshot. */
  @SubscribeMessage('point-order:watch')
  async watch(
    @ConnectedSocket() socket: LivePointOrderSocket,
    @MessageBody() id: unknown,
  ) {
    if (typeof id !== 'string' || !UUID.test(id))
      return { ok: false, code: 'VALIDATION_ERROR' };
    const token = socket.data.token;
    if (!token) return { ok: false, code: 'UNAUTHORIZED' };

    const watching = (socket.data.watching ??= new Set());
    const pending = (socket.data.pending ??= new Set());
    if (watching.has(id) || pending.has(id)) {
      return this.authorizedSnapshot(socket, id);
    }
    if (watching.size + pending.size >= MAX_WATCHED)
      return { ok: false, code: 'RATE_LIMITED' };

    // Verify fresh auth + ownership BEFORE joining the room.
    const initial = await this.authorizedSnapshot(socket, id);
    if (!initial.ok) return initial;

    // Register before final snapshot so commits landing during join are pushed.
    pending.add(id);
    const counted = this.live.watch(id);
    await socket.join(pointOrderRoom(id));
    await counted;

    const reply = await this.authorizedSnapshot(socket, id);
    const kept = pending.delete(id) && reply.ok && socket.connected;
    if (!kept) {
      await socket.leave(pointOrderRoom(id));
      this.live.unwatch(id);
      return reply.ok ? { ok: false, code: 'CANCELLED' } : reply;
    }
    watching.add(id);
    return reply;
  }

  @SubscribeMessage('point-order:unwatch')
  async unwatch(
    @ConnectedSocket() socket: LivePointOrderSocket,
    @MessageBody() id: unknown,
  ) {
    if (typeof id !== 'string') return { ok: false };
    if (socket.data.pending?.delete(id)) return { ok: true };
    if (!socket.data.watching?.delete(id)) return { ok: false };
    await socket.leave(pointOrderRoom(id));
    this.live.unwatch(id);
    return { ok: true };
  }

  handleDisconnect(socket: LivePointOrderSocket) {
    for (const id of socket.data.watching ?? []) this.live.unwatch(id);
    socket.data.watching?.clear();
    socket.data.pending?.clear();
  }

  async publish(orderId: string) {
    const room = pointOrderRoom(orderId);
    try {
      const subscribers = await this.server.in(room).fetchSockets();
      await Promise.all(
        subscribers.map(async (subscriber) => {
          const reply = await this.authorizedSnapshot(subscriber, orderId);
          if (reply.ok) {
            subscriber.emit('point-order:update', reply.order);
            return;
          }
          if (
            reply.code === 'UNAUTHORIZED' ||
            reply.code === 'FORBIDDEN' ||
            reply.code === 'NOT_FOUND'
          ) {
            const removed = subscriber.data.watching?.delete(orderId);
            await subscriber.leave(room);
            if (removed) this.live.unwatch(orderId);
            if (reply.code === 'UNAUTHORIZED') subscriber.disconnect?.(true);
          }
        }),
      );
    } catch {
      this.logger.warn('Point order live delivery did not complete.');
    }
  }

  private async authorizedSnapshot(
    socket: LivePointOrderSocket,
    orderId: string,
  ): Promise<
    | { ok: true; order: Awaited<ReturnType<PointOrdersService['read']>> }
    | { ok: false; code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'ERROR' }
  > {
    const token = socket.data.token;
    if (!token) return { ok: false, code: 'UNAUTHORIZED' };
    let freshAuth: Actor;
    try {
      freshAuth = await this.auth.authenticate(token);
      socket.data.auth = freshAuth;
    } catch {
      return { ok: false, code: 'UNAUTHORIZED' };
    }
    try {
      const order = await this.orders.read(freshAuth, orderId);
      return { ok: true, order };
    } catch (error) {
      if (error instanceof HttpException) {
        const status = error.getStatus();
        if (status === 401) return { ok: false, code: 'UNAUTHORIZED' };
        if (status === 403) return { ok: false, code: 'FORBIDDEN' };
        if (status === 404) return { ok: false, code: 'NOT_FOUND' };
      }
      return { ok: false, code: 'ERROR' };
    }
  }
}
