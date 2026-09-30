import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { walletReceipt } from "./funding.mjs";

test("wallet receipt requires demo semantics, preserves posting identity and excludes extra payload", () => {
  const result = {
    id: randomUUID(),
    entityType: "TopupIntent",
    entityId: randomUUID(),
    version: 2,
    state: "Succeeded",
    credited: true,
    journalId: randomUUID(),
    serverTime: new Date().toISOString(),
    demoOnly: true,
    label: "Mô phỏng đồ án",
    currency: "VND",
  };
  assert.deepEqual(
    walletReceipt({
      ...result,
      accessToken: "never-persist",
      contact: "never-persist",
    }),
    result,
  );
  for (const change of [
    { demoOnly: false },
    { currency: "USD" },
    { journalId: "not-a-journal" },
    { credited: "yes" },
    { state: "Arbitrary" },
  ])
    assert.throws(() => walletReceipt({ ...result, ...change }), {
      code: "INVALID_RECEIPT",
    });
});
