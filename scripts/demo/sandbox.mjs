import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ScenarioError, writeJson } from "./journal.mjs";

export const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(path.join(root, "apps/api/package.json"));
const load = (file) =>
  import(pathToFileURL(path.join(root, "apps/api/dist", file)).href);
export const QA_URL =
  "mongodb://latlai_qa_root:local_test_only@127.0.0.1:57017/admin?authSource=admin&replicaSet=rs-test&directConnection=true";

export function validateTarget(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    /* no raw URL in errors */
  }
  if (
    !parsed ||
    parsed.protocol !== "mongodb:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "57017" ||
    parsed.searchParams.get("replicaSet") !== "rs-test"
  )
    throw new ScenarioError(
      "INVALID_TARGET",
      "Scenario MongoDB must use the QA replica at 127.0.0.1:57017, rs-test.",
    );
}

function withCredentials(url, database, user, password) {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  parsed.pathname = "/" + database;
  parsed.searchParams.set("authSource", database);
  return parsed.href;
}

export function validateConfig(config) {
  if (
    !config ||
    config.schema !== 1 ||
    !/^[a-f0-9]{16}$/.test(config.id) ||
    config.database !== `latlai_demo_${config.id}_test` ||
    !["live", "fixture"].includes(config.storage) ||
    config.bucket !== `latlai-demo-${config.id}` ||
    !Number.isInteger(config.port) ||
    config.port < 3012 ||
    config.port > 65000 ||
    !config.accounts ||
    !["seller", "buyer", "reviewer", "operator"].every(
      (role) => config.accounts[role],
    ) ||
    Object.keys(config.accounts).length !== 4 ||
    new Set(Object.values(config.accounts).map((account) => account.id))
      .size !== 4 ||
    !/^[a-f0-9]{48}$/.test(config.credentials?.app ?? "") ||
    !/^[a-f0-9]{48}$/.test(config.credentials?.migrator ?? "") ||
    !/^[a-f0-9]{64}$/.test(config.jwt ?? "") ||
    typeof config.provisioned !== "boolean"
  )
    throw new ScenarioError(
      "INVALID_CONFIG",
      "Invalid private sandbox configuration.",
    );
  for (const account of Object.values(config.accounts))
    if (
      !/^[0-9a-f-]{36}$/.test(account.id) ||
      typeof account.email !== "string" ||
      !account.email.endsWith("@latlai.demo.test") ||
      !/^[a-f0-9]{48}$/.test(account.password ?? "")
    )
      throw new ScenarioError(
        "INVALID_CONFIG",
        "Invalid demo account configuration.",
      );
  if (
    config.fundingSecret !== undefined &&
    !/^[a-f0-9]{64}$/.test(config.fundingSecret)
  )
    throw new ScenarioError(
      "INVALID_CONFIG",
      "Invalid private funding simulator configuration.",
    );
  if (config.orders !== undefined) {
    if (
      !config.fundingSecret ||
      config.orders?.schema !== 1 ||
      !config.orders.addresses
    )
      throw new ScenarioError(
        "INVALID_CONFIG",
        "Orders require a new opt-in simulator sandbox.",
      );
    for (const actor of ["seller", "buyer"]) {
      const address = config.orders.addresses[actor];
      if (
        !address ||
        typeof address.recipientName !== "string" ||
        !address.recipientName.startsWith("DỮ LIỆU DEMO") ||
        address.phone !== "0900000000" ||
        typeof address.detail !== "string" ||
        !address.detail.startsWith("MÔ PHỎNG") ||
        address.serviceAreaCode !== "HCM-DEMO-v1" ||
        !["DEMO-A", "DEMO-B"].includes(address.localityCode)
      )
        throw new ScenarioError(
          "INVALID_CONFIG",
          "Orders only accept explicitly simulated contact inputs.",
        );
    }
  }
  if (
    config.storage === "live" &&
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.project)
  )
    throw new ScenarioError(
      "INVALID_CONFIG",
      "Live storage requires DEMO_SUPABASE_URL.",
    );
  return config;
}

export async function readConfig(directory) {
  try {
    return validateConfig(
      JSON.parse(await readFile(path.join(directory, "private.json"), "utf8")),
    );
  } catch (error) {
    if (error instanceof ScenarioError) throw error;
    throw new ScenarioError(
      "INVALID_CONFIG",
      "Initialize this run first; private.json is missing or unreadable.",
    );
  }
}

export async function initialize(
  directory,
  { fixture = false, port = 3012, funding = false, orders = false } = {},
) {
  const id = randomBytes(8).toString("hex");
  const accounts = Object.fromEntries(
    ["seller", "buyer", "reviewer", "operator"].map((role) => [
      role,
      {
        id: randomUUID(),
        email: `${role}-${id}@latlai.demo.test`,
        password: randomBytes(24).toString("hex"),
      },
    ]),
  );
  const config = validateConfig({
    schema: 1,
    id,
    database: `latlai_demo_${id}_test`,
    port,
    storage: fixture ? "fixture" : "live",
    bucket: `latlai-demo-${id}`,
    project: fixture ? null : process.env.DEMO_SUPABASE_URL,
    credentials: {
      app: randomBytes(24).toString("hex"),
      migrator: randomBytes(24).toString("hex"),
    },
    jwt: randomBytes(32).toString("hex"),
    accounts,
    provisioned: false,
    ...(funding || orders
      ? { fundingSecret: randomBytes(32).toString("hex") }
      : {}),
    ...(orders
      ? {
          orders: {
            schema: 1,
            addresses: Object.fromEntries(
              ["seller", "buyer"].map((actor, i) => [
                actor,
                {
                  recipientName: `DỮ LIỆU DEMO — ${actor}`,
                  phone: "0900000000",
                  detail: `MÔ PHỎNG — không giao hàng thật — ${id}`,
                  serviceAreaCode: "HCM-DEMO-v1",
                  localityCode: i === 0 ? "DEMO-A" : "DEMO-B",
                },
              ]),
            ),
          },
        }
      : {}),
  });
  // Exclusive create: initializing twice cannot rotate identities or rewrite intents.
  await writeFile(
    path.join(directory, "private.json"),
    JSON.stringify(config, null, 2) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  return config;
}

export function bindingFor(config) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: config.id,
        database: config.database,
        storage: config.storage,
        project: config.project,
        bucket: config.bucket,
        accounts: Object.entries(config.accounts).map(([role, value]) => [
          role,
          value.id,
        ]),
        ...(config.fundingSecret ? { funding: true } : {}),
        ...(config.orders
          ? {
              orderInputs: createHash("sha256")
                .update(JSON.stringify(config.orders))
                .digest("hex"),
            }
          : {}),
      }),
    )
    .digest("hex");
}

async function fixtureStorage(directory, port) {
  const folder = path.join(directory, "fixture-objects");
  await mkdir(folder, { recursive: true });
  const locate = (key) => {
    if (!/^media\/[a-f0-9-]{36}\/(input|render-[1-3]\.webp)$/.test(key))
      throw new ScenarioError(
        "INVALID_STORAGE_KEY",
        "Unexpected fixture object key.",
      );
    return path.join(folder, key.replaceAll("/", "_"));
  };
  const images = createServer(async (request, response) => {
    try {
      const key = decodeURIComponent(request.url.slice(1));
      response
        .writeHead(200, { "Content-Type": "image/webp" })
        .end(await readFile(locate(key)));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve, reject) => {
    images.once("error", reject);
    images.listen(port, "127.0.0.1", resolve);
  });
  return {
    storage: {
      async check() {},
      async put(key, bytes) {
        try {
          await writeFile(locate(key), bytes, { flag: "wx", mode: 0o600 });
        } catch (error) {
          if (
            error.code !== "EEXIST" ||
            !Buffer.from(bytes).equals(await readFile(locate(key)))
          )
            throw error;
        }
      },
      read: (key) => readFile(locate(key)),
      async remove() {
        throw new ScenarioError(
          "FIXTURE_RETENTION",
          "This demo does not run object cleanup.",
        );
      },
      async signedRead(key) {
        locate(key);
        return {
          url: `http://127.0.0.1:${port}/${encodeURIComponent(key)}`,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        };
      },
    },
    close: () => new Promise((resolve) => images.close(resolve)),
  };
}

async function prepareLiveStorage(config) {
  const key = process.env.DEMO_SUPABASE_STORAGE_KEY;
  if (!key || process.env.DEMO_SUPABASE_URL !== config.project)
    throw new ScenarioError(
      "STORAGE_BLOCKED",
      "Set matching DEMO_SUPABASE_URL and DEMO_SUPABASE_STORAGE_KEY in the private environment.",
    );
  const { StorageClient } = require("@supabase/storage-js");
  const headers = {
    apikey: key,
    ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
  };
  const client = new StorageClient(
    config.project + "/storage/v1",
    headers,
    (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
  );
  let bucket = await client.getBucket(config.bucket);
  if (bucket.error) {
    // Own random namespace only; a failed/uncertain create is reconciled by GET.
    await client.createBucket(config.bucket, {
      public: false,
      fileSizeLimit: 10_000_000,
    });
    bucket = await client.getBucket(config.bucket);
  }
  if (
    bucket.error ||
    bucket.data?.public !== false ||
    bucket.data.file_size_limit !== 10_000_000
  )
    throw new ScenarioError(
      "STORAGE_BLOCKED",
      "Dedicated private demo bucket could not be verified.",
    );
}

export async function createSandbox(config, directory) {
  validateConfig(config);
  const adminUrl = process.env.MONGO_TEST_URL || QA_URL;
  validateTarget(adminUrl);
  const { MongoClient } = require("mongodb");
  const admin = new MongoClient(adminUrl, { serverSelectionTimeoutMS: 10000 });
  let migrator, app, fixture;
  const close = async () => {
    try {
      await app?.close();
    } finally {
      try {
        await fixture?.close();
      } finally {
        await migrator?.close();
        await admin.close();
      }
    }
  };
  try {
    await admin.connect();
    const hello = await admin.db("admin").command({ hello: 1 });
    if (hello.setName !== "rs-test")
      throw new ScenarioError(
        "INVALID_TARGET",
        "MongoDB is not the QA replica set.",
      );
    const db = admin.db(config.database);
    const identities = await db
      .collection("users")
      .find({ _id: { $in: Object.values(config.accounts).map((a) => a.id) } })
      .toArray();
    if (config.provisioned && identities.length !== 4)
      throw new ScenarioError(
        "SANDBOX_LOST",
        "Demo database was removed/restarted. Keep this run; initialize a new name instead of replaying into an empty database.",
      );
    if (config.storage === "live") await prepareLiveStorage(config);
    const { bootstrapRoles } = await load("database/mongo/roles.js"),
      { migrate } = await load("database/mongo/migrate.js");
    await bootstrapRoles(db, config.credentials);
    const appUrl = withCredentials(
      adminUrl,
      config.database,
      "latlai_app",
      config.credentials.app,
    );
    migrator = await new MongoClient(
      withCredentials(
        adminUrl,
        config.database,
        "latlai_migrator",
        config.credentials.migrator,
      ),
    ).connect();
    await migrate(migrator, migrator.db());
    for (const [role, account] of Object.entries(config.accounts)) {
      const now = new Date();
      await migrator
        .db()
        .collection("users")
        .updateOne(
          { _id: account.id },
          {
            $setOnInsert: {
              _id: account.id,
              emailNormalized: account.email,
              displayName: `DỮ LIỆU DEMO — ${role}`,
              passwordHash: await require("argon2").hash(account.password),
              status: "ACTIVE",
              emailVerifiedAt: now,
              createdAt: now,
              updatedAt: now,
              roles: [
                {
                  role:
                    role === "reviewer"
                      ? "ADMIN"
                      : role === "operator"
                        ? "TEST_OPERATOR"
                        : "MEMBER",
                  grantedAt: now,
                },
              ],
              lockSeq: 0,
            },
          },
          { upsert: true },
        );
    }
    config.provisioned = true;
    await writeJson(path.join(directory, "private.json"), config);
    // ConfigModule may read .env, but these complete overrides win; no file is changed.
    Object.assign(process.env, {
      MONGODB_URL: appUrl,
      NODE_ENV: "test",
      PORT: String(config.port),
      JWT_ACCESS_SECRET: config.jwt,
      CORS_ORIGINS:
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://127.0.0.1:8081,http://127.0.0.1:8087",
      SUPABASE_URL: config.storage === "live" ? config.project : "",
      SUPABASE_STORAGE_KEY:
        config.storage === "live" ? process.env.DEMO_SUPABASE_STORAGE_KEY : "",
      SUPABASE_MEDIA_BUCKET: config.bucket,
      MEDIA_STORAGE_BUDGET_BYTES: "50000000",
      PAYMENT_SIMULATOR_SECRET: config.fundingSecret ?? "",
    });
    const { AppModule } = await load("app.module.js"),
      { configureApp } = await load("configure-app.js"),
      { MediaWorker } = await load("modules/media/media-worker.service.js"),
      { MediaStorage } = await load("modules/media/media-storage.js");
    if (config.storage === "fixture") {
      fixture = await fixtureStorage(directory, config.port + 1);
      const module = await require("@nestjs/testing")
        .Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MediaStorage)
        .useValue(fixture.storage)
        .compile();
      app = module.createNestApplication({ logger: false });
    } else {
      app = await require("@nestjs/core").NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
      });
    }
    configureApp(app, { docs: false, logRequests: false });
    await app.listen(config.port, "127.0.0.1");
    const { MongoService } = await load("database/mongo/mongo.service.js"),
      { LedgerService } = await load("modules/wallet/ledger.service.js");
    const { checkOrder } = await load("modules/orders/order-invariants.js");
    return {
      base: `http://127.0.0.1:${config.port}/api/v1`,
      close,
      tokens: {},
      processMedia: () => app.get(MediaWorker).tick(),
      reconcileMoney: () =>
        app.get(MongoService).tx((tx) => app.get(LedgerService).reconcile(tx)),
      checkOrder: (id) => app.get(MongoService).tx((tx) => checkOrder(tx, id)),
      // Exposed to focused QA only. Orchestration never writes business documents.
      inspect: (collection) => db.collection(collection),
    };
  } catch (error) {
    await close();
    throw error;
  }
}
