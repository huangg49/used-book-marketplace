// Read-only QA mapping. Never import retail observations into price_references.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateDataset } from "./validator.mjs";
const root = new URL("../../", import.meta.url);
const dir = fileURLToPath(new URL("incoming/", import.meta.url));
const req = createRequire(new URL("apps/api/package.json", root));
const load = (p) =>
  import(new URL(`apps/api/dist/modules/price-assist/${p}.js`, root));
const { evaluate } = await load("evidence");
const { checkOutput } = await load("output-check");
const { SYSTEM_PROMPT, buildUserPrompt } = await load("prompt");
const { priceModelFromConfig, rateFor, costMicroUsd, PriceModelError } =
  await load("price-model");
const args = process.argv.slice(2);
assert.ok(
  args.every((a) => a === "--live"),
  "Only --live is supported; default is offline.",
);
const validation = await validateDataset({ dir });
assert.equal(
  validation.technicalStatus,
  "PASS",
  "Dataset must pass before evaluation.",
);
const json = async (p) =>
  JSON.parse(await readFile(new URL(`incoming/${p}`, import.meta.url), "utf8"));
const { books } = await json("catalog/books.json");
const { observations } = await json("prices/observations.json");
const { sources } = await json("provenance/sources.json");
const bySource = new Map(sources.map((s) => [s.sourceId, s]));
const live = args.includes("--live");
let model = null;
if (live) {
  const env = req("dotenv").parse(
    await readFile(new URL("apps/api/.env", root)),
  );
  assert.equal(
    env.PRICE_ASSIST_PROVIDER,
    "nvidia",
    "Bounded QA expects configured NVIDIA adapter.",
  );
  model = priceModelFromConfig((k) => env[k]);
  assert.ok(model, "AI configuration unavailable; values withheld.");
}
const rows = [];
let calls = 0,
  spentMicroUsd = 0;
const maxCalls = 3,
  maxUsd = 0.02;
const now = new Date();
for (const b of books) {
  if (b.status === "blocked") {
    rows.push({
      bookKey: b.bookKey,
      status: "QUARANTINED",
      providerCalled: false,
    });
    continue;
  }
  // The copy condition is synthetic; observed retail prices remain labelled as retail.
  const book = {
    ...b.metadata,
    id: b.bookKey,
    category: "Văn học",
    confirmed: false,
  };
  const input = {
    bookId: b.bookKey,
    condition: "Good",
    readable: true,
    hasMissingPages: false,
    missingEssentialContent: false,
    conditionNote:
      "QA giả định: bản sách còn đọc rõ, đủ trang; không phải kiểm định bản sách thật.",
  };
  const accepted = observations.filter(
    (o) =>
      o.bookKey === b.bookKey &&
      o.status === "ready" &&
      o.editionMatch === "exact" &&
      o.availability === "in-stock",
  );
  const raw = accepted.map((o) => ({
    id: o.id,
    kind: o.kind,
    amount: o.amountVnd,
    condition: null,
    label: bySource.get(o.sourceId).independenceGroup,
    url: bySource.get(o.sourceId).url,
    observedAt: new Date(`${o.observedAt}T00:00:00Z`),
    isbn: o.identityEvidence.isbn ?? null,
  }));
  const evidence = evaluate(input, book, raw, now);
  // No completed-sale/editorial evidence: retail-only corpus must never claim Strong.
  assert.notEqual(evidence.level, "Strong");
  const row = {
    bookKey: b.bookKey,
    status: evidence.status,
    level: evidence.level,
    bounds: evidence.bounds,
    acceptedObservationIds: accepted.map((o) => o.id),
    rejectedObservationIds: observations
      .filter((o) => o.bookKey === b.bookKey && !accepted.includes(o))
      .map((o) => o.id),
    rules: evidence.rules,
    providerCalled: false,
  };
  if (
    model &&
    evidence.status === "Proceed" &&
    calls < maxCalls &&
    spentMicroUsd < maxUsd * 1e6
  ) {
    calls++;
    row.providerCalled = true;
    const started = Date.now();
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      const draft = await model.draft(
        SYSTEM_PROMPT,
        buildUserPrompt(input, book, evidence),
      );
      usage = draft;
      row.answer = checkOutput(draft.output, evidence);
      row.modelStatus = "VALID_BOUNDED_OUTPUT";
    } catch (e) {
      if (e instanceof PriceModelError && e.usage) usage = e.usage;
      row.modelStatus = e instanceof PriceModelError ? e.kind : "InvalidOutput";
    }
    row.latencyMs = Date.now() - started;
    row.tokens = { input: usage.inputTokens, output: usage.outputTokens };
    spentMicroUsd += costMicroUsd(
      rateFor(model.model, null),
      usage.inputTokens,
      usage.outputTokens,
    );
  }
  rows.push(row);
}
const summary = {
  ranAt: now.toISOString(),
  mode: live ? "live-3-call-maximum" : "offline-rules",
  source:
    "Unreviewed public retail observations; hypothetical Good copy; no DB/import/storage",
  model: model?.model ?? null,
  providerCalls: calls,
  maxCalls,
  maxUsd,
  costUsd: spentMicroUsd / 1e6,
  billingLimit:
    "Token estimate only; failures without usage unpriced; not a hard billing cap.",
  counts: Object.fromEntries(
    [...new Set(rows.map((r) => r.status))].map((s) => [
      s,
      rows.filter((r) => r.status === s).length,
    ]),
  ),
  priceAccuracy:
    "NOT_SCORED: no reviewed used-copy valuation or completed sale",
  humanReview: "NOT_RUN",
  readinessGateChanged: false,
};
const output = new URL(".tmp/listing-ai-corpus/", root);
await mkdir(output, { recursive: true });
await writeFile(
  new URL(`prices-${live ? "live" : "offline"}.json`, output),
  JSON.stringify({ summary, rows }, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
if (
  rows.some((r) => r.providerCalled && r.modelStatus !== "VALID_BOUNDED_OUTPUT")
)
  process.exitCode = 1;
