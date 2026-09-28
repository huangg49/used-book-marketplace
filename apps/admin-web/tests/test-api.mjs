// Isolated HTTP/PostgreSQL fixture. Storage is local and fake; Sharp is real.
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
const req = createRequire(path.join(root, "apps/api/package.json"));
export const origin = "http://127.0.0.1:5174";
export const base = "http://127.0.0.1:3009/api/v1";
export const password = "Operations-test-only-2026!";
export async function createTestApi({ corsOrigin = origin, listingCount = 3 } = {}) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error(
      "TEST_DATABASE_URL must name a dedicated database ending in _test.",
    );
  Object.assign(process.env, {
    DATABASE_URL: url,
    JWT_ACCESS_SECRET: "operations-browser-test-only-key-0000000000",
    NODE_ENV: "test",
    CORS_ORIGINS: corsOrigin,
    SUPABASE_URL: "",
    SUPABASE_STORAGE_KEY: "",
  });
  const load = (p) =>
    import(pathToFileURL(path.join(root, "apps/api/dist", p)).href);
  const { PrismaPg } = req("@prisma/adapter-pg");
  const { PrismaClient } = await load("generated/prisma/client.js");
  const schema = `ops_browser_${randomBytes(8).toString("hex")}`;
  const adapter = await new PrismaPg({
    connectionString: url,
    options: `-c search_path=${schema},public -c timezone=UTC`,
  }).connect();
  const pool = adapter.underlyingDriver();
  let app, db, images;
  const close = async () => {
    try {
      await app?.close();
    } finally {
      try {
        if (images?.listening)
          await new Promise((resolve) => images.close(resolve));
        await db?.$disconnect();
      } finally {
        try {
          await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        } finally {
          await adapter.dispose();
        }
      }
    }
  };
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const migrations = path.join(root, "apps/api/prisma/migrations");
    for (const name of readdirSync(migrations)
      .filter((name) => /^\d/.test(name))
      .sort())
      await pool.query(
        readFileSync(path.join(migrations, name, "migration.sql"), "utf8"),
      );
    db = new PrismaClient({ adapter: new PrismaPg(pool, { schema }) });
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
      { DatabaseService } = await load("database/database.service.js"),
      { MediaStorage } = await load("modules/media/media-storage.js"),
      { MediaWorker } = await load("modules/media/media-worker.service.js"),
      { configureApp } = await load("configure-app.js");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue(db)
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    configureApp(app, { docs: false, logRequests: false });
    await app.listen(3009, "127.0.0.1");
    for (const [email, roles] of [
      ["member@operations.test", ["MEMBER"]],
      ["admin@operations.test", ["ADMIN", "STAFF", "MEMBER"]],
      ["staff@operations.test", ["STAFF"]],
    ])
      await db.user.create({
        data: {
          emailNormalized: email,
          displayName: "Tài khoản kiểm thử",
          passwordHash: await req("argon2").hash(password),
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
          roles: { create: roles.map((role) => ({ role })) },
        },
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
    const photo = await req("sharp")({
      create: { width: 400, height: 500, channels: 3, background: "#58685E" },
    })
      .png()
      .toBuffer();
    const listings = [];
    for (let index = 0; index < listingCount; index++) {
      const draft = await api("/listings", member.accessToken, { content });
      const id = draft.entityId;
      const media = await api(`/listings/${id}/media`, member.accessToken, {
        expectedVersion: draft.version,
        mimeType: "image/png",
        byteSize: photo.length,
        sha256: createHash("sha256").update(photo).digest("hex"),
      });
      const ticket = await api(
        `/listings/${id}/media/${media.entityId}/upload-ticket`,
        member.accessToken,
      );
      await api(ticket.path, member.accessToken, photo, "PUT", ticket.headers);
      const uploaded = await api(
        `/me/listings/${id}/media/${media.entityId}`,
        member.accessToken,
      );
      await api(
        `/listings/${id}/media/${media.entityId}/finalize`,
        member.accessToken,
        { expectedVersion: uploaded.version },
      );
      await app.get(MediaWorker).tick();
      const fresh = await api(`/me/listings/${id}`, member.accessToken);
      const saved = await api(
        `/listings/${id}/draft`,
        member.accessToken,
        {
          expectedVersion: fresh.version,
          content: { ...content, mediaIds: [media.entityId] },
        },
        "PUT",
      );
      await api(`/listings/${id}/submit`, member.accessToken, {
        expectedVersion: saved.version,
        ownershipDeclared: true,
      });
      listings.push(id);
    }
    // Login throttling is tested by API E2E. Browser fixtures clear only their own schema.
    await db.loginAttempt.deleteMany();
    return {
      close,
      api,
      db,
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
