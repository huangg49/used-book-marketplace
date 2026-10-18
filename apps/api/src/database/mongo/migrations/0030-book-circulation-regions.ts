import type { Db, MongoClient } from 'mongodb';

// Operational zone names requested by the owner on 17/10/2026. Preserve opaque
// area/locality keys already referenced by addresses, listing origins and orders.
export const bookCirculationRegions = [
  {
    _id: 'HCM-DEMO-v1:DEMO-A',
    areaCode: 'HCM-DEMO-v1',
    code: 'DEMO-A',
    label: 'TP.HCM',
  },
  {
    _id: 'HCM-DEMO-v1:DEMO-B',
    areaCode: 'HCM-DEMO-v1',
    code: 'DEMO-B',
    label: 'Bình Dương',
  },
  {
    _id: 'HCM-DEMO-v1:DEMO-C',
    areaCode: 'HCM-DEMO-v1',
    code: 'DEMO-C',
    label: 'Vũng Tàu',
  },
];

export const bookCirculationRegionsMigration = {
  id: '0030-book-circulation-regions',
  definition: { serviceLocalities: bookCirculationRegions },
  async up(db: Db, client: MongoClient) {
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          for (const { _id, ...content } of bookCirculationRegions) {
            await db
              .collection<(typeof bookCirculationRegions)[number]>(
                'service_localities',
              )
              .updateOne({ _id }, { $set: content }, { upsert: true, session });
          }
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
      );
    } finally {
      await session.endSession();
    }
  },
};
