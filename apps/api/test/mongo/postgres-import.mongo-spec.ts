import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import pg from 'pg';
import { MongoClient } from 'mongodb';
import {
  EXPECTED_POSTGRES_MIGRATIONS,
  importPostgres,
} from '../../src/database/mongo/import/postgres-import.js';
import { OPENING_JOURNAL_ID } from '../../src/database/mongo/migrations/0002-reference-data.js';
import { prepareDatabase, testUrl } from './harness.js';

// MIG-06: PostgreSQL -> MongoDB import against a real schema built from the
// 17 SQL migrations (all triggers active) and a consistent fixture. Needs the
// PostgreSQL QA database (TEST_DATABASE_URL, name ending in _test).
const pgUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!pgUrl)('PostgreSQL import', () => {
  const schema = `import_test_${randomUUID().replaceAll('-', '')}`;
  const rootUrl = testUrl('latlai_import_test');
  let source: pg.Client, mongo: MongoClient, migratorUrl: string;
  const ids = {
    member: randomUUID(),
    admin: randomUUID(),
    session: randomUUID(),
    pendingBook: randomUUID(),
    pendingRevision: randomUUID(),
    book: randomUUID(),
    revision: randomUUID(),
    address: randomUUID(),
    listing: randomUUID(),
    listingRevision: randomUUID(),
    receipt: randomUUID(),
    audit: randomUUID(),
  };

  beforeAll(async () => {
    if (!new URL(pgUrl!).pathname.endsWith('_test'))
      throw new Error('PostgreSQL test database only');
    source = new pg.Client({
      connectionString: pgUrl,
      options: `-c search_path=${schema} -c timezone=UTC`,
    });
    await source.connect();
    await source.query(`CREATE SCHEMA "${schema}"`);
    for (const name of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n))
      .sort())
      await source.query(
        readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
    await source.query(
      'CREATE TABLE _prisma_migrations (migration_name text, finished_at timestamptz, rolled_back_at timestamptz)',
    );
    for (const name of EXPECTED_POSTGRES_MIGRATIONS)
      await source.query(
        'INSERT INTO _prisma_migrations VALUES ($1, now(), NULL)',
        [name],
      );
    const i = ids;
    await source.query('BEGIN');
    await source.query(
      `INSERT INTO users(id,email_normalized,password_hash,display_name,status,email_verified_at,updated_at) VALUES
        ($1,'member@import.test','hash-a','Bạn đọc Nhập','ACTIVE',now(),now()),
        ($2,'admin@import.test','hash-b','Quản trị','ACTIVE',now(),now())`,
      [i.member, i.admin],
    );
    await source.query(
      `INSERT INTO user_roles(user_id,role) VALUES ($1,'MEMBER'),($2,'ADMIN'),($2,'MEMBER')`,
      [i.member, i.admin],
    );
    await source.query(
      `INSERT INTO auth_sessions(id,user_id,refresh_token_hash,expires_at) VALUES ($1,$2,'refresh-hash',now()+interval '30 days')`,
      [i.session, i.member],
    );
    await source.query(
      `INSERT INTO login_attempts(key,attempts,expires_at) VALUES ('import-key',2,now()+interval '10 minutes')`,
    );
    // Pending catalog request and a confirmed book reviewed by another admin.
    for (const [book, revision, title, isbn] of [
      [i.pendingBook, i.pendingRevision, 'Chờ duyệt', null],
      [i.book, i.revision, 'Đường sách chuyền tay', '9780306406157'],
    ]) {
      await source.query(
        `INSERT INTO catalog_books(id,requester_id,status,version,search_text,updated_at) VALUES ($1,$2,'Pending',1,'duong sach',now())`,
        [book, i.member],
      );
      await source.query(
        `INSERT INTO catalog_revisions(id,book_id,number,title,authors,language,category,isbn) VALUES ($1,$2,1,$3,ARRAY['Tác giả A','B, "trích"'],'vi','Văn học',$4)`,
        [revision, book, title, isbn],
      );
      await source.query(
        `UPDATE catalog_books SET current_revision_id=$2 WHERE id=$1`,
        [book, revision],
      );
    }
    await source.query(
      `INSERT INTO catalog_decisions(id,revision_id,reviewer_id,decision) VALUES ($1,$2,$3,'Confirm')`,
      [randomUUID(), i.revision, i.admin],
    );
    await source.query(
      `UPDATE catalog_books SET status='Confirmed',version=2,confirmed_isbn='9780306406157',updated_at=now() WHERE id=$1`,
      [i.book],
    );
    // Address (identity row is created by the trigger) and a draft listing.
    await source.query(
      `INSERT INTO address_books(owner_id,version) VALUES ($1,1)`,
      [i.member],
    );
    await source.query(
      `INSERT INTO member_addresses(id,owner_id,recipient_name,phone,service_area_code,locality_code,detail,is_default) VALUES ($1,$2,'Người nhận','0900000000','HCM-DEMO-v1','DEMO-A','12 Đường số 3',true)`,
      [i.address, i.member],
    );
    await source.query(
      `INSERT INTO listings(id,owner_id,updated_at) VALUES ($1,$2,now())`,
      [i.listing, i.member],
    );
    await source.query(
      `INSERT INTO listing_revisions(id,listing_id,number,book_id,mode,sale_price,origin_address_id,origin_address_version,origin_service_area_code) VALUES ($1,$2,1,$3,'Sale',50000,$4,1,'HCM-DEMO-v1')`,
      [i.listingRevision, i.listing, i.book, i.address],
    );
    await source.query(
      `UPDATE listings SET current_revision_id=$2 WHERE id=$1`,
      [i.listing, i.listingRevision],
    );
    await source.query(
      `INSERT INTO mutation_receipts(id,actor_id,operation,key,payload_hash,listing_id,result_version,result,committed_at)
        VALUES ($1,$2,'createListingDraft',$3,repeat('a',64),$4,1,$5::jsonb,clock_timestamp())`,
      [
        i.receipt,
        i.member,
        randomUUID(),
        i.listing,
        JSON.stringify({ id: i.receipt, entityType: 'Listing', version: 1 }),
      ],
    );
    await source.query(
      `INSERT INTO audit_events(id,actor_id,receipt_id,listing_id,action,after,request_id) VALUES ($1,$2,$3,$4,'createListingDraft','{"version":1}',$5)`,
      [i.audit, i.member, i.receipt, i.listing, randomUUID()],
    );
    await source.query(
      `INSERT INTO outbox_events(id,audit_id,type,payload) VALUES ($1,$2,'ListingDraftCreated','{"entityId":"x"}')`,
      [randomUUID(), i.audit],
    );
    await source.query('COMMIT');
    ({ migratorUrl } = await prepareDatabase(rootUrl));
    mongo = await new MongoClient(migratorUrl).connect();
  }, 120_000);
  afterAll(async () => {
    await source?.query(`DROP SCHEMA "${schema}" CASCADE`);
    await source?.end();
    await mongo?.db().dropDatabase();
    await mongo?.close();
  });

  it('imports every table with matching counts, hashes and integrity', async () => {
    const report = await importPostgres(source, mongo, mongo.db());
    expect(report.mismatches).toEqual([]);
    expect(report.integrity?.failures).toEqual([]);
    expect(report.integrity?.ledger?.sourceRemaining).toBe(100_000_000);
    for (const [name, stats] of Object.entries(report.collections))
      expect(stats.documents, name).toBe(stats.rows);
    expect(report.collections.users.rows).toBe(2);
    // DEFAULT now() columns carry microseconds; they are truncated to ms.
    expect(report.collections.users.truncatedTimes).toBeGreaterThan(0);
    const c = (name: string) => mongo.db().collection<{ _id: string }>(name);
    const admin = await c('users').findOne({ _id: ids.admin });
    expect(
      (admin as unknown as { roles: { role: string }[] }).roles.map(
        (r) => r.role,
      ),
    ).toEqual(['MEMBER', 'ADMIN']);
    expect(
      await c('mutation_receipts').findOne({ _id: ids.receipt }),
    ).toMatchObject({
      principal: `user:${ids.member}`,
      result: { id: ids.receipt, entityType: 'Listing', version: 1 },
    });
    expect(await c('catalog_books').findOne({ _id: ids.book })).toMatchObject({
      titleKey: 'duong sach chuyen tay',
      confirmedIsbn: '9780306406157',
      lockSeq: 0,
    });
    expect(
      await c('catalog_revisions').findOne({ _id: ids.revision }),
    ).toMatchObject({ authors: ['Tác giả A', 'B, "trích"'] });
    expect(
      await c('address_identities').findOne({ _id: ids.address }),
    ).toMatchObject({ ownerId: ids.member });
    expect(await c('revision_media').countDocuments({})).toBe(0);
    // The simulator's opening journal is the PostgreSQL original.
    const [{ posted_at }] = (
      await source.query<{ posted_at: Date }>(
        'SELECT posted_at FROM ledger_journals WHERE id=$1',
        [OPENING_JOURNAL_ID],
      )
    ).rows;
    const journal = (await c('ledger_journals').findOne({
      _id: OPENING_JOURNAL_ID,
    })) as unknown as { postedAt: Date; sequence: number };
    expect(journal.postedAt.getTime()).toBe(posted_at.getTime());
    expect(
      await c('counters').findOne({ _id: 'ledger_journal_sequence' }),
    ).toMatchObject({
      value: 1,
    });
  });

  it('refuses a non-empty target and a source with a different migration history', async () => {
    await expect(importPostgres(source, mongo, mongo.db())).rejects.toThrow(
      'is not empty',
    );
    await source.query(
      `DELETE FROM _prisma_migrations WHERE migration_name=$1`,
      [EXPECTED_POSTGRES_MIGRATIONS.at(-1)],
    );
    await expect(importPostgres(source, mongo, mongo.db())).rejects.toThrow(
      'not the F2h baseline',
    );
  });
});
