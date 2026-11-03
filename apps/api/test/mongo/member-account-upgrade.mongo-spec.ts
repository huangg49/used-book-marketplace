import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { migrate } from '../../src/database/mongo/migrate.js';
import {
  migrations,
  checksumOf,
} from '../../src/database/mongo/migrations/index.js';
import {
  bootstrapRoles,
  appPrivileges,
} from '../../src/database/mongo/roles.js';
import {
  testUrl,
  withCredentials,
  TEST_APP_PASSWORD,
  TEST_MIGRATOR_PASSWORD,
} from './harness.js';
import { CAPITAL_INCREASE_JOURNAL_ID } from '../../src/database/mongo/migrations/0055-simulator-capital-increase.js';

// An upgrade from main's 59 applied migrations, not a fresh-current-schema test.
const suffix = [
  '0047-member-profiles',
  '0048-account-controls',
  '0049-member-cart',
  '0050-listing-auto-review',
  '0050-support-cases',
  '0051-support-auto-review-union',
  '0056-auto-review-v2-upgrade-bridge',
  '0052-listing-auto-review-v2',
  '0053-exchange-agreement',
  '0054-exchange-evidence',
  '0052-free-shipping',
  '0054-exchange-negotiated-diff',
  '0055-exchange-negotiated-diff-payer',
  '0054-local-demo-completion',
  '0054-uncapped-auction-amounts',
  '0055-simulator-capital-increase',
  '0056-auction-step-options',
  '0057-custom-auction-step',
  '0058-buy-now-rival-window',
  '0059-auction-free-shipping-reconcile',
  '0060-wallet-withdrawals',
  '0061-manual-wallet-withdrawals',
];
const sha = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
describe('main → member profile/account/cart schema upgrade', () => {
  it('preserves legacy users/sessions/ledger and applied checksums; refreshes least-privilege role and is repeatable', async () => {
    const name = `member_upgrade_${randomUUID().replaceAll('-', '')}_test`,
      url = testUrl(name),
      root = await new MongoClient(url).connect(),
      db = root.db();
    let app: MongoClient | undefined;
    try {
      expect(new URL(url).hostname).toBe('127.0.0.1');
      expect(new URL(url).port).toBe('57017');
      expect((await root.db('admin').command({ hello: 1 })).setName).toBe(
        'rs-test',
      );
      await bootstrapRoles(db, {
        app: TEST_APP_PASSWORD,
        migrator: TEST_MIGRATOR_PASSWORD,
      });
      const base = migrations.filter((m) => !suffix.includes(m.id));
      expect(base).toHaveLength(59);
      const main = JSON.parse(
        readFileSync(
          new URL(
            '../fixtures/main-be581aec-migration-checksums.json',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      expect(main.source).toBe('be581aeca4afaf3a7cea8b4b047281fd78e661de');
      expect(base.map((m) => ({ id: m.id, checksum: checksumOf(m) }))).toEqual(
        main.migrations,
      );
      // Model the role installed by main, before these three collections existed.
      await db.command({
        updateRole: 'latlai_app',
        roles: [],
        privileges: appPrivileges(name).filter(
          (p) =>
            ![
              'profile_avatars',
              'member_email_changes',
              'member_carts',
              'listing_auto_reviews',
            ].includes(p.resource.collection),
        ),
      });
      await migrate(root, db, base);
      const now = new Date(),
        id = randomUUID(),
        sessionId = randomUUID();
      const legacy = {
        _id: id,
        emailNormalized: 'legacy-member@upgrade.test',
        passwordHash: 'QA-only-non-login-hash',
        displayName: 'QA legacy member',
        status: 'RESTRICTED',
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
        roles: [{ role: 'MEMBER', grantedAt: now }],
        lockSeq: 0,
      };
      await db.collection('users').insertOne(legacy as never);
      const session = {
        _id: sessionId,
        userId: id,
        refreshTokenHash: 'a'.repeat(64),
        expiresAt: new Date(+now + 3600000),
        revokedAt: null,
        createdAt: now,
        lockSeq: 0,
      };
      await db.collection('auth_sessions').insertOne(session as never);
      const prior = await db
        .collection('_migrations')
        .find()
        .sort({ _id: 1 })
        .toArray();
      const moneyBefore = sha(
        await db
          .collection('ledger_journals')
          .find()
          .sort({ _id: 1 })
          .toArray(),
      );
      expect(await migrate(root, db)).toEqual(suffix);
      expect(
        sha(await db.collection('users').findOne({ _id: id as never })),
      ).toBe(sha(legacy));
      expect(
        sha(
          await db
            .collection('auth_sessions')
            .findOne({ _id: sessionId as never }),
        ),
      ).toBe(sha(session));
      // Existing money is untouched; 0055 only adds its fixed CapitalIncrease journal.
      expect(
        sha(
          await db
            .collection('ledger_journals')
            .find({ _id: { $ne: CAPITAL_INCREASE_JOURNAL_ID } } as never)
            .sort({ _id: 1 })
            .toArray(),
        ),
      ).toBe(moneyBefore);
      for (const row of prior)
        expect(
          sha(await db.collection('_migrations').findOne({ _id: row._id })),
        ).toBe(sha(row));
      expect(await migrate(root, db)).toEqual([]);
      // Reconnect after role refresh so cached privileges cannot mask the setup step.
      app = await new MongoClient(
        withCredentials(url, 'latlai_app', TEST_APP_PASSWORD),
      ).connect();
      await expect(
        app.db().collection('member_carts').findOne({}),
      ).rejects.toMatchObject({ code: 13 });
      await app.close();
      app = undefined;
      await bootstrapRoles(db, {
        app: TEST_APP_PASSWORD,
        migrator: TEST_MIGRATOR_PASSWORD,
      });
      app = await new MongoClient(
        withCredentials(url, 'latlai_app', TEST_APP_PASSWORD),
      ).connect();
      const card = app.db().collection('member_carts');
      await card.insertOne({
        _id: id,
        version: 1,
        lockSeq: 0,
        items: [],
        createdAt: now,
        updatedAt: now,
      } as never);
      expect(await card.countDocuments()).toBe(1);
      await expect(card.deleteOne({ _id: id as never })).rejects.toMatchObject({
        code: 13,
      });
      await expect(
        app
          .db()
          .collection('audit_events')
          .updateMany({}, { $set: { reason: 'forbidden' } }),
      ).rejects.toMatchObject({ code: 13 });
      await expect(
        app.db().command({ collMod: 'users', validator: {} }),
      ).rejects.toMatchObject({ code: 13 });
      await app
        .db()
        .collection('users')
        .updateOne(
          { _id: id as never },
          { $set: { version: 2, contactPhone: null, avatarId: null } },
        );
      expect(
        (await db.collection('users').findOne({ _id: id as never }))?.status,
      ).toBe('RESTRICTED');
    } finally {
      await app?.close();
      // Only the randomly generated, explicitly checked *_test database above.
      await db.dropDatabase();
      await db.command({ dropAllUsersFromDatabase: 1 });
      await db.command({ dropAllRolesFromDatabase: 1 });
      await root.close();
    }
  });
});
