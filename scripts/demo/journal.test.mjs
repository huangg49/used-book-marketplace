import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Commands, ScenarioError, lockRun, openJournal } from "./journal.mjs";
import { createHttp } from "./http.mjs";
import {
  validateTarget,
  validateConfig,
  initialize,
  bindingFor,
} from "./sandbox.mjs";

async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "latlai-demo-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
const accepted = () => ({
  id: randomUUID(),
  entityType: "Listing",
  entityId: randomUUID(),
  version: 2,
  revisionId: randomUUID(),
  state: { moderation: "Draft", visibility: "Hidden", trade: "Available" },
  serverTime: new Date().toISOString(),
});
const request = () => ({
  actor: "seller",
  method: "PUT",
  route: "/listings/draft",
  body: { expectedVersion: 1, content: "demo" },
});
const delay = async () => {};

test("lost acknowledgement replays the persisted key/body, including after restart", async (t) => {
  const directory = await temporary(t),
    journal = await openJournal(directory, "sandbox-one");
  const committed = accepted(),
    seen = [];
  const send = async (intent) => {
    // The server commits once, but its first response never reaches the caller.
    const saved = JSON.parse(
      await readFile(path.join(directory, "journal.json"), "utf8"),
    );
    assert.deepEqual(saved.steps.save.body, request().body);
    seen.push(structuredClone(intent));
    if (seen.length === 1)
      throw new ScenarioError("HTTP_UNCERTAIN", "lost ack");
    return committed;
  };
  await assert.rejects(
    new Commands(journal, send, { attempts: 1, delay }).execute(
      "save",
      request,
    ),
    { code: "ACK_UNCERTAIN" },
  );
  const restarted = await openJournal(directory, "sandbox-one");
  const result = await new Commands(restarted, send, { delay }).execute(
    "save",
    () => {
      throw new Error("must not refresh version/body");
    },
  );
  assert.deepEqual(seen[0], seen[1]);
  assert.deepEqual(result, committed);
  await new Commands(await openJournal(directory, "sandbox-one"), () => {
    throw new Error("must not resend an acknowledged command");
  }).execute("save", request);
  assert.equal(seen.length, 2);
});

test("conflict is durable and stops subsequent retries", async (t) => {
  const directory = await temporary(t),
    journal = await openJournal(directory, "sandbox-one");
  let calls = 0;
  const commands = new Commands(
    journal,
    async () => {
      calls++;
      throw new ScenarioError("HTTP_REJECTED", "conflict", 409);
    },
    { delay },
  );
  await assert.rejects(commands.execute("save", request), {
    code: "COMMAND_REJECTED",
    status: 409,
  });
  await assert.rejects(
    new Commands(await openJournal(directory, "sandbox-one"), () => {
      calls++;
    }).execute("save", request),
    { code: "COMMAND_STOPPED" },
  );
  assert.equal(calls, 1);
});

test("uncertain outcomes have a bounded retry budget and never change the intent", async (t) => {
  const journal = await openJournal(await temporary(t), "sandbox-one"),
    seen = [];
  await assert.rejects(
    new Commands(
      journal,
      async (intent) => {
        seen.push(structuredClone(intent));
        throw new ScenarioError("HTTP_UNCERTAIN", "unavailable", 503);
      },
      { attempts: 3, delay },
    ).execute("save", request),
    { code: "ACK_UNCERTAIN" },
  );
  assert.equal(seen.length, 3);
  assert.deepEqual(seen[0], seen[2]);
  assert.equal(journal.data.steps.save.state, "pending");
});

test("concurrent runner cannot enter an owned run", async (t) => {
  const directory = await temporary(t),
    release = await lockRun(directory);
  await assert.rejects(lockRun(directory), { code: "RUN_LOCKED" });
  await release();
  await (
    await lockRun(directory)
  )();
});

test("journal binding and malformed state cannot be silently recreated", async (t) => {
  const directory = await temporary(t);
  await openJournal(directory, "sandbox-one");
  await assert.rejects(openJournal(directory, "sandbox-two"), {
    code: "TARGET_CHANGED",
  });
  await writeFile(path.join(directory, "journal.json"), "{broken");
  await assert.rejects(openJournal(directory, "sandbox-one"), {
    code: "INVALID_JOURNAL",
  });
  assert.equal(
    await readFile(path.join(directory, "journal.json"), "utf8"),
    "{broken",
  );
});

test("edited intent body fails closed and malformed receipts remain pending", async (t) => {
  const directory = await temporary(t),
    journal = await openJournal(directory, "sandbox-one");
  await assert.rejects(
    new Commands(journal, async () => ({ accessToken: "never-save-this" }), {
      attempts: 1,
    }).execute("save", request),
    { code: "ACK_UNCERTAIN" },
  );
  const file = path.join(directory, "journal.json"),
    saved = JSON.parse(await readFile(file, "utf8"));
  assert.ok(!JSON.stringify(saved).includes("never-save-this"));
  saved.steps.save.body.expectedVersion = 7;
  await writeFile(file, JSON.stringify(saved));
  await assert.rejects(openJournal(directory, "sandbox-one"), {
    code: "INVALID_JOURNAL",
  });
});

test("HTTP rejects external targets/routes and sanitizes server/network errors", async () => {
  assert.throws(() => createHttp("http://localhost:3000/api/v1", {}), {
    code: "INVALID_TARGET",
  });
  let calls = 0;
  const http = createHttp(
    "http://127.0.0.1:3012/api/v1",
    {},
    {
      fetcher: async () => {
        calls++;
        return new Response("private token or contact", { status: 403 });
      },
    },
  );
  await assert.rejects(http("//evil.example"), { code: "INVALID_ROUTE" });
  await assert.rejects(
    http("/listings"),
    (error) => error.status === 403 && !error.message.includes("private"),
  );
  assert.equal(calls, 1);
  await assert.rejects(
    createHttp(
      "http://127.0.0.1:3012/api/v1",
      {},
      {
        fetcher: async () => {
          throw new Error("secret URL");
        },
      },
    )("/listings"),
    (error) =>
      error.code === "HTTP_UNCERTAIN" && !error.message.includes("secret"),
  );
});

test("sandbox cannot target main MongoDB or rotate an initialized run", async (t) => {
  for (const url of [
    "mongodb://127.0.0.1:57117/main?replicaSet=rs-dev",
    "mongodb://remote:57017/admin?replicaSet=rs-test",
    "mongodb://127.0.0.1:57017/admin?replicaSet=wrong",
  ])
    assert.throws(() => validateTarget(url), { code: "INVALID_TARGET" });
  const directory = await temporary(t),
    config = await initialize(directory, { fixture: true });
  assert.throws(
    () => validateConfig({ ...config, database: "latlai_acceptance_20260929" }),
    { code: "INVALID_CONFIG" },
  );
  assert.throws(() => validateConfig({ ...config, bucket: "latlai-media" }), {
    code: "INVALID_CONFIG",
  });
  assert.throws(
    () =>
      validateConfig({
        ...config,
        accounts: { ...config.accounts, reviewer: config.accounts.seller },
      }),
    { code: "INVALID_CONFIG" },
  );
  const before = await readFile(path.join(directory, "private.json"), "utf8");
  await assert.rejects(initialize(directory, { fixture: true }), {
    code: "EEXIST",
  });
  assert.equal(
    await readFile(path.join(directory, "private.json"), "utf8"),
    before,
  );
  assert.notEqual(
    bindingFor(config),
    bindingFor({ ...config, storage: "live" }),
  );
});
