import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { HttpException, Logger } from '@nestjs/common';
import { DomainError } from '../commands/domain-error.js';
import { AuthService } from '../auth/auth.service.js';
import { PurchasesService } from './purchases.service.js';

type Subscriber = {
  data: Record<string, unknown>;
  emit(event: string, payload: unknown): void;
  leave(room: string): void | Promise<void>;
};

@WebSocketGateway({
  namespace: '/purchase-chat',
  cors: { origin: true, credentials: false },
})
export class PurchaseGateway implements OnGatewayInit {
  @WebSocketServer() server!: {
    in(room: string): { fetchSockets(): Promise<Subscriber[]> };
  };
  private readonly logger = new Logger(PurchaseGateway.name);
  constructor(
    private readonly auth: AuthService,
    private readonly purchases: PurchasesService,
  ) {}
  afterInit(namespace: {
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
  }) {
    // Connection hooks are not awaited before the client can emit join/send.
    // Namespace middleware withholds the connect ACK until authentication ends.
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
      } catch {
        return next(new Error('Unauthorized.'));
      }
      next();
    });
  }
  @SubscribeMessage('purchase:join')
  async join(
    @ConnectedSocket()
    socket: { data: Record<string, unknown>; join(room: string): void },
    @MessageBody() conversationId: unknown,
  ) {
    if (typeof conversationId !== 'string')
      throw new Error('Invalid conversation.');
    const auth = socket.data.auth as
      Parameters<PurchasesService['get']>[0] | undefined;
    if (!auth) throw new Error('Unauthorized.');
    await this.purchases.authorizeMessageRead(auth, conversationId);
    await socket.join(`purchase:${conversationId}`);
    return { ok: true };
  }
  @SubscribeMessage('purchase:send')
  async send(
    @ConnectedSocket() socket: { data: Record<string, unknown> },
    @MessageBody() input: unknown,
  ) {
    const auth = socket.data.auth as
      Parameters<PurchasesService['send']>[0] | undefined;
    if (!auth || !input || typeof input !== 'object')
      throw new Error('Unauthorized.');
    const value = input as Record<string, unknown>;
    if (
      typeof value.messageId !== 'string' ||
      typeof value.conversationId !== 'string' ||
      typeof value.body !== 'string'
    )
      throw new Error('Invalid message.');
    const message = await this.purchases
      .send(auth, {
        messageId: value.messageId,
        conversationId: value.conversationId,
        body: value.body,
      })
      .catch((error: unknown) => {
        if (error instanceof DomainError && error.getStatus() === 429)
          return null;
        throw error;
      });
    if (!message) return { code: 'RATE_LIMITED' as const };
    const room = `purchase:${message.conversationId}`;
    try {
      const subscribers = await this.server.in(room).fetchSockets();
      await Promise.all(
        subscribers.map(async (subscriber) => {
          const recipient = subscriber.data.auth as typeof auth | undefined;
          try {
            if (!recipient) {
              await subscriber.leave(room);
              return;
            }
            await this.purchases.authorizeMessageRead(
              recipient,
              message.conversationId,
            );
            subscriber.emit('purchase:message', message);
          } catch (error) {
            if (
              error instanceof HttpException &&
              [401, 403, 404].includes(error.getStatus())
            ) {
              await subscriber.leave(room);
              return;
            }
            throw error;
          }
        }),
      );
    } catch {
      // The message is already committed. History can recover missed delivery.
      this.logger.warn('Purchase chat live delivery did not complete.');
    }
    return message;
  }
}
