import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const apiRequire = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const sessionRequire = createRequire(
  new URL("../../packages/session-client/package.json", import.meta.url),
);
const sharp = apiRequire("sharp");
const { z } = sessionRequire("zod");
const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/);
const text = z.string().trim().min(1);
const strings = z.array(text);
const year = z.number().int().min(1400).max(9999).nullable();
const isbn = z
  .string()
  .regex(/^\d{13}$/)
  .nullable();
const evidence = z.object({ sourceIds: z.array(id).min(1), locator: text });
const metadata = z.object({
  title: text,
  authors: strings.min(1),
  publisher: text.nullable(),
  publicationYear: year,
  language: text,
  edition: text.nullable(),
  isbn,
  translators: strings.optional(),
  illustrators: strings.optional(),
});
const image = z.object({
  path: text,
  sourceId: id,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(10_000_000),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  sourceType: z.enum(["cover-scan", "real-camera"]),
  rightsStatus: text,
});
const book = z.object({
  bookKey: id,
  status: z.enum(["ready", "partial", "blocked"]),
  metadata,
  isbnStatus: z.enum(["observed", "unknown", "not-present"]),
  sourceIds: z.array(id).min(1),
  fieldEvidence: z.record(z.string(), evidence),
  images: z.array(image).min(1),
  verification: z.object({
    method: text,
    humanReviewed: z.literal(false),
    reviewedBy: z.null(),
    reviewedAt: z.null(),
  }),
  issues: strings,
});
const expected = metadata
  .omit({ translators: true, illustrators: true })
  .partial()
  .extend({
    title: text,
    authors: strings,
    isbn,
  })
  .strict();
const testCase = z.object({
  id,
  bookKey: id,
  reviewed: z.literal(false),
  photos: z.array(text).min(1).max(3),
  expected,
});
const lane = (source) =>
  z.object({
    source: z.literal(source),
    cases: z.array(testCase),
    reason: text.optional(),
  });
const source = z.object({
  sourceId: id,
  url: z.url().refine((s) => new URL(s).protocol === "https:"),
  domain: text,
  independenceGroup: text,
  accessedAt: text,
  rights: text,
});
const observation = z.object({
  id,
  bookKey: id,
  kind: z.enum([
    "CoverPrice",
    "EditorialReference",
    "CompletedSale",
    "InternalAsking",
    "OnlineRetail",
  ]),
  amountVnd: z.number().int().positive().max(10_000_000),
  observedAt: text,
  sourceId: id,
  sourceLabel: text,
  status: z.enum(["ready", "partial", "blocked"]),
  editionMatch: z.enum(["exact", "likely", "unknown"]),
  availability: z.enum(["in-stock", "out-of-stock", "unknown"]),
  humanReviewed: z.literal(false),
});
const candidate = z.object({
  bookKey: id,
  approvalStatus: z.literal("PendingHumanReview"),
  importEntry: z
    .object({
      isbn: z.string().regex(/^\d{13}$/),
      kind: z.enum(["CoverPrice", "EditorialReference", "CompletedSale"]),
      amount: z.number().int().min(1000).max(10_000_000),
      condition: z.enum(["LikeNew", "Good", "Fair", "Worn"]).nullable(),
      sourceLabel: text.max(160),
      sourceUrl: z.url().refine((s) => new URL(s).protocol === "https:"),
      observedAt: text,
      enteredBy: text.max(80),
      rightsNote: text.max(300),
    })
    .strict(),
});
const schemas = {
  "catalog/books.json": z.object({
    schemaVersion: z.literal(1),
    books: z.array(book),
  }),
  "provenance/sources.json": z.object({
    schemaVersion: z.literal(1),
    sources: z.array(source),
  }),
  "prices/observations.json": z.object({
    schemaVersion: z.literal(1),
    observations: z.array(observation),
  }),
  "prices/import-candidates.json": z.array(candidate),
  "autofill/cover-scan/cases.json": lane("cover-scan"),
  "autofill/cover-scan/quarantine-cases.json": lane("cover-scan"),
  "autofill/real-camera/cases.json": lane("real-camera"),
};

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value
  );
}
function validTimestamp(value, now) {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    validDate(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= +now
  );
}
function validIsbn(value) {
  const sum = [...value.slice(0, 12)].reduce(
    (s, v, i) => s + Number(v) * (i % 2 ? 3 : 1),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}
// Resolve physical boundaries before reading any bytes, including JSON and reports.
export async function insideFile(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative))
    throw new Error("Relative file required");
  const realRoot = await fs.realpath(root),
    file = await fs.realpath(path.resolve(realRoot, relative));
  const rel = path.relative(realRoot, file);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith(`..${path.sep}`) ||
    path.isAbsolute(rel)
  )
    throw new Error("File outside dataset");
  if (!(await fs.stat(file)).isFile()) throw new Error("Regular file required");
  return file;
}

export async function validateDataset({ dir, now = new Date() }) {
  const checks = [],
    findings = [],
    inputDigests = [];
  const check = (name, ok, details = {}) =>
    checks.push({ name, status: ok ? "PASS" : "FAIL", ...details });
  const fail = (code, entity, detail) =>
    findings.push({ code, entity, detail });
  const group = async (name, work) => {
    const start = findings.length;
    await work();
    check(name, start === findings.length, {
      findings: findings.length - start,
    });
  };
  const metrics = {};
  function finish() {
    const failed = checks.filter((c) => c.status === "FAIL").length;
    const coverage = checks.filter((c) => c.name.startsWith("coverage:"));
    return {
      version: 1,
      ranAt: now.toISOString(),
      technicalStatus: failed ? "FAIL" : "PASS",
      overallStatus: failed ? "FAIL" : "TECHNICAL_PASS_ACCEPTANCE_PARTIAL",
      exitCode: failed ? 1 : 0,
      coverageStatus: !coverage.length
        ? "NOT_RUN"
        : coverage.some((c) => c.status === "PARTIAL")
          ? "PARTIAL"
          : "PASS",
      acceptance: {
        humanReview: "NOT_RUN",
        realCameraQuality: "NOT_RUN",
        liveModel: "NOT_RUN",
        readinessGateChanged: false,
      },
      metrics,
      checks,
      findings,
      inputDigests,
      limits: [
        "Offline structural verification, not semantic source verification or human acceptance.",
        "No DB/import/provider calls. Price groups and edition labels require source review.",
      ],
    };
  }
  const data = {};
  for (const [file, schema] of Object.entries(schemas)) {
    try {
      const full = await insideFile(dir, file),
        bytes = await fs.readFile(full);
      inputDigests.push({
        file,
        sha256: sha256(bytes),
        byteSize: bytes.length,
      });
      const parsed = schema.safeParse(JSON.parse(bytes.toString("utf8")));
      if (!parsed.success) {
        fail(
          "SCHEMA",
          file,
          parsed.error.issues.map((i) => i.path.join(".")).slice(0, 20),
        );
        check(`schema:${file}`, false);
      } else {
        data[file] = parsed.data;
        check(`schema:${file}`, true);
      }
    } catch {
      fail("READ_OR_JSON", file, "Missing, unsafe or invalid JSON file");
      check(`schema:${file}`, false);
    }
  }
  if (checks.some((c) => c.status === "FAIL")) return finish();
  const books = data["catalog/books.json"].books,
    sources = data["provenance/sources.json"].sources;
  const observations = data["prices/observations.json"].observations;
  const active = data["autofill/cover-scan/cases.json"].cases;
  const quarantine = data["autofill/cover-scan/quarantine-cases.json"];
  const real = data["autofill/real-camera/cases.json"].cases;
  const candidates = data["prices/import-candidates.json"];
  const bookMap = new Map(books.map((b) => [b.bookKey, b])),
    sourceMap = new Map(sources.map((s) => [s.sourceId, s]));
  const imageMap = new Map(),
    groups = new Map();
  await group("unique-identities", async () => {
    for (const [name, rows, key] of [
      ["books", books, "bookKey"],
      ["sources", sources, "sourceId"],
      ["observations", observations, "id"],
      ["cases", [...active, ...quarantine.cases, ...real], "id"],
    ]) {
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row[key])) fail("DUPLICATE_ID", name, row[key]);
        seen.add(row[key]);
      }
    }
  });
  await group("metadata-and-references", async () => {
    for (const b of books) {
      for (const s of b.sourceIds)
        if (!sourceMap.has(s)) fail("BOOK_SOURCE", b.bookKey, s);
      for (const [field, value] of Object.entries(b.metadata)) {
        if (
          value !== null &&
          value !== undefined &&
          (!Array.isArray(value) || value.length)
        ) {
          if (!b.fieldEvidence[field])
            fail("FIELD_EVIDENCE_MISSING", b.bookKey, field);
        }
      }
      for (const [field, e] of Object.entries(b.fieldEvidence))
        for (const s of e.sourceIds) {
          if (!sourceMap.has(s) || !b.sourceIds.includes(s))
            fail("FIELD_EVIDENCE_SOURCE", b.bookKey, field);
        }
      if (b.metadata.isbn && !validIsbn(b.metadata.isbn))
        fail("ISBN_CHECKSUM", b.bookKey, "Invalid checksum");
      if ((b.isbnStatus === "observed") !== (b.metadata.isbn !== null))
        fail("ISBN_STATUS", b.bookKey, b.isbnStatus);
      if (
        b.metadata.publicationYear !== null &&
        b.metadata.publicationYear > now.getUTCFullYear()
      )
        fail("FUTURE_YEAR", b.bookKey, "Future publication year");
    }
  });
  await group("sources-and-price-dates", async () => {
    for (const s of sources) {
      if (!validTimestamp(s.accessedAt, now))
        fail("SOURCE_TIMESTAMP", s.sourceId, "Invalid or future timestamp");
      if (
        new URL(s.url).hostname.replace(/^www\./, "") !==
        s.domain.replace(/^www\./, "")
      )
        fail("SOURCE_DOMAIN", s.sourceId, "Domain differs from URL");
    }
    for (const o of observations) {
      const b = bookMap.get(o.bookKey),
        s = sourceMap.get(o.sourceId);
      if (!b || !s || !b.sourceIds.includes(o.sourceId))
        fail("PRICE_REFERENCE", o.id, "Unknown book/source");
      if (
        !validDate(o.observedAt) ||
        o.observedAt > now.toISOString().slice(0, 10)
      )
        fail("PRICE_DATE", o.id, "Invalid or future date");
      if (
        b?.status !== "blocked" &&
        o.status === "ready" &&
        o.editionMatch === "exact" &&
        o.availability === "in-stock" &&
        s
      ) {
        if (!groups.has(o.bookKey)) groups.set(o.bookKey, new Set());
        groups.get(o.bookKey).add(s.independenceGroup);
      }
    }
    for (const c of candidates) {
      if (
        !bookMap.has(c.bookKey) ||
        bookMap.get(c.bookKey).metadata.isbn !== c.importEntry.isbn ||
        !validIsbn(c.importEntry.isbn)
      )
        fail("IMPORT_IDENTITY", c.bookKey, "Unknown or mismatched ISBN");
      if (
        !validDate(c.importEntry.observedAt) ||
        c.importEntry.observedAt > now.toISOString().slice(0, 10)
      )
        fail("IMPORT_DATE", c.bookKey, "Invalid or future date");
    }
  });
  await group("images-raster-hash-size-dimensions", async () => {
    for (const b of books)
      for (const im of b.images) {
        try {
          const file = await insideFile(dir, im.path),
            bytes = await fs.readFile(file);
          if (bytes.length > 10_000_000) {
            fail("IMAGE_BYTES", b.bookKey, "File exceeds input size");
            continue;
          }
          const hash = sha256(bytes);
          inputDigests.push({
            file: im.path,
            sha256: hash,
            byteSize: bytes.length,
          });
          if (hash !== im.sha256) fail("IMAGE_HASH", b.bookKey, im.path);
          if (bytes.length !== im.byteSize)
            fail("IMAGE_SIZE", b.bookKey, im.path);
          if (!sourceMap.has(im.sourceId) || !b.sourceIds.includes(im.sourceId))
            fail("IMAGE_SOURCE", b.bookKey, im.sourceId);
          const decoder = sharp(bytes, {
            limitInputPixels: 40_000_000,
            failOn: "error",
          });
          const info = await decoder.metadata();
          await decoder.raw().toBuffer();
          if (!["jpeg", "png", "webp"].includes(info.format))
            fail("IMAGE_FORMAT", b.bookKey, im.path);
          if (info.width !== im.width || info.height !== im.height)
            fail("IMAGE_DIMENSIONS", b.bookKey, im.path);
          if (!imageMap.has(file)) imageMap.set(file, []);
          imageMap
            .get(file)
            .push({ bookKey: b.bookKey, hash, sourceType: im.sourceType });
        } catch {
          fail("IMAGE_READ_OR_DECODE", b.bookKey, im.path);
        }
      }
  });
  await group("active-corpus-and-quarantine", async () => {
    if (quarantine.cases.length && !quarantine.reason)
      fail("QUARANTINE_REASON", "quarantine", "Reason required");
    const activeHashes = new Map(),
      seenBooks = new Set();
    for (const [name, rows] of [
      ["active", active],
      ["quarantine", quarantine.cases],
      ["real-camera", real],
    ]) {
      for (const c of rows) {
        const b = bookMap.get(c.bookKey),
          laneKey = `${name}:${c.bookKey}`;
        if (seenBooks.has(laneKey))
          fail("DUPLICATE_CASE_BOOK", c.id, c.bookKey);
        seenBooks.add(laneKey);
        if (!b) fail("CASE_BOOK", c.id, c.bookKey);
        if (name !== "quarantine" && b?.status === "blocked")
          fail("ACTIVE_BLOCKED_BOOK", c.id, c.bookKey);
        if (name === "quarantine" && b?.status !== "blocked")
          fail("QUARANTINE_BOOK_STATE", c.id, c.bookKey);
        if (c.expected.isbn && !validIsbn(c.expected.isbn))
          fail("EXPECTED_ISBN", c.id, "Invalid checksum");
        if (new Set(c.photos).size !== c.photos.length)
          fail("DUPLICATE_CASE_PHOTO", c.id, "Repeated photo");
        for (const photo of c.photos) {
          try {
            const file = await insideFile(
              dir,
              path.join(
                name === "real-camera"
                  ? "autofill/real-camera"
                  : "autofill/cover-scan",
                photo,
              ),
            );
            const match = imageMap
              .get(file)
              ?.find((v) => v.bookKey === c.bookKey);
            if (!match) {
              fail("CASE_PHOTO_OWNER", c.id, "Photo not in this book manifest");
              continue;
            }
            if (
              match.sourceType !==
              (name === "real-camera" ? "real-camera" : "cover-scan")
            )
              fail("CASE_PHOTO_LANE", c.id, "Wrong image source type");
            if (name === "active") {
              if (activeHashes.has(match.hash))
                fail(
                  "DUPLICATE_ACTIVE_HASH",
                  c.id,
                  activeHashes.get(match.hash),
                );
              activeHashes.set(match.hash, c.id);
            }
          } catch {
            fail("CASE_PHOTO_PATH", c.id, "Missing or outside dataset");
          }
        }
      }
    }
    for (const c of quarantine.cases)
      if (active.some((a) => a.bookKey === c.bookKey))
        fail("QUARANTINE_ACTIVE_OVERLAP", c.id, c.bookKey);
    metrics.activeUniqueHashes = activeHashes.size;
  });
  const twoSources = [...groups]
    .filter(([, values]) => values.size >= 2)
    .map(([key]) => key);
  Object.assign(metrics, {
    rawBooks: books.length,
    ready: books.filter((b) => b.status === "ready").length,
    partial: books.filter((b) => b.status === "partial").length,
    blocked: books.filter((b) => b.status === "blocked").length,
    manifestImages: books.reduce((s, b) => s + b.images.length, 0),
    observedIsbns: books.filter((b) => b.metadata.isbn !== null).length,
    multiAuthorBooks: books.filter((b) => b.metadata.authors.length > 1).length,
    activeCoverCases: active.length,
    quarantineCases: quarantine.cases.length,
    realCameraCases: real.length,
    observations: observations.length,
    sources: sources.length,
    twoSourceBooks: twoSources.length,
    qualifyingBookKeys: twoSources,
    importCandidates: candidates.length,
    unknownImageRights: books
      .flatMap((b) => b.images)
      .filter((i) => i.rightsStatus === "unknown").length,
  });
  for (const [name, actual, target] of [
    ["raw-books", books.length, 25],
    [
      "vietnamese-books",
      books.filter((b) => b.metadata.language === "vi").length,
      18,
    ],
    ["active-cover-cases", active.length, 20],
    ["multi-author", metrics.multiAuthorBooks, 1],
    ["two-independent-price-groups", twoSources.length, 15],
  ]) {
    checks.push({
      name: `coverage:${name}`,
      status: actual >= target ? "PASS" : "PARTIAL",
      actual,
      target,
    });
  }
  return finish();
}
