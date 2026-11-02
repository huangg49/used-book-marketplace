import { randomUUID } from 'node:crypto';
import { MongoClient, type Document } from 'mongodb';
import { testUrl } from './harness.js';
import { applyCollectionSpecs } from '../../src/database/mongo/migrations/index.js';
import { exchangeMutualCancellationSpecs } from '../../src/database/mongo/migrations/0045-exchange-mutual-cancellation.js';
import { exchangeAgreementMigration } from '../../src/database/mongo/migrations/0053-exchange-agreement.js';

it('upgrades legacy exchanges without inventing agreements, then validates frozen identities and obligations', async () => {
  const url = testUrl('latlai_exchange_agreement_upgrade_test');
  if (!url.includes('127.0.0.1:57017/') || !url.includes('replicaSet=rs-test'))
    throw Error('QA replica set required');
  const client = await new MongoClient(url).connect();
  const db = client.db();
  const exchanges = db.collection<Document & { _id: string }>('exchanges');
  try {
    await db.dropDatabase();
    await applyCollectionSpecs(db, exchangeMutualCancellationSpecs);
    const now = new Date();
    const legacy = {
      _id: randomUUID(),
      initiatorId: randomUUID(),
      recipientId: randomUUID(),
      initiatorListingId: randomUUID(),
      recipientListingId: randomUUID(),
      status: 'Preparing',
      revision: 4,
      initiatorDeposit: 150000,
      recipientDeposit: 100000,
      diffAmount: 50000,
      diffPayerId: '',
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      fundingDeadline: now,
      initiatorFundedAt: now,
      recipientFundedAt: now,
      proposalExpiresAt: now,
      rejectionReason: null,
      cancelReason: null,
      cancelledBy: null,
      cancelledAt: null,
      initiatorShippedAt: null,
      recipientShippedAt: null,
      initiatorReceivedAt: null,
      recipientReceivedAt: null,
      inspectionDeadline: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    };
    legacy.diffPayerId = legacy.initiatorId;
    await exchanges.insertOne(legacy);
    await exchangeAgreementMigration.up(db);
    expect(
      await exchanges.findOne({ _id: legacy._id }),
    ).toEqual(legacy);
    // Existing obligations remain writable with the original money and absent snapshot.
    await exchanges
      .updateOne({ _id: legacy._id }, { $inc: { revision: 1 } });
    const book = (listingId: string, ownerId: string, value: number) => ({
      listingId,
      listingVersion: 3,
      revisionId: randomUUID(),
      ownerId,
      ownerDisplayName: 'Thành viên QA',
      bookId: randomUUID(),
      catalogRevisionId: randomUUID(),
      book: {
        title: 'S'.repeat(300),
        authors: ['Tác giả'],
        publisher: null,
        publicationYear: 2026,
        language: 'vi',
        edition: null,
        category: 'Văn học',
        isbn: null,
      },
      condition: 'Good',
      description: 'Mô tả gốc',
      pages: 'Đủ trang',
      coverNote: '',
      notes: '',
      accessories: '',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      exchangeValue: value,
      mediaIds: [randomUUID()],
    });
    const agreement = {
      initiatorBooks: [
        book(legacy.initiatorListingId, legacy.initiatorId, 100000),
      ],
      recipientBook: book(
        legacy.recipientListingId,
        legacy.recipientId,
        150000,
      ),
    };
    const fresh = {
      ...legacy,
      _id: randomUUID(),
      initiatorOrderId: randomUUID(),
      recipientOrderId: randomUUID(),
      status: 'Proposed',
      revision: 1,
      agreement,
    };
    await exchanges.insertOne(fresh);
    for (const change of [
      { initiatorDeposit: 600000 },
      { diffAmount: 0 },
      { diffPayerId: legacy.recipientId },
      { recipientListingId: randomUUID() },
      { initiatorId: randomUUID() },
    ]) {
      await expect(
        exchanges
          .updateOne({ _id: fresh._id }, { $set: change }),
      ).rejects.toMatchObject({ code: 121 });
    }
    await expect(
      exchanges
        .updateOne(
          { _id: fresh._id },
          { $set: { 'agreement.recipientBook.exchangeValue': -1 } },
        ),
    ).rejects.toMatchObject({ code: 121 });
    expect(
      (await exchanges.findOne({ _id: fresh._id }))
        ?.agreement,
    ).toEqual(agreement);
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
