import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { root, initialize, createSandbox } from "./demo/sandbox.mjs";
import { runFunding, DEMO_FUNDING } from "./demo/funding.mjs";
import { createHttp } from "./demo/http.mjs";

const directory = path.join(
  root,
  ".tmp",
  "demo",
  `funding-qa-${randomBytes(6).toString("hex")}`,
);
await mkdir(directory, { recursive: true });
let sandbox;
try {
  const config = await initialize(directory, {
    fixture: true,
    port: 3018,
    funding: true,
  });
  sandbox = await createSandbox(config, directory);
  let dropped = 0;
  await assert.rejects(
    runFunding(config, directory, sandbox, {
      fetcher: async (url, options) => {
        const response = await fetch(url, options);
        if (new URL(url).pathname.endsWith("/simulator/topup-events")) {
          assert.equal(response.status, 200);
          await response.arrayBuffer();
          dropped++;
          throw new Error("controlled lost funding acknowledgement");
        }
        return response;
      },
    }),
    { code: "ACK_UNCERTAIN" },
  );
  assert.equal(dropped, 3);
  const before = JSON.parse(
    await readFile(path.join(directory, "journal.json"), "utf8"),
  );
  assert.equal(before.steps["funding.event"].state, "pending");
  await sandbox.close();
  sandbox = undefined;
  sandbox = await createSandbox(config, directory);
  const manifest = await runFunding(config, directory, sandbox);
  assert.equal(manifest.wallet.available, DEMO_FUNDING);
  assert.equal(
    manifest.reconciliation.sourceRemaining,
    100_000_000 - DEMO_FUNDING,
  );
  assert.equal(manifest.reconciliation.transactionHeld, 0);
  assert.equal(manifest.reconciliation.journals, 2);
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        [
          "topup_intents",
          "simulated_payment_events",
          "ledger_journals",
          "ledger_entries",
          "mutation_receipts",
        ].map(async (name) => [
          name,
          await sandbox.inspect(name).countDocuments(),
        ]),
      ),
    );
  const initial = await counts();
  assert.deepEqual(initial, {
    topup_intents: 1,
    simulated_payment_events: 1,
    ledger_journals: 2,
    ledger_entries: 4,
    mutation_receipts: 2,
  });
  const again = await runFunding(config, directory, sandbox);
  assert.equal(again.journalId, manifest.journalId);
  assert.deepEqual(await counts(), initial);
  const after = JSON.parse(
    await readFile(path.join(directory, "journal.json"), "utf8"),
  );
  assert.equal(
    after.steps["funding.event"].key,
    before.steps["funding.event"].key,
  );
  assert.deepEqual(
    after.steps["funding.event"].body,
    before.steps["funding.event"].body,
  );
  const http = createHttp(sandbox.base, sandbox.tokens);
  await assert.rejects(
    http("/operations/simulator/topup-events", {
      actor: "buyer",
      method: "POST",
      body: before.steps["funding.event"].body,
      headers: { "Idempotency-Key": randomUUID() },
    }),
    { status: 403 },
  );
  await assert.rejects(
    runFunding({ ...config, fundingSecret: undefined }, directory, sandbox),
    { code: "FUNDING_DISABLED" },
  );
  await assert.rejects(
    runFunding(
      {
        ...config,
        accounts: { ...config.accounts, operator: config.accounts.buyer },
      },
      directory,
      sandbox,
    ),
    { code: "MONEY_MISMATCH" },
  );
  assert.deepEqual(await counts(), initial);
  for (const file of ["journal.json", "funding-manifest.json"]) {
    const text = await readFile(path.join(directory, file), "utf8");
    assert.ok(!text.includes(config.fundingSecret));
    for (const account of Object.values(config.accounts))
      assert.ok(
        !text.includes(account.email) && !text.includes(account.password),
      );
    assert.ok(!text.includes("accessToken") && !text.includes("refreshToken"));
  }
  console.log(
    "H01b funding QA PASS: lost ack after credit + API restart + rerun, one topup/journal, 1M available + 99M finite source; Member event denied; no direct money writes. Order scenarios NOT RUN.",
  );
} finally {
  await sandbox?.close();
}
