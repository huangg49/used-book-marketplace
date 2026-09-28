import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';

type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Pool = ReturnType<Adapter['underlyingDriver']>;
type Sql = Pick<Pool, 'query'>;

// Real PostgreSQL migration/constraint tests, not an implementation of listing APIs.
describe('listing migrations and database invariants', () => {
  const schema = `listing_test_${randomUUID().replaceAll('-', '')}`;
  let adapter: Adapter;
  let pool: Pool;
  const owner = randomUUID();
  const reviewer = randomUUID();
  const reviewer2 = randomUUID();
  const legacyUser = randomUUID();
  const checklist = JSON.stringify({
    catalogMatches: true,
    photosClear: true,
    conditionDisclosed: true,
    readable: true,
    pricingValid: true,
    contentAppropriate: true,
  });

  async function transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const value = await fn(connection);
      await connection.query('COMMIT');
      return value;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }
  async function user(sql: Sql, id: string) {
    await sql.query(
      `INSERT INTO users(id,email_normalized,password_hash,display_name,status,email_verified_at,updated_at)
      VALUES ($1,$2,'test-fixture-not-a-login-secret','Schema Reader','ACTIVE',now(),now())`,
      [id, `${id}@schema.test`],
    );
  }
  async function book(confirmed = true, isbn: string | null = null) {
    const id = randomUUID(),
      revision = randomUUID();
    await transaction(async (sql) => {
      await sql.query(
        'INSERT INTO catalog_books(id,requester_id,updated_at) VALUES ($1,$2,now())',
        [id, owner],
      );
      await sql.query(
        `INSERT INTO catalog_revisions(id,book_id,number,title,authors,language,category,isbn)
        VALUES ($1,$2,1,'Một cuốn sách',ARRAY['Tác giả'],'vi','Văn học',$3)`,
        [revision, id, isbn],
      );
      await sql.query(
        'UPDATE catalog_books SET current_revision_id=$2 WHERE id=$1',
        [id, revision],
      );
      if (confirmed) {
        await sql.query(
          `INSERT INTO catalog_decisions(id,revision_id,reviewer_id,decision) VALUES ($1,$2,$3,'Confirm')`,
          [randomUUID(), revision, reviewer],
        );
        await sql.query(
          `UPDATE catalog_books SET status='Confirmed',version=2,confirmed_isbn=latlai_isbn13($2) WHERE id=$1`,
          [id, isbn],
        );
      }
    });
    return { id, revision };
  }
  async function listing(pending = false, bookId?: string) {
    const id = randomUUID(),
      revision = randomUUID(),
      media = randomUUID();
    const catalog = bookId ?? (await book()).id;
    await transaction(async (sql) => {
      await sql.query(
        'INSERT INTO listings(id,owner_id,updated_at) VALUES ($1,$2,now())',
        [id, owner],
      );
      await sql.query(
        `INSERT INTO listing_revisions(id,listing_id,number,book_id,mode,condition,pages,cover_note,notes,accessories,readable,has_missing_pages,missing_essential_content,description,sale_price,exchange_value)
        VALUES ($1,$2,1,$3,'Both','Good','Đủ trang','Bìa sờn nhẹ','Không có','Không có',true,false,false,'Một cuốn sách đọc được, tình trạng đã được mô tả đầy đủ.',125000,150000)`,
        [revision, id, catalog],
      );
      await sql.query(
        'UPDATE listings SET current_revision_id=$2 WHERE id=$1',
        [id, revision],
      );
      // Test factory only: no assertion that uploading/decoding was implemented.
      await sql.query(
        `INSERT INTO listing_media(id,listing_id,status,staging_key,pinned_key,derivative_key,mime_type,byte_size,sha256,width,height,expires_at,updated_at)
        VALUES ($1,$2,'Ready',$3,$4,$5,'image/jpeg',1024,$6,800,1200,now()+interval '24 hours',now())`,
        [
          media,
          id,
          `${media}/stage`,
          `${media}/pinned`,
          `${media}/view`,
          'a'.repeat(64),
        ],
      );
      await sql.query(
        'INSERT INTO revision_media(listing_id,revision_id,media_id,position) VALUES ($1,$2,$3,0)',
        [id, revision, media],
      );
      if (pending) {
        await sql.query(
          'UPDATE listing_revisions SET submitted_at=now(),ownership_declared_at=now() WHERE id=$1',
          [revision],
        );
        await sql.query(
          `UPDATE listings SET moderation='PendingReview',version=2 WHERE id=$1`,
          [id],
        );
      }
    });
    return { id, revision, media };
  }
  async function receipt(sql: Sql, listingId: string, key = randomUUID()) {
    const id = randomUUID();
    const result = {
      id,
      entityType: 'Listing',
      entityId: listingId,
      version: 1,
      revisionId: null,
      state: null,
      serverTime: new Date().toISOString(),
    };
    await sql.query(
      `INSERT INTO mutation_receipts(id,actor_id,operation,key,payload_hash,listing_id,result_version,result) VALUES ($1,$2,'schemaProbe',$3,$4,$5,1,$6)`,
      [id, owner, key, 'a'.repeat(64), listingId, JSON.stringify(result)],
    );
    return id;
  }
  async function decision(
    sql: Sql,
    item: Awaited<ReturnType<typeof listing>>,
    actor = reviewer,
  ) {
    await sql.query(
      `INSERT INTO listing_decisions(id,revision_id,reviewer_id,decision,checklist) VALUES ($1,$2,$3,'Approve',$4)`,
      [randomUUID(), item.revision, actor, checklist],
    );
    await sql.query(
      `UPDATE listings SET moderation='Approved',version=version+1,published_at=now() WHERE id=$1`,
      [item.id],
    );
  }
  async function expectBlocked(pid: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const state = await pool.query(
        'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
        [pid],
      );
      if (state.rows[0]?.wait_event_type === 'Lock') return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Second connection did not overlap at a database lock');
  }

  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!decodeURIComponent(new URL(url).pathname).endsWith('_test'))
      throw new Error('Dedicated _test database required');
    adapter = await new PrismaPg({
      connectionString: url,
      max: 6,
      options: `-c search_path=${schema},public -c timezone=UTC`,
      statement_timeout: 10000,
    }).connect();
    pool = adapter.underlyingDriver();
    await pool.query(`CREATE SCHEMA "${schema}"`);
    await pool.query(
      readFileSync(
        'prisma/migrations/20260924000000_auth_foundation/migration.sql',
        'utf8',
      ),
    );
    await user(pool, legacyUser);
    await pool.query(
      readFileSync(
        'prisma/migrations/20260926000000_listing_contract_foundation/migration.sql',
        'utf8',
      ),
    );
    for (const id of [owner, reviewer, reviewer2]) await user(pool, id);
  });
  afterAll(async () => {
    // Only this run's isolated schema; never a reset/drop of the shared test DB.
    if (pool && /^listing_test_[a-f0-9]{32}$/.test(schema))
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await adapter?.dispose();
  });

  it('upgrades the auth schema without deleting or changing the existing account', async () => {
    const result = await pool.query(
      'SELECT password_hash,status FROM users WHERE id=$1',
      [legacyUser],
    );
    expect(result.rows[0]).toEqual({
      password_hash: 'test-fixture-not-a-login-secret',
      status: 'ACTIVE',
    });
    expect(
      (
        await pool.query(
          `SELECT count(*)::int n FROM information_schema.tables WHERE table_schema=$1`,
          [schema],
        )
      ).rows[0].n,
    ).toBe(16);
  });

  it('rejects incomplete aggregates at commit and permits transactional construction', async () => {
    await expect(
      transaction((sql) =>
        sql.query(
          'INSERT INTO listings(id,owner_id,updated_at) VALUES ($1,$2,now())',
          [randomUUID(), owner],
        ),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const item = await listing();
    expect(
      (
        await pool.query(
          'SELECT current_revision_id FROM listings WHERE id=$1',
          [item.id],
        )
      ).rows[0].current_revision_id,
    ).toBe(item.revision);
  });

  it('rejects wrong-owner revision pointers, version bypass and ownership transfer', async () => {
    const one = await listing(),
      two = await listing();
    await expect(
      pool.query(
        'UPDATE listings SET current_revision_id=$2,version=version+1 WHERE id=$1',
        [one.id, two.revision],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query("UPDATE listings SET visibility='Hidden' WHERE id=$1", [
        one.id,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'UPDATE listings SET owner_id=$2,version=version+1 WHERE id=$1',
        [one.id, reviewer],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('enforces price/mode and complete submitted-content constraints including SQL nulls', async () => {
    const item = await listing();
    await expect(
      pool.query('UPDATE listing_revisions SET sale_price=9999 WHERE id=$1', [
        item.revision,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE listing_revisions SET mode=NULL WHERE id=$1', [
        item.revision,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `UPDATE listing_revisions SET submitted_at=now(),ownership_declared_at=now(),readable=false WHERE id=$1`,
        [item.revision],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('blocks cross-listing photos and mutation of submitted content/photo order', async () => {
    const pending = await listing(true),
      other = await listing();
    await expect(
      pool.query(
        'INSERT INTO revision_media(listing_id,revision_id,media_id,position) VALUES ($1,$2,$3,1)',
        [other.id, other.revision, pending.media],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      pool.query(
        `UPDATE listing_revisions SET description='replacement' WHERE id=$1`,
        [pending.revision],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('UPDATE revision_media SET position=1 WHERE revision_id=$1', [
        pending.revision,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM revision_media WHERE revision_id=$1', [
        pending.revision,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('requires ready photos and a decision rather than allowing direct Approved writes', async () => {
    const item = await listing();
    await pool.query('DELETE FROM revision_media WHERE revision_id=$1', [
      item.revision,
    ]);
    await expect(
      transaction(async (sql) => {
        await sql.query(
          'UPDATE listing_revisions SET submitted_at=now(),ownership_declared_at=now() WHERE id=$1',
          [item.revision],
        );
        await sql.query(
          `UPDATE listings SET moderation='PendingReview',version=2 WHERE id=$1`,
          [item.id],
        );
      }),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `UPDATE listings SET moderation='Approved',version=2 WHERE id=$1`,
        [item.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('requires independent reviewers and confirmed catalog at approval', async () => {
    const pendingBook = await book(false),
      item = await listing(true, pendingBook.id);
    await expect(
      transaction((sql) => decision(sql, item, owner)),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      transaction((sql) => decision(sql, item)),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM listing_decisions WHERE revision_id=$1',
          [item.revision],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('serializes conflicting review versions on independent connections with one winner', async () => {
    const item = await listing(true);
    const first = await pool.connect(),
      second = await pool.connect();
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      await first.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE', [
        item.id,
      ]);
      const pid = (await second.query('SELECT pg_backend_pid() pid')).rows[0]
        .pid as number;
      const attempt = second.query(
        `UPDATE listings SET version=version+1 WHERE id=$1 AND version=2 AND moderation='PendingReview' RETURNING id`,
        [item.id],
      );
      // Attach a rejection handler immediately so test failures never leak unhandled promises.
      void attempt.catch(() => undefined);
      await expectBlocked(pid);
      await decision(first, item);
      await first.query('COMMIT');
      expect((await attempt).rowCount).toBe(0);
      await second.query('ROLLBACK');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int n FROM listing_decisions WHERE revision_id=$1',
            [item.revision],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await first.query('ROLLBACK');
      await second.query('ROLLBACK');
      first.release();
      second.release();
    }
  });

  it('deduplicates concurrent command receipts at the database unique key', async () => {
    const item = await listing(),
      key = randomUUID();
    const first = await pool.connect(),
      second = await pool.connect();
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      await receipt(first, item.id, key);
      const pid = (await second.query('SELECT pg_backend_pid() pid')).rows[0]
        .pid as number;
      const loser = receipt(second, item.id, key).then(
        () => null,
        (error) => error,
      );
      await expectBlocked(pid);
      await first.query('COMMIT');
      expect(await loser).toMatchObject({ code: '23505' });
      await second.query('ROLLBACK');
      expect(
        (
          await pool.query(
            'SELECT count(*)::int n FROM mutation_receipts WHERE key=$1',
            [key],
          )
        ).rows[0].n,
      ).toBe(1);
    } finally {
      await first.query('ROLLBACK');
      await second.query('ROLLBACK');
      first.release();
      second.release();
    }
  });

  it('rolls back receipt, audit and outbox with a failed domain transaction', async () => {
    const item = await listing(),
      key = randomUUID(),
      audit = randomUUID();
    await expect(
      transaction(async (sql) => {
        const command = await receipt(sql, item.id, key);
        await sql.query(
          `INSERT INTO audit_events(id,actor_id,receipt_id,listing_id,action,request_id) VALUES ($1,$2,$3,$4,'SchemaProbe',$5)`,
          [audit, owner, command, item.id, randomUUID()],
        );
        await sql.query(
          `INSERT INTO outbox_events(id,audit_id,type,payload) VALUES ($1,$2,'SchemaProbe','{}')`,
          [randomUUID(), audit],
        );
        throw new Error('injected-before-commit');
      }),
    ).rejects.toThrow('injected-before-commit');
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM mutation_receipts WHERE key=$1',
          [key],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM audit_events WHERE id=$1',
          [audit],
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int n FROM outbox_events WHERE audit_id=$1',
          [audit],
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('preserves receipts, audit and outbox payload while permitting worker delivery metadata', async () => {
    const item = await listing(),
      command = await receipt(pool, item.id),
      audit = randomUUID(),
      event = randomUUID();
    await pool.query(
      `INSERT INTO audit_events(id,actor_id,receipt_id,listing_id,action,request_id) VALUES ($1,$2,$3,$4,'SchemaProbe',$5)`,
      [audit, owner, command, item.id, randomUUID()],
    );
    await pool.query(
      `INSERT INTO outbox_events(id,audit_id,type,payload) VALUES ($1,$2,'SchemaProbe','{}')`,
      [event, audit],
    );
    await expect(
      pool.query('DELETE FROM mutation_receipts WHERE id=$1', [command]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(`UPDATE audit_events SET action='rewrite' WHERE id=$1`, [
        audit,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        `UPDATE outbox_events SET payload='{"changed":true}' WHERE id=$1`,
        [event],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await pool.query(
      'UPDATE outbox_events SET attempts=1,processed_at=now() WHERE id=$1',
      [event],
    );
  });

  it('validates ISBN checksums and collapses ISBN-10/13 to one confirmed identity', async () => {
    expect(
      (await pool.query(`SELECT latlai_isbn13('0306406152') isbn`)).rows[0]
        .isbn,
    ).toBe('9780306406157');
    await expect(book(false, '9780306406158')).rejects.toMatchObject({
      code: '23514',
    });
    await book(true, '0306406152');
    await expect(book(true, '9780306406157')).rejects.toMatchObject({
      code: '23505',
    });
    await expect(book(false, '9780306406157')).resolves.toHaveProperty(
      'revision',
    );
  });

  it('retains reviewed media and disallows replacement or purge under a revision', async () => {
    const item = await listing(true);
    await expect(
      pool.query(
        `UPDATE listing_media SET derivative_key='replacement',version=2 WHERE id=$1`,
        [item.media],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query(
        'UPDATE listing_media SET purged_at=now(),version=2 WHERE id=$1',
        [item.media],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      pool.query('DELETE FROM listing_media WHERE id=$1', [item.media]),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
