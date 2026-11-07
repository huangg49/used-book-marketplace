import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { DomainError } from '../commands/domain-error.js';
import { PurchaseGateway } from './purchase.gateway.js';
import { AuthService } from '../auth/auth.service.js';
import { PurchasesService } from './purchases.service.js';

const actor = {
  sessionId: 'synthetic-session',
  user: { id: 'synthetic-member' },
};
describe('purchase socket authentication boundary', () => {
  let app: INestApplication;
  const sockets: Socket[] = [];
  const authenticate = vi.fn(),
    authorizeMessageRead = vi.fn(),
    send = vi.fn();
  const start = async () => {
    const module = await Test.createTestingModule({
      providers: [
        PurchaseGateway,
        { provide: AuthService, useValue: { authenticate } },
        { provide: PurchasesService, useValue: { authorizeMessageRead, send } },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    return (credential = 'synthetic-qa-token') => {
      const socket = io(`http://127.0.0.1:${address.port}/purchase-chat`, {
        auth: { token: credential },
        transports: ['websocket'],
        reconnection: false,
        autoConnect: false,
        timeout: 2000,
      });
      sockets.push(socket);
      return socket;
    };
  };
  beforeEach(() => {
    vi.resetAllMocks();
    authenticate.mockResolvedValue(actor);
    authorizeMessageRead.mockResolvedValue({});
  });
  afterEach(async () => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
    await app?.close();
  });
  it('does not announce connection before slow authentication completes', async () => {
    let ready = false;
    authenticate.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      ready = true;
      return actor;
    });
    const socket = (await start())();
    const atConnect = await new Promise<boolean>((resolve, reject) => {
      socket.once('connect', () => resolve(ready));
      socket.once('connect_error', reject);
      socket.connect();
    });
    expect(atConnect).toBe(true);
  });
  it('accepts join immediately on connect and preserves the existing ACK', async () => {
    const socket = (await start())();
    const reply = await new Promise((resolve, reject) => {
      socket.once('connect', () =>
        socket
          .timeout(1000)
          .emit(
            'purchase:join',
            'synthetic-room',
            (error: unknown, value: unknown) =>
              error ? reject(error) : resolve(value),
          ),
      );
      socket.once('connect_error', reject);
      socket.connect();
    });
    expect(reply).toEqual({ ok: true });
    expect(authorizeMessageRead).toHaveBeenCalledWith(actor, 'synthetic-room');
  });
  it('refuses bad credentials through connect_error without exposing auth errors', async () => {
    authenticate.mockRejectedValue(new Error('private authentication detail'));
    const socket = (await start())();
    const connected = vi.fn();
    socket.on('connect', connected);
    const error = await new Promise<Error>((resolve) => {
      socket.once('connect_error', resolve);
      socket.connect();
    });
    expect(error.message).toBe('Unauthorized.');
    expect(connected).not.toHaveBeenCalled();
    expect(authorizeMessageRead).not.toHaveBeenCalled();
  });
  it('retains participant/session checks after a successful handshake', async () => {
    const gateway = new PurchaseGateway(
      {} as AuthService,
      { authorizeMessageRead } as unknown as PurchasesService,
    );
    const join = vi.fn();
    authorizeMessageRead.mockRejectedValue({ status: 403 });
    await expect(
      gateway.join({ data: { auth: actor }, join }, 'other-room'),
    ).rejects.toMatchObject({ status: 403 });
    expect(join).not.toHaveBeenCalled();
  });
  it('does not broadcast a rejected or revoked send, and passes the original message ID to the service', async () => {
    const gateway = new PurchaseGateway(
      {} as AuthService,
      { send } as unknown as PurchasesService,
    );
    const room = vi.fn();
    gateway.server = { in: room };
    send.mockRejectedValue({ status: 401 });
    const input = {
      messageId: 'original-id',
      conversationId: 'synthetic-room',
      body: 'Synthetic QA message',
    };
    await expect(
      gateway.send({ data: { auth: actor } }, input),
    ).rejects.toMatchObject({ status: 401 });
    expect(send).toHaveBeenCalledWith(actor, input);
    expect(room).not.toHaveBeenCalled();
  });
  it('acknowledges a rate refusal without broadcasting or timing out', async () => {
    const gateway = new PurchaseGateway(
      {} as AuthService,
      { send } as unknown as PurchasesService,
    );
    const room = vi.fn();
    gateway.server = { in: room };
    send.mockRejectedValue(
      new DomainError(429, 'RATE_LIMITED', 'Synthetic limit'),
    );
    await expect(
      gateway.send(
        { data: { auth: actor } },
        {
          messageId: 'synthetic-id',
          conversationId: 'synthetic-room',
          body: 'Synthetic QA message',
        },
      ),
    ).resolves.toEqual({ code: 'RATE_LIMITED' });
    expect(room).not.toHaveBeenCalled();
  });

  it('evicts a revoked subscriber while delivering to a current subscriber', async () => {
    const create = await start();
    const sender = create('sender');
    const receiver = create('receiver');
    authenticate.mockImplementation(async (credential: string) => ({
      ...actor,
      sessionId: credential,
    }));
    const join = async (socket: Socket) => {
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
        socket.connect();
      });
      await expect(
        socket.timeout(1000).emitWithAck('purchase:join', 'synthetic-room'),
      ).resolves.toEqual({ ok: true });
    };
    await Promise.all([join(sender), join(receiver)]);
    authorizeMessageRead.mockImplementation(
      async (subscriber: typeof actor) => {
        if (subscriber.sessionId === 'receiver')
          throw new UnauthorizedException();
      },
    );
    const live = vi.fn();
    const revoked = vi.fn();
    sender.on('purchase:message', live);
    receiver.on('purchase:message', revoked);
    const message = {
      id: 'committed-message',
      conversationId: 'synthetic-room',
    };
    send.mockResolvedValue(message);
    const input = {
      ...message,
      messageId: message.id,
      body: 'Synthetic QA message',
    };
    await expect(
      sender.timeout(1000).emitWithAck('purchase:send', input),
    ).resolves.toEqual(message);
    expect(live).toHaveBeenCalledExactlyOnceWith(message);
    expect(revoked).not.toHaveBeenCalled();
    authorizeMessageRead.mockClear();
    await sender.timeout(1000).emitWithAck('purchase:send', input);
    expect(
      authorizeMessageRead.mock.calls.map(([value]) => value.sessionId),
    ).toEqual(['sender']);
  });
});
