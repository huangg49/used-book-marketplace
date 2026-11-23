import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { ExchangeDoc } from '../../database/mongo/documents.js';
import { exchangeAmounts, type ExchangeAgreement } from './exchange-agreement.js';
import {
  exchangeDisputeScope,
  exchangeMaxDamageDeduction,
  oneSidedReturn,
  returnResolutionView,
} from './exchange-return-resolution.js';
import { currentDemoDeadline } from './exchange-demo-deadline.js';
import { exchangeReturnMoves } from '../wallet/ledger.service.js';
import { currentCollections } from '../../database/mongo/migrations/index.js';

describe('Exchange Agreement Amounts & Invariants', () => {
  const initId = '11111111-1111-4111-8111-111111111111';
  const recId = '22222222-2222-4222-8222-222222222222';

  const makeAgreement = (initValues: number[], recValue: number): ExchangeAgreement => ({
    initiatorBooks: initValues.map((val) => ({
      listingId: randomUUID(),
      listingVersion: 1,
      revisionId: randomUUID(),
      ownerId: initId,
      ownerDisplayName: 'Nguyễn Văn A',
      bookId: randomUUID(),
      catalogRevisionId: randomUUID(),
      book: {
        title: 'Sách A',
        authors: ['Tác giả A'],
        publisher: 'NXB',
        publicationYear: 2024,
        language: 'vi',
        edition: null,
        category: 'Văn học',
        isbn: null,
      },
      condition: 'Good',
      description: 'Mô tả',
      pages: 'Đủ trang',
      coverNote: '',
      notes: '',
      accessories: '',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      exchangeValue: val,
      mediaIds: [randomUUID()],
    })),
    recipientBook: {
      listingId: randomUUID(),
      listingVersion: 1,
      revisionId: randomUUID(),
      ownerId: recId,
      ownerDisplayName: 'Trần Thị B',
      bookId: randomUUID(),
      catalogRevisionId: randomUUID(),
      book: {
        title: 'Sách B',
        authors: ['Tác giả B'],
        publisher: 'NXB',
        publicationYear: 2024,
        language: 'vi',
        edition: null,
        category: 'Kinh tế',
        isbn: null,
      },
      condition: 'LikeNew',
      description: 'Mô tả B',
      pages: 'Đủ trang',
      coverNote: '',
      notes: '',
      accessories: '',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      exchangeValue: recValue,
      mediaIds: [randomUUID()],
    },
  });

  it('Hội đồng V2 Case: A có sách 100k cọc 100k, B có sách 800k cọc 800k, A bù 700k', () => {
    // A (initiator) has 100k book, B (recipient) has 800k book
    const agreement = makeAgreement([100000], 800000);
    const amounts = exchangeAmounts(agreement, initId, recId);

    // Initiator A deposits for own book (100k)
    expect(amounts.initiatorDeposit).toBe(100000);
    // Recipient B deposits for own book (800k)
    expect(amounts.recipientDeposit).toBe(800000);
    // Difference is 700k, paid by A (the party with lower value book)
    expect(amounts.diffAmount).toBe(700000);
    expect(amounts.diffPayerId).toBe(initId);

    // Total required funding (collateral + diff):
    const totalToPayA = amounts.initiatorDeposit + (amounts.diffPayerId === initId ? amounts.diffAmount : 0);
    const totalToPayB = amounts.recipientDeposit + (amounts.diffPayerId === recId ? amounts.diffAmount : 0);

    // Both parties fund exactly 800.000đ:
    // A funds 100k cọc + 700k bù = 800k (exact value of book B being received)
    // B funds 800k cọc = 800k (exact collateral for book B being sent)
    expect(totalToPayA).toBe(800000);
    expect(totalToPayB).toBe(800000);
  });

  it('Reverse Case: A có sách 800k cọc 800k, B có sách 100k cọc 100k, B bù 700k', () => {
    const agreement = makeAgreement([800000], 100000);
    const amounts = exchangeAmounts(agreement, initId, recId);

    expect(amounts.initiatorDeposit).toBe(800000);
    expect(amounts.recipientDeposit).toBe(100000);
    expect(amounts.diffAmount).toBe(700000);
    expect(amounts.diffPayerId).toBe(recId);

    const totalToPayA = amounts.initiatorDeposit + (amounts.diffPayerId === initId ? amounts.diffAmount : 0);
    const totalToPayB = amounts.recipientDeposit + (amounts.diffPayerId === recId ? amounts.diffAmount : 0);

    expect(totalToPayA).toBe(800000);
    expect(totalToPayB).toBe(800000);
  });

  it('Equal Value Case: 100k đổi 100k -> cả 2 cọc 100k, tiền bù = 0', () => {
    const agreement = makeAgreement([100000], 100000);
    const amounts = exchangeAmounts(agreement, initId, recId);

    expect(amounts.initiatorDeposit).toBe(100000);
    expect(amounts.recipientDeposit).toBe(100000);
    expect(amounts.diffAmount).toBe(0);
    expect(amounts.diffPayerId).toBeNull();
  });

  it('Multi-book Case: A đổi 2 cuốn (150k + 100k = 250k) lấy 1 cuốn 200k của B -> A cọc 250k, B cọc 200k + bù 50k', () => {
    const agreement = makeAgreement([150000, 100000], 200000);
    const amounts = exchangeAmounts(agreement, initId, recId);

    expect(amounts.initiatorDeposit).toBe(250000);
    expect(amounts.recipientDeposit).toBe(200000);
    expect(amounts.diffAmount).toBe(50000);
    expect(amounts.diffPayerId).toBe(recId); // B bù cho A vì 200k < 250k
  });

  it('Negotiated Diff: Cho phép thỏa thuận số tiền bù tùy ý', () => {
    const agreement = makeAgreement([100000], 800000);
    // Two parties agreed diff is 500k instead of mathematical 700k
    const amounts = exchangeAmounts(agreement, initId, recId, 500000, initId);

    expect(amounts.initiatorDeposit).toBe(100000);
    expect(amounts.recipientDeposit).toBe(800000);
    expect(amounts.diffAmount).toBe(500000);
    expect(amounts.diffPayerId).toBe(initId);
    expect(amounts.negotiatedDiffAmount).toBe(500000);
  });

  it('Schema Migration 0086: Collection validator contains proportional deposit checks', () => {
    const collections = currentCollections();
    const exchangeSpec = collections.find((c) => c.name === 'exchanges');
    expect(exchangeSpec).toBeDefined();

    const exprStr = JSON.stringify(exchangeSpec?.expr);
    // initiatorDeposit equals sum of initiatorBooks
    expect(exprStr).toContain('["$initiatorDeposit",{"$sum":"$agreement.initiatorBooks.exchangeValue"}]');
    // recipientDeposit equals recipientBook
    expect(exprStr).toContain('["$recipientDeposit","$agreement.recipientBook.exchangeValue"]');
    // diffPayer is initiator when initiatorDeposit < recipientDeposit
    expect(exprStr).toContain('{"$lt":["$initiatorDeposit","$recipientDeposit"]}');
    // Migration 0087 keeps legacy cross-deposit compatibility for already-funded or closed rows
    expect(exprStr).toContain('{"$gt":["$initiatorDeposit","$recipientDeposit"]}');
    expect(exprStr).toContain('$initiatorFundedAt');
  });

  describe('Dispute Compensation & Ledger Allocation', () => {
    const now = new Date('2026-11-23T08:00:00Z');
    const makeDisputedExchange = (opts: {
      agreement: ExchangeAgreement;
      initiatorDeposit: number;
      recipientDeposit: number;
      diffAmount: number;
      diffPayerId: string | null;
      decision: 'CompensateRecipient' | 'CompensateInitiator';
      outcome?: 'Compensated' | 'Returned';
    }): ExchangeDoc =>
      ({
        _id: randomUUID(),
        initiatorId: initId,
        recipientId: recId,
        initiatorListingId: opts.agreement.initiatorBooks[0].listingId,
        initiatorListingIds: opts.agreement.initiatorBooks.map((b) => b.listingId),
        recipientListingId: opts.agreement.recipientBook.listingId,
        agreement: opts.agreement,
        status: 'Cancelled',
        revision: 8,
        initiatorDeposit: opts.initiatorDeposit,
        recipientDeposit: opts.recipientDeposit,
        diffAmount: opts.diffAmount,
        diffPayerId: opts.diffPayerId,
        initiatorOrderId: randomUUID(),
        recipientOrderId: randomUUID(),
        initiatorFundedAt: now,
        recipientFundedAt: now,
        initiatorShippedAt: now,
        recipientShippedAt: now,
        initiatorReceivedAt: now,
        recipientReceivedAt: now,
        disputedAt: now,
        disputedBy: opts.decision === 'CompensateRecipient' ? recId : initId,
        disputeReason: 'Sách bị hư hại nặng',
        resolutionDecision: opts.decision,
        returnResolution: {
          phase: 'Closed',
          note: 'Đã đối chiếu bằng chứng',
          evidenceDueAt: null,
          appealDueAt: null,
          appeals: [],
          decisionBy: randomUUID(),
          effectiveAt: now,
          returnDueAt: null,
          trackingCode: null,
          dispatchedAt: null,
          returnedAt: null,
          checkDueAt: null,
          outcome: opts.outcome ?? 'Compensated',
          settlementReceiptId: randomUUID(),
          evidenceId: null,
        },
      }) as unknown as ExchangeDoc;

    it('A (100k) defaults on B (800k): B gets full 800k compensation + 800k own deposit; A gets 0đ', () => {
      const agreement = makeAgreement([100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId);
      const exchange = makeDisputedExchange({
        agreement,
        ...amounts,
        decision: 'CompensateRecipient',
      });

      const view = returnResolutionView(exchange);
      expect(view.compensation).toBe(800000);

      const moves = exchangeReturnMoves(exchange);
      expect(moves).toEqual([
        expect.objectContaining({ code: 'exchange-owner-refund', recipientId: recId, amount: 800000 }),
        expect.objectContaining({ code: 'exchange-compensation', recipientId: recId, amount: 800000 }),
      ]);
      // Total released equals exact total held (800k + 800k = 1.600k)
      expect(moves.reduce((s, m) => s + m.amount, 0)).toBe(1600000);
    });

    it('B (800k) defaults on A (100k): A gets 100k compensation + 800k own locked funds; B gets 700k remainder', () => {
      const agreement = makeAgreement([100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId);
      const exchange = makeDisputedExchange({
        agreement,
        ...amounts,
        decision: 'CompensateInitiator',
      });

      const view = returnResolutionView(exchange);
      expect(view.compensation).toBe(100000);

      const moves = exchangeReturnMoves(exchange);
      expect(moves).toEqual([
        expect.objectContaining({ code: 'exchange-owner-refund', recipientId: initId, amount: 800000 }),
        expect.objectContaining({ code: 'exchange-holder-refund', recipientId: recId, amount: 700000 }),
        expect.objectContaining({ code: 'exchange-compensation', recipientId: initId, amount: 100000 }),
      ]);
      expect(moves.reduce((s, m) => s + m.amount, 0)).toBe(1600000);
    });

    it('Negotiated diff (A locks 100k + 500k = 600k) and A defaults on B (800k): caps compensation at 600k locked', () => {
      const agreement = makeAgreement([100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId, 500000, initId);
      const exchange = makeDisputedExchange({
        agreement,
        ...amounts,
        decision: 'CompensateRecipient',
      });

      expect(returnResolutionView(exchange).compensation).toBe(600000);
      const moves = exchangeReturnMoves(exchange);
      expect(moves).toEqual([
        expect.objectContaining({ code: 'exchange-owner-refund', recipientId: recId, amount: 800000 }),
        expect.objectContaining({ code: 'exchange-compensation', recipientId: recId, amount: 600000 }),
      ]);
      expect(moves.reduce((s, m) => s + m.amount, 0)).toBe(1400000);
    });

    it('Legacy cross-deposit funded before 0086 (initDep=800k, recDep=100k, A pays 700k): A defaults on B (800k)', () => {
      const agreement = makeAgreement([100000], 800000);
      const exchange = makeDisputedExchange({
        agreement,
        initiatorDeposit: 800000,
        recipientDeposit: 100000,
        diffAmount: 700000,
        diffPayerId: initId,
        decision: 'CompensateRecipient',
      });

      expect(returnResolutionView(exchange).compensation).toBe(800000);
      const moves = exchangeReturnMoves(exchange);
      expect(moves).toEqual([
        expect.objectContaining({ code: 'exchange-owner-refund', recipientId: recId, amount: 100000 }),
        expect.objectContaining({ code: 'exchange-holder-refund', recipientId: initId, amount: 700000 }),
        expect.objectContaining({ code: 'exchange-compensation', recipientId: recId, amount: 800000 }),
      ]);
      expect(moves.reduce((s, m) => s + m.amount, 0)).toBe(1600000);
    });

    it('Type 2 Multi-book Partial (A=3x100k + 500k diff vs B=800k, 1/3 book damaged D=100k): B gets 1.400k, A gets 200k', () => {
      const agreement = makeAgreement([100000, 100000, 100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId);
      const exchange = {
        ...makeDisputedExchange({
          agreement,
          ...amounts,
          decision: 'CompensateRecipient',
        }),
        status: 'Completed',
        completedAt: now,
        resolutionCompensationAmount: 100000,
      } as unknown as ExchangeDoc;

      const scope = exchangeDisputeScope(exchange, false);
      expect(exchangeMaxDamageDeduction(scope)).toBe(300000);
      expect(returnResolutionView(exchange).compensation).toBe(100000);

      const moves = exchangeReturnMoves(exchange);
      const toB = moves.filter((m) => m.recipientId === recId).reduce((s, m) => s + m.amount, 0);
      const toA = moves.filter((m) => m.recipientId === initId).reduce((s, m) => s + m.amount, 0);
      expect(toB).toBe(1400000);
      expect(toA).toBe(200000);
      expect(toA + toB).toBe(1600000);
    });

    it('Type 2 Partial on B (A=3x100k + 500k diff vs B=800k, minor damage D=200k on B): A gets 500k, B gets 1.100k', () => {
      const agreement = makeAgreement([100000, 100000, 100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId);
      const exchange = {
        ...makeDisputedExchange({
          agreement,
          ...amounts,
          decision: 'CompensateInitiator',
        }),
        status: 'Completed',
        completedAt: now,
        resolutionCompensationAmount: 200000,
      } as unknown as ExchangeDoc;

      const scope = exchangeDisputeScope(exchange, true);
      expect(exchangeMaxDamageDeduction(scope)).toBe(800000);

      const moves = exchangeReturnMoves(exchange);
      const toA = moves.filter((m) => m.recipientId === initId).reduce((s, m) => s + m.amount, 0);
      const toB = moves.filter((m) => m.recipientId === recId).reduce((s, m) => s + m.amount, 0);
      expect(toA).toBe(500000);
      expect(toB).toBe(1100000);
      expect(toA + toB).toBe(1600000);
    });

    it('InTransit dispute (both shipped, only B received) resolved via CompensateRecipient releases full 1.600k', () => {
      const agreement = makeAgreement([100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId);
      const exchange = {
        ...makeDisputedExchange({
          agreement,
          ...amounts,
          decision: 'CompensateRecipient',
        }),
        initiatorReceivedAt: null,
        recipientReceivedAt: now,
      } as unknown as ExchangeDoc;

      const moves = exchangeReturnMoves(exchange);
      const toB = moves.filter((m) => m.recipientId === recId).reduce((s, m) => s + m.amount, 0);
      const toA = moves.filter((m) => m.recipientId === initId).reduce((s, m) => s + m.amount, 0);
      expect(toB).toBe(1600000);
      expect(toA).toBe(0);
    });

    it('Multi-book 1-sided return: A shipped 3 books (300k), B missed shipping deadline', () => {
      const agreement = makeAgreement([100000, 100000, 100000], 800000);
      const amounts = exchangeAmounts(agreement, initId, recId);
      const shipped = new Date('2026-11-20T08:00:00Z');
      const deadline = new Date('2026-11-22T08:00:00Z');
      const row = {
        ...makeDisputedExchange({
          agreement,
          ...amounts,
          decision: 'CompensateInitiator',
        }),
        status: 'ResolutionPending',
        shippingDeadline: deadline,
        initiatorShippedAt: shipped,
        recipientShippedAt: null,
        initiatorReceivedAt: null,
        recipientReceivedAt: shipped,
        disputedAt: new Date('2026-11-22T09:00:00Z'),
        returnResolution: null,
      } as unknown as ExchangeDoc;

      const scope = oneSidedReturn(row, now);
      expect(scope).not.toBeNull();
      expect(scope!.ownerListingIds).toHaveLength(3);
      expect(scope!.ownerBookValue).toBe(300000);
    });

    it('Migration 0088 adds resolutionCompensationAmount and Demo Skip works in Delivered before both confirm', () => {
      const exchangeSpec = currentCollections().find((c) => c.name === 'exchanges');
      expect((exchangeSpec?.schema.properties as Record<string, unknown>)?.resolutionCompensationAmount).toBeDefined();

      const delivered = {
        status: 'Delivered',
        initiatorReceivedAt: now,
        recipientReceivedAt: now,
        initiatorInspectionDeadline: new Date(+now + 72 * 3_600_000),
        recipientInspectionDeadline: new Date(+now + 72 * 3_600_000),
        inspectionDeadline: new Date(+now + 72 * 3_600_000),
        initiatorCompletedAt: now,
        recipientCompletedAt: null,
        disputedAt: null,
        disputedBy: null,
        disputeReason: null,
      } as unknown as ExchangeDoc;
      expect(currentDemoDeadline(delivered, now, false)).toBe('Inspection');
    });
  });
});
