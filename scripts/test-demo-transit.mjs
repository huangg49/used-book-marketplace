import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, initialize, createSandbox } from "./demo/sandbox.mjs";
import { runTransit } from "./demo/transit.mjs";
import { createHttp } from "./demo/http.mjs";
import { shippingReceipt } from "./demo/shipping-receipts.mjs";

const directory = path.join(
  root,
  ".tmp",
  "demo",
  `transit-qa-${randomBytes(6).toString("hex")}`,
);
await mkdir(directory, { recursive: true });
let sandbox;
try {
  const config = await initialize(directory, {
    fixture: true,
    port: 3028,
    transit: true,
  });
  sandbox = await createSandbox(config, directory);
  const readJournal = async () =>
    JSON.parse(await readFile(path.join(directory, "journal.json"), "utf8"));
  const interrupted = {},
    projections = {};
  const phases = [
    [
      "transit.packaging.upload",
      (url, method) =>
        method === "PUT" && /\/packaging-evidence\/[^/]+\/content$/.test(url),
    ],
    [
      "transit.label",
      (url, method) =>
        method === "POST" && /\/orders\/[^/]+\/shipment$/.test(url),
    ],
    [
      "transit.pickup",
      (url, method) =>
        method === "POST" && url.endsWith("/simulator/pickup-events"),
    ],
  ];
  for (const [step, match] of phases) {
    let attempts = 0;
    const requests = [],
      receipts = [];
    await assert.rejects(
      runTransit(config, directory, sandbox, {
        fetcher: async (url, options) => {
          if (!match(new URL(url).pathname, options.method))
            return fetch(url, options);
          requests.push({
            key: options.headers["Idempotency-Key"],
            body: options.body,
          });
          // Two identical pickup commands enter the API concurrently, including the
          // first application. This is actual contention, not sequential replay.
          const responses = await Promise.all(
            step === "transit.pickup"
              ? [fetch(url, options), fetch(url, options)]
              : [fetch(url, options)],
          );
          const batch = [];
          for (const response of responses) {
            assert.ok(response.ok);
            batch.push(shippingReceipt(await response.json()));
          }
          for (const receipt of batch) assert.deepEqual(receipt, batch[0]);
          receipts.push(batch[0]);
          attempts++;
          throw new Error("controlled response loss after commit");
        },
      }),
      { code: "ACK_UNCERTAIN" },
    );
    assert.equal(attempts, 3);
    assert.deepEqual(requests[0], requests[2]);
    assert.deepEqual(receipts[0], receipts[2]);
    const journal = await readJournal();
    interrupted[step] = journal.steps[step];
    assert.equal(interrupted[step].state, "pending");
    const http = createHttp(sandbox.base, sandbox.tokens),
      orderId = receipts[0].orderId;
    const order = await http(`/me/orders/${orderId}`, { actor: "buyer" });
    assert.equal(order.moneyHeld, order.amounts.buyerTotal);
    assert.equal(order.commitment.status, "Active");
    assert.equal(order.commitment.version, 1);
    assert.equal(
      order.state,
      step === "transit.pickup" ? "InTransit" : "Preparing",
    );
    projections[step] = {
      version: order.version,
      pickupDeadline: order.preparation.pickupDeadline,
      ledger: await sandbox.reconcileMoney(),
      ...(step === "transit.pickup"
        ? {
            pickup: (
              await http(`/me/orders/${orderId}/shipment`, { actor: "buyer" })
            ).pickup,
          }
        : {}),
    };
    if (step === "transit.packaging.upload") {
      const photo = await readFile(path.join(directory, "demo-packaging.png"));
      await writeFile(
        path.join(directory, "demo-packaging.png"),
        Buffer.from("changed fixture bytes"),
      );
      try {
        await assert.rejects(runTransit(config, directory, sandbox), {
          code: "TRANSIT_MISMATCH",
        });
      } finally {
        await writeFile(path.join(directory, "demo-packaging.png"), photo);
      }
      assert.equal(
        (await readJournal()).steps[step].key,
        interrupted[step].key,
      );
    }
    const tokens = sandbox.tokens;
    await sandbox.close();
    sandbox = await createSandbox(config, directory);
    Object.assign(sandbox.tokens, tokens);
  }
  const manifest = await runTransit(config, directory, sandbox);
  assert.equal(manifest.orders.intransit.state, "InTransit");
  assert.equal(manifest.orders.intransit.version, 4);
  assert.equal(manifest.wallet.available, 535_000);
  assert.equal(manifest.wallet.held, 465_000);
  assert.equal(manifest.wallet.sellerAvailable, 0);
  assert.equal(
    (
      await fetch(
        `http://127.0.0.1:${config.port + 1}/${encodeURIComponent(`order-evidence/${manifest.packaging.evidenceId}/original`)}`,
      )
    ).status,
    404,
  );
  assert.equal(manifest.reconciliation.sourceRemaining, 99_000_000);
  for (const projection of Object.values(projections)) {
    assert.deepEqual(manifest.reconciliation, projection.ledger);
    assert.equal(manifest.shipment.pickupDeadline, projection.pickupDeadline);
  }
  assert.deepEqual(
    manifest.shipment.pickup,
    projections["transit.pickup"].pickup,
  );
  const collections = [
    "direct_orders",
    "exclusive_commitments",
    "order_preparations",
    "listings",
    "listing_media",
    "order_packaging_evidence",
    "direct_shipments",
    "shipment_packaging_evidence",
    "carrier_pickup_events",
    "carrier_pickup_reviews",
    "ledger_journals",
    "ledger_entries",
    "mutation_receipts",
  ];
  const counts = async () =>
    Object.fromEntries(
      await Promise.all(
        collections.map(async (name) => [
          name,
          await sandbox.inspect(name).countDocuments(),
        ]),
      ),
    );
  const initial = await counts();
  assert.deepEqual(initial, {
    direct_orders: 4,
    exclusive_commitments: 4,
    order_preparations: 2,
    listings: 4,
    listing_media: 4,
    order_packaging_evidence: 1,
    direct_shipments: 1,
    shipment_packaging_evidence: 1,
    carrier_pickup_events: 1,
    carrier_pickup_reviews: 0,
    ledger_journals: 5,
    ledger_entries: 10,
    mutation_receipts: 57,
  });
  const after = await readJournal();
  assert.equal(Object.keys(after.steps).length, 57);
  for (const [step, before] of Object.entries(interrupted)) {
    assert.equal(after.steps[step].state, "acknowledged");
    assert.equal(after.steps[step].key, before.key);
    assert.deepEqual(after.steps[step].body, before.body);
  }
  assert.equal(
    after.steps["transit.pickup"].key,
    after.steps["transit.pickup"].body.eventId,
  );
  const again = await runTransit(config, directory, sandbox);
  assert.deepEqual(again.orders, manifest.orders);
  assert.deepEqual(again.shipment, manifest.shipment);
  assert.deepEqual(await counts(), initial);
  const http = createHttp(sandbox.base, sandbox.tokens),
    id = manifest.orders.intransit.id;
  const pickup = after.steps["transit.pickup"].body;
  const post = (actor, body = pickup, key = body.eventId) =>
    http("/operations/simulator/pickup-events", {
      actor,
      method: "POST",
      body,
      headers: { "Idempotency-Key": key },
    });
  for (const actor of ["seller", "buyer", "reviewer"])
    await assert.rejects(post(actor), { status: 403 });
  await assert.rejects(post("operator", pickup, randomUUID()), { status: 422 });
  await assert.rejects(
    post("operator", {
      ...pickup,
      occurredAt: new Date(Date.parse(pickup.occurredAt) + 1).toISOString(),
    }),
    { status: 409 },
  );
  await assert.rejects(
    post("operator", { ...pickup, trackingCode: "LL-NONMATCHING" }),
    { status: 404 },
  );
  for (const actor of ["operator", "reviewer"])
    await assert.rejects(
      http(
        `/me/orders/${id}/packaging-evidence/${manifest.packaging.evidenceId}/read`,
        { actor },
      ),
      { status: 403 },
    );
  await assert.rejects(
    http(`/orders/${id}/shipment`, {
      actor: "buyer",
      method: "POST",
      body: after.steps["transit.label"].body,
      headers: { "Idempotency-Key": after.steps["transit.label"].key },
    }),
    { status: 404 },
  );
  // Ready binary replay checks current Seller authorization too.
  await assert.rejects(
    http(
      `/orders/${id}/packaging-evidence/${manifest.packaging.evidenceId}/content`,
      {
        actor: "buyer",
        method: "PUT",
        binary: true,
        body: await readFile(path.join(directory, "demo-packaging.png")),
        headers: {
          "Content-Type": "image/png",
          "Idempotency-Key": after.steps["transit.packaging.upload"].key,
        },
      },
    ),
    { status: 404 },
  );
  assert.deepEqual(await counts(), initial);
  for (const file of [
    "journal.json",
    "orders-manifest.json",
    "transit-manifest.json",
  ]) {
    const text = await readFile(path.join(directory, file), "utf8");
    for (const secret of [
      config.jwt,
      config.fundingSecret,
      config.credentials.app,
      config.credentials.migrator,
      ...Object.values(sandbox.tokens),
      ...Object.values(config.accounts).flatMap((account) => [
        account.email,
        account.password,
      ]),
      ...Object.values(config.orders.addresses).flatMap((address) => [
        address.phone,
        address.detail,
        address.recipientName,
      ]),
    ])
      assert.ok(!text.includes(secret), `Private input leaked to ${file}`);
    for (const field of [
      "signature",
      "accessToken",
      "refreshToken",
      "signedUrl",
    ])
      assert.ok(!text.includes(field));
  }
  // Extra factual duplicate and conflict are separate focused API cases after
  // the deterministic scenario evidence. They never refund, settle or restock.
  const duplicate = await post("operator", {
    ...pickup,
    eventId: randomUUID(),
  });
  assert.equal(duplicate.outcome, "Duplicate");
  assert.equal(duplicate.orderVersion, 4);
  assert.equal(
    (await http(`/me/orders/${id}/shipment`, { actor: "buyer" })).pickup
      .eventId,
    pickup.eventId,
  );
  const conflicting = await post("operator", {
    ...pickup,
    eventId: randomUUID(),
    occurredAt: new Date(Date.parse(pickup.occurredAt) + 1).toISOString(),
  });
  assert.equal(conflicting.outcome, "ReviewRequired");
  const reviewed = await http(`/me/orders/${id}`, { actor: "buyer" });
  assert.equal(reviewed.state, "ResolutionPending");
  assert.equal(reviewed.version, 5);
  assert.equal(reviewed.moneyHeld, manifest.orders.intransit.heldAmount);
  assert.equal(reviewed.commitment.status, "Active");
  const reviewedShipment = await http(`/me/orders/${id}/shipment`, {
    actor: "buyer",
  });
  assert.equal(reviewedShipment.pickup.eventId, pickup.eventId);
  assert.equal(reviewedShipment.carrierReview.reason, "ConflictingPickup");
  await sandbox.checkShipment(manifest.shipment.id);
  assert.deepEqual(await sandbox.reconcileMoney(), manifest.reconciliation);
  await assert.rejects(runTransit(config, directory, sandbox), {
    code: "ORDER_MISMATCH",
  });
  console.log(
    "H01b transit QA PASS: 57 stable intents/receipts; packaging/label/pickup loss + API restart with memory sessions; actual concurrent identical pickup one Applied event; no ledger/commitment movement; wrong actor/key/payload denied; separate duplicate/conflict preserves canonical pickup and hold, conflicting scenario blocked. Storage FAKE; native/human/remote CI not certified.",
  );
} finally {
  await sandbox?.close();
}
