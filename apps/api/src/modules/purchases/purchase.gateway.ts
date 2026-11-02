import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { AuthService } from '../auth/auth.service.js';
import { PurchasesService } from './purchases.service.js';

@WebSocketGateway({
  namespace: '/purchase-chat',
  cors: { origin: true, credentials: false },
})
export class PurchaseGateway implements OnGatewayInit {
  @WebSocketServer() server!: {
    to(room: string): { emit(event: string, payload: unknown): void };
  };
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
    await this.purchases.get(auth, conversationId);
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
    const message = await this.purchases.send(auth, {
      messageId: value.messageId,
      conversationId: value.conversationId,
      body: value.body,
    });
    this.server
      .to(`purchase:${message.conversationId}`)
      .emit('purchase:message', message);
    return message;
  }
}
