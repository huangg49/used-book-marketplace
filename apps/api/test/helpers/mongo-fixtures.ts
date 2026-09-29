import { randomBytes, randomUUID } from 'node:crypto';
import { MongoClient, type Document } from 'mongodb';
import {
  bindCollections,
  type Collections,
} from '../../src/database/mongo/collections.js';
import type { RoleCode, UserDoc } from '../../src/database/mongo/documents.js';

// Fixture access for E2E suites. Connects as the migrator (readWrite), so
// fixtures can be removed, but validators still reject malformed documents.
export class MongoFixtures {
  private constructor(
    readonly client: MongoClient,
    readonly c: Collections,
  ) {}
  static async connect() {
    const client = await new MongoClient(
      process.env.MONGO_FIXTURE_URL!,
    ).connect();
    return new MongoFixtures(client, bindCollections(client.db()));
  }
  close() {
    return this.client.close();
  }
  async user(
    options: {
      email?: string;
      passwordHash?: string;
      displayName?: string;
      roles?: RoleCode[];
      status?: UserDoc['status'];
      verified?: boolean;
    } = {},
  ): Promise<UserDoc> {
    const now = new Date();
    const user: UserDoc = {
      _id: randomUUID(),
      emailNormalized: options.email ?? `user-${randomUUID()}@example.com`,
      passwordHash: options.passwordHash ?? 'not-a-login-hash',
      displayName: options.displayName ?? 'Người dùng kiểm thử',
      status: options.status ?? 'ACTIVE',
      emailVerifiedAt: options.verified === false ? null : now,
      createdAt: now,
      updatedAt: now,
      roles: (options.roles ?? ['MEMBER']).map((role) => ({
        role,
        grantedAt: now,
      })),
      lockSeq: 0,
    };
    await this.c.users.insertOne(user);
    return user;
  }
  addRole(userId: string, role: RoleCode) {
    return this.c.users.updateOne(
      { _id: userId },
      {
        $push: { roles: { role, grantedAt: new Date() } },
        $inc: { lockSeq: 1 },
      },
    );
  }
  removeRole(userId: string, role: RoleCode) {
    return this.c.users.updateOne(
      { _id: userId },
      { $pull: { roles: { role } }, $inc: { lockSeq: 1 } },
    );
  }
  setStatus(userId: string, status: UserDoc['status']) {
    return this.c.users.updateOne(
      { _id: userId },
      { $set: { status, updatedAt: new Date() }, $inc: { lockSeq: 1 } },
    );
  }
  async session(userId: string) {
    const id = randomUUID();
    await this.c.auth_sessions.insertOne({
      _id: id,
      userId,
      refreshTokenHash: randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      createdAt: new Date(),
      lockSeq: 0,
    });
    return id;
  }
  // Fault injection, the equivalent of a temporary failing SQL trigger: adds a
  // rule to a collection validator for the duration of `fn`, then restores it.
  async withRejectingValidator<T>(
    collection: string,
    rejectWhen: Document,
    fn: () => Promise<T>,
  ): Promise<T> {
    const db = this.client.db();
    const [info] = (await db
      .listCollections({ name: collection })
      .toArray()) as { options?: { validator?: Document } }[];
    const original = info.options!.validator!;
    await db.command({
      collMod: collection,
      validator: { $and: [original, { $nor: [rejectWhen] }] },
    });
    try {
      return await fn();
    } finally {
      await db.command({ collMod: collection, validator: original });
    }
  }
  async removeUsers(ids: string[]) {
    await this.c.auth_sessions.deleteMany({ userId: { $in: ids } });
    await this.c.users.deleteMany({ _id: { $in: ids } });
  }
}
