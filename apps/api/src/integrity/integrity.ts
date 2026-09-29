import type { Tx } from '../database/mongo/transaction.js';
import { checkAddressBook } from '../modules/addresses/addresses.service.js';
import { checkCatalog } from '../modules/catalog/catalog.service.js';
import { checkListing } from '../modules/listings/listing-projection.js';
import {
  checkOrder,
  checkPackaging,
  checkShipment,
} from '../modules/orders/order-invariants.js';
import {
  checkJournal,
  checkTopupRecord,
  LedgerService,
} from '../modules/wallet/ledger.service.js';

// Whole-database run of every commit-time invariant (MIG02_MODEL_MAP, C) in
// one snapshot. Commands only check the aggregates they touch; a privileged
// write that bypassed the executor is found here. The equivalent of the
// `SELECT latlai_check_*(id)` sweeps at the end of the PostgreSQL migrations.
export interface IntegrityReport {
  checked: Record<string, number>;
  failures: { aggregate: string; id: string; error: string }[];
  ledger: Awaited<ReturnType<LedgerService['reconcile']>> | null;
}

export async function checkIntegrity(
  tx: Tx,
  limitFailures = 50,
): Promise<IntegrityReport> {
  const report: IntegrityReport = { checked: {}, failures: [], ledger: null };
  const run = async (
    aggregate: string,
    ids: string[],
    check: (id: string) => Promise<void>,
  ) => {
    report.checked[aggregate] = ids.length;
    for (const id of ids) {
      if (report.failures.length >= limitFailures) return;
      try {
        await check(id);
      } catch (error) {
        report.failures.push({
          aggregate,
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
  const ids = async (name: string) =>
    (
      await tx.db
        .collection<{ _id: string }>(name)
        .find({}, { session: tx.session, projection: { _id: 1 } })
        .toArray()
    ).map((d) => d._id);
  await run('catalog', await ids('catalog_books'), (id) =>
    checkCatalog(tx, id),
  );
  await run('listing', await ids('listings'), (id) => checkListing(tx, id));
  const owners = new Set([
    ...(await ids('address_books')),
    ...(
      await tx.c.member_addresses
        .find({}, { projection: { ownerId: 1 } })
        .toArray()
    ).map((a) => a.ownerId),
  ]);
  await run('addressBook', [...owners], (id) => checkAddressBook(tx, id));
  await run('journal', await ids('ledger_journals'), (id) =>
    checkJournal(tx, id),
  );
  await run('topup', await ids('topup_intents'), (id) =>
    checkTopupRecord(tx, id),
  );
  await run('order', await ids('direct_orders'), (id) => checkOrder(tx, id));
  await run('shipment', await ids('direct_shipments'), (id) =>
    checkShipment(tx, id),
  );
  await run('packaging', await ids('order_packaging_evidence'), (id) =>
    checkPackaging(tx, id),
  );
  try {
    report.ledger = await new LedgerService().reconcile(tx);
  } catch (error) {
    report.failures.push({
      aggregate: 'ledger',
      id: '*',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  // Nested checks registered by the functions above were already covered.
  tx.discardChecks();
  return report;
}
