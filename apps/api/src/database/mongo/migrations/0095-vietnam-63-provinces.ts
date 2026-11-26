import type { Db, MongoClient } from 'mongodb';

// Complete 63 Vietnam provinces/cities for auction outbound delivery (Hybrid
// GHN Express live calculation + regional zone fallback). Preserves DEMO-A/B/C
// and migration 0094 codes untouched.
export const vietnam63DeliveryLocalities = [
  {
    "_id": "HCM-DEMO-v1:VN-HN",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-HN",
    "label": "Hà Nội"
  },
  {
    "_id": "HCM-DEMO-v1:DEMO-A",
    "areaCode": "HCM-DEMO-v1",
    "code": "DEMO-A",
    "label": "TP.HCM"
  },
  {
    "_id": "HCM-DEMO-v1:VN-DNG",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-DNG",
    "label": "Đà Nẵng"
  },
  {
    "_id": "HCM-DEMO-v1:VN-DN",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-DN",
    "label": "Đồng Nai"
  },
  {
    "_id": "HCM-DEMO-v1:DEMO-B",
    "areaCode": "HCM-DEMO-v1",
    "code": "DEMO-B",
    "label": "Bình Dương"
  },
  {
    "_id": "HCM-DEMO-v1:DEMO-C",
    "areaCode": "HCM-DEMO-v1",
    "code": "DEMO-C",
    "label": "Vũng Tàu"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P207",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P207",
    "label": "Gia Lai"
  },
  {
    "_id": "HCM-DEMO-v1:VN-KH",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-KH",
    "label": "Khánh Hòa"
  },
  {
    "_id": "HCM-DEMO-v1:VN-LD",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-LD",
    "label": "Lâm Đồng"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P210",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P210",
    "label": "Đắk Lắk"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P211",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P211",
    "label": "Long An"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P212",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P212",
    "label": "Tiền Giang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P213",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P213",
    "label": "Bến Tre"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P214",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P214",
    "label": "Trà Vinh"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P215",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P215",
    "label": "Vĩnh Long"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P216",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P216",
    "label": "Đồng Tháp"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P217",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P217",
    "label": "An Giang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P218",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P218",
    "label": "Sóc Trăng"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P219",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P219",
    "label": "Kiên Giang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-CT",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-CT",
    "label": "Cần Thơ"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P221",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P221",
    "label": "Vĩnh Phúc"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P223",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P223",
    "label": "Thừa Thiên Huế"
  },
  {
    "_id": "HCM-DEMO-v1:VN-HP",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-HP",
    "label": "Hải Phòng"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P225",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P225",
    "label": "Hải Dương"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P226",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P226",
    "label": "Thái Bình"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P227",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P227",
    "label": "Hà Giang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P228",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P228",
    "label": "Tuyên Quang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P229",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P229",
    "label": "Phú Thọ"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P230",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P230",
    "label": "Quảng Ninh"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P231",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P231",
    "label": "Nam Định"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P232",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P232",
    "label": "Hà Nam"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P233",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P233",
    "label": "Ninh Bình"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P234",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P234",
    "label": "Thanh Hóa"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P235",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P235",
    "label": "Nghệ An"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P236",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P236",
    "label": "Hà Tĩnh"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P237",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P237",
    "label": "Quảng Bình"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P238",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P238",
    "label": "Quảng Trị"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P239",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P239",
    "label": "Bình Phước"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P240",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P240",
    "label": "Tây Ninh"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P241",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P241",
    "label": "Đắk Nông"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P242",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P242",
    "label": "Quảng Ngãi"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P243",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P243",
    "label": "Quảng Nam"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P244",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P244",
    "label": "Thái Nguyên"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P245",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P245",
    "label": "Bắc Kạn"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P246",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P246",
    "label": "Cao Bằng"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P247",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P247",
    "label": "Lạng Sơn"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P248",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P248",
    "label": "Bắc Giang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P249",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P249",
    "label": "Bắc Ninh"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P250",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P250",
    "label": "Hậu Giang"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P252",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P252",
    "label": "Cà Mau"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P253",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P253",
    "label": "Bạc Liêu"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P258",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P258",
    "label": "Bình Thuận"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P259",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P259",
    "label": "Kon Tum"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P260",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P260",
    "label": "Phú Yên"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P261",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P261",
    "label": "Ninh Thuận"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P262",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P262",
    "label": "Bình Định"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P263",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P263",
    "label": "Yên Bái"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P264",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P264",
    "label": "Lai Châu"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P265",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P265",
    "label": "Điện Biên"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P266",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P266",
    "label": "Sơn La"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P267",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P267",
    "label": "Hòa Bình"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P268",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P268",
    "label": "Hưng Yên"
  },
  {
    "_id": "HCM-DEMO-v1:VN-P269",
    "areaCode": "HCM-DEMO-v1",
    "code": "VN-P269",
    "label": "Lào Cai"
  }
];

export const vietnam63ProvincesMigration = {
  id: '0095-vietnam-63-provinces',
  definition: { serviceLocalities: vietnam63DeliveryLocalities },
  async up(db: Db, client: MongoClient) {
    const session = client.startSession();
    try {
      await session.withTransaction(
        async () => {
          for (const { _id, ...content } of vietnam63DeliveryLocalities) {
            await db
              .collection<(typeof vietnam63DeliveryLocalities)[number]>(
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
