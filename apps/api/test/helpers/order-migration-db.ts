import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { MongoClient, type Db } from 'mongodb';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/configure-app.js';
import { MongoService } from '../../src/database/mongo/mongo.service.js';
import { E2E_DATABASE } from '../mongo-global-setup.js';
import { prepareDatabase, testUrl } from '../mongo/harness.js';
import { MongoFixtures } from './mongo-fixtures.js';

// A dedicated, freshly migrated *_test database with the API booted against
// it (as the least-privilege app user), for the order "migration" suites.
// PostgreSQL built these in a private schema so that table-wide assertions
// (only the opening journal, exactly two simulator accounts, ...) are exact;
// a dedicated database keeps them exact without seeing other suites' data.
export async function orderUpgradeDatabase(suffix: string) {
  const rootUrl = testUrl(
    `${E2E_DATABASE.replace(/_test$/, '')}_${suffix}_upgrade_test`,
  );
  const { appUrl, migratorUrl } = await prepareDatabase(rootUrl);
  const root = await new MongoClient(rootUrl).connect();
  let db: MongoFixtures | undefined, app: INestApplication | undefined;
  const close = async () => {
    await app?.close();
    await db?.close();
    const rootDb = root.db();
    await rootDb.dropDatabase();
    await rootDb.command({ dropAllUsersFromDatabase: 1 });
    await rootDb.command({ dropAllRolesFromDatabase: 1 });
    await root.close();
  };
  try {
    // MongoFixtures reads its URL when connecting: point it at the migrator
    // of the dedicated database for this one connection.
    const fixtureUrl = process.env.MONGO_FIXTURE_URL;
    process.env.MONGO_FIXTURE_URL = migratorUrl;
    try {
      db = await MongoFixtures.connect();
    } finally {
      process.env.MONGO_FIXTURE_URL = fixtureUrl;
    }
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MongoService)
      .useFactory({
        factory: () =>
          new MongoService({
            getOrThrow: () => appUrl,
          } as unknown as ConfigService),
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.init();
  } catch (error) {
    await close();
    throw error;
  }
  const nest = app,
    fixtures = db;
  const user = await fixtures.user({ displayName: 'Upgrade fixture' });
  const sid = await fixtures.session(user._id);
  const token = await nest.get(JwtService).signAsync({ sub: user._id, sid });
  const send = (method: 'post' | 'put', path: string, body: object) =>
    request(nest.getHttpServer())
      [method]('/api/v1' + path)
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send(body);
  return {
    app: nest,
    db: fixtures,
    rootDb: root.db() as Db,
    mongo: nest.get(MongoService),
    owner: user._id,
    send,
    close,
  };
}

export const upgradeAddress = {
  recipientName: 'Fixture',
  phone: '0900000000',
  serviceAreaCode: 'HCM-DEMO-v1',
  localityCode: 'DEMO-A',
  detail: 'Test address only',
};
export const emptyContent = {
  bookId: null,
  mode: null,
  condition: null,
  pages: '',
  coverNote: '',
  notes: '',
  accessories: '',
  readable: null,
  hasMissingPages: null,
  missingEssentialContent: null,
  description: '',
  salePrice: null,
  exchangeValue: null,
  mediaIds: [] as string[],
};

// Populated fulfillment history through the public API: an address and a
// listing whose draft uses it as origin, with their receipts/audit events.
export async function populateFulfillment(
  send: Awaited<ReturnType<typeof orderUpgradeDatabase>>['send'],
) {
  const addressId = (
    await send('post', '/me/addresses', {
      expectedBookVersion: 0,
      address: upgradeAddress,
      makeDefault: false,
    }).expect(200)
  ).body.addressId as string;
  const listingId = (
    await send('post', '/listings', { content: emptyContent }).expect(200)
  ).body.entityId as string;
  await send('put', `/listings/${listingId}/draft`, {
    expectedVersion: 1,
    content: {
      ...emptyContent,
      fulfillment: {
        originAddressId: addressId,
        originAddressVersion: 1,
        method: 'DirectDelivery',
      },
    },
  }).expect(200);
  return { addressId, listingId };
}

// Whole-collection snapshot (the dedicated database only holds this suite).
export async function snapshot(db: Db, names: string[]) {
  const rows: Record<string, unknown> = {};
  for (const name of names)
    rows[name] = await db.collection(name).find().sort({ _id: 1 }).toArray();
  return rows;
}
