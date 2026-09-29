import type { MongoFixtures } from './mongo-fixtures.js';

// Removes every record the shipment/carrier-pickup suites create for their
// users: catalog/listing fixtures, addresses, quotes, Orders with their
// fulfillment history, wallets and ledger postings, and command records.
// Ledger journals are removed together with every entry of the accounts they
// touch, so the shared simulator source is conserved. Worker receipts/audits
// carry no actor; they are joined through the Order context.
export async function removeShipmentFixtures(
  db: MongoFixtures,
  users: string[],
) {
  const c = db.c;
  const ids = <T extends { _id: string }>(rows: T[]) => rows.map((r) => r._id);
  const orders = ids(
    await c.direct_orders
      .find({
        $or: [{ buyerId: { $in: users } }, { sellerId: { $in: users } }],
      })
      .toArray(),
  );
  const contexts = ids(
    await c.workflow_contexts.find({ orderId: { $in: orders } }).toArray(),
  );
  const commitments = ids(
    await c.exclusive_commitments
      .find({ currentContextId: { $in: contexts } })
      .toArray(),
  );
  const topups = ids(
    await c.topup_intents.find({ ownerId: { $in: users } }).toArray(),
  );
  const accounts = ids(
    await c.wallet_accounts
      .find({
        $or: [{ ownerId: { $in: users } }, { orderId: { $in: orders } }],
      })
      .toArray(),
  );
  const journals = ids(
    await c.ledger_journals
      .find({
        $or: [{ topupId: { $in: topups } }, { orderId: { $in: orders } }],
      })
      .toArray(),
  );
  const history = {
    $or: [
      { actorId: { $in: users } },
      { contextId: { $in: contexts } },
      { topupId: { $in: topups } },
    ],
  };
  const audits = ids(await c.audit_events.find(history).toArray());
  await c.outbox_events.deleteMany({ auditId: { $in: audits } });
  await c.audit_events.deleteMany({ _id: { $in: audits } });
  await c.mutation_receipts.deleteMany(history);
  await c.ledger_entries.deleteMany({ journalId: { $in: journals } });
  await c.ledger_journals.deleteMany({ _id: { $in: journals } });
  await c.simulated_payment_events.deleteMany({ intentId: { $in: topups } });
  await c.topup_intents.deleteMany({ _id: { $in: topups } });
  await c.account_locks.deleteMany({ _id: { $in: accounts } });
  await c.wallet_accounts.deleteMany({ _id: { $in: accounts } });
  const byOrder = { orderId: { $in: orders } };
  await c.carrier_pickup_reviews.deleteMany(byOrder);
  await c.carrier_pickup_events.deleteMany(byOrder);
  await c.order_non_receipt_reports.deleteMany(byOrder);
  await c.order_delivery_reviews.deleteMany(byOrder);
  await c.shipment_packaging_evidence.deleteMany(byOrder);
  await c.direct_shipments.deleteMany(byOrder);
  await c.order_packaging_evidence.deleteMany(byOrder);
  await c.pickup_reviews.deleteMany(byOrder);
  await c.order_preparations.deleteMany({ _id: { $in: orders } });
  await c.commitment_events.deleteMany({ commitmentId: { $in: commitments } });
  await c.exclusive_commitments.deleteMany({ _id: { $in: commitments } });
  await c.agreement_snapshots.deleteMany({ _id: { $in: contexts } });
  await c.workflow_items.deleteMany({ contextId: { $in: contexts } });
  await c.workflow_contexts.deleteMany({ _id: { $in: contexts } });
  await c.direct_orders.deleteMany({ _id: { $in: orders } });
  await c.sale_quotes.deleteMany({
    $or: [{ buyerId: { $in: users } }, { sellerId: { $in: users } }],
  });
  const listings = ids(
    await c.listings.find({ ownerId: { $in: users } }).toArray(),
  );
  const revisions = ids(
    await c.listing_revisions.find({ listingId: { $in: listings } }).toArray(),
  );
  const media = ids(
    await c.listing_media.find({ listingId: { $in: listings } }).toArray(),
  );
  const books = ids(
    await c.catalog_books.find({ requesterId: { $in: users } }).toArray(),
  );
  const bookRevisions = ids(
    await c.catalog_revisions.find({ bookId: { $in: books } }).toArray(),
  );
  await c.listing_decisions.deleteMany({ revisionId: { $in: revisions } });
  await c.revision_media.deleteMany({ listingId: { $in: listings } });
  await c.media_processing_jobs.deleteMany({ mediaId: { $in: media } });
  await c.listing_media.deleteMany({ _id: { $in: media } });
  await c.listing_revisions.deleteMany({ _id: { $in: revisions } });
  await c.listings.deleteMany({ _id: { $in: listings } });
  await c.catalog_decisions.deleteMany({ revisionId: { $in: bookRevisions } });
  await c.catalog_revisions.deleteMany({ _id: { $in: bookRevisions } });
  await c.catalog_books.deleteMany({ _id: { $in: books } });
  await c.member_addresses.deleteMany({ ownerId: { $in: users } });
  await c.address_identities.deleteMany({ ownerId: { $in: users } });
  await c.address_books.deleteMany({ _id: { $in: users } });
  await db.removeUsers(users);
}
