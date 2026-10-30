import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { bindCollections } from './database/mongo/collections.js';
import { titleKey } from './database/mongo/migrations/0003-catalog-title-key.js';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? ''))
  throw new Error('Seed requires NODE_ENV=development or test.');

if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required.');

const BOOKS_WITH_PREFERENCES = [
  // 3 cuốn sách MỚI của Nguyen Dai
  {
    ownerEmail: 'nguyendai@latlai.local',
    ownerName: 'Nguyen Dai',
    book: {
      title: 'Đại Gia Gatsby',
      authors: ['F. Scott Fitzgerald'],
      category: 'Văn học kinh điển',
      condition: 'LikeNew' as const,
      exchangeValue: 95000,
      salePrice: 105000,
      description: 'Kiệt tác văn học kinh điển về giấc mơ Mỹ xa hoa và bi kịch tình yêu thời kỳ Jazz.',
      exchangePreferences: {
        targetAuthor: 'Haruki Murakami',
        targetCategory: 'Văn học đương đại',
        targetDescription: 'Ưu tiên đổi lấy Rừng Na Uy hoặc Kafka bên bờ biển bản Nhã Nam',
      },
    },
  },
  {
    ownerEmail: 'nguyendai@latlai.local',
    ownerName: 'Nguyen Dai',
    book: {
      title: 'Tư Duy Nhanh Và Chậm',
      authors: ['Daniel Kahneman'],
      category: 'Tâm lý học',
      condition: 'Good' as const,
      exchangeValue: 180000,
      salePrice: 195000,
      description: 'Công trình kinh điển đạt giải Nobel kinh tế giải mã hai hệ thống tư duy của con người.',
      exchangePreferences: {
        targetAuthor: 'Yuval Noah Harari',
        targetCategory: 'Khoa học - Lịch sử',
        targetDescription: 'Muốn đổi Sapiens: Lược Sử Loài Người bản đẹp còn bìa áo',
      },
    },
  },
  {
    ownerEmail: 'nguyendai@latlai.local',
    ownerName: 'Nguyen Dai',
    book: {
      title: 'Chuyện Con Mèo Dạy Hải Âu Bay',
      authors: ['Luis Sepúlveda'],
      category: 'Văn học thiếu nhi',
      condition: 'LikeNew' as const,
      exchangeValue: 75000,
      salePrice: 80000,
      description: 'Câu chuyện ấm áp, nhân văn về lòng dũng cảm, tình bạn và lời hứa danh dự.',
      exchangePreferences: {
        targetAuthor: 'Nguyễn Nhật Ánh',
        targetCategory: 'Văn học tuổi thơ',
        targetDescription: 'Muốn đổi lấy cuốn Tôi Thấy Hoa Vàng Trên Cỏ Xanh hoặc Cho Tôi Xin Một Vé Đi Tuổi Thơ',
      },
    },
  },

  // 3 cuốn sách MỚI của Nguyen Tu
  {
    ownerEmail: 'nguyentu@latlai.local',
    ownerName: 'Nguyen Tu',
    book: {
      title: 'Biên Niên Ký Chim Vặn Dây Cót',
      authors: ['Haruki Murakami'],
      category: 'Văn học đương đại',
      condition: 'Good' as const,
      exchangeValue: 210000,
      salePrice: 225000,
      description: 'Tiểu thuyết đồ sộ của Murakami hòa quyện hiện thực kỳ ảo và hành trình đi tìm bản ngã.',
      exchangePreferences: {
        targetAuthor: 'Daniel Kahneman',
        targetCategory: 'Tâm lý học',
        targetDescription: 'Muốn đổi Tư Duy Nhanh Và Chậm hoặc sách tâm lý học kinh tế',
      },
    },
  },
  {
    ownerEmail: 'nguyentu@latlai.local',
    ownerName: 'Nguyen Tu',
    book: {
      title: 'Homo Deus: Lược Sử Tương Lai',
      authors: ['Yuval Noah Harari'],
      category: 'Khoa học - Lịch sử',
      condition: 'LikeNew' as const,
      exchangeValue: 195000,
      salePrice: 215000,
      description: 'Cuốn sách dự phóng tương lai loài người bước vào kỷ nguyên công nghệ sinh học và trí tuệ nhân tạo.',
      exchangePreferences: {
        targetAuthor: 'Tô Hoài',
        targetCategory: 'Văn học thiếu nhi',
        targetDescription: 'Muốn tìm Dế Mèn Phiêu Lưu Ký bản bìa cứng minh họa tranh màu',
      },
    },
  },
  {
    ownerEmail: 'nguyentu@latlai.local',
    ownerName: 'Nguyen Tu',
    book: {
      title: 'Hành Trình Về Phương Đông',
      authors: ['Baird T. Spalding'],
      category: 'Triết học phương Đông',
      condition: 'Good' as const,
      exchangeValue: 110000,
      salePrice: 120000,
      description: 'Cuộc thám hiểm khám phá minh triết tâm linh bí truyền của đoàn khoa học Hoàng gia Anh.',
      exchangePreferences: {
        targetAuthor: 'Paulo Coelho',
        targetCategory: 'Văn học thế giới',
        targetDescription: 'Tìm cuốn Nhà Giả Kim bản dịch mới của Nhã Nam',
      },
    },
  },
];

async function run() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db();
  const c = bindCollections(db);
  const now = new Date();

  console.log('=== BẮT ĐẦU ĐĂNG SÁCH MỚI VỚI TÍNH NĂNG TIÊU CHÍ TRAO ĐỔI (SMART MATCHMAKING) ===\n');

  for (const item of BOOKS_WITH_PREFERENCES) {
    const user = await c.users.findOne({ emailNormalized: item.ownerEmail });
    if (!user) {
      console.warn(`[CẢNH BÁO] Không tìm thấy user: ${item.ownerEmail}. Vui lòng chạy pnpm mongo:seed-exchange trước.`);
      continue;
    }
    const userId = user._id;

    // Tìm địa chỉ gửi sách mặc định của user
    const addr = await c.member_addresses.findOne({ ownerId: userId, isDefault: true });
    if (!addr) {
      console.warn(`[CẢNH BÁO] Không tìm thấy địa chỉ cho user: ${item.ownerEmail}`);
      continue;
    }

    const bookDef = item.book;

    // Kiểm tra xem đã có sách này với tiêu chí chưa
    const existingCatalogs = await c.catalog_revisions.find({ title: bookDef.title }).toArray();
    const existingBookIds = existingCatalogs.map((cat) => cat.bookId);

    if (existingBookIds.length > 0) {
      const matchingRevs = await c.listing_revisions.find({ bookId: { $in: existingBookIds } }).toArray();
      const listingIds = matchingRevs.map((r) => r.listingId);
      const existingListing = await c.listings.findOne({
        _id: { $in: listingIds },
        ownerId: userId,
        trade: 'Available',
      });

      if (existingListing) {
        // Cập nhật revision hiện tại với exchangePreferences nếu chưa có
        await c.listing_revisions.updateOne(
          { _id: existingListing.currentRevisionId },
          { $set: { exchangePreferences: bookDef.exchangePreferences } },
        );
        console.log(`[ĐÃ CẬP NHẬT] "${bookDef.title}" của ${item.ownerName}:`);
        console.log(`   + Tiêu chí: Tác giả="${bookDef.exchangePreferences.targetAuthor}" | Thể loại="${bookDef.exchangePreferences.targetCategory}"`);
        console.log(`   + Ghi chú: "${bookDef.exchangePreferences.targetDescription}"\n`);
        continue;
      }
    }

    const bookId = randomUUID();
    const catRevId = randomUUID();
    const listingId = randomUUID();
    const listRevId = randomUUID();
    const mediaId = randomUUID();

    // 1. Catalog Book & Revision
    await c.catalog_books.insertOne({
      _id: bookId,
      requesterId: userId,
      status: 'Confirmed',
      version: 1,
      currentRevisionId: catRevId,
      confirmedIsbn: null,
      searchText: `${bookDef.title} ${bookDef.authors.join(' ')} ${bookDef.category}`,
      titleKey: titleKey(bookDef.title),
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });

    await c.catalog_revisions.insertOne({
      _id: catRevId,
      bookId,
      number: 1,
      title: bookDef.title,
      authors: bookDef.authors,
      publisher: 'NXB Trẻ',
      publicationYear: 2023,
      language: 'vi',
      edition: 'Bản in mới',
      category: bookDef.category,
      categoryId: null,
      series: null,
      attributes: {},
      isbn: null,
      submittedAt: now,
    });

    await c.catalog_decisions.insertOne({
      _id: randomUUID(),
      revisionId: catRevId,
      reviewerId: userId,
      decision: 'Confirm',
      reason: null,
      decidedAt: now,
    });

    // 2. Listing Media
    await c.listing_media.insertOne({
      _id: mediaId,
      listingId,
      version: 1,
      status: 'Ready',
      stagingKey: `demo/${mediaId}`,
      pinnedKey: `demo/${mediaId}/input`,
      derivativeKey: `demo/${mediaId}/display.webp`,
      mimeType: 'image/jpeg',
      byteSize: 250000,
      sha256: '0'.repeat(64),
      width: 600,
      height: 800,
      failureCode: null,
      expiresAt: new Date(now.getTime() + 86400000 * 365),
      purgedAt: null,
      reservedBytes: 500000,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });

    // 3. Listing Revision với exchangePreferences
    await c.listing_revisions.insertOne({
      _id: listRevId,
      listingId,
      number: 1,
      bookId,
      mode: 'Both',
      condition: bookDef.condition,
      pages: 'Đầy đủ trang',
      coverNote: 'Bìa đẹp, sách giữ gìn cẩn thận',
      notes: 'Bản in chất lượng, không viết bẩn',
      accessories: 'Kèm bookmark minh họa',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description: bookDef.description,
      salePrice: bookDef.salePrice,
      exchangeValue: bookDef.exchangeValue,
      exchangePreferences: bookDef.exchangePreferences,
      submittedAt: now,
      ownershipDeclaredAt: now,
      createdAt: now,
      originAddressId: addr._id,
      originAddressVersion: addr.version,
      originServiceAreaCode: 'HCM-DEMO-v1',
      lockSeq: 0,
    });

    await c.revision_media.insertOne({
      _id: `${listRevId}:${mediaId}`,
      listingId,
      revisionId: listRevId,
      mediaId,
      position: 0,
    });

    await c.listing_decisions.insertOne({
      _id: randomUUID(),
      revisionId: listRevId,
      reviewerId: '9e13a8bd-7610-45d5-b19a-6085b37028f8',
      decision: 'Approve',
      checklist: {
        catalogMatches: true,
        photosClear: true,
        conditionDisclosed: true,
        readable: true,
        pricingValid: true,
        contentAppropriate: true,
      },
      reason: null,
      decidedAt: now,
    });

    // 4. Listing Document
    await c.listings.insertOne({
      _id: listingId,
      ownerId: userId,
      channel: 'Marketplace',
      version: 1,
      moderation: 'Approved',
      visibility: 'Visible',
      trade: 'Available',
      currentRevisionId: listRevId,
      removalReason: null,
      deletedAt: null,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });

    console.log(`[ĐÃ TẠO MỚI] Sách "${bookDef.title}" của ${item.ownerName}:`);
    console.log(`   + ID Tin đăng: ${listingId}`);
    console.log(`   + Giá trị đổi: ${bookDef.exchangeValue.toLocaleString('vi-VN')} đ`);
    console.log(`   + Tiêu chí đổi mong muốn:`);
    console.log(`     • Tác giả: ${bookDef.exchangePreferences.targetAuthor}`);
    console.log(`     • Thể loại: ${bookDef.exchangePreferences.targetCategory}`);
    console.log(`     • Ghi chú: "${bookDef.exchangePreferences.targetDescription}"\n`);
  }

  await client.close();
  console.log('=== HOÀN TẤT ĐĂNG TẢI DỮ LIỆU SÁCH CÓ TIÊU CHÍ TRAO ĐỔI ===');
}

run().catch((err) => {
  console.error('Lỗi khi seed sách:', err);
  if (err && typeof err === 'object' && 'errInfo' in err) {
    console.error('Validation errInfo:', JSON.stringify((err as any).errInfo, null, 2));
  }
  process.exit(1);
});
