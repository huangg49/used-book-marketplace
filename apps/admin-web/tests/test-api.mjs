// Isolated HTTP/MongoDB fixture: a disposable *_test database on the QA replica
// set with its own least-privilege users. Storage is local and fake; Sharp is real.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
const req = createRequire(path.join(root, "apps/api/package.json"));
export const origin = "http://127.0.0.1:5174";
export const base = "http://127.0.0.1:3009/api/v1";
export const password = "Operations-test-only-2026!";
const withCredentials = (url, database, user, secret) => {
  const match =
    /^(mongodb(?:\+srv)?:\/\/)(?:[^@/]*@)?([^/]+)\/[^?]*(?:\?(.*))?$/.exec(url);
  if (!match) throw new Error("Unsupported MongoDB URL.");
  const params = new URLSearchParams(match[3] ?? "");
  params.set("authSource", database);
  return `${match[1]}${user}:${secret}@${match[2]}/${database}?${params}`;
};
export async function createTestApi({
  corsOrigin = origin,
  listingCount = 3,
  photoBytes,
  onResponse,
} = {}) {
  const rootUrl = process.env.MONGO_TEST_URL;
  if (!rootUrl)
    throw new Error(
      "MONGO_TEST_URL must name the QA replica set (pnpm infra:mongo:test:up).",
    );
  const database = `ops_browser_${randomBytes(8).toString("hex")}_test`;
  const credentials = {
    app: randomBytes(24).toString("hex"),
    migrator: randomBytes(24).toString("hex"),
  };
  Object.assign(process.env, {
    MONGODB_URL: withCredentials(
      rootUrl,
      database,
      "latlai_app",
      credentials.app,
    ),
    JWT_ACCESS_SECRET: "operations-browser-test-only-key-0000000000",
    NODE_ENV: "test",
    // Listings are always free. Historical browser suites retain unpaid checkout;
    // the wallet suite supplies an obsolete fee value to verify it is ignored.
    LISTING_SUBMISSION_FEE_VND: process.env.LISTING_SUBMISSION_FEE_VND ?? "0",
    ORDER_CHECKOUT_MODE: process.env.ORDER_CHECKOUT_MODE ?? "Unpaid",
    CORS_ORIGINS: corsOrigin,
    SUPABASE_URL: "",
    SUPABASE_STORAGE_KEY: "",
  });
  const load = (p) =>
    import(pathToFileURL(path.join(root, "apps/api/dist", p)).href);
  const { MongoClient } = req("mongodb");
  const { bootstrapRoles } = await load("database/mongo/roles.js"),
    { migrate } = await load("database/mongo/migrate.js");
  const admin = new MongoClient(rootUrl);
  let app, migrator, images;
  const close = async () => {
    try {
      await app?.close();
    } finally {
      try {
        if (images?.listening)
          await new Promise((resolve) => images.close(resolve));
        await migrator?.close();
      } finally {
        try {
          const disposable = admin.db(database);
          await disposable.dropDatabase();
          await disposable.command({ dropAllUsersFromDatabase: 1 });
          await disposable.command({ dropAllRolesFromDatabase: 1 });
        } finally {
          await admin.close();
        }
      }
    }
  };
  try {
    await admin.connect();
    await bootstrapRoles(admin.db(database), credentials);
    migrator = await new MongoClient(
      withCredentials(
        rootUrl,
        database,
        "latlai_migrator",
        credentials.migrator,
      ),
    ).connect();
    await migrate(migrator, migrator.db());
    const db = migrator.db();
    const objects = new Map();
    const storage = {
      async check() {},
      async put(key, bytes) {
        objects.set(key, Buffer.from(bytes));
      },
      async read(key) {
        if (!objects.has(key)) throw new Error("Missing test image");
        return objects.get(key);
      },
      async remove(keys) {
        keys.forEach((key) => objects.delete(key));
      },
      async signedRead(key) {
        return {
          url: "http://127.0.0.1:3010/" + encodeURIComponent(key),
          expiresAt: new Date(Date.now() + 120000).toISOString(),
        };
      },
    };
    const { createServer } = await import("node:http");
    images = createServer((request, response) => {
      const bytes = objects.get(decodeURIComponent(request.url.slice(1)));
      if (!bytes) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "image/webp" }).end(bytes);
    });
    await new Promise((resolve, reject) => {
      images.once("error", reject);
      images.listen(3010, "127.0.0.1", resolve);
    });
    const { Test } = req("@nestjs/testing");
    const { AppModule } = await load("app.module.js"),
      { MediaStorage } = await load("modules/media/media-storage.js"),
      { MediaWorker } = await load("modules/media/media-worker.service.js"),
      { configureApp } = await load("configure-app.js");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    // Opt-in QA counters never receive headers, tokens, bodies or response data.
    if (onResponse)
      app.use((request, response, next) => {
        response.once("finish", () =>
          onResponse({
            method: request.method,
            path: request.path,
            status: response.statusCode,
          }),
        );
        next();
      });
    await app.listen(3009, "127.0.0.1");
    for (const [email, roles] of [
      ["member@operations.test", ["MEMBER"]],
      ["admin@operations.test", ["ADMIN", "STAFF", "MEMBER"]],
      ["staff@operations.test", ["STAFF"]],
    ])
      await db.collection("users").insertOne({
        _id: randomUUID(),
        emailNormalized: email,
        displayName: "Tài khoản kiểm thử",
        passwordHash: await req("argon2").hash(password),
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        roles: roles.map((role) => ({ role, grantedAt: new Date() })),
        lockSeq: 0,
      });
    const api = async (
      route,
      token,
      body,
      method = body ? "POST" : "GET",
      headers = {},
    ) => {
      const response = await fetch(base + route, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Idempotency-Key": randomUUID(),
          ...headers,
        },
        body:
          body === undefined
            ? undefined
            : Buffer.isBuffer(body)
              ? body
              : JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(`Fixture ${method} ${route}: HTTP ${response.status}`);
      return response.status === 204 ? undefined : response.json();
    };
    const member = await api("/auth/login", null, {
      email: "member@operations.test",
      password,
    });
    const metadata = {
      title:
        "Những trang sách qua tay người đọc — hành trình của một cuốn sách trong thành phố",
      authors: ["Tác giả kiểm thử"],
      publisher: "Nhà xuất bản thử nghiệm",
      publicationYear: 2024,
      language: "vi",
      edition: "Bản thử nghiệm",
      category: "Văn học",
      isbn: null,
    };
    const catalog = await api("/catalog/requests", member.accessToken, {
      metadata,
    });
    const extra = await api("/catalog/requests", member.accessToken, {
      metadata: { ...metadata, title: "Đầu sách cần bổ sung thông tin" },
    });
    const content = {
      bookId: catalog.entityId,
      mode: "Both",
      condition: "Good",
      pages: "Đủ trang, mép giấy hơi ngả màu.",
      coverNote: "Góc bìa sờn nhẹ, gáy còn chắc.",
      notes: "Gạch chân bằng bút chì ở trang 15 và 27.",
      accessories: "Không có",
      description:
        "DỮ LIỆU KIỂM THỬ. Cuốn sách đã cùng tôi đi qua nhiều buổi chiều đọc ở quán cà phê.",
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      salePrice: 125000,
      exchangeValue: 150000,
      mediaIds: [],
    };
    const photo =
      photoBytes ??
      (await req("sharp")({
        create: { width: 400, height: 500, channels: 3, background: "#58685E" },
      })
        .png()
        .toBuffer());
    const listings = [];
    if (listingCount > 5) {
      // Multiple owners can only select a catalog already confirmed by review.
      const reviewer = await api("/auth/login", null, {
        email: "admin@operations.test",
        password,
      });
      await api(
        `/operations/catalog-requests/${catalog.entityId}/decision`,
        reviewer.accessToken,
        {
          expectedVersion: catalog.version,
          revisionId: catalog.revisionId,
          decision: "Confirm",
        },
      );
    }
    let listingOwner = member;
    for (let index = 0; index < listingCount; index++) {
      // A large public shelf needs multiple owners under the real API cap.
      if (index > 0 && index % 5 === 0) {
        const email = `shelf-owner-${index}@operations.test`;
        const template = await db
          .collection("users")
          .findOne({ emailNormalized: "member@operations.test" });
        await db.collection("users").insertOne({
          ...template,
          _id: randomUUID(),
          emailNormalized: email,
        });
        listingOwner = await api("/auth/login", null, { email, password });
      }
      const ownerToken = listingOwner.accessToken;
      const draft = await api("/listings", ownerToken, { content });
      const id = draft.entityId;
      const media = await api(`/listings/${id}/media`, ownerToken, {
        expectedVersion: draft.version,
        mimeType: "image/png",
        byteSize: photo.length,
        sha256: createHash("sha256").update(photo).digest("hex"),
      });
      const ticket = await api(
        `/listings/${id}/media/${media.entityId}/upload-ticket`,
        ownerToken,
      );
      await api(ticket.path, ownerToken, photo, "PUT", ticket.headers);
      const uploaded = await api(
        `/me/listings/${id}/media/${media.entityId}`,
        ownerToken,
      );
      await api(
        `/listings/${id}/media/${media.entityId}/finalize`,
        ownerToken,
        { expectedVersion: uploaded.version },
      );
      await app.get(MediaWorker).tick();
      const fresh = await api(`/me/listings/${id}`, ownerToken);
      const saved = await api(
        `/listings/${id}/draft`,
        ownerToken,
        {
          expectedVersion: fresh.version,
          content: { ...content, mediaIds: [media.entityId] },
        },
        "PUT",
      );
      await api(`/listings/${id}/submit`, ownerToken, {
        expectedVersion: saved.version,
        ownershipDeclared: true,
      });
      listings.push(id);
    }
    // Login throttling is tested by API E2E. Browser fixtures clear only their own database.
    await db.collection("login_attempts").deleteMany({});
    return {
      close,
      api,
      db,
      // Owner status changes follow the write protocol (lock sequence, updatedAt).
      setUserStatus: (id, status) =>
        db
          .collection("users")
          .updateOne(
            { _id: id },
            { $set: { status, updatedAt: new Date() }, $inc: { lockSeq: 1 } },
          ),
      member,
      metadata,
      catalogId: catalog.entityId,
      extraId: extra.entityId,
      listings,
      photo,
      processMedia: () => app.get(MediaWorker).tick(),
    };
  } catch (error) {
    await close();
    throw error;
  }
}
