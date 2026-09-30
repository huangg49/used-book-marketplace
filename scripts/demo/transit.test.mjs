import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Commands, ScenarioError, openJournal } from "./journal.mjs";
import { shippingReceipt } from "./shipping-receipts.mjs";
import { previewTarget, runTransit } from "./transit.mjs";
import { initialize, bindingFor } from "./sandbox.mjs";

test("carrier event pins command key to event ID through loss/restart, invalid explicit keys fail before write", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "latlai-transit-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = await openJournal(directory, "transit-unit"),
    eventId = randomUUID(),
    seen = [];
  const request = () => ({
    actor: "operator",
    method: "POST",
    route: "/operations/simulator/pickup-events",
    key: eventId,
    body: { eventId },
  });
  const result = {
    id: randomUUID(),
    entityType: "CarrierEvent",
    entityId: eventId,
    orderId: randomUUID(),
    contextId: randomUUID(),
    shipmentId: randomUUID(),
    version: 1,
    state: "Recorded",
    outcome: "Applied",
    orderVersion: 4,
    orderState: "InTransit",
    serverTime: new Date().toISOString(),
  };
  await assert.rejects(
    new Commands(
      journal,
      async (intent) => {
        seen.push(structuredClone(intent));
        throw new ScenarioError("HTTP_UNCERTAIN", "lost ack");
      },
      { attempts: 1, projectReceipt: shippingReceipt },
    ).execute("pickup", request),
    { code: "ACK_UNCERTAIN" },
  );
  await new Commands(
    await openJournal(directory, "transit-unit"),
    async (intent) => {
      seen.push(structuredClone(intent));
      return result;
    },
    { projectReceipt: shippingReceipt },
  ).execute("pickup", () => {
    throw new Error("do not regenerate event");
  });
  assert.deepEqual(seen[0], seen[1]);
  assert.equal(seen[1].key, seen[1].body.eventId);
  for (const key of ["bad", [eventId]])
    await assert.rejects(
      new Commands(journal, () => {
        throw new Error("must not send");
      }).execute("invalid", () => ({ ...request(), key })),
      { code: "INVALID_INTENT" },
    );
  assert.equal(journal.data.steps.invalid, undefined);
});
test("shipping receipts separate evidence/label/event versions and discard contact/signature payloads", () => {
  const base = {
    id: randomUUID(),
    entityId: randomUUID(),
    orderId: randomUUID(),
    contextId: randomUUID(),
    serverTime: new Date().toISOString(),
    contact: "never-persist",
    signature: "never-persist",
  };
  for (const value of [
    { entityType: "OrderPackagingEvidence", version: 1, state: "Pending" },
    { entityType: "OrderPackagingEvidence", version: 2, state: "Ready" },
    { entityType: "Shipment", version: 1, state: "LabelCreated" },
    {
      entityType: "CarrierEvent",
      version: 1,
      state: "Recorded",
      shipmentId: randomUUID(),
      outcome: "Applied",
      orderVersion: 4,
      orderState: "InTransit",
    },
  ])
    assert.ok(
      !JSON.stringify(shippingReceipt({ ...base, ...value })).includes(
        "never-persist",
      ),
    );
  for (const value of [
    { entityType: "OrderPackagingEvidence", version: 1, state: "Ready" },
    { entityType: "Shipment", version: 2, state: "PickedUp" },
    { entityType: "CarrierEvent", version: 129, state: "Recorded" },
  ])
    assert.throws(() => shippingReceipt({ ...base, ...value }), {
      code: "INVALID_RECEIPT",
    });
});
test("transit config is opt-in and preview targets cannot leak to unrelated hosts or objects", async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "latlai-transit-config-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = await initialize(directory, {
    fixture: true,
    transit: true,
    port: 3026,
  });
  const id = randomUUID(),
    url = `http://127.0.0.1:3027/${encodeURIComponent(`order-evidence/${id}/preview-v1.webp`)}`;
  assert.equal(previewTarget(config, id, url), url);
  for (const target of [
    "https://evil.test/a",
    url.replace("3027", "57117"),
    url.replace("preview-v1.webp", "original"),
    url + "?token=bad",
  ])
    assert.throws(() => previewTarget(config, id, target), {
      code: "TRANSIT_MISMATCH",
    });
  const legacy = structuredClone(config);
  delete legacy.orders.transit;
  assert.notEqual(bindingFor(legacy), bindingFor(config));
  await assert.rejects(runTransit(legacy, directory, {}), {
    code: "TRANSIT_DISABLED",
  });
  const live = {
    ...config,
    storage: "live",
    project: "https://example.supabase.co",
  };
  assert.equal(
    previewTarget(
      live,
      id,
      `${live.project}/storage/v1/object/sign/${live.bucket}/order-evidence/${id}/preview-v1.webp?token=private`,
    ),
    `${live.project}/storage/v1/object/sign/${live.bucket}/order-evidence/${id}/preview-v1.webp?token=private`,
  );
  assert.throws(
    () =>
      previewTarget(
        live,
        id,
        `${live.project}/storage/v1/object/sign/other/order-evidence/${id}/preview-v1.webp`,
      ),
    { code: "TRANSIT_MISMATCH" },
  );
});
