import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateDataset, sha256 } from "./validator.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sharp = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
)("sharp");
const now = new Date("2026-10-29T12:00:00Z");
let directory,
  baseline,
  serial = 0;
const json = async (dir, file) =>
  JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
const write = async (dir, file, value) => {
  await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
  await fs.writeFile(path.join(dir, file), JSON.stringify(value, null, 2));
};
async function mutate(dir, file, change) {
  const value = await json(dir, file);
  change(value);
  await write(dir, file, value);
}
async function fixture() {
  const dest = path.join(directory, `case-${++serial}`);
  await fs.cp(baseline, dest, { recursive: true });
  return dest;
}
const check = (dir) => validateDataset({ dir, now });
before(async () => {
  await fs.mkdir(path.join(root, ".tmp"), { recursive: true });
  directory = await fs.mkdtemp(
    path.join(root, ".tmp/listing-ai-validator-tests-"),
  );
  baseline = path.join(directory, "baseline");
  const sources = ["a", "b"].map((s) => ({
    sourceId: `source-${s}`,
    url: `https://${s}.example/books`,
    domain: `${s}.example`,
    independenceGroup: `group-${s}`,
    accessedAt: "2026-10-29T03:00:00Z",
    rights: "unknown",
  }));
  const books = [],
    cases = [],
    observations = [];
  for (let i = 0; i < 25; i++) {
    const bookKey = `book-${i}`,
      photo = `autofill/cover-scan/images/${bookKey}.jpg`;
    const bytes = await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 3,
        background: { r: i * 9, g: 10, b: 30 },
      },
    })
      .jpeg()
      .toBuffer();
    await fs.mkdir(path.dirname(path.join(baseline, photo)), {
      recursive: true,
    });
    await fs.writeFile(path.join(baseline, photo), bytes);
    const metadata = {
      title: `Synthetic fixture ${i}`,
      authors: i ? ["Fixture Author"] : ["Fixture Author", "Second Author"],
      publisher: null,
      publicationYear: null,
      edition: null,
      language: "vi",
      isbn: null,
    };
    books.push({
      bookKey,
      status: "ready",
      metadata,
      isbnStatus: "unknown",
      sourceIds: ["source-a", "source-b"],
      fieldEvidence: Object.fromEntries(
        ["title", "authors", "language"].map((f) => [
          f,
          { sourceIds: ["source-a"], locator: "Synthetic fixture only" },
        ]),
      ),
      images: [
        {
          path: photo,
          sourceId: "source-a",
          sha256: sha256(bytes),
          byteSize: bytes.length,
          width: 3,
          height: 2,
          sourceType: "cover-scan",
          rightsStatus: "unknown",
        },
      ],
      verification: {
        method: "synthetic-test-only",
        humanReviewed: false,
        reviewedBy: null,
        reviewedAt: null,
      },
      issues: [],
    });
    cases.push({
      id: `case-${i}`,
      bookKey,
      reviewed: false,
      photos: [`images/${bookKey}.jpg`],
      expected: {
        title: metadata.title,
        authors: metadata.authors,
        isbn: null,
      },
    });
    for (const s of sources)
      observations.push({
        id: `price-${i}-${s.sourceId}`,
        bookKey,
        sourceId: s.sourceId,
        kind: "OnlineRetail",
        amountVnd: 100000,
        observedAt: "2026-10-29",
        sourceLabel: "Synthetic price",
        editionMatch: "exact",
        availability: "in-stock",
        status: "ready",
        humanReviewed: false,
      });
  }
  await write(baseline, "catalog/books.json", { schemaVersion: 1, books });
  await write(baseline, "provenance/sources.json", {
    schemaVersion: 1,
    sources,
  });
  await write(baseline, "prices/observations.json", {
    schemaVersion: 1,
    observations,
  });
  await write(baseline, "prices/import-candidates.json", []);
  await write(baseline, "autofill/cover-scan/cases.json", {
    source: "cover-scan",
    cases,
  });
  await write(baseline, "autofill/cover-scan/quarantine-cases.json", {
    source: "cover-scan",
    cases: [],
  });
  await write(baseline, "autofill/real-camera/cases.json", {
    source: "real-camera",
    cases: [],
  });
  await fs.mkdir(path.join(baseline, "validation"));
});
after(async () => {
  // Recursive removal is limited to the unique test folder created above.
  const expected = path.join(root, ".tmp") + path.sep;
  const real = await fs.realpath(directory);
  assert.ok(
    real.startsWith(expected) &&
      path.basename(real).startsWith("listing-ai-validator-tests-"),
  );
  await fs.rm(real, { recursive: true });
});

test("valid synthetic fixture passes technical checks without claiming human/model quality", async () => {
  const dir = await fixture(),
    before = await fs.readFile(path.join(dir, "catalog/books.json"));
  const r = await check(dir);
  assert.equal(r.technicalStatus, "PASS");
  assert.equal(r.coverageStatus, "PASS");
  assert.equal(r.overallStatus, "TECHNICAL_PASS_ACCEPTANCE_PARTIAL");
  assert.equal(r.metrics.twoSourceBooks, 25);
  assert.equal(r.acceptance.realCameraQuality, "NOT_RUN");
  assert.deepEqual(
    await fs.readFile(path.join(dir, "catalog/books.json")),
    before,
  );
});

const bad = (name, change, code) =>
  test(name, async () => {
    const dir = await fixture();
    await change(dir);
    const r = await check(dir);
    assert.equal(r.exitCode, 1);
    assert.equal(r.technicalStatus, "FAIL");
    assert.ok(
      r.findings.some((f) => f.code === code),
      `${code}: ${JSON.stringify(r.findings)}`,
    );
  });
bad(
  "rejects invalid ISBN checksum",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].metadata.isbn = "9786042036611";
      v.books[0].isbnStatus = "observed";
      v.books[0].fieldEvidence.isbn = v.books[0].fieldEvidence.title;
    }),
  "ISBN_CHECKSUM",
);
bad(
  "rejects negative prices",
  (d) =>
    mutate(d, "prices/observations.json", (v) => {
      v.observations[0].amountVnd = -1;
    }),
  "SCHEMA",
);
bad(
  "rejects future observation dates",
  (d) =>
    mutate(d, "prices/observations.json", (v) => {
      v.observations[0].observedAt = "2099-01-01";
    }),
  "PRICE_DATE",
);
bad(
  "rejects impossible calendar dates",
  (d) =>
    mutate(d, "prices/observations.json", (v) => {
      v.observations[0].observedAt = "2026-02-30";
    }),
  "PRICE_DATE",
);
bad(
  "rejects missing case photos",
  (d) =>
    mutate(d, "autofill/cover-scan/cases.json", (v) => {
      v.cases[0].photos = ["images/missing.jpg"];
    }),
  "CASE_PHOTO_PATH",
);
bad(
  "decodes pixels: frame-only JPEG fails even with matching declared hash and size",
  async (d) => {
    const bytes = Buffer.from([
      255, 216, 255, 192, 0, 17, 8, 4, 17, 3, 32, 3, 1, 17, 0, 2, 17, 1, 3, 17,
      1, 255, 217,
    ]);
    await fs.writeFile(
      path.join(d, "autofill/cover-scan/images/book-0.jpg"),
      bytes,
    );
    await mutate(d, "catalog/books.json", (v) => {
      Object.assign(v.books[0].images[0], {
        sha256: sha256(bytes),
        byteSize: bytes.length,
        width: 800,
        height: 1041,
      });
    });
  },
  "IMAGE_READ_OR_DECODE",
);
bad(
  "rejects dimension mismatch",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].images[0].width = 1;
    }),
  "IMAGE_DIMENSIONS",
);
bad(
  "rejects byte-size mismatch",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].images[0].byteSize = 1;
    }),
  "IMAGE_SIZE",
);
bad(
  "rejects a changed image hash",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].images[0].sha256 = "0".repeat(64);
    }),
  "IMAGE_HASH",
);
bad(
  "rejects duplicate IDs",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[1].bookKey = v.books[0].bookKey;
    }),
  "DUPLICATE_ID",
);
bad(
  "rejects missing book source",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].sourceIds.push("missing-source");
    }),
  "BOOK_SOURCE",
);
bad(
  "rejects a fieldEvidence source that does not exist",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].fieldEvidence.title.sourceIds = ["missing-source"];
    }),
  "FIELD_EVIDENCE_SOURCE",
);
bad(
  "rejects siblings sharing the incoming prefix before reading image bytes",
  async (d) => {
    const sibling = d + "-escape";
    await fs.mkdir(sibling);
    await fs.copyFile(
      path.join(d, "autofill/cover-scan/images/book-0.jpg"),
      path.join(sibling, "photo.jpg"),
    );
    await mutate(d, "catalog/books.json", (v) => {
      v.books[0].images[0].path = path.relative(
        d,
        path.join(sibling, "photo.jpg"),
      );
    });
  },
  "IMAGE_READ_OR_DECODE",
);
bad(
  "rejects case-photo sibling escapes",
  async (d) => {
    const sibling = d + "-escape";
    await fs.mkdir(sibling);
    await fs.copyFile(
      path.join(d, "autofill/cover-scan/images/book-0.jpg"),
      path.join(sibling, "photo.jpg"),
    );
    await mutate(d, "autofill/cover-scan/cases.json", (v) => {
      v.cases[0].photos = [
        path.relative(
          path.join(d, "autofill/cover-scan"),
          path.join(sibling, "photo.jpg"),
        ),
      ];
    });
  },
  "CASE_PHOTO_PATH",
);
bad(
  "rejects true human-review flags in real-camera",
  (d) =>
    mutate(d, "autofill/real-camera/cases.json", (v) => {
      v.cases = [
        {
          id: "real-case",
          bookKey: "book-0",
          reviewed: true,
          photos: ["none.jpg"],
          expected: { title: "Synthetic", authors: [], isbn: null },
        },
      ];
    }),
  "SCHEMA",
);
bad(
  "rejects missing mandatory review flags",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      delete v.books[0].verification.humanReviewed;
    }),
  "SCHEMA",
);
bad(
  "rejects invalid importer kinds",
  (d) =>
    write(d, "prices/import-candidates.json", [
      { bookKey: "book-0", importEntry: { kind: "OnlineRetail", amount: 1 } },
    ]),
  "SCHEMA",
);
bad(
  "rejects future source timestamps",
  (d) =>
    mutate(d, "provenance/sources.json", (v) => {
      v.sources[0].accessedAt = "2099-01-01T00:00:00Z";
    }),
  "SOURCE_TIMESTAMP",
);
bad(
  "rejects empty photo arrays",
  (d) =>
    mutate(d, "autofill/cover-scan/cases.json", (v) => {
      v.cases[0].photos = [];
    }),
  "SCHEMA",
);
bad(
  "rejects unknown case book IDs",
  (d) =>
    mutate(d, "autofill/cover-scan/cases.json", (v) => {
      v.cases[0].bookKey = "unknown";
    }),
  "CASE_BOOK",
);
bad(
  "rejects a blocked book left in active cases",
  (d) =>
    mutate(d, "catalog/books.json", (v) => {
      v.books[0].status = "blocked";
    }),
  "ACTIVE_BLOCKED_BOOK",
);
bad(
  "rejects duplicate image hashes in the active corpus",
  async (d) => {
    const bytes = await fs.readFile(
      path.join(d, "autofill/cover-scan/images/book-0.jpg"),
    );
    await fs.writeFile(
      path.join(d, "autofill/cover-scan/images/book-1.jpg"),
      bytes,
    );
    await mutate(d, "catalog/books.json", (v) => {
      Object.assign(v.books[1].images[0], {
        sha256: sha256(bytes),
        byteSize: bytes.length,
      });
    });
  },
  "DUPLICATE_ACTIVE_HASH",
);
bad(
  "rejects using another book photo",
  (d) =>
    mutate(d, "autofill/cover-scan/cases.json", (v) => {
      v.cases[0].photos = ["images/book-1.jpg"];
    }),
  "CASE_PHOTO_OWNER",
);
bad(
  "rejects relabelling a cover scan as a phone photo",
  async (d) => {
    await mutate(d, "autofill/real-camera/cases.json", (v) => {
      v.cases = [
        {
          id: "real-case",
          bookKey: "book-0",
          reviewed: false,
          photos: ["../cover-scan/images/book-0.jpg"],
          expected: { title: "Synthetic", authors: [], isbn: null },
        },
      ];
    });
  },
  "CASE_PHOTO_LANE",
);

test("quarantine is separate from active eval and does not claim acceptance", async () => {
  const dir = await fixture(),
    c = (await json(dir, "autofill/cover-scan/cases.json")).cases[0];
  await mutate(dir, "catalog/books.json", (v) => {
    v.books[0].status = "blocked";
  });
  await mutate(dir, "autofill/cover-scan/cases.json", (v) => {
    v.cases.shift();
  });
  await write(dir, "autofill/cover-scan/quarantine-cases.json", {
    source: "cover-scan",
    reason: "Synthetic quarantine test",
    cases: [c],
  });
  const r = await check(dir);
  assert.equal(r.technicalStatus, "PASS");
  assert.equal(r.metrics.activeCoverCases, 24);
  assert.equal(r.metrics.quarantineCases, 1);
});
test("counts eligible sources without changing the 15-book goal", async () => {
  const dir = await fixture();
  await mutate(dir, "prices/observations.json", (v) => {
    for (const o of v.observations.slice(0, 30)) o.editionMatch = "likely";
  });
  const r = await check(dir);
  assert.equal(r.technicalStatus, "PASS");
  assert.equal(r.metrics.twoSourceBooks, 10);
  assert.equal(r.coverageStatus, "PARTIAL");
});
test("timestamp comparisons use instants rather than lexical timezone order", async () => {
  const dir = await fixture();
  await mutate(dir, "provenance/sources.json", (v) => {
    v.sources[0].accessedAt = "2026-10-29T13:00:00+02:00";
  });
  assert.equal((await check(dir)).technicalStatus, "PASS");
});
test("CLI returns one for structured failures and zero for technical pass only", async () => {
  const dir = await fixture(),
    cli = fileURLToPath(new URL("./validate.mjs", import.meta.url));
  const pass = spawnSync(process.execPath, [cli, `--dir=${dir}`], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(pass.status, 0);
  assert.equal(JSON.parse(pass.stdout).acceptance.realCameraQuality, "NOT_RUN");
  await mutate(dir, "prices/observations.json", (v) => {
    v.observations[0].amountVnd = -1;
  });
  const fail = spawnSync(process.execPath, [cli, `--dir=${dir}`], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout).technicalStatus, "FAIL");
});
