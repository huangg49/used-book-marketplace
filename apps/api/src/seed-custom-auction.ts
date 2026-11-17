import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hash } from 'argon2';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import { MongoService } from './database/mongo/mongo.service.js';
import { titleKey } from './database/mongo/migrations/0003-catalog-title-key.js';
import { HANDOVER_POINT_A } from './database/mongo/migrations/auction-constants.js';
import { checkCatalog } from './modules/catalog/catalog.service.js';
import { checkListing } from './modules/listings/listing-projection.js';
import sharp from 'sharp';
import { MediaStorage, digest, inputKey, outputKey } from './modules/media/media-storage.js';

if (process.env.NODE_ENV !== 'development')
  throw new Error('Script runs only with NODE_ENV=development.');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set DEV_SEED_PASSWORD to at least 12 characters.');

const H = 3_600_000;
const STAFF_EMAIL = 'staff@latlai.local';
const OPERATOR_EMAIL = 'test_operator@latlai.local';
const SELLER_EMAIL = 'nguyentu@latlai.local';

const NEW_USERS = [
  { email: 'user1@latlai.local', displayName: 'Lê Văn An', phone: '0901111222' },
  { email: 'user2@latlai.local', displayName: 'Trần Thị Bình', phone: '0902222333' },
  { email: 'user3@latlai.local', displayName: 'Phạm Quốc Cường', phone: '0903333444' },
  { email: 'user4@latlai.local', displayName: 'Hoàng Thu Dung', phone: '0904444555' },
] as const;

const CHECKLIST = {
  catalogMatches: true,
  photosClear: true,
  conditionDisclosed: true,
  readable: true,
  pricingValid: true,
  contentAppropriate: true,
};

type Actor = { id: string; email: string; token: string; sessionId: string; displayName: string };
type Json = Record<string, unknown>;

const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
configureApp(app, { docs: false, logRequests: false });
await app.listen(0, '127.0.0.1');
const { port } = app.getHttpServer().address() as { port: number };
const base = `http://127.0.0.1:${port}/api/v1`;
const mongo = app.get(MongoService);
const c = mongo.c;
const sessions: string[] = [];

async function call(method: string, path: string, who: Actor | null, body?: Json) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(who ? { authorization: `Bearer ${who.token}` } : {}),
      ...(method === 'GET' ? {} : { 'idempotency-key': randomUUID() }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Json) : {};
  if (!res.ok)
    throw new Error(`${method} ${path} → ${res.status} ${String(data.code ?? '')} ${String(data.message ?? text)}`);
  return data;
}

async function ensureUser(email: string, name: string) {
  const now = new Date();
  await c.users.updateOne(
    { emailNormalized: email },
    {
      $setOnInsert: {
        _id: randomUUID(),
        emailNormalized: email,
        displayName: name,
        passwordHash: await hash(password!),
        status: 'ACTIVE',
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        roles: [{ role: 'MEMBER', grantedAt: now }],
        lockSeq: 0,
      },
    },
    { upsert: true },
  );
}

async function createActor(email: string, displayName = ''): Promise<Actor> {
  const user = await c.users.findOne({ emailNormalized: email });
  if (!user) throw new Error(`${email} is missing`);
  const sessionId = randomUUID();
  await c.auth_sessions.insertOne({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    expiresAt: new Date(Date.now() + 24 * H),
    revokedAt: null,
    createdAt: new Date(),
    lockSeq: 0,
  });
  sessions.push(sessionId);
  const token = await app.get(JwtService).signAsync({ sub: user._id, sid: sessionId });
  return { id: user._id, email, token, sessionId, displayName: user.displayName || displayName };
}

async function fundWallet(who: Actor, operator: Actor, target: number) {
  const wallet = await call('GET', '/me/wallet', who);
  const amount = target - Number(wallet.available ?? 0);
  if (amount < 1000) return;
  const intent = await call('POST', '/me/topups', who, { amount });
  await call('POST', '/operations/simulator/topup-events', operator, {
    eventId: randomUUID(),
    intentId: intent.entityId,
    recipientId: who.id,
    amount,
    currency: 'VND',
    outcome: 'Succeeded',
    occurredAt: new Date().toISOString(),
  });
}

async function ensureAddress(who: Actor, phone: string) {
  const book = (await call('GET', '/me/addresses', who)) as { items: Array<unknown> };
  if (book.items && book.items.length > 0) return;
  await call('POST', '/me/addresses', who, {
    expectedBookVersion: 0,
    address: {
      recipientName: who.displayName,
      phone,
      serviceAreaCode: 'HCM-DEMO-v1',
      localityCode: 'DEMO-A',
      detail: 'Số 123 Đường Lê Lợi, Bến Nghé, Quận 1, TP.HCM',
    },
    makeDefault: true,
  });
}

type Book = { title: string; author: string; publisher: string; year: number; value: number; condition: 'LikeNew' | 'Good' | 'Fair' };

function esc(x: string) {
  return x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function lines(text: string, max: number) {
  const out: string[] = [];
  for (const word of text.split(' ')) {
    const last = out[out.length - 1];
    if (last && (last + ' ' + word).length <= max) out[out.length - 1] = last + ' ' + word;
    else out.push(word);
  }
  return out;
}

function cover(book: Book) {
  const title = lines(book.title, 14);
  const top = 420 - (title.length - 1) * 34;
  const font = 'Segoe UI, Arial, sans-serif';
  const rows = title
    .map((l, i) => `<text x="410" y="${top + i * 68}" font-family="${font}" font-size="56" font-weight="700" fill="#f7ecd9" text-anchor="middle">${esc(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1050">
<rect width="800" height="1050" fill="#f3e6d3"/>
<rect x="158" y="98" width="500" height="760" rx="10" fill="#00000022"/>
<rect x="150" y="90" width="500" height="760" rx="10" fill="#5c1a1b"/>
<rect x="150" y="90" width="22" height="760" fill="#00000033"/>
<text x="410" y="170" font-family="${font}" font-size="22" letter-spacing="4" fill="#e8c98f" text-anchor="middle">LẬT LẠI · PHIÊN ĐẤU GIÁ MẪU</text>
<line x1="290" y1="${top - 80}" x2="530" y2="${top - 80}" stroke="#e8c98f" stroke-width="3"/>
${rows}
<text x="410" y="${top + title.length * 68 + 30}" font-family="${font}" font-size="34" fill="#e8c98f" text-anchor="middle">${esc(book.author)}</text>
<text x="410" y="800" font-family="${font}" font-size="24" fill="#f7ecd9" opacity="0.75" text-anchor="middle">${esc(`${book.publisher} · ${book.year}`)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

async function createAuctionListing(owner: Actor, staff: Actor, book: Book) {
  const bookId = randomUUID(), bookRevision = randomUUID();
  const listingId = randomUUID(), revision = randomUUID(), media = randomUUID();
  const bytes = await cover(book);
  await app.get(MediaStorage).put(outputKey(media, 1), bytes, 'image/webp');
  const now = new Date();
  await mongo.tx(async (tx) => {
    await tx.c.catalog_books.insertOne({
      _id: bookId,
      requesterId: owner.id,
      status: 'Confirmed',
      version: 2,
      currentRevisionId: null,
      confirmedIsbn: null,
      searchText: `${book.title} ${book.author}`.toLowerCase(),
      titleKey: titleKey(book.title),
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    await tx.c.catalog_revisions.insertOne({
      _id: bookRevision,
      bookId,
      number: 1,
      title: book.title,
      authors: [book.author],
      publisher: book.publisher,
      publicationYear: book.year,
      language: 'vi',
      edition: null,
      category: 'Văn học',
      isbn: null,
      submittedAt: now,
    });
    await tx.c.catalog_books.updateOne({ _id: bookId }, { $set: { currentRevisionId: bookRevision } });
    await tx.c.catalog_decisions.insertOne({
      _id: randomUUID(),
      revisionId: bookRevision,
      reviewerId: staff.id,
      decision: 'Confirm',
      reason: null,
      decidedAt: now,
    });
    await tx.c.listing_revisions.insertOne({
      _id: revision,
      listingId,
      number: 1,
      bookId,
      mode: 'Sale',
      condition: book.condition,
      pages: 'Đủ trang',
      coverNote: 'Bìa cứng mạ vàng, bản kỷ niệm nguyên vẹn',
      notes: 'Sách sưu tầm, giấy trắng đẹp không quăn mép',
      accessories: 'Bookmark kỷ niệm đính kèm',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description: `${book.title} - Tác phẩm đặc sắc của ${book.author}, do ${book.publisher} ấn hành năm ${book.year}. Bản in đẹp, tình trạng bảo quản hoàn hảo.`,
      salePrice: book.value,
      exchangeValue: null,
      submittedAt: now,
      ownershipDeclaredAt: now,
      createdAt: now,
      originAddressId: null,
      originAddressVersion: null,
      originServiceAreaCode: null,
      lockSeq: 0,
    });
    await tx.c.listing_media.insertOne({
      _id: media,
      listingId,
      version: 1,
      status: 'Ready',
      stagingKey: `unused/${media}`,
      pinnedKey: inputKey(media),
      derivativeKey: outputKey(media, 1),
      mimeType: 'image/webp',
      byteSize: bytes.length,
      sha256: digest(bytes),
      width: 800,
      height: 1050,
      failureCode: null,
      expiresAt: new Date(now.getTime() + 365 * 24 * H),
      purgedAt: null,
      reservedBytes: 0,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    await tx.c.revision_media.insertOne({
      _id: `${revision}:${media}`,
      listingId,
      revisionId: revision,
      mediaId: media,
      position: 0,
    });
    await tx.c.listings.insertOne({
      _id: listingId,
      ownerId: owner.id,
      channel: 'Auction',
      version: 2,
      moderation: 'PendingReview',
      visibility: 'Visible',
      trade: 'Available',
      currentRevisionId: revision,
      removalReason: null,
      deletedAt: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      lockSeq: 0,
    });
    tx.check(`catalog:${bookId}`, () => checkCatalog(tx, bookId));
    tx.check(`listing:${listingId}`, () => checkListing(tx, listingId));
  });

  await call('POST', `/operations/listings/${listingId}/decision`, staff, {
    expectedVersion: 2,
    revisionId: revision,
    decision: 'Approve',
    checklist: CHECKLIST,
  });
  const listing = (await c.listings.findOne({ _id: listingId }))!;
  return { id: listingId, version: listing.version };
}

try {
  console.log('=== 1. TẠO 4 TÀI KHOẢN MỚI TRONG DATABASE ===');
  for (const u of NEW_USERS) {
    await ensureUser(u.email, u.displayName);
    console.log(`✓ Đã tạo/chuẩn bị tài khoản: ${u.email} (${u.displayName})`);
  }

  const staff = await createActor(STAFF_EMAIL);
  const operator = await createActor(OPERATOR_EMAIL);
  const seller = await createActor(SELLER_EMAIL);

  const actors: Actor[] = [];
  for (const u of NEW_USERS) {
    const act = await createActor(u.email, u.displayName);
    actors.push(act);
    await fundWallet(act, operator, 3_000_000);
    await ensureAddress(act, u.phone);
    console.log(`✓ Nạp 3.000.000đ và thiết lập địa chỉ cho: ${u.displayName}`);
  }
  await fundWallet(seller, operator, 3_000_000);

  console.log('\n=== 2. MỞ 1 PHIÊN ĐẤU GIÁ TRỰC TIẾP (ACTIVE) ===');
  const book: Book = {
    title: 'Dế Mèn phiêu lưu ký',
    author: 'Tô Hoài',
    publisher: 'Kim Đồng',
    year: 2021,
    value: 150_000,
    condition: 'LikeNew',
  };

  const shelfCode = `DEMO-LIVE-${Date.now().toString().slice(-4)}`;
  const listing = await createAuctionListing(seller, staff, book);

  const intake = await call('POST', '/auction-intakes', seller, {
    listingId: listing.id,
    expectedListingVersion: listing.version,
    pointId: HANDOVER_POINT_A,
    declaredValue: book.value,
    startPrice: 100_000,
    step: 10_000,
    buyNowPrice: 500_000,
    buyNowMode: 'Challenge',
    auctionType: 'English',
    minBidders: 4,
  });
  const intakeId = intake.intakeId as string;

  await call('POST', `/operations/auction-intakes/${intakeId}/receive`, staff, {
    expectedVersion: 1,
    shelfCode,
  });
  await call('POST', `/operations/auction-intakes/${intakeId}/inspect`, staff, {
    expectedVersion: 2,
    outcome: 'Pass',
    note: 'Sách đẹp xuất sắc, đầy đủ trang, không rách nát, sẵn sàng mở đấu giá.',
  });

  const durationSeconds = 24 * 3600;
  const startAtIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await call('POST', `/auction-intakes/${intakeId}/publish`, seller, {
    expectedVersion: 3,
    startAt: startAtIso,
    durationSeconds,
  });

  let auction = (await c.auctions.findOne({ intakeId }))!;

  console.log(`✓ Đang đăng ký và đặt cọc 4 thành viên vào phiên...`);
  for (const r of actors) {
    await call('POST', `/auctions/${auction._id}/registration`, r, { deposit: auction.depositAmount });
  }

  // Cả 4 thành viên đã đặt cọc đủ! Di chuyển startAt và opensAt về 1 phút trước để phiên chính thức "Live":
  const nowLive = new Date(Date.now() - 60 * 1000);
  const endLive = new Date(nowLive.getTime() + durationSeconds * 1000);
  await c.auctions.updateOne(
    { _id: auction._id },
    {
      $set: {
        opensAt: nowLive,
        startAt: nowLive,
        biddingOpenedAt: nowLive,
        endAt: endLive,
        plannedEndAt: endLive,
      },
    },
  );
  auction = (await c.auctions.findOne({ intakeId }))!;

  // Đặt giá mở màn từ User 1:
  await call('POST', `/auctions/${auction._id}/bids`, actors[0], {
    amount: 100_000,
    fulfillmentMethod: 'SelfCollect',
  });
  console.log(`✓ ${actors[0].displayName} (${actors[0].email}) trả giá mở màn: 100.000đ`);

  // Đặt giá tiếp theo từ User 2:
  await call('POST', `/auctions/${auction._id}/bids`, actors[1], {
    amount: 110_000,
    fulfillmentMethod: 'SelfCollect',
  });
  console.log(`✓ ${actors[1].displayName} (${actors[1].email}) trả giá tiếp theo: 110.000đ (đang dẫn đầu)`);

  const pub = await call('GET', `/auctions/${auction._id}`, null);
  const summary = pub.auction as Json;

  console.log('\n======================================================');
  console.log('🎉 TẠO THÀNH CÔNG 4 ACCOUNT VÀ MỞ 1 PHIÊN ĐẤU GIÁ LIVE');
  console.log('======================================================');
  console.log(`\nPhiên đấu giá ID: ${auction._id}`);
  console.log(`Sách: ${book.title} - ${book.author} (${book.publisher})`);
  console.log(`Trạng thái: ${String(summary.state)} / ${String(summary.phase)}`);
  console.log(`Giá khởi điểm: 100.000đ · Bước giá: 10.000đ · Mua ngay: 500.000đ`);
  console.log(`Giá dẫn đầu hiện tại: ${(Number(summary.currentPrice)).toLocaleString('vi-VN')}đ (Người dẫn: ${actors[1].displayName})`);
  console.log(`Đường dẫn truy cập xem phiên đấu giá:`);
  console.log(`  http://localhost:5174/auctions/${auction._id}`);
  console.log('\nDanh sách 4 tài khoản mới tạo (Mật khẩu: LatLai-Local-2026!):');
  for (const u of NEW_USERS) {
    console.log(`  - Email: ${u.email} | Tên: ${u.displayName} | Số dư ví: ~2.980.000đ`);
  }
  console.log(`  Đăng nhập tại: http://localhost:5174/login`);
  console.log('======================================================\n');
} finally {
  await app.close();
}
