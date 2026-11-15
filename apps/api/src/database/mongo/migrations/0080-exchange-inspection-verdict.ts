import type { Db } from 'mongodb';
import type { ExchangeDoc, MutationReceiptDoc } from '../documents.js';
import { t, type CollectionSpec } from '../schema-dsl.js';

export function withExchangeInspectionVerdict(spec: CollectionSpec): CollectionSpec {
  if (spec.name !== 'exchanges') return spec;
  return {
    ...spec,
    schema: {
      ...spec.schema,
      properties: {
        ...spec.schema.properties,
        resolutionDecision: t.nenum(
          'RefundBoth',
          'CompleteExchange',
          'CompensateInitiator',
          'CompensateRecipient',
        ),
      },
    },
  };
}

export function createExchangeInspectionVerdictMigration(previous: CollectionSpec) {
  const collections = [withExchangeInspectionVerdict(previous)];
  return {
    id: '0080-exchange-inspection-verdict',
    definition: { collections, backfill: 'inspectionCompensationDecisionFromReceiptV1' },
    async up(db: Db) {
      const { applyCollectionSpecs } = await import('./index.js');
      await applyCollectionSpecs(db, collections);
      const exchanges = db.collection<ExchangeDoc>('exchanges');
      const receipts = db.collection<MutationReceiptDoc>('mutation_receipts');
      const pending = {
        status: 'Cancelled' as const,
        resolutionDecision: null,
        'returnResolution.outcome': 'Compensated',
        'returnResolution.settlementReceiptId': { $type: 'string' as const },
      };
      for await (const row of exchanges.find(pending)) {
        const receipt = await receipts.findOne({
          _id: row.returnResolution!.settlementReceiptId!,
          operation: 'resolveExchangeDispute',
          resultVersion: row.revision,
        });
        const result = receipt?.result as { id?: string; resolutionDecision?: string } | undefined;
        const decision = result?.resolutionDecision;
        if (result?.id === row._id &&
          (decision === 'CompensateInitiator' || decision === 'CompensateRecipient')) {
          await exchanges.updateOne(
            { ...pending, _id: row._id, revision: row.revision },
            { $set: { resolutionDecision: decision } },
          );
        }
      }
    },
  };
}
