import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { cartFixture, base } from "./qa-member-cart.mjs";
import { root } from "../apps/admin-web/tests/test-api.mjs";
let f;
const checks = [];
try {
  f = await cartFixture("http://127.0.0.1:5194");
  const { api, buyer, seller, db } = f,
    token = buyer.accessToken,
    owner = buyer.user.id,
    [id, second] = f.listings;
  const read = () => api("/me/cart", token),
    listing = () => api("/listings/" + id, null);
  const call = async (route, body, who = token, key = randomUUID()) => {
    const r = await fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(who ? { Authorization: `Bearer ${who}` } : {}),
        "Idempotency-Key": key,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      value: await r.json(),
      replayed: r.headers.get("Idempotency-Replayed"),
    };
  };
  const addBody = async (listingId = id) => ({
    expectedVersion: (await read()).version,
    listingId,
    expectedListingVersion: (await api("/listings/" + listingId, null)).version,
  });
  assert.equal((await call("/me/cart", null, null)).status, 401);
  assert.equal((await read()).items.length, 0);
  const staff = await api("/auth/login", null, {
    email: "staff@operations.test",
    password: "Operations-test-only-2026!",
  });
  assert.equal((await call("/me/cart", null, staff.accessToken)).status, 403);
  assert.equal(
    (await call("/me/cart/add", { ...(await addBody()), quantity: 2 })).status,
    422,
  );
  assert.equal(
    (await call("/me/cart/add", { ...(await addBody()), expectedVersion: 0 }))
      .status,
    422,
  );
  assert.equal(
    (await call("/me/cart/add", await addBody(), seller.accessToken)).status,
    409,
  );
  checks.push("auth/role/overposting/quantity/self");
  const third = f.listings[2],
    thirdCurrent = await api(`/me/listings/${third}`, seller.accessToken);
  await api(`/listings/${third}/revision`, seller.accessToken, {
    expectedVersion: thirdCurrent.version,
    ownershipDeclared: true,
    content: { ...thirdCurrent.currentRevision.content, fulfillment: null },
  });
  await f.approve(third);
  assert.equal((await call("/me/cart/add", await addBody(third))).status, 200);
  const noOrigin = await read();
  assert.equal(noOrigin.items[0].canBuy, false);
  await api("/me/cart/remove", token, {
    expectedVersion: noOrigin.version,
    listingId: third,
  });
  const forExchange = await api(`/me/listings/${third}`, seller.accessToken);
  await api(`/listings/${third}/revision`, seller.accessToken, {
    expectedVersion: forExchange.version,
    ownershipDeclared: true,
    content: {
      ...forExchange.currentRevision.content,
      mode: "Exchange",
      salePrice: null,
    },
  });
  await f.approve(third);
  assert.equal((await call("/me/cart/add", await addBody(third))).status, 409);
  await db
    .collection("listings")
    .updateOne(
      { _id: third },
      { $set: { channel: "Auction" }, $inc: { lockSeq: 1 } },
    );
  assert.equal(
    (
      await call("/me/cart/add", {
        expectedVersion: (await read()).version,
        listingId: third,
        expectedListingVersion: 1,
      })
    ).status,
    404,
  );
  checks.push("save-without-origin/no-checkout/exclude-exchange-auction");
  const counts = async () => [
    await db.collection("exclusive_commitments").countDocuments({}),
    await db.collection("direct_orders").countDocuments({}),
    await db.collection("ledger_journals").countDocuments({}),
  ];
  const original = await counts(),
    before = await listing(),
    body = await addBody(),
    key = randomUUID(),
    first = await call("/me/cart/add", body, token, key);
  assert.equal(first.status, 200);
  assert.equal(first.value.entityType, "Cart");
  const replay = await call("/me/cart/add", body, token, key);
  assert.equal(replay.status, 200);
  assert.equal(replay.replayed, "true");
  assert.equal(first.value.id, replay.value.id);
  assert.equal(
    (await call("/me/cart/add", { ...body, listingId: second }, token, key))
      .status,
    409,
  );
  assert.deepEqual(await counts(), original);
  assert.equal((await listing()).version, before.version);
  assert.equal((await listing()).purchaseAvailability.status, "Available");
  const duplicate = await call("/me/cart/add", await addBody());
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.value.state, "Unchanged");
  assert.equal((await read()).items.length, 1);
  checks.push("exact-replay/unique/no-reservation/no-money");
  const current = await api(`/me/listings/${id}`, seller.accessToken);
  await api(`/listings/${id}/revision`, seller.accessToken, {
    expectedVersion: current.version,
    ownershipDeclared: true,
    content: { ...current.currentRevision.content, salePrice: 140000 },
  });
  await f.approve(id);
  let cart = await read();
  assert.equal(cart.items[0].priceAtAdd, 125000);
  assert.equal(cart.items[0].listing.salePrice, 140000);
  assert.equal(cart.items[0].canBuy, true);
  assert.equal(
    (
      await call("/me/cart/add", {
        ...(await addBody()),
        expectedListingVersion: before.version,
      })
    ).status,
    409,
  );
  checks.push("current-price/version-no-price-guarantee");
  await db
    .collection("listings")
    .updateOne(
      { _id: id },
      { $set: { visibility: "Hidden" }, $inc: { lockSeq: 1 } },
    );
  cart = await read();
  assert.equal(cart.items[0].listing, null);
  assert.equal(cart.items[0].canBuy, false);
  assert.equal(
    (await call("/me/cart/add", { ...body, expectedVersion: cart.version }))
      .status,
    404,
  );
  await db
    .collection("listings")
    .updateOne(
      { _id: id },
      { $set: { visibility: "Visible" }, $inc: { lockSeq: 1 } },
    );
  checks.push("private-hidden-null/no-content-leak");
  const template = await db.collection("member_carts").findOne({ _id: owner }),
    now = new Date();
  await db.collection("member_carts").updateOne(
    { _id: owner },
    {
      $set: {
        version: 10,
        items: Array.from({ length: 49 }, () => ({
          listingId: randomUUID(),
          priceAtAdd: 10000,
          addedAt: now,
        })),
      },
    },
  );
  const { onTransactionRetry } = await import(
    pathToFileURL(
      path.join(root, "apps/api/dist/database/mongo/transaction.js"),
    ).href
  );
  async function gate(collection, ids) {
    const session = db.client.startSession();
    session.startTransaction();
    for (const id of [...ids].sort())
      await db
        .collection(collection)
        .updateOne({ _id: id }, { $inc: { lockSeq: 1 } }, { session });
    return session;
  }
  async function contended(set, n) {
    const until = Date.now() + 4000;
    while (set.size < n) {
      if (Date.now() > until)
        throw new Error("QA commands did not reach genuine contention barrier");
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  const transactions = new Set(),
    stop = onTransactionRetry((e) => transactions.add(e.transactionId)),
    barrier = await gate("users", [owner]);
  const a = call("/me/cart/add", {
      expectedVersion: 10,
      listingId: id,
      expectedListingVersion: (await listing()).version,
    }),
    b = call("/me/cart/add", {
      expectedVersion: 10,
      listingId: second,
      expectedListingVersion: (await api("/listings/" + second, null)).version,
    });
  try {
    await contended(transactions, 2);
  } finally {
    await barrier.abortTransaction();
    await barrier.endSession();
    stop();
  }
  assert.deepEqual(
    (await Promise.all([a, b])).map((r) => r.status).sort(),
    [200, 409],
  );
  cart = await read();
  assert.equal(cart.items.length, 50);
  assert.equal(new Set(cart.items.map((i) => i.listingId)).size, 50);
  const absent = cart.items.some((i) => i.listingId === id) ? second : id;
  const full = await call("/me/cart/add", await addBody(absent));
  assert.equal(full.status, 409);
  assert.equal(full.value.code, "CartFull");
  await assert.rejects(
    db.collection("member_carts").updateOne(
      { _id: owner },
      {
        $push: {
          items: { listingId: randomUUID(), priceAtAdd: 10000, addedAt: now },
        },
      },
    ),
    (e) => e.code === 121,
  );
  await assert.rejects(
    db
      .collection("member_carts")
      .updateOne(
        { _id: owner },
        { $set: { items: [template.items[0], template.items[0]] } },
      ),
    (e) => e.code === 121,
  );
  checks.push("genuine-max49-two-admissions/max50/db-uniqueness");
  await db
    .collection("member_carts")
    .updateOne(
      { _id: owner },
      { $set: { version: 20, items: [template.items[0]] } },
    );
  await f.setUserStatus(owner, "LOCKED");
  assert.equal((await read()).items[0].canBuy, false);
  assert.equal((await call("/me/cart/add", body, token, key)).status, 403);
  const remove = { expectedVersion: 20, listingId: id },
    removeKey = randomUUID();
  assert.equal(
    (await call("/me/cart/remove", remove, token, removeKey)).status,
    200,
  );
  assert.equal(
    (await call("/me/cart/remove", remove, token, removeKey)).replayed,
    "true",
  );
  assert.equal((await read()).items.length, 0);
  assert.deepEqual(await counts(), original);
  await f.setUserStatus(owner, "ACTIVE");
  checks.push("locked-read-remove/current-authority-before-replay");
  // Real actor wait: eligibility can change after HTTP guard, before command commit.
  const actorBody = await addBody();
  const seen = new Set(),
    unsub = onTransactionRetry((e) => seen.add(e.transactionId)),
    userGate = await gate("users", [owner]);
  const pending = call("/me/cart/add", actorBody);
  try {
    await contended(seen, 1);
    await db
      .collection("users")
      .updateOne(
        { _id: owner },
        { $set: { status: "LOCKED" } },
        { session: userGate },
      );
    await userGate.commitTransaction();
  } finally {
    if (userGate.inTransaction()) await userGate.abortTransaction();
    await userGate.endSession();
    unsub();
  }
  assert.equal((await pending).status, 403);
  await f.setUserStatus(owner, "ACTIVE");
  checks.push("genuine-current-actor-race");
  const listingSeen = new Set(),
    off = onTransactionRetry((e) => listingSeen.add(e.transactionId)),
    listingGate = await gate("listings", [id]);
  const waiting = call("/me/cart/add", await addBody());
  try {
    await contended(listingSeen, 1);
    await db
      .collection("listings")
      .updateOne(
        { _id: id },
        { $set: { visibility: "Hidden" } },
        { session: listingGate },
      );
    await listingGate.commitTransaction();
  } finally {
    if (listingGate.inTransaction()) await listingGate.abortTransaction();
    await listingGate.endSession();
    off();
  }
  assert.equal((await waiting).status, 404);
  assert.equal((await read()).items.length, 0);
  checks.push("genuine-current-listing-race");
  console.log(
    `PASS: ${checks.length} Member cart API/Mongo invariant groups; real lock contention, max50/unique/quantity1, privacy, versions/replay, locked obligations and zero reservation/money effects. 49 capacity rows are synthetic unavailable QA IDs; eligible admissions use real approved listings. Storage fake.`,
  );
} finally {
  await f?.close();
}
