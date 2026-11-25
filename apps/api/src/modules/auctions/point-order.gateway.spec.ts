import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AuthService } from '../auth/auth.service.js';
import { PointOrderGateway } from './point-order.gateway.js';
import { PointOrderLiveService } from './point-order-live.service.js';
import { PointOrdersService } from './point-orders.service.js';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORDER_ID = '22222222-2222-4222-8222-222222222222';

const buyerActor = { sessionId: 'buyer-sess', user: { id: 'buyer-1' } };
const sellerActor = { sessionId: 'seller-sess', user: { id: 'seller-1' } };
const strangerActor = { sessionId: 'stranger-sess', user: { id: 'stranger-1' } };

const orderProjection = (role: 'Buyer' | 'Seller', version: number, state: string) => ({
  id: ORDER_ID,
  role,
  version,
  state,
  delivery: role === 'Buyer' ? { trackingCode: 'LL-TEST123456', recipientName: 'User 8' } : null,
});

describe('PointOrderGateway authentication, ownership & realtime push', () => {
  let app: INestApplication;
  let live: PointOrderLiveService;
  const sockets: Socket[] = [];
  let dbVersion = 1;

  const authenticate = vi.fn();
  const readOrder = vi.fn();
  const mongoMock = {
    c: {
      point_orders: {
        findOne: vi.fn(async ({ _id }: { _id: string }) =>
          _id === ORDER_ID ? { _id, version: dbVersion } : null,
        ),
        find: vi.fn(({ _id }: { _id: { $in: string[] } }) => ({
          toArray: async () =>
            _id.$in
              .filter((id) => id === ORDER_ID)
              .map((id) => ({ _id: id, version: dbVersion })),
        })),
      },
    },
  };

  const start = async () => {
    const module = await Test.createTestingModule({
      providers: [
        PointOrderGateway,
        PointOrderLiveService,
        { provide: AuthService, useValue: { authenticate } },
        { provide: PointOrdersService, useValue: { read: readOrder } },
        { provide: MongoService, useValue: mongoMock },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    live = module.get(PointOrderLiveService);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    return (token?: string) => {
      const socket = io(`http://127.0.0.1:${address.port}/point-orders`, {
        auth: token !== undefined ? { token } : undefined,
        transports: ['websocket'],
        reconnection: false,
        autoConnect: false,
        timeout: 2000,
      });
      sockets.push(socket);
      return socket;
    };
  };

  const connectAndWatch = (socket: Socket, id: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      socket.once('connect', () => {
        socket
          .timeout(1500)
          .emit('point-order:watch', id, (err: unknown, reply: unknown) =>
            err ? reject(err) : resolve(reply),
          );
      });
      socket.once('connect_error', reject);
      socket.connect();
    });

  beforeEach(() => {
    vi.clearAllMocks();
    dbVersion = 1;
    authenticate.mockImplementation(async (token: string) => {
      if (token === 'buyer-token') return buyerActor;
      if (token === 'seller-token') return sellerActor;
      if (token === 'stranger-token') return strangerActor;
      throw new UnauthorizedException('bad token');
    });
    readOrder.mockImplementation(async (actor: typeof buyerActor, id: string) => {
      if (id !== ORDER_ID) throw new NotFoundException();
      if (actor.user.id === 'buyer-1')
        return orderProjection('Buyer', dbVersion, dbVersion === 1 ? 'ReadyForCollection' : 'InTransit');
      if (actor.user.id === 'seller-1')
        return orderProjection('Seller', dbVersion, dbVersion === 1 ? 'ReadyForCollection' : 'InTransit');
      throw new NotFoundException();
    });
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await app?.close();
  });

  it('withholds connect until slow handshake authentication completes', async () => {
    let authDone = false;
    authenticate.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 150));
      authDone = true;
      return buyerActor;
    });
    const socket = (await start())('buyer-token');
    const readyAtConnect = await new Promise<boolean>((resolve, reject) => {
      socket.once('connect', () => resolve(authDone));
      socket.once('connect_error', reject);
      socket.connect();
    });
    expect(readyAtConnect).toBe(true);
  });

  it('rejects missing or invalid credentials with generic Unauthorized error', async () => {
    authenticate.mockRejectedValue(new Error('internal jwt decode detail'));
    const make = await start();
    const socket = make('bad-token');
    const err = await new Promise<Error>((resolve) => {
      socket.once('connect_error', resolve);
      socket.connect();
    });
    expect(err.message).toBe('Unauthorized.');
    expect(readOrder).not.toHaveBeenCalled();
  });

  it('refuses invalid UUID and unauthorized non-participants without leaking updates', async () => {
    const make = await start();
    const stranger = make('stranger-token');
    const badReply = await connectAndWatch(stranger, 'not-a-uuid');
    expect(badReply).toEqual({ ok: false, code: 'VALIDATION_ERROR' });

    const denied = await new Promise<unknown>((resolve, reject) => {
      stranger
        .timeout(1500)
        .emit('point-order:watch', ORDER_ID, (err: unknown, reply: unknown) =>
          err ? reject(err) : resolve(reply),
        );
    });
    expect(denied).toEqual({ ok: false, code: 'NOT_FOUND' });

    const forbidden = await new Promise<unknown>((resolve, reject) => {
      readOrder.mockRejectedValueOnce(new ForbiddenException());
      stranger
        .timeout(1500)
        .emit('point-order:watch', OTHER_ORDER_ID, (err: unknown, reply: unknown) =>
          err ? reject(err) : resolve(reply),
        );
    });
    expect(forbidden).toEqual({ ok: false, code: 'FORBIDDEN' });

    const leaked = vi.fn();
    stranger.on('point-order:update', leaked);
    dbVersion = 2;
    await live.tick([ORDER_ID]);
    await new Promise((r) => setTimeout(r, 50));
    expect(leaked).not.toHaveBeenCalled();
  });

  it('pushes role-scoped updates immediately on nudge (buyer sees delivery, seller does not)', async () => {
    const make = await start();
    const buyer = make('buyer-token');
    const seller = make('seller-token');

    const [buyerAck, sellerAck] = await Promise.all([
      connectAndWatch(buyer, ORDER_ID),
      connectAndWatch(seller, ORDER_ID),
    ]);
    expect(buyerAck).toMatchObject({
      ok: true,
      order: { id: ORDER_ID, role: 'Buyer', version: 1, delivery: { trackingCode: 'LL-TEST123456' } },
    });
    expect(sellerAck).toMatchObject({
      ok: true,
      order: { id: ORDER_ID, role: 'Seller', version: 1, delivery: null },
    });

    const buyerUpdate = new Promise<Record<string, unknown>>((resolve) =>
      buyer.once('point-order:update', resolve),
    );
    const sellerUpdate = new Promise<Record<string, unknown>>((resolve) =>
      seller.once('point-order:update', resolve),
    );

    dbVersion = 2;
    live.nudge(ORDER_ID);

    const [bNext, sNext] = await Promise.all([buyerUpdate, sellerUpdate]);
    expect(bNext).toMatchObject({
      id: ORDER_ID,
      role: 'Buyer',
      version: 2,
      state: 'InTransit',
      delivery: { trackingCode: 'LL-TEST123456' },
    });
    expect(sNext).toMatchObject({
      id: ORDER_ID,
      role: 'Seller',
      version: 2,
      state: 'InTransit',
      delivery: null,
    });
  });

  it('evicts and disconnects a subscriber whose session was revoked before a push', async () => {
    const make = await start();
    const buyer = make('buyer-token');
    const ack = await connectAndWatch(buyer, ORDER_ID);
    expect(ack).toMatchObject({ ok: true });

    const received = vi.fn();
    buyer.on('point-order:update', received);
    const disconnected = new Promise<void>((resolve) =>
      buyer.once('disconnect', () => resolve()),
    );

    // Revoke buyer's session before the order transitions
    authenticate.mockRejectedValue(new UnauthorizedException('revoked'));
    dbVersion = 2;
    await live.tick([ORDER_ID]);
    await disconnected;

    expect(received).not.toHaveBeenCalled();
  });
});
