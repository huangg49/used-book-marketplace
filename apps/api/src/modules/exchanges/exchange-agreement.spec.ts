import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { exchangeAmounts, type ExchangeAgreement } from './exchange-agreement.js';
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
  });
});
