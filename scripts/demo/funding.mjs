import { randomUUID } from "node:crypto";
import path from "node:path";
import { Commands, ScenarioError, openJournal, writeJson } from "./journal.mjs";
import { createHttp } from "./http.mjs";
import { bindingFor } from "./sandbox.mjs";

export const DEMO_FUNDING = 1_000_000;
const check = (condition, message) => {
  if (!condition) throw new ScenarioError("MONEY_MISMATCH", message);
};
export function walletReceipt(value) {
  const uuid = (id) =>
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      id ?? "",
    );
  if (
    !value ||
    !uuid(value.id) ||
    !uuid(value.entityId) ||
    value.entityType !== "TopupIntent" ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    ![
      "Pending",
      "Processing",
      "Succeeded",
      "Failed",
      "ReviewRequired",
    ].includes(value.state) ||
    typeof value.credited !== "boolean" ||
    !(value.journalId === null || uuid(value.journalId)) ||
    value.demoOnly !== true ||
    value.currency !== "VND" ||
    value.label !== "Mô phỏng đồ án" ||
    typeof value.serverTime !== "string" ||
    !Number.isFinite(Date.parse(value.serverTime))
  )
    throw new ScenarioError(
      "INVALID_RECEIPT",
      "Funding response is not a wallet receipt; intent remains pending.",
    );
  return Object.fromEntries(
    [
      "id",
      "entityType",
      "entityId",
      "version",
      "state",
      "credited",
      "journalId",
      "serverTime",
      "demoOnly",
      "label",
      "currency",
    ].map((key) => [key, value[key]]),
  );
}

export async function runFunding(
  config,
  directory,
  sandbox,
  { fetcher = fetch } = {},
) {
  if (!config.fundingSecret)
    throw new ScenarioError(
      "FUNDING_DISABLED",
      "Initialize an opt-in funding run; existing book runs keep their simulator disabled.",
    );
  check(
    config.accounts.buyer.id !== config.accounts.operator.id,
    "Operator must differ from the recipient.",
  );
  const http = createHttp(sandbox.base, sandbox.tokens, { fetcher });
  for (const actor of ["buyer", "operator"]) {
    if (!sandbox.tokens[actor]) {
      const account = config.accounts[actor];
      const session = await http("/auth/login", {
        method: "POST",
        body: { email: account.email, password: account.password },
      });
      sandbox.tokens[actor] = session.accessToken;
    }
    const user = await http("/auth/me", { actor });
    check(
      user.id === config.accounts[actor].id,
      "Funding actor differs from the sandbox identity.",
    );
  }
  const journal = await openJournal(directory, bindingFor(config));
  const commands = new Commands(
    journal,
    (intent) =>
      http(intent.route, {
        actor: intent.actor,
        method: intent.method,
        body: intent.body,
        headers: { "Idempotency-Key": intent.key },
      }),
    { projectReceipt: walletReceipt },
  );
  const created = await commands.execute("funding.intent", () => ({
    actor: "buyer",
    method: "POST",
    route: "/me/topups",
    body: { amount: DEMO_FUNDING },
  }));
  const emitted = await commands.execute("funding.event", async () => {
    const intent = await http(`/me/topups/${created.entityId}`, {
      actor: "buyer",
    });
    // Bind occurredAt to the server-created intent, never fast-forward a clock.
    return {
      actor: "operator",
      method: "POST",
      route: "/operations/simulator/topup-events",
      body: {
        eventId: randomUUID(),
        intentId: created.entityId,
        recipientId: config.accounts.buyer.id,
        amount: DEMO_FUNDING,
        currency: "VND",
        outcome: "Succeeded",
        occurredAt: intent.createdAt,
      },
    };
  });
  const intent = await http(`/me/topups/${created.entityId}`, {
    actor: "buyer",
  });
  check(
    intent.state === "Succeeded" &&
      intent.credited &&
      emitted.credited &&
      intent.journalId === emitted.journalId,
    "Topup does not match its committed funding journal; do not add replacement money.",
  );
  const wallet = await http("/me/wallet", { actor: "buyer" });
  const history = await http("/me/wallet/history", { actor: "buyer" });
  const posting = history.items.find(
    (item) => item.journalId === emitted.journalId,
  );
  check(
    posting?.type === "Topup" && posting.amount === DEMO_FUNDING,
    "Wallet history has no matching immutable topup posting.",
  );
  check(
    wallet.demoOnly &&
      wallet.currency === "VND" &&
      wallet.total === DEMO_FUNDING &&
      wallet.available + wallet.transactionHeld === wallet.total &&
      wallet.withdrawalHeld === 0,
    "Wallet projection does not conserve the funded amount.",
  );
  const reconciliation = await sandbox.reconcileMoney();
  check(
    reconciliation.demoOnly &&
      reconciliation.balanced &&
      reconciliation.totalDebit === reconciliation.totalCredit &&
      reconciliation.sourceRemaining + DEMO_FUNDING === 100_000_000 &&
      reconciliation.memberAvailable + reconciliation.transactionHeld ===
        DEMO_FUNDING,
    "Finite simulator source/ledger reconciliation failed; stop financial scenarios.",
  );
  const manifest = {
    schema: 1,
    scenario: "H01b-funding",
    run: config.id,
    status: "PASS",
    completedAt: new Date().toISOString(),
    demoOnly: true,
    amount: DEMO_FUNDING,
    recipientId: config.accounts.buyer.id,
    operatorId: config.accounts.operator.id,
    topupId: created.entityId,
    journalId: emitted.journalId,
    wallet: {
      available: wallet.available,
      transactionHeld: wallet.transactionHeld,
      total: wallet.total,
    },
    reconciliation,
    receipts: { create: created, emit: emitted },
    limitations: [
      "Simulated finite funding only",
      "Unpaid/paid/Preparing/InTransit scenarios not implemented by this command",
      "No production/native/human-review gate closed",
    ],
  };
  await writeJson(path.join(directory, "funding-manifest.json"), manifest);
  return manifest;
}
