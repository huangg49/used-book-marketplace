import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { root, initialize, createSandbox } from "./demo/sandbox.mjs";
import { runOrders } from "./demo/orders.mjs";
import { createHttp } from "./demo/http.mjs";
import { orderReceipt } from "./demo/order-receipts.mjs";

const directory = path.join(
  root,
  ".tmp",
  "demo",
  `orders-qa-${randomBytes(6).toString("hex")}`,
);
await mkdir(directory, { recursive: true });
let sandbox;
try {
  const config = await initialize(directory, {
    fixture: true,
    port: 3022,
    orders: true,
  });
  sandbox = await createSandbox(config, directory);
  const readJournal = async () =>
    JSON.parse(await readFile(path.join(directory, "journal.json"), "utf8"));
  const points = [
    ["orders.awaiting.quote", (url) => /\/listings\/[^/]+\/quotes$/.test(url)],
    ["orders.awaiting.create", (url) => url.endsWith("/orders")],
    ["orders.paid.pay", (url) => /\/orders\/[^/]+\/pay$/.test(url)],
    ["orders.preparing.accept", (url) => /\/orders\/[^/]+\/accept$/.test(url)],
  ];
  const interrupted = {},
    committedDeadlines = {};
  for (const [step, match] of points) {
    const requests = [],
      receipts = [];
    await assert.rejects(
      runOrders(config, directory, sandbox, {
        fetcher: async (url, options) => {
          const response = await fetch(url, options);
          if (options.method === "POST" && match(new URL(url).pathname)) {
            assert.ok(response.ok);
            requests.push({
              key: options.headers["Idempotency-Key"],
              body: options.body,
            });
            receipts.push(orderReceipt(await response.json()));
            throw new Error(
              "controlled lost acknowledgement after server commit",
            );
          }
          return response;
        },
      }),
      { code: "ACK_UNCERTAIN" },
    );
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0], requests[2]);
    assert.deepEqual(receipts[0], receipts[2]);
    const journal = await readJournal();
    assert.equal(journal.steps[step].state, "pending");
    interrupted[step] = journal.steps[step];
    if (receipts[0].entityType === "Order") {
      const current = await createHttp(sandbox.base, sandbox.tokens)(
        `/me/orders/${receipts[0].entityId}`,
        { actor: "buyer" },
      );
      committedDeadlines[receipts[0].entityId] = {
        paymentDeadline: current.paymentDeadline,
        sellerConfirmationDeadline: current.sellerConfirmationDeadline,
        pickupDeadline: current.preparation?.pickupDeadline ?? null,
      };
    }
    // The API restarts; sessions stay in this test process's memory. No persisted
    // tokens, throttle bypass, synthetic IP or login-attempt deletion is involved.
    const tokens = sandbox.tokens;
    await sandbox.close();
    sandbox = await createSandbox(config, directory);
    Object.assign(sandbox.tokens, tokens);
  }
  const manifest = await runOrders(config, directory, sandbox);
  assert.equal(manifest.status, "PASS");
  assert.equal(manifest.orders.awaiting.state, "AwaitingPayment");
  assert.equal(manifest.orders.paid.state, "PendingSellerConfirmation");
  assert.equal(manifest.orders.preparing.state, "Preparing");
  assert.equal(manifest.orders.awaiting.heldAmount, 0);
  for (const order of Object.values(manifest.orders))
    if (committedDeadlines[order.id])
      assert.deepEqual(
        {
          paymentDeadline: order.paymentDeadline,
          sellerConfirmationDeadline: order.sellerConfirmationDeadline,
          pickupDeadline: order.pickupDeadline,
        },
        committedDeadlines[order.id],
      );
  const held =
    manifest.orders.paid.amounts.buyerTotal +
    manifest.orders.preparing.amounts.buyerTotal;
  assert.equal(manifest.wallet.held, held);
  assert.equal(manifest.wallet.available, 1_000_000 - held);
  assert.equal(manifest.wallet.sellerAvailable, 0);
  assert.equal(manifest.reconciliation.sourceRemaining, 99_000_000);
  assert.equal(manifest.reconciliation.balanced, true);
  const collections = [
    "address_books",
    "sale_quotes",
    "direct_orders",
    "workflow_contexts",
    "exclusive_commitments",
    "order_preparations",
    "listings",
    "listing_media",
    "topup_intents",
    "simulated_payment_events",
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
    address_books: 2,
    sale_quotes: 3,
    direct_orders: 3,
    workflow_contexts: 3,
    exclusive_commitments: 3,
    order_preparations: 1,
    listings: 3,
    listing_media: 3,
    topup_intents: 1,
    simulated_payment_events: 1,
    ledger_journals: 4,
    ledger_entries: 8,
    mutation_receipts: 46,
  });
  const after = await readJournal();
  for (const [step, intent] of Object.entries(interrupted)) {
    assert.equal(after.steps[step].key, intent.key);
    assert.deepEqual(after.steps[step].body, intent.body);
    assert.equal(after.steps[step].state, "acknowledged");
  }
  const again = await runOrders(config, directory, sandbox);
  assert.deepEqual(again.orders, manifest.orders);
  assert.deepEqual(await counts(), initial);
  assert.equal(Object.keys((await readJournal()).steps).length, 46);
  const http = createHttp(sandbox.base, sandbox.tokens);
  // Existing participants cannot exercise one another's commands, even when a
  // genuine receipt and command payload exist. A reviewer is not a participant.
  const denied = [
    [
      "buyer",
      `/orders/${manifest.orders.paid.id}/accept`,
      { expectedVersion: manifest.orders.paid.version },
    ],
    [
      "seller",
      `/orders/${manifest.orders.awaiting.id}/pay`,
      { expectedVersion: manifest.orders.awaiting.version },
    ],
    [
      "reviewer",
      `/orders/${manifest.orders.paid.id}/accept`,
      { expectedVersion: manifest.orders.paid.version },
    ],
  ];
  for (const [actor, route, body] of denied)
    await assert.rejects(
      http(route, {
        actor,
        method: "POST",
        body,
        headers: { "Idempotency-Key": randomUUID() },
      }),
      (error) => [403, 404].includes(error.status),
    );
  await assert.rejects(
    http(`/me/orders/${manifest.orders.preparing.id}`, { actor: "operator" }),
    { status: 403 },
  );
  const quoteIntent = after.steps["orders.awaiting.create"];
  await assert.rejects(
    http("/orders", {
      actor: "buyer",
      method: "POST",
      body: quoteIntent.body,
      headers: { "Idempotency-Key": randomUUID() },
    }),
    { status: 404 },
  );
  // Replay authorization is current, not supplied by a saved receipt.
  await assert.rejects(
    http(`/orders/${manifest.orders.preparing.id}/accept`, {
      actor: "buyer",
      method: "POST",
      body: after.steps["orders.preparing.accept"].body,
      headers: {
        "Idempotency-Key": after.steps["orders.preparing.accept"].key,
      },
    }),
    (error) => [403, 404, 409].includes(error.status),
  );
  assert.deepEqual(await counts(), initial);
  assert.deepEqual(
    (await runOrders(config, directory, sandbox)).orders,
    manifest.orders,
  );
  await assert.rejects(
    runOrders(config, directory, sandbox, {
      fetcher: async (url, options) => {
        const response = await fetch(url, options);
        if (
          options.method === "GET" &&
          new URL(url).pathname.endsWith(
            `/me/orders/${manifest.orders.awaiting.id}`,
          )
        ) {
          const current = await response.json();
          return Response.json({
            ...current,
            paymentDeadline: "2000-01-01T00:00:00.000Z",
          });
        }
        return response;
      },
    }),
    { code: "ORDER_MISMATCH" },
  );
  assert.deepEqual(await counts(), initial);
  for (const file of [
    "journal.json",
    "orders-manifest.json",
    "funding-manifest.json",
    ...Object.keys(manifest.orders).map(
      (slot) => `manifest-orders-${slot}-book.json`,
    ),
  ]) {
    const text = await readFile(path.join(directory, file), "utf8");
    for (const secret of [
      config.jwt,
      config.fundingSecret,
      config.credentials.app,
      config.credentials.migrator,
      ...Object.values(config.accounts).flatMap((account) => [
        account.email,
        account.password,
      ]),
      ...Object.values(config.orders.addresses).flatMap((address) => [
        address.recipientName,
        address.phone,
        address.detail,
      ]),
      ...Object.values(sandbox.tokens),
    ])
      assert.ok(!text.includes(secret), `Private input leaked to ${file}`);
    assert.ok(!text.includes("accessToken") && !text.includes("refreshToken"));
  }
  console.log(
    "H01b Order QA PASS: lost quote/create/pay/accept ack after commit, API restart with memory sessions, stable 46 intents/receipts; 3 orders, 2 holds, one preparation, immutable deadlines, no duplicate/debit/contact leak; wrong actors and conflicting new create denied. Storage FAKE; no native/human gate closed.",
  );
} finally {
  await sandbox?.close();
}
