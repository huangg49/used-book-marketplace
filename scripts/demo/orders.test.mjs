import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { orderReceipt } from "./order-receipts.mjs";
import { addressBody } from "./orders.mjs";
import { initialize, bindingFor, validateConfig } from "./sandbox.mjs";
import { Commands, ScenarioError, openJournal } from "./journal.mjs";

const receipt = (entityType, extra) => ({
  id: randomUUID(),
  entityId: randomUUID(),
  entityType,
  version: 1,
  serverTime: new Date().toISOString(),
  ...extra,
});
test("order receipts reject malformed identities/states and discard private fields", () => {
  const value = receipt("Order", {
    contextId: randomUUID(),
    state: "Preparing",
    paymentDeadline: new Date().toISOString(),
    affectedListings: [
      { id: randomUUID(), version: 3, phone: "never-persist" },
    ],
    shippingAddress: { phone: "never-persist" },
  });
  assert.ok(!JSON.stringify(orderReceipt(value)).includes("never-persist"));
  for (const extra of [
    { contextId: "bad" },
    { state: "Delivered" },
    { paymentDeadline: null },
    { affectedListings: [{ id: randomUUID(), version: 0 }] },
  ])
    assert.throws(() => orderReceipt({ ...value, ...extra }), {
      code: "INVALID_RECEIPT",
    });
  assert.throws(
    () => orderReceipt(receipt("SaleQuote", { expiresAt: "bad" })),
    { code: "INVALID_RECEIPT" },
  );
  assert.throws(
    () => orderReceipt(receipt("AddressBook", { addressId: "bad" })),
    { code: "INVALID_RECEIPT" },
  );
});
test("private address remains outside journal, drift fails before sending under a saved key", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "latlai-order-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = await initialize(directory, { fixture: true, orders: true });
  const journal = await openJournal(directory, bindingFor(config));
  const input = config.orders.addresses.seller;
  const { createHash } = await import("node:crypto");
  const inputDigest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  let intent;
  await assert.rejects(
    new Commands(
      journal,
      async (saved) => {
        intent = saved;
        throw new ScenarioError("HTTP_UNCERTAIN", "lost ack");
      },
      { attempts: 1 },
    ).execute("orders.address.seller", () => ({
      actor: "seller",
      method: "POST",
      route: "/me/addresses",
      kind: "address",
      body: { expectedBookVersion: 0, makeDefault: false, inputDigest },
    })),
    { code: "ACK_UNCERTAIN" },
  );
  assert.deepEqual(addressBody(intent, config), {
    expectedBookVersion: 0,
    makeDefault: false,
    address: input,
  });
  assert.ok(!JSON.stringify(journal.data).includes(input.phone));
  const changed = structuredClone(config);
  changed.orders.addresses.seller.localityCode = "DEMO-B";
  assert.throws(() => addressBody(intent, changed), { code: "ORDER_MISMATCH" });
  await assert.rejects(openJournal(directory, bindingFor(changed)), {
    code: "TARGET_CHANGED",
  });
  changed.orders.addresses.seller.phone = "0912345678";
  assert.throws(() => validateConfig(changed), { code: "INVALID_CONFIG" });
  const booksDirectory = path.join(directory, "books");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(booksDirectory);
  const books = await initialize(booksDirectory, { fixture: true });
  assert.equal(books.orders, undefined);
  assert.equal(books.fundingSecret, undefined);
});
