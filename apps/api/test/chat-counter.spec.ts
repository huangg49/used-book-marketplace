import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { ExchangesService } from '../src/modules/exchanges/exchanges.service.js';
import { ExchangesController } from '../src/modules/exchanges/exchanges.controller.js';
import { MongoService } from '../src/database/mongo/mongo.service.js';

describe('Exchange Chat and Counter Tests', () => {
  let module: TestingModule;
  let svc: ExchangesService;
  let ctrl: ExchangesController;
  let mongo: MongoService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    svc = module.get<ExchangesService>(ExchangesService);
    ctrl = module.get<ExchangesController>(ExchangesController);
    mongo = module.get<MongoService>(MongoService);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should test getMessages and sendMessage on an exchange', async () => {
    const exchange = await mongo.c.exchanges.findOne({ status: 'Proposed' });
    if (!exchange) {
      console.log('No Proposed exchange found, skipping');
      return;
    }

    const initUser = await mongo.c.users.findOne({ _id: exchange.initiatorId });
    let initSession = await mongo.c.auth_sessions.findOne({ userId: exchange.initiatorId, revokedAt: null });
    if (!initSession) {
      const now = new Date();
      const doc = {
        _id: crypto.randomUUID(),
        userId: exchange.initiatorId,
        refreshTokenHash: '0'.repeat(64),
        expiresAt: new Date(now.getTime() + 86400000),
        revokedAt: null,
        createdAt: now,
        lockSeq: 0,
      };
      await mongo.c.auth_sessions.insertOne(doc);
      initSession = doc as any;
    }

    const recUser = await mongo.c.users.findOne({ _id: exchange.recipientId });
    let recSession = await mongo.c.auth_sessions.findOne({ userId: exchange.recipientId, revokedAt: null });
    if (!recSession) {
      const now = new Date();
      const doc = {
        _id: crypto.randomUUID(),
        userId: exchange.recipientId,
        refreshTokenHash: '0'.repeat(64),
        expiresAt: new Date(now.getTime() + 86400000),
        revokedAt: null,
        createdAt: now,
        lockSeq: 0,
      };
      await mongo.c.auth_sessions.insertOne(doc);
      recSession = doc as any;
    }

    const initiatorActor = {
      user: {
        id: initUser!._id,
        displayName: initUser!.displayName,
        email: initUser!.emailNormalized,
        status: initUser!.status,
        roles: initUser!.roles.map((r) => r.role),
      },
      sessionId: initSession!._id,
    };

    const recipientActor = {
      user: {
        id: recUser!._id,
        displayName: recUser!.displayName,
        email: recUser!.emailNormalized,
        status: recUser!.status,
        roles: recUser!.roles.map((r) => r.role),
      },
      sessionId: recSession!._id,
    };

    // 1. Send message as initiator
    const sent = await svc.sendMessage(initiatorActor as any, exchange._id, {
      body: 'Xin chào, sách của bạn còn mới không?',
    });
    expect(sent.body).toBe('Xin chào, sách của bạn còn mới không?');
    expect(sent.senderId).toBe(exchange.initiatorId);

    // 2. Read messages as recipient
    const msgs = await svc.getMessages(recipientActor as any, exchange._id);
    expect(msgs.items.length).toBeGreaterThanOrEqual(1);
    expect(msgs.items.some((m) => m.body === 'Xin chào, sách của bạn còn mới không?')).toBe(true);

    // 3. Send reply as recipient
    const reply = await svc.sendMessage(recipientActor as any, exchange._id, {
      body: 'Sách mới 95%, nguyên vẹn bạn nhé!',
    });
    expect(reply.body).toBe('Sách mới 95%, nguyên vẹn bạn nhé!');
    expect(reply.senderId).toBe(exchange.recipientId);

    // 4. Outsider access check - 3rd party user cannot view messages
    const outsiderActor = {
      user: {
        id: crypto.randomUUID(),
        displayName: 'Outsider',
        email: 'outsider@test.local',
        status: 'ACTIVE',
        roles: ['MEMBER'],
      },
      sessionId: initSession!._id,
    };
    await expect(svc.getMessages(outsiderActor as any, exchange._id)).rejects.toThrow();

    // 5. Test counter proposal
    const latestExchange = await mongo.c.exchanges.findOne({ _id: exchange._id });
    expect(latestExchange).not.toBeNull();
    const currentRev = latestExchange!.revision;

    let recAddr = await mongo.c.member_addresses.findOne({ ownerId: exchange.recipientId });
    if (!recAddr) {
      recAddr = {
        _id: crypto.randomUUID(),
        ownerId: exchange.recipientId,
        recipientName: 'Trần Tú',
        phone: '0373916690',
        detail: '120 Yên Lãng (DEMO-A)',
        localityCode: 'DEMO-A',
        serviceAreaCode: 'SGN',
        isDefault: true,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        lockSeq: 0,
      };
      await mongo.c.member_addresses.insertOne(recAddr);
    }

    const countered = await svc.counter(
      {
        auth: recipientActor as any,
        key: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
      },
      exchange._id,
      {
        expectedVersion: currentRev,
        diffAmount: 20000,
        diffPayer: 'initiator',
        deliveryAddressId: recAddr._id,
        note: 'Đề xuất bạn bù thêm 20.000đ tiền chênh lệch nhé',
      },
    );

    expect(countered.receipt.diffAmount).toBe(20000);
    expect(countered.receipt.diffPayerId).toBe(exchange.initiatorId);
    expect(countered.receipt.revision).toBe(currentRev + 1);
    expect(countered.receipt.recipientAddress?.recipientName).toBe('Trần Tú');

    // 6. Verify that the latest system message was posted in chat with both money and address
    const updatedMsgs = await svc.getMessages(initiatorActor as any, exchange._id);
    const systemMsg = updatedMsgs.items.findLast((m) => m.body.includes('[Đề xuất lại điều khoản]'));
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.body).toContain('20.000 đ');
    expect(systemMsg?.body).toContain('Địa chỉ nhận mới: Trần Tú');
    expect(systemMsg?.body).toContain('Đề xuất bạn bù thêm 20.000đ');
  });
});
