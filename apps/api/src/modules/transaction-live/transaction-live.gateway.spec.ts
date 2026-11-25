import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { AuthService } from '../auth/auth.service.js';
import { TransactionChanges, type TransactionTarget } from '../commands/transaction-changes.js';
import { TransactionLiveGateway } from './transaction-live.gateway.js';

const id = '11111111-1111-4111-8111-111111111111';
const buyer = '22222222-2222-4222-8222-222222222222';
const seller = '33333333-3333-4333-8333-333333333333';
const stranger = '44444444-4444-4444-8444-444444444444';

const exchange: TransactionTarget = { kind: 'exchange', id };
const order: TransactionTarget = { kind: 'order', id };
const conversation: TransactionTarget = { kind: 'conversation', id };
const buyerInbox: TransactionTarget = { kind: 'inbox', id: buyer };

describe('Transaction live gateway', () => {
  let app: INestApplication;
  let endpoint: string;
  let changes: TransactionChanges;
  let version: number;
  let shipment: number | null;
  let message: string | null;
  let revoked: Set<string>;
  const clients: Socket[] = [];

  beforeEach(async () => {
    version = 1;
    shipment = null;
    message = null;
    revoked = new Set();
    const authorize = (request: { _id: string; $or?: Record<string, string>[] }) =>
      request._id === id && (!request.$or || request.$or.some(item => Object.values(item).some(user => user === buyer || user === seller)));
    const findOrder = async (request: Parameters<typeof authorize>[0]) =>
      authorize(request) ? { _id: id, buyerId: buyer, sellerId: seller, version } : null;
    const testing = await Test.createTestingModule({
      providers: [
        TransactionChanges,
        TransactionLiveGateway,
        {
          provide: MongoService,
          useValue: { c: {
            direct_orders: { findOne: findOrder },
            direct_shipments: { findOne: async () => shipment === null ? null : { version: shipment } },
            purchase_conversations: { findOne: findOrder },
            exchanges: {
              findOne: async (request: Parameters<typeof authorize>[0]) =>
                authorize(request) ? { _id: id, initiatorId: buyer, recipientId: seller, revision: version } : null,
            },
            exchange_messages: { findOne: async () => message ? { _id: message } : null },
            member_notifications: { findOne: async () => null },
          } },
        },
        {
          provide: AuthService,
          useValue: { authenticate: async (token: string) => {
            if (!['buyer', 'seller', 'stranger', 'staff'].includes(token) || revoked.has(token))
              throw new Error('invalid session');
            const id = token === 'buyer' ? buyer : token === 'seller' ? seller : stranger;
            return { user: { id, roles: [token === 'staff' ? 'STAFF' : 'MEMBER'] } };
          } },
        },
      ],
    }).compile();
    changes = testing.get(TransactionChanges);
    app = testing.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    endpoint = `http://127.0.0.1:${app.getHttpServer().address().port}/transactions`;
  });

  afterEach(async () => {
    clients.splice(0).forEach(client => client.disconnect());
    await app.close();
  });

  function open(token: string) {
    const client = io(endpoint, {
      autoConnect: false, reconnection: false, transports: ['websocket'], auth: { token },
    });
    clients.push(client);
    return new Promise<Socket>((resolve, reject) => {
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
      client.connect();
    });
  }

  const watch = (client: Socket, target: unknown) =>
    client.timeout(1_500).emitWithAck('transaction:watch', target) as Promise<{ ok: boolean }>;

  it('requires a member session and checks current participation before acknowledging a watch', async () => {
    await expect(open('')).rejects.toThrow('Unauthorized.');
    await expect(open('staff')).rejects.toThrow('Unauthorized.');
    const other = await open('stranger');
    expect(await watch(other, 'not a target')).toEqual({ ok: false });
    expect(await watch(other, order)).toEqual({ ok: false });
    expect(await watch(other, exchange)).toEqual({ ok: false });
    expect(await watch(other, buyerInbox)).toEqual({ ok: false });
  });

  it('sends only the committed resource reference to participants and wakes the related inbox', async () => {
    const [a, b, outside] = await Promise.all([open('buyer'), open('seller'), open('stranger')]);
    expect(await watch(a, exchange)).toEqual({ ok: true });
    expect(await watch(b, exchange)).toEqual({ ok: true });
    expect(await watch(a, buyerInbox)).toEqual({ ok: true });
    expect(await watch(outside, exchange)).toEqual({ ok: false });
    const received = vi.fn();
    const sellerUpdate = vi.fn();
    const foreign = vi.fn();
    a.on('transaction:changed', received);
    b.on('transaction:changed', sellerUpdate);
    outside.on('transaction:changed', foreign);
    version++;
    changes.committed(exchange);
    await vi.waitFor(() => {
      expect(received).toHaveBeenCalledWith(exchange);
      expect(received).toHaveBeenCalledWith(buyerInbox);
      expect(sellerUpdate).toHaveBeenCalledExactlyOnceWith(exchange);
    }, { timeout: 1_000 });
    expect(foreign).not.toHaveBeenCalled();
  });

  it('observes a shipment-only change, a message from another process and a negotiated term', async () => {
    const a = await open('buyer');
    for (const target of [order, exchange, conversation]) expect(await watch(a, target)).toEqual({ ok: true });
    const received = vi.fn();
    a.on('transaction:changed', received);
    shipment = 1;
    changes.committed(order);
    message = 'latest-message';
    await vi.waitFor(() => {
      expect(received).toHaveBeenCalledWith(order);
      expect(received).toHaveBeenCalledWith(exchange);
    }, { timeout: 1_250 });
    received.mockClear();
    version++;
    changes.committed(conversation);
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(conversation));
  });

  it('rechecks the session before pushing to an established subscription', async () => {
    const a = await open('buyer');
    expect(await watch(a, order)).toEqual({ ok: true });
    const received = vi.fn();
    const disconnected = vi.fn();
    a.on('transaction:changed', received);
    a.on('disconnect', disconnected);
    revoked.add('buyer');
    version++;
    changes.committed(order);
    await vi.waitFor(() => expect(disconnected).toHaveBeenCalled());
    expect(received).not.toHaveBeenCalled();
  });
});
