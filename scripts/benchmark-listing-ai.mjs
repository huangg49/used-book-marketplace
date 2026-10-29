// Real HTTP/Mongo pipeline timings on QA. --live sends ONLY synthetic book
// data/photos to configured NVIDIA adapters. It never uses the main DB/storage.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAiQa } from "./listing-ai-qa.mjs";
const live = process.argv.includes("--live");
const raw =
  process.argv.find((arg) => arg.startsWith("--samples="))?.split("=")[1] ??
  "5";
const samples = Number(raw);
if (!Number.isInteger(samples) || samples < 1 || samples > 5)
  throw new Error(
    "Use --samples=1..5; one run caps fresh provider calls at ten.",
  );
if (
  process.argv
    .slice(2)
    .some((arg) => arg !== "--live" && !arg.startsWith("--samples="))
)
  throw new Error("Use --live and/or --samples=1..5.");
const directory = path.resolve(".tmp/listing-ai-benchmark");
await mkdir(directory, { recursive: true });
let fixture;
const rows = [];
const percentile = (values, q) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1]
    : null;
try {
  fixture = await createAiQa({ live });
  async function call(type, listing, body, key = randomUUID()) {
    const start = performance.now();
    const response = await fetch(
      `${fixture.base}/listings/${listing}/${type}-suggestions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${fixture.member.accessToken}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      },
    );
    const value = await response.json();
    const serverTiming = response.headers.get("server-timing") ?? "";
    assert.match(serverTiming, /^ai_[a-z]+;dur=[0-9., a-z_;=]+$/);
    return {
      http: response.status,
      elapsedMs: Math.round(performance.now() - start),
      serverTiming,
      status: value.status ?? value.code,
      cached: value.cached ?? false,
    };
  }
  for (let index = 0; index < samples; index++) {
    const day = new Date().toISOString().slice(0, 10);
    const used = await fixture.db
      .collection("price_assist_usage")
      .findOne({ _id: `global:${day}` });
    if ((used?.costMicroUsd ?? 0) >= 100000) {
      rows.push({ sample: index + 1, status: "NOT_RUN_BUDGET" });
      break;
    }
    const start = performance.now();
    const draft = await fixture.draftWithPhoto();
    const uploadAndProcessMs = Math.round(performance.now() - start);
    const photo = await call("autofill", draft.id, {
      mediaIds: [draft.mediaId],
    });
    const priceBody = {
      bookId: fixture.catalogId,
      condition: "Good",
      readable: true,
      hasMissingPages: false,
      missingEssentialContent: false,
      conditionNote: "Synthetic QA transport benchmark",
    };
    const key = randomUUID();
    const price = await call("price", draft.id, priceBody, key);
    let replay;
    if (index === 0 && price.http === 200) {
      const before = fixture.counters.price;
      replay = await call("price", draft.id, priceBody, key);
      assert.equal(replay.cached, true);
      assert.equal(fixture.counters.price, before);
      assert.ok(!replay.serverTiming.includes("ai_model;"));
    }
    rows.push({
      sample: index + 1,
      uploadAndProcessMs,
      photo,
      price,
      ...(replay ? { replay } : {}),
      pipelineMs: Math.round(performance.now() - start),
    });
    console.log(
      `Sample ${index + 1}: photo HTTP ${photo.http} ${photo.elapsedMs}ms; price HTTP ${price.http} ${price.elapsedMs}ms; synthetic QA.`,
    );
  }
  const usage = await fixture.db
    .collection("price_assist_usage")
    .findOne({ _id: `global:${new Date().toISOString().slice(0, 10)}` });
  const summary = {
    mode: live ? "live-NVIDIA" : "fake-provider",
    source: "synthetic",
    ranAt: new Date().toISOString(),
    sourceHead: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], {
      encoding: "utf8",
    }).trim(),
    samplesRequested: samples,
    samplesRun: rows.filter((r) => r.price).length,
    results: Object.fromEntries(
      ["photo", "price"].map((type) => {
        const timings = rows
          .filter((r) => r[type]?.http === 200)
          .map((r) => r[type].elapsedMs);
        return [
          type,
          {
            success: timings.length,
            failures: rows.filter((r) => r[type] && r[type].http !== 200)
              .length,
            freshHttpP50Ms: percentile(timings, 0.5),
            freshHttpP95Ms: percentile(timings, 0.95),
          },
        ];
      }),
    ),
    estimatedCostUsd: (usage?.costMicroUsd ?? 0) / 1e6,
    providerCalls: fixture.counters,
    qualityAcceptance:
      "NOT_RUN: no reviewed real-camera corpus; this is a synthetic transport/latency probe, fake storage",
    rows,
  };
  await writeFile(
    path.join(directory, `${live ? "live" : "fake"}.json`),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      mode: summary.mode,
      source: summary.source,
      results: summary.results,
      estimatedCostUsd: summary.estimatedCostUsd,
      qualityAcceptance: summary.qualityAcceptance,
    }),
  );
  if (rows.some((r) => r.photo?.http !== 200 || r.price?.http !== 200))
    process.exitCode = 1;
} finally {
  await fixture?.close();
}
