// Real Nest/MongoDB/Sharp; persistent local FAKE storage, never Supabase acceptance.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { root, initialize, createSandbox } from "./demo/sandbox.mjs";
import { runBooks } from "./demo/books.mjs";

const directory = path.join(
  root,
  ".tmp",
  "demo",
  `qa-${randomBytes(6).toString("hex")}`,
);
await mkdir(directory, { recursive: true });
let sandbox;
try {
  const config = await initialize(directory, { fixture: true, port: 3014 });
  sandbox = await createSandbox(config, directory);
  let uploads = 0;
  const droppingAck = async (url, options) => {
    const response = await fetch(url, options);
    if (
      options?.method === "PUT" &&
      new URL(url).pathname.endsWith("/content")
    ) {
      assert.equal(response.status, 200);
      await response.arrayBuffer(); // Server committed, caller sees no acknowledgement.
      uploads++;
      throw new Error("controlled lost acknowledgement");
    }
    return response;
  };
  await assert.rejects(
    runBooks(config, directory, sandbox, { fetcher: droppingAck }),
    { code: "ACK_UNCERTAIN" },
  );
  assert.equal(uploads, 3);
  const pending = JSON.parse(
    await readFile(path.join(directory, "journal.json"), "utf8"),
  );
  assert.equal(pending.steps["media.upload"].state, "pending");
  assert.equal(pending.steps["listing.submit"], undefined);
  await sandbox.close();
  sandbox = undefined;
  // Restart the entire API with the same DB/config/files; credentials/tokens are not in the journal.
  sandbox = await createSandbox(config, directory);
  const manifest = await runBooks(config, directory, sandbox);
  assert.equal(manifest.status, "PASS");
  assert.match(manifest.storage, /FAKE/);
  assert.equal(Object.keys(manifest.steps).length, 9);
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        [
          "catalog_books",
          "listings",
          "listing_media",
          "media_processing_jobs",
          "catalog_decisions",
          "listing_decisions",
        ].map(async (name) => [
          name,
          await sandbox.inspect(name).countDocuments(),
        ]),
      ),
    );
  const firstCounts = await counts();
  for (const count of Object.values(firstCounts)) assert.equal(count, 1);
  const keys = Object.fromEntries(
    Object.entries(
      JSON.parse(await readFile(path.join(directory, "journal.json"), "utf8"))
        .steps,
    ).map(([name, intent]) => [name, intent.key]),
  );
  const again = await runBooks(config, directory, sandbox);
  assert.equal(again.listingId, manifest.listingId);
  assert.deepEqual(await counts(), firstCounts);
  const saved = JSON.parse(
    await readFile(path.join(directory, "journal.json"), "utf8"),
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(saved.steps).map(([name, intent]) => [name, intent.key]),
    ),
    keys,
  );
  for (const file of ["journal.json", "manifest.json"]) {
    const text = await readFile(path.join(directory, file), "utf8");
    for (const account of Object.values(config.accounts)) {
      assert.ok(!text.includes(account.email));
      assert.ok(!text.includes(account.password));
    }
    assert.ok(
      !text.includes("accessToken") &&
        !text.includes("refreshToken") &&
        !text.includes("Upload-Token"),
    );
  }
  // A lost/recreated QA database must never receive historical commands.
  const lostConfig = structuredClone(config);
  lostConfig.accounts.buyer.id = "00000000-0000-4000-8000-000000000000";
  await assert.rejects(createSandbox(lostConfig, directory), {
    code: "SANDBOX_LOST",
  });
  console.log(
    "H01a QA PASS: real API/Mongo/Sharp; upload lost-ack + API restart + rerun; no duplicate business records; sanitized manifest. Storage FAKE, native NOT RUN.",
  );
} finally {
  await sandbox?.close();
}
