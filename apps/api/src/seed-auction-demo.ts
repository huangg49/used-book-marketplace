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
import { AuctionWorker } from './modules/auctions/auction-worker.service.js';
import sharp from 'sharp';
import { MediaStorage, digest, inputKey, outputKey } from './modules/media/media-storage.js';

// Local auction demo data (development only). Demo accounts are insert-if-
// absent with DEV_SEED_PASSWORD, like mongo-seed. Books and listings are
// written as fixtures with a generated cover (title and author) stored in the
// app's own media bucket under the media row's own key, so the media purge
// still owns it. Every auction step after that goes through the real
// API in this process: intake, Staff receive/inspect, listing approval,
// publish, simulator top-up, registration, bids, flag. Only the OnHold case
// locks its seller for one worker pass, as an Admin lock would.
//
//   pnpm db:seed-auctions   (nest build, then node dist/seed-auction-demo.js:
//   Nest needs the decorator metadata that tsx does not emit)
//
// `-- --refresh-covers` re-renders the covers of seeded demo listings.
// Run on a migrated local DB. A re-run skips auctions already seeded (found by
// their DEMO-Sn shelf code) and tops wallets up only to the target.
// A seller may have two unfinished auctions, so the demo uses several sellers.

if (process.env.NODE_ENV !== 'development')
  throw new Error('The auction demo seed runs only with NODE_ENV=development.');
const password = process.env.DEV_SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error('Set DEV_SEED_PASSWORD to at least 12 characters.');

const H = 3_600_000;
const TESTER = 'member@latlai.local';
const STAFF = 'staff@latlai.local';
const OPERATOR = 'test_operator@latlai.local';
const DEMO = {
  seller: ['seller.demo@latlai.local', 'Người bán thử'],
  seller2: ['seller.demo2@latlai.local', 'Người bán thử 2'],
  seller3: ['seller.demo3@latlai.local', 'Người bán thử 3'],
  holdSeller: ['seller.hold@latlai.local', 'Người bán bị tạm giữ'],
  bidders: 'abcdefgh'.split('').map((x) => [`bidder.${x}@latlai.local`, `Người trả giá ${x.toUpperCase()}`]),
} as const;
const CHECKLIST = {
  catalogMatches: true,
  photosClear: true,
  conditionDisclosed: true,
  readable: true,
  pricingValid: true,
  contentAppropriate: true,
};

type Actor = { id: string; email: string; token: string; sessionId: string };
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

async function account(email: string, name: string) {
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

// A short session for this run only; revoked at the end.
async function actor(email: string): Promise<Actor> {
  const user = await c.users.findOne({ emailNormalized: email });
  if (!user) throw new Error(`${email} is missing; run pnpm db:seed first.`);
  const sessionId = randomUUID();
  await c.auth_sessions.insertOne({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    expiresAt: new Date(Date.now() + 2 * H),
    revokedAt: null,
    createdAt: new Date(),
    lockSeq: 0,
  });
  sessions.push(sessionId);
  const token = await app.get(JwtService).signAsync({ sub: user._id, sid: sessionId });
  return { id: user._id, email, token, sessionId };
}

// Tops the wallet up to `amount` (a re-run after a failure adds nothing).
async function fund(who: Actor, operator: Actor, target: number) {
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

type Book = { title: string; author: string; publisher: string; year: number; value: number; condition: 'LikeNew' | 'Good' | 'Fair' };
const PALETTES = [
  ['#5c1a1b', '#f7ecd9', '#e8c98f'],
  ['#1f3d36', '#f2ead8', '#d9b46a'],
  ['#23324f', '#f1ece2', '#e0b36b'],
  ['#6b3a1f', '#fbf1df', '#f0c987'],
  ['#3d2a4f', '#f4ecdf', '#e3b977'],
] as const;
const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function lines(text: string, max: number) {
  const out: string[] = [];
  for (const word of text.split(' ')) {
    const last = out[out.length - 1];
    if (last && (last + ' ' + word).length <= max) out[out.length - 1] = last + ' ' + word;
    else out.push(word);
  }
  return out;
}
// A plain generated cover: the title and author, marked as sample data.
function cover(book: Book) {
  let n = 0;
  for (const ch of book.title) n = (n * 31 + ch.charCodeAt(0)) % 997;
  const [bg, ink, accent] = PALETTES[n % PALETTES.length]!;
  const title = lines(book.title, 14);
  const top = 420 - (title.length - 1) * 34;
  const font = 'Segoe UI, Arial, sans-serif';
  const rows = title
    .map((l, i) => `<text x="410" y="${top + i * 68}" font-family="${font}" font-size="56" font-weight="700" fill="${ink}" text-anchor="middle">${esc(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1050">
<rect width="800" height="1050" fill="#f3e6d3"/>
<rect x="158" y="98" width="500" height="760" rx="10" fill="#00000022"/>
<rect x="150" y="90" width="500" height="760" rx="10" fill="${bg}"/>
<rect x="150" y="90" width="22" height="760" fill="#00000033"/>
<text x="410" y="170" font-family="${font}" font-size="22" letter-spacing="4" fill="${accent}" text-anchor="middle">LẬT LẠI · DỮ LIỆU MẪU</text>
<line x1="290" y1="${top - 80}" x2="530" y2="${top - 80}" stroke="${accent}" stroke-width="3"/>
${rows}
<text x="410" y="${top + title.length * 68 + 30}" font-family="${font}" font-size="34" fill="${accent}" text-anchor="middle">${esc(book.author)}</text>
<text x="410" y="800" font-family="${font}" font-size="24" fill="${ink}" opacity="0.75" text-anchor="middle">${esc(`${book.publisher} · ${book.year}`)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
}

// Confirmed catalog book + pending Auction listing (fixture), then the real
// Staff approval through the API.
async function auctionListing(owner: Actor, staff: Actor, book: Book) {
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
      coverNote: 'Bìa còn tốt, gáy hơi sờn',
      notes: 'Sách dữ liệu mẫu để thử đấu giá',
      accessories: 'Không có',
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      description: `${book.title} của ${book.author}, bản ${book.publisher} ${book.year}. Dữ liệu mẫu để thử luồng đấu giá; ảnh bìa được tạo tự động.`,
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
    // The generated cover lives under this row's own derivative key.
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

// Re-renders the cover of every demo listing whose book is in `books`: the
// new file goes to the row's next derivative key (storage never overwrites),
// the row points at it, and the previous file is removed.
async function refreshCovers(books: Book[]) {
  const storage = app.get(MediaStorage);
  const owners = [TESTER, DEMO.seller[0], DEMO.seller2[0], DEMO.seller3[0], DEMO.holdSeller[0]];
  const demoSellers = (await c.users.find({ emailNormalized: { $in: owners } }).toArray()).map((u) => u._id);
  const listings = await c.listings.find({ ownerId: { $in: demoSellers }, channel: 'Auction', deletedAt: null }).toArray();
  let refreshed = 0;
  for (const l of listings) {
    const r = await c.listing_revisions.findOne({ _id: l.currentRevisionId! });
    const title = r?.bookId ? (await c.catalog_revisions.findOne({ bookId: r.bookId }))?.title : undefined;
    const book = books.find((b) => b.title === title);
    const link = r ? await c.revision_media.findOne({ revisionId: r._id, position: 0 }) : null;
    const m = link ? await c.listing_media.findOne({ _id: link.mediaId }) : null;
    if (!book || !m || !m.stagingKey.startsWith('unused/')) continue;
    const attempt = Number(/render-(\d)\.webp$/.exec(m.derivativeKey ?? '')?.[1] ?? 0) + 1;
    if (attempt > 3) continue;
    const bytes = await cover(book);
    await storage.put(outputKey(m._id, attempt), bytes, 'image/webp');
    await c.listing_media.updateOne(
      { _id: m._id, derivativeKey: m.derivativeKey },
      {
        $set: { derivativeKey: outputKey(m._id, attempt), mimeType: 'image/webp', width: 800, height: 1050, byteSize: bytes.length, sha256: digest(bytes), updatedAt: new Date() },
        $inc: { lockSeq: 1 },
      },
    );
    if (m.derivativeKey) await storage.remove([m.derivativeKey]);
    refreshed++;
  }
  console.log(`Refreshed ${refreshed} demo cover(s).`);
}

type Scenario = {
  key: string;
  seller: Actor;
  book: Book;
  intake: Json;
  publish: { startAt: string | null; durationSeconds: number };
  registrants: Actor[];
  then?: (auctionId: string) => Promise<void>;
  test: string;
};

const results: { key: string; title: string; auctionId: string; state: string; test: string }[] = [];

try {
  for (const [email, name] of [DEMO.seller, DEMO.seller2, DEMO.seller3, DEMO.holdSeller, ...DEMO.bidders])
    await account(email, name);

  const tester = await actor(TESTER);
  const staff = await actor(STAFF);
  const operator = await actor(OPERATOR);
  const seller = await actor(DEMO.seller[0]);
  const seller2 = await actor(DEMO.seller2[0]);
  const seller3 = await actor(DEMO.seller3[0]);
  const holdSeller = await actor(DEMO.holdSeller[0]);
  const [a, b, cc, d, e, f, g, h] = await Promise.all(DEMO.bidders.map(([email]) => actor(email)));
  if (!(await c.point_staff_assignments.findOne({ userId: staff.id, pointId: HANDOVER_POINT_A, validTo: null })))
    throw new Error(`${STAFF} has no assignment at point A; run pnpm db:seed first.`);

  for (const m of [tester, a, b, cc, d, e, f, g, h]) await fund(m, operator, 3_000_000);
  console.log('Topped up the tester and 8 demo bidders to 3.000.000đ each (simulator).');

  const english = (start: number, buyNow: number | null) => ({ startPrice: start, step: 10_000, buyNowPrice: buyNow, buyNowMode: 'Challenge', auctionType: 'English' });
  const inHours = (n: number) => new Date(Date.now() + n * H).toISOString();
  const bid = (id: string, who: Actor, amount: number) =>
    call('POST', `/auctions/${id}/bids`, who, { amount, fulfillmentMethod: 'SelfCollect' });

  const scenarios: Scenario[] = [
    {
      key: 'S1', seller, registrants: [a, b],
      book: { title: 'Dế Mèn phiêu lưu ký', author: 'Tô Hoài', publisher: 'Kim Đồng', year: 2019, value: 150_000, condition: 'Good' },
      intake: { ...english(120_000, 400_000), minBidders: 4 },
      publish: { startAt: null, durationSeconds: 4 * 3600 },
      test: 'Chờ đăng ký 2/4 (Mở khi đủ người, hạn 24 giờ). Bạn đăng ký và đặt cọc; đủ 4 người thì phiên mở ngay.',
    },
    {
      key: 'S2', seller: tester, registrants: [cc, d, e, f],
      book: { title: 'Số đỏ', author: 'Vũ Trọng Phụng', publisher: 'Văn học', year: 2016, value: 180_000, condition: 'LikeNew' },
      intake: { ...english(150_000, 500_000), minBidders: 4 },
      publish: { startAt: inHours(3), durationSeconds: 2 * 3600 },
      test: 'Bạn là người bán: hẹn mở sau 3 giờ, đã đủ 4/4. Thử Mở ngay, Đổi giờ mở hoặc Đóng phiên.',
    },
    {
      key: 'S3', seller: tester, registrants: [g],
      book: { title: 'Tắt đèn', author: 'Ngô Tất Tố', publisher: 'Văn học', year: 2015, value: 120_000, condition: 'Fair' },
      intake: { ...english(100_000, null), minBidders: 6 },
      publish: { startAt: null, durationSeconds: 3 * 3600 },
      test: 'Bạn là người bán: chờ đăng ký 1/6. Thử Giảm tối thiểu (không dưới 4), Hẹn giờ mở, Đóng phiên.',
    },
    {
      key: 'S4', seller, registrants: [tester, a, b, cc],
      book: { title: 'Nhà giả kim', author: 'Paulo Coelho', publisher: 'Nhã Nam', year: 2020, value: 200_000, condition: 'LikeNew' },
      intake: { ...english(150_000, 500_000), minBidders: 4 },
      publish: { startAt: null, durationSeconds: 6 * 3600 },
      then: async (id) => {
        await bid(id, a, 150_000);
        await call('PUT', `/auctions/${id}/auto-bid`, b, { maxAmount: 250_000, fulfillmentMethod: 'SelfCollect' });
      },
      test: 'Đang diễn ra 6 giờ, đã có giá. Thử trả giá, Đặt giá tự động, Mua ngay 500.000đ (cửa sổ thách giá).',
    },
    {
      key: 'S5', seller: seller2, registrants: [tester, d, e, f],
      book: { title: 'Đất rừng phương Nam', author: 'Đoàn Giỏi', publisher: 'Kim Đồng', year: 2018, value: 160_000, condition: 'Good' },
      intake: { ...english(100_000, null), minBidders: 4 },
      publish: { startAt: null, durationSeconds: 3600 },
      then: async (id) => {
        await bid(id, d, 100_000);
        await bid(id, tester, 150_000);
      },
      test: 'Kết thúc sau 1 giờ, bạn đang dẫn giá. Để API chạy tới lúc đó: bạn thắng và thanh toán đơn tại điểm.',
    },
    {
      key: 'S6', seller: seller2, registrants: [tester, g, h, a],
      book: { title: 'Cho tôi xin một vé đi tuổi thơ', author: 'Nguyễn Nhật Ánh', publisher: 'Trẻ', year: 2021, value: 140_000, condition: 'LikeNew' },
      intake: { startPrice: 100_000, step: 10_000, buyNowPrice: null, auctionType: 'Dutch', dutchTopPrice: 300_000, dutchIntervalSeconds: 120, minBidders: 4 },
      publish: { startAt: null, durationSeconds: 2 * 3600 },
      test: 'Đấu giá giảm dần: từ 300.000đ, giảm 10.000đ mỗi 2 phút, sàn 100.000đ. Chấp nhận giá là thắng ngay.',
    },
    {
      key: 'S7', seller: seller3, registrants: [tester, b, cc, d],
      book: { title: 'Truyện Kiều', author: 'Nguyễn Du', publisher: 'Giáo dục', year: 2017, value: 220_000, condition: 'Good' },
      intake: { startPrice: 100_000, step: 10_000, buyNowPrice: null, auctionType: 'SealedFirst', minBidders: 4 },
      publish: { startAt: null, durationSeconds: 3 * 3600 },
      then: async (id) => {
        await call('POST', `/auctions/${id}/sealed-bid`, b, { amount: 180_000, fulfillmentMethod: 'SelfCollect' });
      },
      test: 'Đấu giá kín giá cao nhất: giá bị ẩn. Thử đặt giá kín; người cao nhất thắng và trả đúng giá mình đặt.',
    },
    {
      key: 'S8', seller: holdSeller, registrants: [e, f, g, h],
      book: { title: 'Chí Phèo', author: 'Nam Cao', publisher: 'Văn học', year: 2014, value: 130_000, condition: 'Fair' },
      intake: { ...english(100_000, 400_000), minBidders: 4 },
      publish: { startAt: null, durationSeconds: 6 * 3600 },
      then: async (id) => {
        await bid(id, e, 100_000);
        await bid(id, f, 150_000);
        // An Admin lock of the seller, then the worker's hold, then the
        // account is reinstated: the auction waits for an Admin decision.
        await c.users.updateOne({ _id: holdSeller.id }, { $set: { status: 'LOCKED', updatedAt: new Date() }, $inc: { lockSeq: 1 } });
        try {
          await app.get(AuctionWorker).tick();
        } finally {
          await c.users.updateOne({ _id: holdSeller.id }, { $set: { status: 'ACTIVE', updatedAt: new Date() }, $inc: { lockSeq: 1 } });
        }
      },
      test: 'Tạm giữ (người bán từng bị khóa, nay đã mở lại). Admin → Phiên đang mở hoặc tạm giữ → Xử lý phiên: tiếp tục một lần hoặc hủy. Tự hủy sau 48 giờ.',
    },
    {
      key: 'S9', seller: seller3, registrants: [a, b, cc, h],
      book: { title: 'Mắt biếc', author: 'Nguyễn Nhật Ánh', publisher: 'Trẻ', year: 2019, value: 150_000, condition: 'Good' },
      intake: { ...english(120_000, 450_000), minBidders: 4 },
      publish: { startAt: null, durationSeconds: 6 * 3600 },
      then: async (id) => {
        await bid(id, a, 120_000);
        await call('POST', '/me/support-cases', b, {
          kind: 'Violation',
          title: 'Nghi ngờ đẩy giá: Mắt biếc',
          description: 'Một tài khoản liên tục đẩy giá phiên này ngay khi tôi vừa trả giá.',
          target: { type: 'Auction', id },
        });
      },
      test: 'Bị báo cáo (hồ sơ hỗ trợ chưa ai nhận). Admin → Hỗ trợ: nhận hồ sơ rồi Đóng phiên kèm lời nhắn; người đang xem phiên thấy ngay.',
    },
  ];

  for (const s of scenarios) {
    const seeded = await c.auction_intakes.findOne({ shelfCode: `DEMO-${s.key}`, auctionId: { $ne: null } });
    if (seeded) {
      results.push({ key: s.key, title: s.book.title, auctionId: seeded.auctionId!, state: 'đã có từ lần chạy trước', test: s.test });
      console.log(`${s.key} already seeded: ${s.book.title}`);
      continue;
    }
    const listing = await auctionListing(s.seller, staff, s.book);
    const created = await call('POST', '/auction-intakes', s.seller, {
      listingId: listing.id,
      expectedListingVersion: listing.version,
      pointId: HANDOVER_POINT_A,
      declaredValue: s.book.value,
      ...s.intake,
    });
    const intakeId = created.intakeId as string;
    await call('POST', `/operations/auction-intakes/${intakeId}/receive`, staff, { expectedVersion: 1, shelfCode: `DEMO-${s.key}` });
    await call('POST', `/operations/auction-intakes/${intakeId}/inspect`, staff, { expectedVersion: 2, outcome: 'Pass', note: null });
    await call('POST', `/auction-intakes/${intakeId}/publish`, s.seller, { expectedVersion: 3, ...s.publish });
    const auction = (await c.auctions.findOne({ intakeId }))!;
    for (const r of s.registrants)
      await call('POST', `/auctions/${auction._id}/registration`, r, { deposit: auction.depositAmount });
    await s.then?.(auction._id);
    const pub = await call('GET', `/auctions/${auction._id}`, null);
    const summary = pub.auction as Json;
    results.push({
      key: s.key,
      title: s.book.title,
      auctionId: auction._id,
      state: `${String(summary.state)}/${String(summary.phase)} · ${String(summary.registeredCount)}/${String(summary.minBidders)} đăng ký`,
      test: s.test,
    });
    console.log(`${s.key} ready: ${s.book.title} (${auction._id})`);
  }

  if (process.argv.includes('--refresh-covers')) await refreshCovers(scenarios.map((x) => x.book));

  console.log('\nAuction demo ready. Sign in with the accounts below (demo password = DEV_SEED_PASSWORD).');
  console.log(`  Tester (member web/RN): ${TESTER}  ·  Admin: admin@latlai.local  ·  Staff: ${STAFF}`);
  console.log(`  Demo sellers: seller.demo, seller.demo2, seller.demo3, seller.hold@latlai.local  ·  Bidders: bidder.a … bidder.h@latlai.local`);
  console.log('');
  for (const r of results) console.log(`${r.key}  ${r.title}\n    ${r.state}\n    ${r.test}\n    /auctions/${r.auctionId}`);
} finally {
  await c.auth_sessions.updateMany({ _id: { $in: sessions } }, { $set: { revokedAt: new Date() } }).catch(() => undefined);
  await app.close();
}
