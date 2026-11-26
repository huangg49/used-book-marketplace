import type { Db, MongoClient } from 'mongodb';

// National destination provinces/cities for auction outbound delivery (Hybrid
// GHN live calculation + zone fallback). Preserves existing DEMO-A/B/C keys so
// existing addresses, listings, quotes and orders remain 100% compatible.
export const nationalDeliveryLocalities = [
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
  {
    _id: 'HCM-DEMO-v1:VN-DN',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-DN',
    label: 'Đồng Nai',
  },
  {
    _id: 'HCM-DEMO-v1:VN-CT',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-CT',
    label: 'Cần Thơ',
  },
  {
    _id: 'HCM-DEMO-v1:VN-LD',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-LD',
    label: 'Lâm Đồng',
  },
  {
    _id: 'HCM-DEMO-v1:VN-KH',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-KH',
    label: 'Khánh Hòa',
  },
  {
    _id: 'HCM-DEMO-v1:VN-DNG',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-DNG',
    label: 'Đà Nẵng',
  },
  {
    _id: 'HCM-DEMO-v1:VN-HN',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-HN',
    label: 'Hà Nội',
  },
  {
    _id: 'HCM-DEMO-v1:VN-HP',
    areaCode: 'HCM-DEMO-v1',
    code: 'VN-HP',
    label: 'Hải Phòng',
  },
];

export const auctionDeliveryProvincesMigration = {
  id: '0094-auction-delivery-provinces',
  definition: { serviceLocalities: nationalDeliveryLocalities },
  async up(db: Db, client: MongoClient) {
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          for (const { _id, ...content } of nationalDeliveryLocalities) {
            await db
              .collection<(typeof nationalDeliveryLocalities)[number]>(
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
