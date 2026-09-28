import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';

it('upgrades populated quote storage, rejects legacy Reserved placeholders and preserves history', async () => {
  const url = process.env.TEST_DATABASE_URL!;
  if (!decodeURIComponent(new URL(url).pathname).endsWith('_test'))
    throw new Error('Dedicated test DB required');
  const schema = `order_upgrade_test_${randomUUID().replaceAll('-', '')}`;
  const adapter = await new PrismaPg({
    connectionString: url,
    options: `-c search_path=${schema},public`,
  }).connect();
  const connection = await adapter.underlyingDriver().connect();
  const owner = randomUUID(),
    address = randomUUID(),
    listing = randomUUID(),
    revision = randomUUID(),
    receipt = randomUUID(),
    audit = randomUUID();
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    const target = '20260927030000_unpaid_direct_orders';
    for (const name of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n) && n < target)
      .sort())
      await connection.query(
        readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'),
      );
    await connection.query('BEGIN');
    await connection.query(
      'INSERT INTO users(id,email_normalized,password_hash,display_name,updated_at) VALUES($1,$2,$3,$4,now())',
      [owner, `${owner}@upgrade.test`, 'unused', 'Upgrade fixture'],
    );
    await connection.query(
      'INSERT INTO address_books(owner_id,version) VALUES($1,1)',
      [owner],
    );
    await connection.query(
      "INSERT INTO member_addresses(id,owner_id,recipient_name,phone,service_area_code,locality_code,detail,is_default) VALUES($1,$2,'Fixture','0900000000','HCM-DEMO-v1','DEMO-A','Test address only',true)",
      [address, owner],
    );
    await connection.query(
      'INSERT INTO listings(id,owner_id,updated_at) VALUES($1,$2,now())',
      [listing, owner],
    );
    await connection.query(
      "INSERT INTO listing_revisions(id,listing_id,number,origin_address_id,origin_address_version,origin_service_area_code) VALUES($1,$2,1,$3,1,'HCM-DEMO-v1')",
      [revision, listing, address],
    );
    await connection.query(
      'UPDATE listings SET current_revision_id=$1 WHERE id=$2',
      [revision, listing],
    );
    await connection.query(
      "INSERT INTO mutation_receipts(id,actor_id,operation,key,payload_hash,listing_id,result_version,result,committed_at) VALUES($1,$2,'createListing',$5,$3,$4,1,'{}',now())",
      [receipt, owner, 'a'.repeat(64), listing, randomUUID()],
    );
    await connection.query(
      "INSERT INTO audit_events(id,actor_id,receipt_id,listing_id,action,request_id) VALUES($1,$2,$3,$4,'createListing',$5)",
      [audit, owner, receipt, listing, randomUUID()],
    );
    await connection.query('COMMIT');
    const snapshot = async () => {
      const tables = [
        'member_addresses',
        'address_identities',
        'listing_revisions',
        'listings',
        'mutation_receipts',
        'audit_events',
      ];
      const rows: Record<string, unknown> = {};
      for (const table of tables)
        rows[table] = (await connection.query(`SELECT * FROM ${table}`)).rows;
      return rows;
    };
    await connection.query(
      "UPDATE listings SET trade='Reserved',version=version+1 WHERE id=$1",
      [listing],
    );
    await expect(
      connection.query(
        readFileSync(`prisma/migrations/${target}/migration.sql`, 'utf8'),
      ),
    ).rejects.toThrow('Legacy Reserved listings require reconciliation');
    expect(
      (
        await connection.query(
          // Check this upgrade fixture, not public.direct_orders via search_path.
          // CI and a freshly migrated QA database already contain the public table.
          'SELECT to_regclass($1) AS table_name',
          [`${schema}.direct_orders`],
        )
      ).rows[0].table_name,
    ).toBeNull();
    expect(
      (
        await connection.query('SELECT trade FROM listings WHERE id=$1', [
          listing,
        ])
      ).rows[0].trade,
    ).toBe('Reserved');
    await connection.query(
      "UPDATE listings SET trade='Available',version=version+1 WHERE id=$1",
      [listing],
    );
    const before = await snapshot();
    await connection.query(
      readFileSync(`prisma/migrations/${target}/migration.sql`, 'utf8'),
    );
    const after = await snapshot();
    for (const table of ['mutation_receipts', 'audit_events'])
      before[table] = (before[table] as object[]).map((row) => ({
        ...row,
        context_id: null,
        system_actor: null,
      }));
    expect(after).toEqual(before);
    expect(
      (await connection.query('SELECT * FROM sale_quotes')).rows,
    ).toHaveLength(0);
    expect(
      (await connection.query('SELECT * FROM sale_quote_policies')).rows,
    ).toEqual([
      {
        code: 'HCM-DIRECT-v1',
        shipping_fee: 30000,
        commission_bps: 500,
        ttl_seconds: 300,
      },
    ]);
    await expect(
      connection.query('UPDATE listings SET version=99 WHERE id=$1', [listing]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      connection.query('UPDATE member_addresses SET version=99 WHERE id=$1', [
        address,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      connection.query('DELETE FROM mutation_receipts WHERE id=$1', [receipt]),
    ).rejects.toMatchObject({ code: '23514' });
    // The expanded target constraint still rejects ambiguous existing target types.
    await expect(
      connection.query(
        "INSERT INTO mutation_receipts(id,actor_id,operation,key,payload_hash,listing_id,address_book_id,result_version,result,committed_at) VALUES($1,$2,'bad',$5,$3,$4,$2,1,'{}',now())",
        [randomUUID(), owner, 'b'.repeat(64), listing, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await connection.query('ROLLBACK');
    await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    connection.release();
    await adapter.dispose();
  }
});
