// Explicit opt-in: disposable rs-test DB plus a brand-new private Supabase bucket.
// No production DB/bucket, actual email delivery, carrier or AI calls.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import {
  createTestApi,
  root,
  base,
  password,
} from "../apps/admin-web/tests/test-api.mjs";
const req = createRequire(new URL("../apps/api/package.json", import.meta.url));
const load = (file) =>
  import(pathToFileURL(path.join(root, "apps/api/dist", file)).href);
const evidence = path.join(root, ".tmp/member-acceptance");
if (process.argv.slice(2).join(" ") !== "--live") {
  console.log(
    "NOT RUN: pass --live explicitly; this runner creates and cleans its own private QA bucket.",
  );
  process.exit(2);
}
let fixture,
  client,
  storage,
  bucket,
  created = false,
  stage = "preflight",
  failed = false,
  puts = 0,
  failRemove = false;
const keys = new Set(),
  checks = [];
const result = {
  source: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
  }).trim(),
  runnerHasLocalChanges: !!execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
  }).trim(),
  platform: "HTTP/Mongo/Sharp/Supabase",
  native: "NOT_RUN",
  emailDelivery: "NOT_RUN",
  storage: "NOT_RUN",
  cleanup: "NOT_RUN",
  checks,
};
async function save() {
  await mkdir(evidence, { recursive: true });
  await writeFile(
    path.join(evidence, "live-profile.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
}
try {
  assert.equal(
    process.argv.slice(2).join(" "),
    "--live",
    "Explicit --live is required; this runner makes real storage calls.",
  );
  const qa = new URL(process.env.MONGO_TEST_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(qa.hostname) &&
      qa.port === "57017" &&
      qa.searchParams.get("replicaSet") === "rs-test",
    "Dedicated QA rs-test is required.",
  );
  const { parse } = req("dotenv"),
    env = parse(await readFile(path.join(root, "apps/api/.env"), "utf8"));
  assert.ok(
    env.SUPABASE_URL && env.SUPABASE_STORAGE_KEY,
    "Local storage configuration is required.",
  );
  assert.ok(
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL),
    "Expected Supabase project.",
  );
  // Never use the configured app bucket. The namespace exists only for this run.
  bucket = "latlai-profile-qa-" + randomBytes(10).toString("hex");
  assert.ok(
    /^latlai-profile-qa-[a-f0-9]{20}$/.test(bucket) &&
      bucket !== env.SUPABASE_MEDIA_BUCKET,
  );
  const { StorageClient } = req("@supabase/storage-js");
  const auth = {
    apikey: env.SUPABASE_STORAGE_KEY,
    ...(env.SUPABASE_STORAGE_KEY.startsWith("eyJ")
      ? { Authorization: "Bearer " + env.SUPABASE_STORAGE_KEY }
      : {}),
  };
  client = new StorageClient(
    env.SUPABASE_URL + "/storage/v1",
    auth,
    (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) }),
  );
  stage = "create-private-QA-bucket";
  const initial = await client.getBucket(bucket);
  assert.ok(
    initial.error &&
      (Number(initial.error.status) === 404 ||
        Number(initial.error.statusCode) === 404),
    "New QA namespace must not already exist.",
  );
  const creation = await client.createBucket(bucket, {
    public: false,
    fileSizeLimit: 2000000,
    allowedMimeTypes: ["image/webp"],
  });
  assert.ok(!creation.error, "QA bucket creation failed.");
  created = true;
  const verified = await client.getBucket(bucket);
  assert.equal(verified.data?.public, false);
  assert.equal(verified.data?.file_size_limit, 2000000);
  checks.push("new-dedicated-private-bucket");
  const { MediaStorage } = await load("modules/media/media-storage.js"),
    { ConfigService } = req("@nestjs/config");
  storage = new MediaStorage(
    new ConfigService({
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_STORAGE_KEY: env.SUPABASE_STORAGE_KEY,
      SUPABASE_MEDIA_BUCKET: bucket,
    }),
  );
  const own = (key) =>
    assert.ok(keys.has(key), "Storage operation must belong to this run.");
  const adapter = {
    check: () => storage.check(),
    put: async (key, bytes, mime) => {
      own(key);
      puts++;
      return storage.put(key, bytes, mime);
    },
    read: (key, max) => {
      own(key);
      return storage.read(key, max);
    },
    signedRead: (key) => {
      own(key);
      return storage.signedRead(key);
    },
    remove: async (items) => {
      items.forEach(own);
      if (failRemove) throw new Error("QA injected remove outage");
      return storage.remove(items);
    },
  };
  Object.assign(process.env, {
    AUTH_MAIL_PROVIDER: "local",
    AUTH_MAIL_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
    AUTH_WEB_ORIGIN: "http://127.0.0.1:5194",
  });
  stage = "create-isolated-API";
  fixture = await createTestApi({ listingCount: 0, storageAdapter: adapter });
  const owner = fixture.member,
    other = await fixture.api("/auth/login", null, {
      email: "admin@operations.test",
      password,
    });
  const sharp = req("sharp"),
    bytes = await sharp({
      create: { width: 500, height: 600, channels: 3, background: "#58685e" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
  const hash = createHash("sha256").update(bytes).digest("hex");
  async function asset() {
    const receipt = await fixture.api(
      "/me/profile/avatar-uploads",
      owner.accessToken,
      { mimeType: "image/jpeg", byteSize: bytes.length, sha256: hash },
    );
    keys.add(`profile-avatars/${receipt.entityId}/avatar.webp`);
    return receipt.entityId;
  }
  const upload = (id, key = randomUUID()) =>
    fixture.api(
      `/me/profile/avatar-uploads/${id}/content`,
      owner.accessToken,
      bytes,
      "PUT",
      { "Content-Type": "image/jpeg", "Idempotency-Key": key },
    );
  const view = () => fixture.api("/me/profile", owner.accessToken);
  async function attach(id) {
    const p = await view();
    return fixture.api("/me/profile", owner.accessToken, {
      expectedVersion: p.version,
      displayName: p.displayName,
      contactPhone: p.contactPhone,
      avatarId: id,
    });
  }
  stage = "real-image-upload-and-replay";
  const first = await asset(),
    key = randomUUID(),
    receipt = await upload(first, key),
    writes = puts;
  const replay = await upload(first, key);
  assert.equal(replay.id, receipt.id);
  assert.equal(puts, writes);
  checks.push("real-upload/exact-replay/no-extra-object");
  const signed = await fixture.api(
    `/me/profile/avatar-uploads/${first}/read`,
    owner.accessToken,
  );
  const signedResponse = await fetch(signed.url, {
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(signedResponse.status, 200);
  const decoded = await sharp(
    Buffer.from(await signedResponse.arrayBuffer()),
  ).metadata();
  assert.equal(decoded.width, 256);
  assert.equal(decoded.height, 256);
  assert.equal(decoded.format, "webp");
  assert.equal(decoded.exif, undefined);
  checks.push("signed-GET/decoded-256-WebP/EXIF-stripped");
  const unauthorized = await fetch(
    `${base}/me/profile/avatar-uploads/${first}/read`,
    { headers: { Authorization: "Bearer " + other.accessToken } },
  );
  assert.equal(unauthorized.status, 404);
  const anonymous = await fetch(
    env.SUPABASE_URL +
      `/storage/v1/object/public/${bucket}/profile-avatars/${first}/avatar.webp`,
    { signal: AbortSignal.timeout(20000) },
  );
  assert.notEqual(anonymous.status, 200);
  checks.push("other-member-denied/anonymous-public-read-denied");
  stage = "attach-and-retain-current-avatar";
  await attach(first);
  await fixture.db
    .collection("profile_avatars")
    .updateOne(
      { _id: first },
      { $set: { gcAt: new Date(Date.now() - 700000) } },
    );
  await fixture.cleanupProfileAvatars();
  assert.equal(
    (await fixture.db.collection("profile_avatars").findOne({ _id: first }))
      .state,
    "Attached",
  );
  const still = await storage.read(
    `profile-avatars/${first}/avatar.webp`,
    2000000,
  );
  assert.ok(still.length > 0);
  checks.push("worker-keeps-attached-pointer");
  stage = "replace-and-durable-cleanup";
  const second = await asset();
  await upload(second);
  await attach(second);
  await fixture.db
    .collection("profile_avatars")
    .updateOne(
      { _id: first },
      { $set: { gcAt: new Date(Date.now() - 700000) } },
    );
  failRemove = true;
  await assert.rejects(
    fixture.cleanupProfileAvatars(),
    /QA injected remove outage/,
  );
  assert.equal(
    (await fixture.db.collection("profile_avatars").findOne({ _id: first }))
      .state,
    "Deleting",
  );
  failRemove = false;
  await fixture.cleanupProfileAvatars();
  assert.equal(
    await fixture.db.collection("profile_avatars").findOne({ _id: first }),
    null,
  );
  await assert.rejects(
    storage.read(`profile-avatars/${first}/avatar.webp`, 2000000),
  );
  assert.ok(
    (await storage.read(`profile-avatars/${second}/avatar.webp`, 2000000))
      .length > 0,
  );
  checks.push("durable-Deleting/real-retry-removes-old-only");
  await attach(null);
  await fixture.db
    .collection("profile_avatars")
    .updateOne(
      { _id: second },
      { $set: { gcAt: new Date(Date.now() - 700000) } },
    );
  await fixture.cleanupProfileAvatars();
  assert.equal(
    await fixture.db.collection("profile_avatars").countDocuments(),
    0,
  );
  const listed = await client.from(bucket).list("", { limit: 100 });
  assert.ok(!listed.error);
  assert.equal(listed.data.length, 0);
  checks.push("detach/worker-removes-final-object");
  result.storage = "PASS";
} catch (error) {
  failed = true;
  result.storage = "FAIL";
  result.failureStage = stage;
  result.errorType = error.name;
  console.error(
    `FAIL live profile at ${stage}; private provider details suppressed.`,
  );
} finally {
  try {
    failRemove = false;
    if (created) {
      // Exact generated namespace and exact allocated keys only. Never enumerate
      // or mutate the configured application's bucket or another run's objects.
      if (keys.size) await storage?.remove([...keys]);
      const removed = await client.deleteBucket(bucket);
      assert.ok(!removed.error, "Dedicated QA bucket cleanup failed.");
    }
    result.cleanup = "PASS";
  } catch {
    failed = true;
    result.cleanup = "BLOCKED";
    await mkdir(evidence, { recursive: true });
    await writeFile(
      path.join(evidence, "private-cleanup.json"),
      JSON.stringify({ bucket, keys: [...keys] }),
    );
    console.error(
      "BLOCKED: exact QA storage cleanup needs reconciliation; private journal retained.",
    );
  }
  try {
    await fixture?.close();
    result.databaseCleanup = "PASS";
  } catch {
    failed = true;
    result.databaseCleanup = "BLOCKED";
    console.error(
      "BLOCKED: disposable QA database cleanup incomplete; private details suppressed.",
    );
  }
  storage?.onModuleDestroy();
  await save();
  process.exitCode = failed ? 1 : 0;
  if (!failed)
    console.log(
      `PASS: ${checks.length} real private-storage profile checks; real API/Mongo/Sharp/Supabase, durable worker retry, exact QA bucket cleaned. Mail local; native NOT RUN.`,
    );
}
