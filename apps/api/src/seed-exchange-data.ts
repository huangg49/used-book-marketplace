import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { hash } from 'argon2';
import { bindCollections } from './database/mongo/collections.js';
import { CLEARING_ACCOUNT_ID } from './database/mongo/migrations/0002-reference-data.js';
import { titleKey } from './database/mongo/migrations/0003-catalog-title-key.js';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? ''))
  throw new Error('Seed requires NODE_ENV=development or test.');

const password = process.env.DEV_SEED_PASSWORD || 'LatLai-Local-2026!';
if (!process.env.MONGODB_URL) throw new Error('MONGODB_URL is required.');

const USERS = [
  {
    email: 'nguyendai@latlai.local',
    displayName: 'Nguyen Dai',
    address: {
      recipientName: 'Nguyen Dai',
      phone: '0901234567',
      localityCode: 'Q1',
      detail: '123 Nguyễn Huệ, P. Bến Nghé, Quận 1',
    },
    books: [
      {
        title: 'Dế Mèn Phiêu Lưu Ký',
        authors: ['Tô Hoài'],
        category: 'Văn học thiếu nhi',
        condition: 'LikeNew' as const,
        exchangeValue: 65000,
        salePrice: 70000,
        description: 'Tác phẩm văn học kinh điển của nhà văn Tô Hoài về tình bạn và tinh thần hiệp nghĩa.',
      },
      {
        title: 'Số Đỏ',
        authors: ['Vũ Trọng Phụng'],
        category: 'Văn học kinh điển',
        condition: 'Good' as const,
        exchangeValue: 80000,
        salePrice: 85000,
        description: 'Kiệt tác văn học trào phúng phản ánh xã hội đương thời qua nhân vật Xuân Tóc Đỏ.',
      },
      {
        title: 'Đắc Nhân Tâm',
        authors: ['Dale Carnegie'],
        category: 'Kỹ năng sống',
        condition: 'LikeNew' as const,
        exchangeValue: 95000,
        salePrice: 100000,
        description: 'Cuốn sách nghệ thuật thu phục lòng người bán chạy nhất mọi thời đại.',
      },
      {
        title: 'Nhà Giả Kim',
        authors: ['Paulo Coelho'],
        category: 'Văn học thế giới',
        condition: 'LikeNew' as const,
        exchangeValue: 85000,
        salePrice: 90000,
        description: 'Câu chuyện theo đuổi vận mệnh của chàng trai chăn cừu Santiago ở sa mạc Sahara.',
      },
      {
        title: 'Mắt Biếc',
        authors: ['Nguyễn Nhật Ánh'],
        category: 'Văn học thanh xuân',
        condition: 'Good' as const,
        exchangeValue: 110000,
        salePrice: 115000,
        description: 'Tình yêu trong veo của Ngạn dành cho Hà Lan dưới bóng cây bàng làng Đo Đo.',
      },
      {
        title: 'Tuổi Trẻ Đáng Giá Bao Nhiêu',
        authors: ['Rosie Nguyễn'],
        category: 'Phát triển bản thân',
        condition: 'LikeNew' as const,
        exchangeValue: 90000,
        salePrice: 95000,
        description: 'Kim chỉ nam truyền cảm hứng rèn luyện và đọc sách của tác giả Rosie Nguyễn.',
      },
      {
        title: 'Tội Ác Và Hình Phạt',
        authors: ['Fyodor Dostoevsky'],
        category: 'Kinh điển thế giới',
        condition: 'Good' as const,
        exchangeValue: 150000,
        salePrice: 160000,
        description: 'Tác phẩm đồ sộ khám phá chiều sâu tâm lý và sự sám hối của Raskolnikov.',
      },
    ],
  },
  {
    email: 'nguyentu@latlai.local',
    displayName: 'Nguyen Tu',
    address: {
      recipientName: 'Nguyen Tu',
      phone: '0909876543',
      localityCode: 'Q3',
      detail: '456 Lê Văn Sỹ, Phường 14, Quận 3',
    },
    books: [
      {
        title: 'Cho Tôi Xin Một Vé Đi Tuổi Thơ',
        authors: ['Nguyễn Nhật Ánh'],
        category: 'Văn học tuổi thơ',
        condition: 'LikeNew' as const,
        exchangeValue: 90000,
        salePrice: 95000,
        description: 'Chuyến tàu chở ký ức tuổi thơ hồn nhiên, đáng yêu với nhóm bạn Cu Mùi.',
      },
      {
        title: 'Rừng Na Uy',
        authors: ['Haruki Murakami'],
        category: 'Văn học đương đại',
        condition: 'Good' as const,
        exchangeValue: 120000,
        salePrice: 130000,
        description: 'Tác phẩm nổi tiếng thế giới của Murakami về tình yêu, sự cô đơn và trưởng thành.',
      },
      {
        title: 'Sapiens: Lược Sử Loài Người',
        authors: ['Yuval Noah Harari'],
        category: 'Khoa học - Lịch sử',
        condition: 'LikeNew' as const,
        exchangeValue: 195000,
        salePrice: 210000,
        description: 'Cuốn sách khai sáng lịch sử tiến hóa và sức mạnh hư cấu của loài người.',
      },
      {
        title: 'Tôi Thấy Hoa Vàng Trên Cỏ Xanh',
        authors: ['Nguyễn Nhật Ánh'],
        category: 'Văn học Việt Nam',
        condition: 'Good' as const,
        exchangeValue: 85000,
        salePrice: 90000,
        description: 'Bức tranh đồng quê mộc mạc và câu chuyện tình anh em Thiều - Tường cảm động.',
      },
      {
        title: 'Đi Tìm Lẽ Sống',
        authors: ['Viktor E. Frankl'],
        category: 'Tâm lý học',
        condition: 'LikeNew' as const,
        exchangeValue: 95000,
        salePrice: 100000,
        description: 'Liệu pháp ý nghĩa vượt qua nghịch cảnh từ trải nghiệm trại tập trung Auschwitz.',
      },
      {
        title: 'Hoàng Tử Bé',
        authors: ['Antoine de Saint-Exupéry'],
        category: 'Kinh điển thiếu nhi',
        condition: 'LikeNew' as const,
        exchangeValue: 75000,
        salePrice: 80000,
        description: 'Triết lý sâu sắc về tình bạn, tình yêu và trách nhiệm với đóa hoa hồng.',
      },
      {
        title: 'Bắt Trẻ Đồng Xanh',
        authors: ['J.D. Salinger'],
        category: 'Văn học nước ngoài',
        condition: 'Fair' as const,
        exchangeValue: 80000,
        salePrice: 85000,
        description: 'Tiếng nói của thanh thiếu niên nổi loạn và chân thật qua lăng kính Holden Caulfield.',
      },
    ],
  },
];

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URL!);
  await client.connect();
  const db = client.db();
  const c = bindCollections(db);
  const now = new Date();
  const passwordHash = await hash(password);

  console.log('--- Bắt đầu tạo dữ liệu test trao đổi sách ---');

  for (const userDef of USERS) {
    // 1. Ensure user
    let user = await c.users.findOne({ emailNormalized: userDef.email });
    if (!user) {
      const newUserId = randomUUID();
      await c.users.insertOne({
        _id: newUserId,
        emailNormalized: userDef.email,
        displayName: userDef.displayName,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        roles: [{ role: 'MEMBER', grantedAt: now }],
        lockSeq: 0,
      });
      user = await c.users.findOne({ _id: newUserId });
      console.log(`+ Đã tạo tài khoản: ${userDef.displayName} (${userDef.email})`);
    } else {
      console.log(`* Tài khoản đã tồn tại: ${userDef.displayName} (${userDef.email})`);
    }

    const userId = user!._id;

    // 2. Ensure Delivery Address
    let addr = await c.member_addresses.findOne({ ownerId: userId });
    if (!addr) {
      const addrId = randomUUID();
      await c.member_addresses.insertOne({
        _id: addrId,
        ownerId: userId,
        version: 1,
        recipientName: userDef.address.recipientName,
        phone: userDef.address.phone,
        serviceAreaCode: 'HCM-DEMO-v1',
        localityCode: userDef.address.localityCode,
        detail: userDef.address.detail,
        isDefault: true,
        createdAt: now,
      });
      await c.address_identities.insertOne({
        _id: addrId,
        ownerId: userId,
      });
      addr = await c.member_addresses.findOne({ _id: addrId });
      console.log(`  + Đã tạo sổ địa chỉ mặc định tại ${userDef.address.localityCode}`);
    } else {
      const idExists = await c.address_identities.findOne({ _id: addr._id });
      if (!idExists) {
        await c.address_identities.insertOne({
          _id: addr._id,
          ownerId: userId,
        });
      }
    }

    // 3. Ensure Wallet balance (>= 1,000,000 VND)
    let wallet = await c.wallet_accounts.findOne({ ownerId: userId, purpose: 'UserAvailable' });
    if (!wallet) {
      const walletId = randomUUID();
      await c.wallet_accounts.insertOne({
        _id: walletId,
        ownerId: userId,
        orderId: null,
        purpose: 'UserAvailable',
        currency: 'VND',
      });
      await c.account_locks.insertOne({
        _id: walletId,
        lockSeq: 0,
      });
      wallet = await c.wallet_accounts.findOne({ _id: walletId });
    }

    // Check balance
    const [balanceRow] = await c.ledger_entries
      .aggregate<{ amount: number }>([
        { $match: { accountId: wallet!._id } },
        { $group: { _id: null, amount: { $sum: { $subtract: ['$debit', '$credit'] } } } },
      ])
      .toArray();

    const currentBalance = balanceRow?.amount ?? 0;
    if (currentBalance < 500000) {
      const topupAmount = 2000000;
      const topupId = randomUUID();
      const eventId = randomUUID();
      const journalId = randomUUID();

      await c.topup_intents.insertOne({
        _id: topupId,
        ownerId: userId,
        amount: topupAmount,
        currency: 'VND',
        state: 'Succeeded',
        version: 1,
        createdAt: now,
        updatedAt: now,
        lockSeq: 0,
      });

      await c.simulated_payment_events.insertOne({
        _id: eventId,
        intentId: topupId,
        provider: 'LatLaiSimulator-v1',
        payloadHash: '0'.repeat(64),
        recipientId: userId,
        amount: topupAmount,
        currency: 'VND',
        outcome: 'Succeeded',
        disposition: 'Applied',
        occurredAt: now,
        receivedAt: now,
        receiptId: randomUUID(),
      });

      const counter = await c.counters.findOneAndUpdate(
        { _id: 'ledger_journal_sequence' },
        { $inc: { value: 1 } },
        { returnDocument: 'after' },
      );

      await c.ledger_journals.insertOne({
        _id: journalId,
        sequence: counter!.value,
        type: 'Topup',
        topupId,
        eventId,
        orderId: null,
        receiptId: null,
        postedAt: now,
      });

      await c.ledger_entries.insertMany([
        {
          _id: `${journalId}:${CLEARING_ACCOUNT_ID}`,
          journalId,
          accountId: CLEARING_ACCOUNT_ID,
          debit: 0,
          credit: topupAmount,
        },
        {
          _id: `${journalId}:${wallet!._id}`,
          journalId,
          accountId: wallet!._id,
          debit: topupAmount,
          credit: 0,
        },
      ]);
      console.log(`  + Đã nạp 2.000.000 đ vào ví mô phỏng cho ${userDef.displayName}`);
    } else {
      console.log(`  * Số dư ví hiện tại: ${currentBalance.toLocaleString('vi-VN')} đ (đã sẵn sàng)`);
    }

    // 4. Seed 7 distinct Books
    for (let i = 0; i < userDef.books.length; i++) {
      const bookDef = userDef.books[i];
      // Check if user already has an active listing with this title
      const existingCatalogs = await c.catalog_revisions
        .find({ title: bookDef.title })
        .toArray();
      const bookIds = existingCatalogs.map((cat) => cat.bookId);
      if (bookIds.length > 0) {
        const matchingRevs = await c.listing_revisions
          .find({ bookId: { $in: bookIds } })
          .toArray();
        const listingIds = matchingRevs.map((r) => r.listingId);
        const existingListing = await c.listings.findOne({
          _id: { $in: listingIds },
          ownerId: userId,
          trade: 'Available',
        });
        if (existingListing) {
          console.log(`  * Đã có sách: "${bookDef.title}" (${bookDef.exchangeValue.toLocaleString('vi-VN')} đ)`);
          continue;
        }
      }

      const bookId = randomUUID();
      const catRevId = randomUUID();
      const listingId = randomUUID();
      const listRevId = randomUUID();
      const mediaId = randomUUID();

      // 4a. Catalog Book & Revision
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
        publicationYear: 2022,
        language: 'vi',
        edition: 'Tái bản lần 1',
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

      // 4b. Listing Media
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

      // 4c. Listing Revision
      await c.listing_revisions.insertOne({
        _id: listRevId,
        listingId,
        number: 1,
        bookId,
        mode: 'Both',
        condition: bookDef.condition,
        pages: 'Đầy đủ trang',
        coverNote: 'Bìa đẹp, sách giữ gìn cẩn thận',
        notes: 'Không rách nát, không viết bẩn',
        accessories: 'Kèm bookmark',
        readable: true,
        hasMissingPages: false,
        missingEssentialContent: false,
        description: bookDef.description,
        salePrice: bookDef.salePrice,
        exchangeValue: bookDef.exchangeValue,
        submittedAt: now,
        ownershipDeclaredAt: now,
        createdAt: now,
        originAddressId: addr!._id,
        originAddressVersion: addr!.version,
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
        reviewerId: '9e13a8bd-7610-45d5-b19a-6085b37028f8', // Admin reviewer
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

      // 4d. Listing
      await c.listings.insertOne({
        _id: listingId,
        ownerId: userId,
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

      console.log(`  + Đã tạo sách: "${bookDef.title}" (${bookDef.exchangeValue.toLocaleString('vi-VN')} đ)`);
    }
  }

  console.log('\n--- Hoàn tất! Cả 2 tài khoản đã có sẵn sách và số dư để kiểm thử ngay lập tức ---');
  await client.close();
}

seed().catch((err) => {
  console.error('Lỗi khi seed sách:', err);
  process.exit(1);
});
