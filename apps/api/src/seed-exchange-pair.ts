import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { MongoService } from './database/mongo/mongo.service.js';
import { titleKey } from './database/mongo/migrations/0003-catalog-title-key.js';
import { recoveryKeys } from './common/catalog-recovery-keys.js';
import sharp from 'sharp';
import { MediaStorage, digest, outputKey } from './modules/media/media-storage.js';

if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) {
  throw new Error('Script requires NODE_ENV=development or test.');
}

const password = process.env.DEV_SEED_PASSWORD || 'LatLai-Local-2026!';

const USERS = [
  {
    email: 'reader1@latlai.local',
    displayName: 'Đặng Hoàng Nam',
    phone: '0901234111',
    address: {
      recipientName: 'Đặng Hoàng Nam',
      phone: '0901234111',
      localityCode: 'DEMO-A',
      detail: '123 Nguyễn Huệ, Phường Bến Nghé, Quận 1',
    },
    books: [
      {
        title: 'Hoàng Tử Bé',
        authors: ['Antoine de Saint-Exupéry'],
        category: 'Văn học kinh điển',
        condition: 'LikeNew' as const,
        exchangeValue: 75000,
        salePrice: 80000,
        color: '#2C3E50',
        description: 'Tác phẩm văn học kinh điển về tình yêu thương, bài học cuộc sống và chú cáo nhỏ.',
        preferences: {
          targetAuthor: 'Nguyễn Nhật Ánh',
          targetCategory: 'Văn học thiếu nhi',
          targetDescription: 'Ưu tiên đổi lấy Tôi Thấy Hoa Vàng Trên Cỏ Xanh hoặc Mắt Biếc',
        },
      },
      {
        title: 'Cây Cam Ngọt Của Tôi',
        authors: ['José Mauro de Vasconcelos'],
        category: 'Văn học thế giới',
        condition: 'LikeNew' as const,
        exchangeValue: 90000,
        salePrice: 95000,
        color: '#E67E22',
        description: 'Câu chuyện lay động trái tim về cậu bé Zezé thông minh, giàu trí tưởng tượng nhưng thiếu thốn tình thương.',
        preferences: {
          targetAuthor: 'Kore-eda Hirokazu',
          targetCategory: 'Văn học Nhật Bản',
          targetDescription: 'Muốn đổi lấy Gia Đình Trộm Cắp hoặc tiểu thuyết Nhật Bản bản đẹp',
        },
      },
      {
        title: 'Mắt Biếc',
        authors: ['Nguyễn Nhật Ánh'],
        category: 'Văn học thanh xuân',
        condition: 'Good' as const,
        exchangeValue: 110000,
        salePrice: 115000,
        color: '#27AE60',
        description: 'Tình yêu trong veo nhưng man mác buồn của Ngạn dành cho Hà Lan dưới bóng cây bàng làng Đo Đo.',
        preferences: {
          targetAuthor: 'Andrea Hirata',
          targetCategory: 'Văn học truyền cảm hứng',
          targetDescription: 'Muốn đổi lấy Chiến Binh Cầu Vồng tình trạng LikeNew',
        },
      },
      {
        title: 'Nhà Giả Kim',
        authors: ['Paulo Coelho'],
        category: 'Văn học triết lý',
        condition: 'LikeNew' as const,
        exchangeValue: 85000,
        salePrice: 90000,
        color: '#D4AF37',
        description: 'Hành trình vượt sa mạc Sahara tìm kho báu và lắng nghe tiếng gọi số phận của chàng chăn cừu Santiago.',
        preferences: {
          targetAuthor: 'Dale Carnegie',
          targetCategory: 'Kỹ năng sống',
          targetDescription: 'Ưu tiên đổi lấy Đắc Nhân Tâm bản bìa cứng hoặc kỹ năng kinh điển',
        },
      },
      {
        title: 'Số Đỏ',
        authors: ['Vũ Trọng Phụng'],
        category: 'Văn học hiện thực',
        condition: 'Good' as const,
        exchangeValue: 80000,
        salePrice: 85000,
        color: '#C0392B',
        description: 'Kiệt tác trào phúng đỉnh cao của văn học Việt Nam với nhân vật điển hình Xuân Tóc Đỏ.',
        preferences: {
          targetAuthor: 'Hector Malot',
          targetCategory: 'Văn học thế giới',
          targetDescription: 'Muốn đổi lấy Không Gia Đình để đọc lại',
        },
      },
    ],
  },
  {
    email: 'reader2@latlai.local',
    displayName: 'Trần Minh Thư',
    phone: '0909876222',
    address: {
      recipientName: 'Trần Minh Thư',
      phone: '0909876222',
      localityCode: 'DEMO-B',
      detail: '456 Lê Văn Sỹ, Phường 14, Quận 3',
    },
    books: [
      {
        title: 'Tôi Thấy Hoa Vàng Trên Cỏ Xanh',
        authors: ['Nguyễn Nhật Ánh'],
        category: 'Văn học thanh xuân',
        condition: 'LikeNew' as const,
        exchangeValue: 95000,
        salePrice: 100000,
        color: '#F39C12',
        description: 'Những mảnh ghép tuổi thơ nghèo khó mà êm đềm ở làng quê với anh em Thiều và Tường.',
        preferences: {
          targetAuthor: 'Antoine de Saint-Exupéry',
          targetCategory: 'Văn học kinh điển',
          targetDescription: 'Muốn tìm cuốn Hoàng Tử Bé bìa đẹp về làm quà tặng',
        },
      },
      {
        title: 'Chiến Binh Cầu Vồng',
        authors: ['Andrea Hirata'],
        category: 'Văn học truyền cảm hứng',
        condition: 'LikeNew' as const,
        exchangeValue: 105000,
        salePrice: 110000,
        color: '#3498DB',
        description: 'Tác phẩm lay động hàng triệu trái tim về nghị lực phi thường của thầy cô và 10 học trò trường làng đảo Belitong.',
        preferences: {
          targetAuthor: 'Nguyễn Nhật Ánh',
          targetCategory: 'Văn học Việt Nam',
          targetDescription: 'Rất muốn đổi lấy Mắt Biếc hoặc truyện dài Nguyễn Nhật Ánh',
        },
      },
      {
        title: 'Đắc Nhân Tâm',
        authors: ['Dale Carnegie'],
        category: 'Kỹ năng sống',
        condition: 'LikeNew' as const,
        exchangeValue: 95000,
        salePrice: 100000,
        color: '#8E44AD',
        description: 'Cẩm nang nghệ thuật thu phục lòng người, tạo dựng mối quan hệ và đối nhân xử thế xuất sắc.',
        preferences: {
          targetAuthor: 'Paulo Coelho',
          targetCategory: 'Văn học triết lý',
          targetDescription: 'Đang tìm cuốn Nhà Giả Kim để đọc',
        },
      },
      {
        title: 'Không Gia Đình',
        authors: ['Hector Malot'],
        category: 'Văn học kinh điển',
        condition: 'LikeNew' as const,
        exchangeValue: 120000,
        salePrice: 130000,
        color: '#16A085',
        description: 'Hành trình lưu lạc đầy chông gai nhưng ấm áp tình người của cậu bé Rémi và gánh xiếc cụ Vitalis.',
        preferences: {
          targetAuthor: 'Vũ Trọng Phụng',
          targetCategory: 'Văn học hiện thực',
          targetDescription: 'Đổi lấy Số Đỏ hoặc tiểu thuyết văn học Việt Nam',
        },
      },
      {
        title: 'Gia Đình Trộm Cắp',
        authors: ['Kore-eda Hirokazu'],
        category: 'Văn học Nhật Bản',
        condition: 'LikeNew' as const,
        exchangeValue: 85000,
        salePrice: 90000,
        color: '#7F8C8D',
        description: 'Tiểu thuyết chuyển thể từ bộ phim đoạt giải Cành cọ vàng, câu hỏi day dứt về ý nghĩa thực sự của gia đình.',
        preferences: {
          targetAuthor: 'José Mauro de Vasconcelos',
          targetCategory: 'Văn học thế giới',
          targetDescription: 'Ưu tiên đổi lấy Cây Cam Ngọt Của Tôi',
        },
      },
    ],
  },
];

export const BOOK_COVERS: Record<string, string> = {
  'Hoàng Tử Bé': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/57/58/f7/1256dcaf0f6cfe797ea923f21896305b.jpg',
  'Cây Cam Ngọt Của Tôi': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/5e/18/24/2a6154ba08df6ce6161c13f4303fa19e.jpg',
  'Mắt Biếc': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/10/d1/35/b2098bf8884bb8a5fbcd42a978a6b601.jpg',
  'Nhà Giả Kim': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/45/3b/fc/aa81d0a534b45706ae1eee1e344e80d9.jpg',
  'Số Đỏ': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/6a/14/f8/efe8171950a0fbe2c5a1b5f4d6ff8744.jpg',
  'Tôi Thấy Hoa Vàng Trên Cỏ Xanh': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/d5/56/6b/506b4f5baeed19a459dce7cea095787e.jpg',
  'Chiến Binh Cầu Vồng': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/70/63/3d/c57040b46e074d49d9e2af573ecefd4e.jpg',
  'Đắc Nhân Tâm': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/db/09/a5/4892e37b77ddf3b9883e489a2151e7bf.jpg',
  'Không Gia Đình': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/18/0f/10/d88b72c75541b04821713543e340d055.jpg',
  'Gia Đình Trộm Cắp': 'https://salt.tikicdn.com/cache/750x750/ts/product/18/f8/9a/9d6ea11214401bc136b684ce8e12cfa4.jpg',
  'Dế Mèn Phiêu Lưu Ký': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/47/54/8e/30bac752bcca2beb34a3522990805aa1.jpg',
  'Tuổi Trẻ Đáng Giá Bao Nhiêu': 'https://salt.tikicdn.com/cache/750x750/ts/product/56/ce/23/64b2eaa5b859d8ba1412f1b350c3e128.jpg',
  'Hành Trình Về Phương Đông': 'https://salt.tikicdn.com/cache/750x750/media/catalog/product/product/da/23/c2/ed5eff6b06b244b942184c88d6d65b20.jpg',
  'Tư Duy Nhanh Và Chậm': 'https://salt.tikicdn.com/cache/750x750/ts/product/d2/5a/00/479b787ba33d3933c0619ea2441e2a7d.png',
  'Biên Niên Ký Chim Vặn Dây Cót': 'https://salt.tikicdn.com/cache/750x750/ts/product/70/d5/57/86a39f54565770a8a98fba90769633fc.jpg'
};

async function generateCover(title: string, author: string, color: string, coverUrl?: string): Promise<Buffer> {
  const targetUrl = coverUrl || BOOK_COVERS[title];
  if (targetUrl) {
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return await sharp(buf).resize(600, 800, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
      }
    } catch (e) {
      console.warn(`! Không tải được ảnh online cho "${title}", fallback SVG:`, (e as Error).message);
    }
  }

  const svg = `<svg width="600" height="800" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="${color}"/>
    <rect x="25" y="25" width="550" height="750" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-opacity="0.4"/>
    <rect x="35" y="35" width="530" height="730" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.2"/>
    <text x="300" y="280" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${title}</text>
    <text x="300" y="350" font-family="Arial, sans-serif" font-size="20" fill="#EAEAEA" text-anchor="middle">${author}</text>
    <text x="300" y="700" font-family="Arial, sans-serif" font-size="14" fill="#EAEAEA" text-anchor="middle" letter-spacing="3">LẬT LẠI · TỦ SÁCH TRAO ĐỔI</text>
  </svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
}

async function run() {
  console.log('🚀 Khởi tạo context NestJS...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const mongo = app.get(MongoService);
  const storage = app.get(MediaStorage);
  const c = mongo.c;
  const passwordHash = await hash(password);
  const now = new Date();

  console.log('📦 Bắt đầu tạo 2 tài khoản và 10 cuốn sách trao đổi...');

  const createdUserIds: string[] = [];

  for (const userDef of USERS) {
    const emailNormalized = userDef.email.toLowerCase();
    let user = await c.users.findOne({ emailNormalized });

    let userId: string;
    if (!user) {
      userId = randomUUID();
      await c.users.insertOne({
        _id: userId,
        emailNormalized,
        displayName: userDef.displayName,
        passwordHash,
        roles: [{ role: 'MEMBER', grantedAt: now }],
        status: 'ACTIVE',
        emailVerifiedAt: now,
        lockSeq: 0,
        createdAt: now,
        updatedAt: now,
      });
      console.log(`✅ Đã tạo user mới: ${userDef.email} (${userDef.displayName})`);
    } else {
      userId = user._id;
      console.log(`ℹ️ User đã tồn tại: ${userDef.email} (${userDef.displayName})`);
    }
    createdUserIds.push(userId);

    // Địa chỉ nhận hàng
    let addr = await c.member_addresses.findOne({ ownerId: userId });
    if (!addr) {
      const addrId = randomUUID();
      await c.member_addresses.insertOne({
        _id: addrId,
        ownerId: userId,
        recipientName: userDef.address.recipientName,
        phone: userDef.address.phone,
        serviceAreaCode: 'HCM-DEMO-v1',
        localityCode: userDef.address.localityCode,
        detail: userDef.address.detail,
        isDefault: true,
        version: 1,
        createdAt: now,
      });
      await c.address_identities.insertOne({
        _id: addrId,
        ownerId: userId,
      });
      addr = await c.member_addresses.findOne({ _id: addrId });
      console.log(`  + Đã thêm địa chỉ giao nhận: ${userDef.address.detail}`);
    }

    // 5 Sách của tài khoản
    for (const bookDef of userDef.books) {
      // Kiểm tra sách đã tồn tại chưa
      const existingCatalog = await c.catalog_revisions.findOne({ title: bookDef.title });
      if (existingCatalog) {
        const matchingRevs = await c.listing_revisions.find({ bookId: existingCatalog.bookId }).toArray();
        const existingListing = await c.listings.findOne({
          _id: { $in: matchingRevs.map(r => r.listingId) },
          ownerId: userId,
          trade: 'Available',
        });
        if (existingListing) {
          console.log(`  * Đã có sách: "${bookDef.title}" - Đang cập nhật ảnh bìa thực tế...`);
          const media = await c.listing_media.findOne({ listingId: existingListing._id });
          if (media && media.derivativeKey) {
            const coverBytes = await generateCover(bookDef.title, bookDef.authors[0], bookDef.color);
            await storage.remove([media.derivativeKey]).catch(() => null);
            await storage.put(media.derivativeKey, coverBytes, 'image/webp');
            await c.listing_media.updateOne(
              { _id: media._id },
              { $set: { byteSize: coverBytes.length, sha256: digest(coverBytes), mimeType: 'image/webp' } }
            );
            console.log(`    -> Đã cập nhật ảnh bìa thực tế cho "${bookDef.title}"`);
          }
          continue;
        }
      }

      const bookId = randomUUID();
      const catRevId = randomUUID();
      const listingId = randomUUID();
      const listRevId = randomUUID();
      const mediaId = randomUUID();

      // Bìa ảnh thực tế upload vào Supabase
      const coverBytes = await generateCover(bookDef.title, bookDef.authors[0], bookDef.color);
      const derivativeKey = outputKey(mediaId, 1);
      await storage.put(derivativeKey, coverBytes, 'image/webp');

      // Catalog book
      await c.catalog_books.insertOne({
        _id: bookId,
        requesterId: userId,
        status: 'Confirmed',
        version: 1,
        currentRevisionId: catRevId,
        confirmedIsbn: null,
        searchText: `${bookDef.title} ${bookDef.authors.join(' ')} ${bookDef.category}`,
        titleKey: titleKey(bookDef.title),
        recoveryKeys: recoveryKeys(bookDef.title, bookDef.authors),
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

      // Listing media
      await c.listing_media.insertOne({
        _id: mediaId,
        listingId,
        version: 1,
        status: 'Ready',
        stagingKey: `demo/${mediaId}`,
        pinnedKey: `demo/${mediaId}/input`,
        derivativeKey,
        mimeType: 'image/webp',
        byteSize: coverBytes.length,
        sha256: digest(coverBytes),
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

      // Listing revision
      await c.listing_revisions.insertOne({
        _id: listRevId,
        listingId,
        number: 1,
        bookId,
        mode: 'Both',
        condition: bookDef.condition,
        pages: 'Đầy đủ trang',
        coverNote: 'Bìa đẹp, sách giữ gìn cẩn thận',
        notes: 'Không rách nát, giấy sạch đẹp',
        accessories: 'Kèm bookmark kỷ niệm',
        readable: true,
        hasMissingPages: false,
        missingEssentialContent: false,
        description: bookDef.description,
        salePrice: bookDef.salePrice,
        exchangeValue: bookDef.exchangeValue,
        exchangePreferences: bookDef.preferences,
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

      // Listing
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

      console.log(`  + Đã xuất bản sách: "${bookDef.title}" (Giá trị đổi: ${bookDef.exchangeValue.toLocaleString('vi-VN')} đ)`);
    }
  }

  await app.close();

  // Nạp tiền mô phỏng 2.000.000 đ cho 2 tài khoản qua HTTP API
  console.log('💳 Nạp 2.000.000 đ vào ví cho 2 tài khoản...');
  try {
    const loginRes = await fetch('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test_operator@latlai.local', password }),
    });
    if (loginRes.ok) {
      const loginData = (await loginRes.json()) as { accessToken: string };
      for (const uid of createdUserIds) {
        await fetch('http://localhost:3000/api/v1/operations/simulator/topup-events', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${loginData.accessToken}`,
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            eventId: randomUUID(),
            recipientId: uid,
            amount: 2_000_000,
            occurredAt: new Date().toISOString(),
          }),
        });
      }
      console.log('✅ Đã nạp thành công 2.000.000 đ qua API.');
    }
  } catch (e) {
    console.warn('⚠️ Nạp tiền qua API gặp lỗi, bỏ qua:', e);
  }

  console.log('\n🎉 Hoàn tất chuẩn bị 2 tài khoản và 10 cuốn sách trao đổi!');
}

run().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
