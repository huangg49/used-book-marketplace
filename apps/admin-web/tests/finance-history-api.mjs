import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { chromium, expect } from "playwright/test";
import { createServer } from "vite";
import { base, createTestApi, origin, password, root } from "./test-api.mjs";

// Synthetic, paired postings in the isolated snapshot created by the QA fixture.
const fixture = await createTestApi({ listingCount: 1 });
let server, browser;
try {
  const admin = await fixture.api("/auth/login", null, { email: "admin@operations.test", password });
  const staff = await fixture.api("/auth/login", null, { email: "staff@operations.test", password });
  const journals = fixture.db.collection("ledger_journals");
  const accounts = fixture.db.collection("wallet_accounts");
  const ownerId = fixture.member.user.id;
  let wallet = await accounts.findOne({ purpose: "UserAvailable", ownerId });
  if (!wallet) {
    wallet = { _id: randomUUID(), ownerId, orderId: null, purpose: "UserAvailable", currency: "VND" };
    await accounts.insertOne(wallet);
  }
  const clearing = await accounts.findOne({ purpose: "SimulatorClearing" });
  const hold = { _id: randomUUID(), orderId: randomUUID(), ownerId: null, purpose: "OrderHold", currency: "VND" };
  assert(clearing);
  await accounts.insertOne(hold);
  let sequence = (await journals.find().sort({ sequence: -1 }).limit(1).next())?.sequence ?? 0;
  const docs = [], entries = [];
  const count = 526;
  function add(type, index, from, to, referenceId) {
    const _id = randomUUID();
    const topup = type === "Topup";
    docs.push({
      _id, type, sequence: ++sequence,
      postedAt: new Date(1_790_000_000_000 + Math.floor(index / 2) * 1000),
      topupId: topup ? referenceId : null,
      eventId: topup ? randomUUID() : null,
      orderId: topup ? null : referenceId,
      receiptId: topup ? null : randomUUID(),
      auctionId: null,
      withdrawalId: null,
    });
    entries.push(
      { _id: _id + ":" + from, journalId: _id, accountId: from, debit: 0, credit: 1000 },
      { _id: _id + ":" + to, journalId: _id, accountId: to, debit: 1000, credit: 0 },
    );
    return _id;
  }
  const oldest = {};
  for (let index = 0; index < count; index++) {
    const orderId = randomUUID();
    const payment = add("OrderPayment", index, wallet._id, hold._id, orderId);
    const refund = add("OrderRefund", index, hold._id, wallet._id, orderId);
    const topup = add("Topup", index, clearing._id, wallet._id, randomUUID());
    if (index === 0) Object.assign(oldest, { payment, refund, topup });
  }
  const compensated = add("ExchangeNonReturnCompensation", count, hold._id, wallet._id, hold.orderId);
  await journals.insertMany(docs);
  await fixture.db.collection("ledger_entries").insertMany(entries);

  for (const [route, expected, kind] of [
    ["finance-hold-locks", oldest.payment, "DirectOrder"],
    ["finance-hold-history", oldest.refund, "OrderRefund"],
    ["finance-transfers", oldest.topup, "Topup"],
  ]) {
    const get = (query) => fixture.api("/operations/" + route + "?" + new URLSearchParams(query), admin.accessToken);
    const first = await get({ kind, page: "1" });
    const second = await get({ kind, page: "2" });
    const last = await get({ kind, page: String(Math.ceil(count / 15)) });
    assert.equal(first.totalItems, count);
    assert.equal(first.items.length, 15);
    assert.equal(second.items.length, 15);
    assert(!second.items.some((item) => first.items.some(({ journalId }) => item.journalId === journalId)));
    assert.equal(last.items.at(-1)?.journalId, expected);
    const found = await get({ kind, q: "#" + expected.slice(0, 8).toUpperCase() });
    assert.equal(found.totalItems, 1);
    assert.equal(found.items[0].journalId, expected);
    assert.equal((await get({ q: "[" })).totalItems, 0);
    const denied = await fetch(base + "/operations/" + route, { headers: { Authorization: "Bearer " + staff.accessToken } });
    assert.equal(denied.status, 403);
  }
  const history = await fixture.api("/operations/finance-hold-history?kind=ExchangeCompensation", admin.accessToken);
  assert.equal(history.summary.totalCompensated, 1000);
  assert.equal(history.summary.totalRefunded, count * 1000);
  assert.equal(history.items[0].journalId, compensated);
  assert.equal(history.items[0].outcome, "TransferredToCounterparty");

  process.env.VITE_API_BASE_URL = base;
  server = await createServer({
    root: path.join(root, "apps/admin-web"),
    logLevel: "error",
    server: { host: "127.0.0.1", port: Number(new URL(origin).port), strictPort: true },
  });
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(origin + "/statistics/cashflow");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("admin@operations.test");
  await page.getByLabel(/^Mật khẩu/).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const holds = page.getByRole("region", { name: "Chi tiết tiền cọc & tiền đang giữ trên toàn hệ thống" });
  await holds.getByRole("tab", { name: "Lịch sử giữ cọc" }).click();
  await expect(holds.getByText(/Trang 1\/36/)).toBeVisible();
  await holds.getByRole("button", { name: "Trang sau" }).click();
  await expect(holds.getByText(/Trang 2\/36/)).toBeVisible();
  const search = holds.getByLabel("Tìm lịch sử giữ cọc");
  await search.fill("#" + oldest.payment.slice(0, 8).toUpperCase());
  await search.press("Enter");
  await expect(holds.getByText(/Kết quả cho.*1 bút toán/)).toBeVisible();
  await expect(holds.getByRole("row")).toHaveCount(2);
  console.log("PASS finance history: Mongo/HTTP, 526 rows per report, stable pages, old reference lookup, compensation, Staff denial and Admin browser navigation.");
} finally {
  await browser?.close();
  await server?.close();
  await fixture.close();
}
