import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';

it('upgrades wallet storage without changing historical balances, opening source, address/listing or receipts', async () => {
  const url = process.env.TEST_DATABASE_URL!;
  if (!decodeURIComponent(new URL(url).pathname).endsWith('_test'))
    throw new Error('Dedicated test DB required');
  const schema = `payment_upgrade_test_${randomUUID().replaceAll('-', '')}`;
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
    const target = '20260928020000_order_wallet_payment';
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
        'wallet_accounts',
        'ledger_journals',
        'ledger_entries',
      ];
      const rows: Record<string, unknown> = {};
      for (const table of tables)
        rows[table] = (await connection.query(`SELECT * FROM ${table}`)).rows;
      return rows;
    };
    const before = await snapshot();
    await connection.query(
      readFileSync(`prisma/migrations/${target}/migration.sql`, 'utf8'),
    );
    const after = await snapshot();
    before.wallet_accounts = (before.wallet_accounts as object[]).map((r) => ({
      ...r,
      order_id: null,
    }));
    before.ledger_journals = (before.ledger_journals as object[]).map(
      (r, i) => ({
        ...r,
        order_id: null,
        receipt_id: null,
        sequence: String(i + 1),
      }),
    );
    expect(after).toEqual(before);
    expect(
      (
        await connection.query(
          'SELECT purpose FROM wallet_accounts ORDER BY purpose',
        )
      ).rows,
    ).toEqual([
      { purpose: 'SimulatorCapital' },
      { purpose: 'SimulatorClearing' },
    ]);
    expect(
      (await connection.query('SELECT type FROM ledger_journals')).rows,
    ).toEqual([{ type: 'OpeningCapital' }]);
    expect(
      (
        await connection.query(
          'SELECT sum(debit)::text debit,sum(credit)::text credit FROM ledger_entries',
        )
      ).rows,
    ).toEqual([{ debit: '100000000', credit: '100000000' }]);
    expect(
      (await connection.query('SELECT * FROM topup_intents')).rows,
    ).toHaveLength(0);
    await expect(
      connection.query(
        "UPDATE listings SET trade='Reserved',version=version+1 WHERE id=$1",
        [listing],
      ),
    ).rejects.toMatchObject({ code: '23514' });
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
    await expect(
      connection.query('UPDATE ledger_journals SET sequence=99'),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      connection.query('UPDATE ledger_entries SET debit=debit+1'),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      connection.query(
        "INSERT INTO wallet_accounts(id,purpose) VALUES($1,'OrderHold')",
        [randomUUID()],
      ),
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
