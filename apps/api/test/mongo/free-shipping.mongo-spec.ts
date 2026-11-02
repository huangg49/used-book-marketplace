import { randomUUID } from 'node:crypto';
import { MongoClient, type Document } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import { migrations } from '../../src/database/mongo/migrations/index.js';
import { FREE_SHIPPING_POLICY } from '../../src/database/mongo/migrations/0052-free-shipping.js';
import {
  deliveryPrice,
  deliverySnapshot,
} from '../../src/modules/auctions/point-delivery.js';
import type { Tx } from '../../src/database/mongo/transaction.js';
import type { PointOrderDoc } from '../../src/database/mongo/documents.js';
import { testUrl } from './harness.js';

it('upgrades to free shipping without rewriting old policy or ledger; accepts zero outbound fee and rejects stale fees', async () => {
  const client = await new MongoClient(
    testUrl(`free_shipping_${randomUUID().replaceAll('-', '')}_test`),
  ).connect();
  const db = client.db();
  try {
    await migrate(
      client,
      db,
      migrations.filter((m) => m.id !== '0052-free-shipping'),
    );
    const old = await db.collection('sale_quote_policies').find().toArray();
    const ledger = await db.collection('ledger_entries').find().toArray();
    const createdAt = new Date();
    const historicalQuote = {
      _id: randomUUID(),
      version: 1,
      buyerId: randomUUID(),
      sellerId: randomUUID(),
      listingId: randomUUID(),
      listingVersion: 1,
      listingRevisionId: randomUUID(),
      catalogRevisionId: randomUUID(),
      originAddressId: randomUUID(),
      originAddressVersion: 1,
      destinationAddressId: randomUUID(),
      destinationAddressVersion: 1,
      serviceAreaCode: 'HCM-DEMO-v1',
      policyCode: 'HCM-DIRECT-v1',
      bookPrice: 100000,
      shippingFee: 30000,
      commissionBps: 500,
      commission: 5000,
      buyerTotal: 130000,
      sellerProceeds: 125000,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 300000),
    };
    await db.collection('sale_quotes').insertOne(historicalQuote as never);
    expect(await migrate(client, db)).toEqual(['0052-free-shipping']);
    expect(await migrate(client, db)).toEqual([]);
    expect(
      await db
        .collection<Document & { _id: string }>('sale_quotes')
        .findOne({ _id: historicalQuote._id }),
    ).toEqual(historicalQuote);
    for (const policy of old)
      expect(
        await db.collection('sale_quote_policies').findOne({ _id: policy._id }),
      ).toEqual(policy);
    expect(await db.collection('ledger_entries').find().toArray()).toEqual(
      ledger,
    );
    const policy = await db
      .collection<Document & { _id: string }>('sale_quote_policies')
      .findOne({ _id: FREE_SHIPPING_POLICY });
    expect(policy).toMatchObject({
      shippingFee: 0,
      commissionBps: 500,
      ttlSeconds: 300,
    });
    const address = {
      _id: randomUUID(),
      ownerId: randomUUID(),
      version: 1,
      recipientName: 'QA',
      phone: '0900000000',
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: 'QA address',
    };
    // The helper reads the real policy and a synthetic owned address; no app data.
    const tx = {
      c: {
        member_addresses: { findOne: async () => address },
        sale_quote_policy_selection: db.collection(
          'sale_quote_policy_selection',
        ),
        sale_quote_policies: db.collection('sale_quote_policies'),
      },
    } as unknown as Tx;
    const order = {
      _id: randomUUID(),
      buyerId: address.ownerId,
    } as PointOrderDoc;
    expect(await deliveryPrice(tx, order, address._id)).toMatchObject({
      fee: 0,
    });
    const body = {
      expectedVersion: 1,
      fulfillmentMethod: 'CarrierOutbound' as const,
      destinationAddressId: address._id,
      expectedDestinationAddressVersion: 1,
      expectedOutboundFee: 0,
    };
    const snapshot = await deliverySnapshot(
      tx,
      order,
      body,
      new Date(),
      randomUUID(),
    );
    await db.collection('point_order_deliveries').insertOne(snapshot as never);
    await expect(
      db.collection('point_order_deliveries').insertOne({
        ...snapshot,
        _id: randomUUID(),
        outboundFee: -1,
      } as never),
    ).rejects.toMatchObject({ code: 121 });
    await expect(
      deliverySnapshot(
        tx,
        order,
        { ...body, expectedOutboundFee: 30000 },
        new Date(),
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'VersionConflict' } });
  } finally {
    await db.dropDatabase();
    await client.close();
  }
});
