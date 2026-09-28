import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';

it('upgrades existing addresses/listings without assigning legacy origins or losing SQL guards', async () => {
  const url = process.env.TEST_DATABASE_URL!;
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('Dedicated test DB required');
  const schema = `origin_upgrade_test_${randomUUID().replaceAll('-', '')}`;
  const adapter = await new PrismaPg({
    connectionString: url,
    options: `-c search_path=${schema},public`,
  }).connect();
  const pool = adapter.underlyingDriver(),
    connection = await pool.connect();
  const owner = randomUUID(),
    address = randomUUID(),
    listing = randomUUID(),
    revision = randomUUID();
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    const names = readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n))
      .sort();
    const target = '20260927010000_listing_fulfillment';
    for (const name of names.filter((n) => n < target))
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
      'INSERT INTO listing_revisions(id,listing_id,number) VALUES($1,$2,1)',
      [revision, listing],
    );
    await connection.query(
      'UPDATE listings SET current_revision_id=$1 WHERE id=$2',
      [revision, listing],
    );
    await connection.query('COMMIT');
    const before = (
      await connection.query('SELECT * FROM member_addresses WHERE id=$1', [
        address,
      ])
    ).rows[0];
    await connection.query(
      readFileSync(`prisma/migrations/${target}/migration.sql`, 'utf8'),
    );
    expect(
      (
        await connection.query('SELECT * FROM member_addresses WHERE id=$1', [
          address,
        ])
      ).rows[0],
    ).toEqual({ ...before, version: 1 });
    expect(
      (
        await connection.query('SELECT * FROM address_identities WHERE id=$1', [
          address,
        ])
      ).rows[0],
    ).toEqual({ id: address, owner_id: owner });
    expect(
      (
        await connection.query(
          'SELECT origin_address_id,origin_address_version,origin_service_area_code FROM listing_revisions WHERE id=$1',
          [revision],
        )
      ).rows[0],
    ).toEqual({
      origin_address_id: null,
      origin_address_version: null,
      origin_service_area_code: null,
    });
    await expect(
      connection.query(
        'UPDATE member_addresses SET is_default=false WHERE id=$1',
        [address],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      connection.query('UPDATE listings SET version=99 WHERE id=$1', [listing]),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await connection.query('ROLLBACK');
    await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    connection.release();
    await adapter.dispose();
  }
});
