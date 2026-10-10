import { createHash, randomUUID, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  Commands,
  openJournal,
  ScenarioError,
  writeJson,
} from "../demo/journal.mjs";
import { createHttp } from "../demo/http.mjs";
import { bindingFor, root, QA_URL, validateTarget } from "../demo/sandbox.mjs";

const require = createRequire(path.join(root, "apps/api/package.json"));
export function assert(ok, message) {
  if (!ok) throw new ScenarioError("PILOT_CHECK_FAILED", message);
}

export async function actorHttp(config, sandbox, actors = ["buyer"]) {
  const http = createHttp(sandbox.base, sandbox.tokens);
  for (const actor of actors) {
    if (!sandbox.tokens[actor]) {
      const account = config.accounts[actor];
      sandbox.tokens[actor] = (
        await http("/auth/login", {
          method: "POST",
          body: { email: account.email, password: account.password },
        })
      ).accessToken;
    }
    assert(
      (await http("/auth/me", { actor })).id === config.accounts[actor].id,
      "API identity differs from this QA sandbox.",
    );
  }
  return http;
}

// Fixture identity provisioning only, as in createSandbox; all catalog/listing/media writes use API commands.
async function pagingSellers(config, directory) {
  const file = path.join(directory, "private-paging-sellers.json");
  let extra;
  try {
    extra = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    extra = Array.from({ length: 2 }, (_, n) => ({
      id: randomUUID(),
      email: `paging-seller-${n}-${config.id}@latlai.demo.test`,
      password: randomBytes(24).toString("hex"),
    }));
    await writeJson(file, extra);
  }
  assert(
    extra.length === 2 &&
      extra.every(
        (a, n) =>
          /^[0-9a-f-]{36}$/.test(a.id) &&
          a.email === `paging-seller-${n}-${config.id}@latlai.demo.test` &&
          /^[a-f0-9]{48}$/.test(a.password),
      ),
    "Invalid private paging identities.",
  );
  const url = process.env.MONGO_TEST_URL || QA_URL;
  validateTarget(url);
  const client = await new (require("mongodb").MongoClient)(url).connect();
  try {
    assert(
      (await client.db("admin").command({ hello: 1 })).setName === "rs-test",
      "Paging identity provisioning requires rs-test.",
    );
    const db = client.db(config.database);
    for (const [n, account] of extra.entries()) {
      const now = new Date();
      await db.collection("users").updateOne(
        { _id: account.id },
        {
          $setOnInsert: {
            _id: account.id,
            emailNormalized: account.email,
            displayName: `DỮ LIỆU QA — người bán phân trang ${n + 2}`,
            passwordHash: await require("argon2").hash(account.password),
            status: "ACTIVE",
            emailVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
            roles: [{ role: "MEMBER", grantedAt: now }],
            lockSeq: 0,
          },
        },
        { upsert: true },
      );
    }
  } finally {
    await client.close();
  }
  return [config.accounts.seller, ...extra];
}

export async function prepareFixtures(config, directory, sandbox, paging) {
  const manifestFile = path.join(directory, "pilot-fixtures.json");
  try {
    const existing = JSON.parse(await readFile(manifestFile, "utf8"));
    assert(
      existing.binding === bindingFor(config) && existing.paging === paging,
      "Keep this dataset's original mode; use a new name for a different mode.",
    );
    await createHttp(
      sandbox.base,
      sandbox.tokens,
    )(`/listings/${existing.target}`);
    return { ...existing, reused: true };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const http = await actorHttp(config, sandbox, ["seller", "reviewer"]);
  const initialSellerToken = sandbox.tokens.seller;
  const journal = await openJournal(directory, bindingFor(config));
  const sharp = require("sharp");
  const commands = new Commands(journal, async (intent) => {
    if (intent.kind === "photo") {
      const photo = await readFile(
        path.join(directory, "uploads", `${intent.body.sha256}.png`),
      );
      assert(
        photo.length === intent.body.byteSize &&
          createHash("sha256").update(photo).digest("hex") ===
            intent.body.sha256,
        "Preserve original upload bytes for replay.",
      );
      const ticket = await http(
        intent.route.replace(/\/content$/, "/upload-ticket"),
        { actor: intent.actor },
      );
      assert(
        ticket.path === intent.route && ticket.method === "PUT",
        "Unexpected upload ticket.",
      );
      return http(intent.route, {
        actor: intent.actor,
        method: "PUT",
        binary: true,
        body: photo,
        headers: { ...ticket.headers, "Idempotency-Key": intent.key },
      });
    }
    return http(intent.route, {
      actor: intent.actor,
      method: intent.method,
      body: intent.body,
      headers: { "Idempotency-Key": intent.key },
    });
  });
  const command = (name, actor, route, build, method = "POST", kind) =>
    commands.execute(name, async () => ({
      actor,
      route,
      method,
      body: await build(),
      ...(kind ? { kind } : {}),
    }));
  const definitions = [
    [
      "gatsby",
      "The Great Gatsby",
      "F. Scott Fitzgerald",
      "Good",
      "Both",
      65000,
      80000,
      3,
    ],
    [
      "gatsby-expensive",
      "The Great Gatsby",
      "F. Scott Fitzgerald",
      "Good",
      "Sale",
      150000,
      null,
      1,
    ],
    [
      "dalloway",
      "Mrs. Dalloway",
      "Virginia Woolf",
      "LikeNew",
      "Sale",
      90000,
      null,
      1,
    ],
    [
      "garden",
      "The Secret Garden",
      "Frances Hodgson Burnett",
      "Good",
      "Exchange",
      null,
      70000,
      1,
    ],
    [
      "siddhartha",
      "Siddhartha",
      "Hermann Hesse",
      "Fair",
      "Sale",
      50000,
      null,
      1,
    ],
    [
      "alice",
      "Alice’s Adventures in Wonderland",
      "Lewis Carroll",
      "Good",
      "Both",
      75000,
      90000,
      1,
    ],
    [
      "long-valid",
      "Những con đường nhỏ, những mùa mưa và một cuốn sách cũ ở lại bên cửa sổ",
      "Tác giả mô phỏng tên dài",
      "Worn",
      "Both",
      1000000,
      999000,
      1,
    ],
  ];
  if (paging)
    definitions.splice(
      1,
      definitions.length - 1,
      ...Array.from({ length: 50 }, (_, n) => [
        `paging-${n + 1}`,
        `Phân trang — bản thử ${n + 1}`,
        "Tác giả mô phỏng",
        "Good",
        "Sale",
        150000,
        null,
        1,
      ]),
    );
  const fixtures = [];
  const sellers = paging
    ? await pagingSellers(config, directory)
    : [config.accounts.seller];
  let sellerIndex = 0,
    uploads = 0;
  for (const [
    slug,
    title,
    author,
    condition,
    mode,
    salePrice,
    exchangeValue,
    photoCount,
  ] of definitions) {
    if (uploads + photoCount > 20) {
      sellerIndex++;
      uploads = 0;
    }
    const seller = sellers[sellerIndex];
    assert(seller, "Dataset exceeds its provisioned sellers' upload quota.");
    if (sellerIndex > 0 && uploads === 0) {
      sandbox.tokens.seller = (
        await http("/auth/login", {
          method: "POST",
          body: { email: seller.email, password: seller.password },
        })
      ).accessToken;
      assert(
        (await http("/auth/me", { actor: "seller" })).id === seller.id,
        "Paging seller identity differs.",
      );
    }
    uploads += photoCount;
    const catalog = await command(
      `${slug}.catalog`,
      "seller",
      "/catalog/requests",
      () => ({
        metadata: {
          title: `[QA] ${title}`,
          authors: [author],
          publisher: "Dữ liệu QA Lật lại",
          publicationYear: 2026,
          language: "vi",
          edition: "Bản mô phỏng",
          category: "Văn học",
          isbn: null,
        },
      }),
    );
    const bookId = catalog.entityId;
    await command(
      `${slug}.confirm`,
      "reviewer",
      `/operations/catalog-requests/${bookId}/decision`,
      async () => {
        const current = await http(`/operations/catalog-requests/${bookId}`, {
          actor: "reviewer",
        });
        return {
          expectedVersion: current.version,
          revisionId: current.currentRevision.id,
          decision: "Confirm",
        };
      },
    );
    const content = {
      bookId,
      condition,
      mode,
      salePrice,
      exchangeValue,
      readable: true,
      hasMissingPages: slug === "long-valid",
      missingEssentialContent: false,
      pages:
        slug === "long-valid"
          ? "MÔ PHỎNG — thiếu trang phụ lục, nội dung chính đọc rõ."
          : "MÔ PHỎNG — đủ trang, nội dung đọc rõ.",
      coverNote:
        "MÔ PHỎNG — bìa sờn. Ảnh tư liệu, không phải ảnh bản sách thật.",
      notes: "DỮ LIỆU QA — không phải lời rao bán.",
      accessories: "Không có phụ kiện.",
      description:
        "DỮ LIỆU QA. Giá và tình trạng mô phỏng. Bìa tư liệu Standard Ebooks; nguồn tại docs/ui/shelf-directions/assets/sources.json. Không chứng minh sách thật hoặc quyền sở hữu.",
      mediaIds: [],
    };
    const listing = await command(
      `${slug}.draft`,
      "seller",
      "/listings",
      () => ({ content }),
    );
    const id = listing.entityId,
      mediaIds = [];
    const asset = slug.startsWith("gatsby")
      ? "gatsby"
      : slug.startsWith("paging") || slug === "long-valid"
        ? "jekyll"
        : slug;
    const assetBytes = await readFile(
      path.join(root, "docs/ui/shelf-directions/assets", `${asset}.svg`),
    );
    for (let n = 0; n < photoCount; n++) {
      const photo = await sharp(assetBytes)
        .resize({ width: 300 - n * 10 })
        .png()
        .toBuffer();
      const sha256 = createHash("sha256").update(photo).digest("hex");
      const media = await command(
        `${slug}.media-${n}`,
        "seller",
        `/listings/${id}/media`,
        async () => {
          const current = await http(`/me/listings/${id}`, { actor: "seller" });
          return {
            expectedVersion: current.version,
            mimeType: "image/png",
            byteSize: photo.length,
            sha256,
          };
        },
      );
      const mediaId = media.entityId;
      await mkdir(path.join(directory, "uploads"), { recursive: true });
      const file = path.join(directory, "uploads", `${sha256}.png`);
      try {
        await writeFile(file, photo, { flag: "wx" });
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      await command(
        `${slug}.upload-${n}`,
        "seller",
        `/listings/${id}/media/${mediaId}/content`,
        () => ({ byteSize: photo.length, sha256 }),
        "PUT",
        "photo",
      );
      await command(
        `${slug}.finalize-${n}`,
        "seller",
        `/listings/${id}/media/${mediaId}/finalize`,
        async () => {
          const current = await http(`/me/listings/${id}/media/${mediaId}`, {
            actor: "seller",
          });
          return { expectedVersion: current.version };
        },
      );
      const deadline = Date.now() + 90000;
      for (;;) {
        const current = await http(`/me/listings/${id}/media/${mediaId}`, {
          actor: "seller",
        });
        if (current.status === "Ready") break;
        assert(
          current.status !== "Failed" && Date.now() < deadline,
          "QA media did not become Ready; keep journal for diagnosis.",
        );
        await sandbox.processMedia();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      mediaIds.push(mediaId);
    }
    await command(
      `${slug}.attach`,
      "seller",
      `/listings/${id}/draft`,
      async () => ({
        expectedVersion: (await http(`/me/listings/${id}`, { actor: "seller" }))
          .version,
        content: { ...content, mediaIds },
      }),
      "PUT",
    );
    await command(
      `${slug}.submit`,
      "seller",
      `/listings/${id}/submit`,
      async () => ({
        expectedVersion: (await http(`/me/listings/${id}`, { actor: "seller" }))
          .version,
        ownershipDeclared: true,
      }),
    );
    await command(
      `${slug}.approve`,
      "reviewer",
      `/operations/listings/${id}/decision`,
      async () => {
        const current = await http(`/operations/listings/${id}`, {
          actor: "reviewer",
        });
        return {
          expectedVersion: current.version,
          revisionId: current.currentRevision.id,
          decision: "Approve",
          checklist: {
            catalogMatches: true,
            photosClear: true,
            conditionDisclosed: true,
            readable: true,
            pricingValid: true,
            contentAppropriate: true,
          },
        };
      },
    );
    const detail = await http(`/listings/${id}`);
    assert(
      detail.id === id && detail.photos.length === photoCount,
      "Public QA listing/photo projection differs.",
    );
    fixtures.push({
      slug,
      listingId: id,
      salePrice,
      exchangeValue,
      photoCount,
    });
    console.log(`QA listing ${fixtures.length}/${definitions.length} ready.`);
  }
  const manifest = {
    schema: 1,
    binding: bindingFor(config),
    paging,
    target: fixtures[0].listingId,
    fixtures,
  };
  await writeJson(manifestFile, manifest);
  sandbox.tokens.seller = initialSellerToken;
  return manifest;
}

export async function resetWishlist(http, actor = "buyer") {
  const ids = [],
    visited = new Set();
  let cursor;
  do {
    const page = await http(
      `/me/wishlist?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      { actor },
    );
    ids.push(...page.items);
    cursor = page.nextCursor;
    if (cursor) {
      assert(
        !visited.has(cursor),
        "QA wishlist cursor repeated; no reset performed.",
      );
      visited.add(cursor);
    }
  } while (cursor);
  for (const item of ids)
    await http(
      `/me/wishlist/${item.subjectType === "LISTING" ? "listings" : "catalog-books"}/${item.subjectId}`,
      { actor, method: "DELETE" },
    );
  assert(
    (await http("/me/wishlist?limit=50", { actor })).items.length === 0,
    "QA wishlist reset was not confirmed.",
  );
}

export async function seedPagination(
  config,
  sandbox,
  manifest,
  actor = "buyer",
) {
  assert(
    manifest.paging && manifest.fixtures.length === 51,
    "Use a paging dataset for the 51-item check.",
  );
  const http = await actorHttp(config, sandbox, [actor]);
  await resetWishlist(http, actor);
  for (const item of manifest.fixtures)
    await http(`/me/wishlist/listings/${item.listingId}`, {
      actor,
      method: "PUT",
      body: { wantsToExchange: false, receiveNotifications: true },
    });
  const first = await http("/me/wishlist?limit=50&subjectType=LISTING", {
    actor,
  });
  assert(
    first.items.length === 50 &&
      first.nextCursor &&
      !first.items.some((i) => i.subjectId === manifest.target),
    "Target must be absent from the first 50-item page.",
  );
  const second = await http(
    `/me/wishlist?limit=50&subjectType=LISTING&cursor=${encodeURIComponent(first.nextCursor)}`,
    { actor },
  );
  assert(
    second.items.length === 1 &&
      second.items[0].subjectId === manifest.target &&
      !second.nextCursor,
    "Target must be item 51 on page two.",
  );
  console.log(
    "PASS: API confirms 50 items on page one and Gatsby alone on page two.",
  );
}
