import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service.js';
import { TransactionChanges } from '../commands/transaction-changes.js';
import { StaffLiveGateway } from './staff-live.gateway.js';

describe('Staff live gateway', () => {
  let app: INestApplication;
  let endpoint: string;
  let changes: TransactionChanges;
  let roles: Map<string, string[]>;
  const clients: Socket[] = [];

  beforeEach(async () => {
    roles = new Map([
      ['admin', ['ADMIN']],
      ['staff', ['STAFF']],
      ['member', ['MEMBER']],
    ]);
    const testing = await Test.createTestingModule({
      providers: [
        TransactionChanges,
        StaffLiveGateway,
        {
          provide: AuthService,
          useValue: { authenticate: async (token: string) => {
            const current = roles.get(token);
            if (!current) throw new Error('invalid session');
            return { user: { id: token, roles: current } };
          } },
        },
      ],
    }).compile();
    changes = testing.get(TransactionChanges);
    app = testing.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    endpoint = `http://127.0.0.1:${app.getHttpServer().address().port}/staff`;
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

  const watch = (client: Socket, topic: unknown) =>
    client.timeout(1_500).emitWithAck('staff:watch', topic) as Promise<{ ok: boolean }>;

  it('accepts only current staff sessions and checks each topic role', async () => {
    await expect(open('')).rejects.toThrow('Unauthorized.');
    await expect(open('member')).rejects.toThrow('Unauthorized.');
    await expect(open('expired')).rejects.toThrow('Unauthorized.');
    const staff = await open('staff');
    expect(await watch(staff, 'listings')).toEqual({ ok: true });
    expect(await watch(staff, 'support')).toEqual({ ok: false });
    expect(await watch(staff, 'withdrawals')).toEqual({ ok: false });
    expect(await watch(staff, 'toString')).toEqual({ ok: false });
    const admin = await open('admin');
    expect(await watch(admin, 'support')).toEqual({ ok: true });
  });

  it('pushes only the topic name to watchers of the changed queues, once per burst', async () => {
    const [admin, staff] = await Promise.all([open('admin'), open('staff')]);
    for (const topic of ['support', 'work-items']) expect(await watch(admin, topic)).toEqual({ ok: true });
    expect(await watch(staff, 'listings')).toEqual({ ok: true });
    const adminUpdate = vi.fn();
    const staffUpdate = vi.fn();
    admin.on('staff:changed', adminUpdate);
    staff.on('staff:changed', staffUpdate);
    changes.entityCommitted('SupportCase');
    changes.entityCommitted('SupportCase');
    changes.entityCommitted('AddressBook');
    await vi.waitFor(() => {
      expect(adminUpdate).toHaveBeenCalledWith({ topic: 'support' });
      expect(adminUpdate).toHaveBeenCalledWith({ topic: 'work-items' });
    });
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(adminUpdate).toHaveBeenCalledTimes(2);
    expect(staffUpdate).not.toHaveBeenCalled();
  });

  it('stops pushing after unwatch', async () => {
    const staff = await open('staff');
    expect(await watch(staff, 'listings')).toEqual({ ok: true });
    await staff.timeout(1_500).emitWithAck('staff:unwatch', 'listings');
    const received = vi.fn();
    staff.on('staff:changed', received);
    changes.entityCommitted('Listing');
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(received).not.toHaveBeenCalled();
  });

  it('rechecks the session and role before every push', async () => {
    const [revoked, demoted] = await Promise.all([open('admin'), open('staff')]);
    expect(await watch(revoked, 'support')).toEqual({ ok: true });
    expect(await watch(demoted, 'listings')).toEqual({ ok: true });
    const revokedUpdate = vi.fn();
    const demotedUpdate = vi.fn();
    const disconnected = vi.fn();
    revoked.on('staff:changed', revokedUpdate);
    revoked.on('disconnect', disconnected);
    demoted.on('staff:changed', demotedUpdate);
    roles.delete('admin');
    roles.set('staff', ['MEMBER']);
    changes.entityCommitted('SupportCase');
    changes.entityCommitted('Listing');
    await vi.waitFor(() => expect(disconnected).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(revokedUpdate).not.toHaveBeenCalled();
    expect(demotedUpdate).not.toHaveBeenCalled();
  });
});
