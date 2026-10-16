import { createHash } from "node:crypto";
import path from "node:path";
import { Commands, ScenarioError, openJournal, writeJson } from "./journal.mjs";
import { bindingFor } from "./sandbox.mjs";
import { createHttp } from "./http.mjs";
import { runBooks } from "./books.mjs";
import { runFunding, DEMO_FUNDING } from "./funding.mjs";
import { orderReceipt } from "./order-receipts.mjs";

export const ORDER_STATES = {
  awaiting: "AwaitingPayment",
  paid: "PendingSellerConfirmation",
  preparing: "Preparing",
};
const check = (condition, message) => {
  if (!condition) throw new ScenarioError("ORDER_MISMATCH", message);
};
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

// Contact is reconstructed only from the private immutable input. Journal contains a hash/ref.
export function addressBody(intent, config) {
  const input = config.orders?.addresses[intent.actor];
  check(
    input && digest(input) === intent.body.inputDigest,
    "Private address input changed; do not send a different payload under the saved key.",
  );
  return {
    expectedBookVersion: intent.body.expectedBookVersion,
    address: input,
    makeDefault: intent.body.makeDefault,
  };
}

export async function runOrders(
  config,
  directory,
  sandbox,
  { fetcher = fetch, onStep = () => {} } = {},
) {
  if (!config.orders || !config.fundingSecret)
    throw new ScenarioError(
      "ORDERS_DISABLED",
      "Initialize a new order scenario; do not repurpose existing book/funding runs.",
    );
  const journal = await openJournal(directory, bindingFor(config));
  const http = createHttp(sandbox.base, sandbox.tokens, { fetcher });
  for (const actor of ["seller", "buyer"]) {
    const account = config.accounts[actor];
    if (!sandbox.tokens[actor]) {
      const session = await http("/auth/login", {
        method: "POST",
        body: { email: account.email, password: account.password },
      });
      sandbox.tokens[actor] = session.accessToken;
    }
    check(
      (await http("/auth/me", { actor })).id === account.id,
      "Order actor differs from the sandbox identity.",
    );
  }
  const commands = new Commands(
    journal,
    (intent) =>
      http(intent.route, {
        actor: intent.actor,
        method: intent.method,
        body:
          intent.kind === "address" ? addressBody(intent, config) : intent.body,
        headers: { "Idempotency-Key": intent.key },
      }),
    { projectReceipt: orderReceipt },
  );
  const command = async (name, actor, route, body, kind) => {
    const result = await commands.execute(name, async () => ({
      actor,
      method: "POST",
      route,
      body: await body(),
      ...(kind ? { kind } : {}),
    }));
    onStep(name, result.state ?? result.entityType);
    return result;
  };
  const directoryResponse = await http("/service-areas", { actor: "buyer" });
  check(
    directoryResponse.demoOnly && directoryResponse.code === "HCM-DEMO-v1",
    "Order target is not the simulated HCM directory.",
  );
  const addresses = {};
  for (const actor of ["seller", "buyer"]) {
    const input = config.orders.addresses[actor];
    check(
      directoryResponse.localities.some(
        (item) => item.code === input.localityCode,
      ),
      "Configured demo locality is not available.",
    );
    const saved = await command(
      `orders.address.${actor}`,
      actor,
      "/me/addresses",
      async () => {
        const book = await http("/me/addresses", { actor });
        return {
          expectedBookVersion: book.version,
          makeDefault: false,
          inputDigest: digest(input),
        };
      },
      "address",
    );
    const book = await http("/me/addresses", { actor });
    const current = book.items.find((item) => item.id === saved.addressId);
    check(
      current &&
        digest({
          recipientName: current.recipientName,
          phone: current.phone,
          detail: current.detail,
          serviceAreaCode: current.serviceAreaCode,
          localityCode: current.localityCode,
        }) === digest(input),
      "Address projection differs from the private demo input.",
    );
    addresses[actor] = { id: current.id, version: current.version };
  }
  const funding = await runFunding(config, directory, sandbox, {
    fetcher,
    journal,
  });
  const orders = {};
  const states = {
    ...ORDER_STATES,
    ...(config.orders.transit ? { intransit: "Preparing" } : {}),
  };
  for (const [slot, expectedState] of Object.entries(states)) {
    const scope = `orders.${slot}`,
      prefix = `${scope}.book`;
    // A create intent precedes any reservation. Its presence permits receipt recovery
    // without trying to read an already-reserved book from the public shelf again.
    if (!journal.data.steps[`${scope}.create`]) {
      await runBooks(config, directory, sandbox, {
        fetcher,
        journal,
        prefix,
        fulfillment: {
          method: "DirectDelivery",
          originAddressId: addresses.seller.id,
          originAddressVersion: addresses.seller.version,
        },
      });
    }
    const listingId =
      journal.data.steps[`${prefix}.listing.draft`]?.receipt?.entityId;
    check(
      listingId &&
        journal.data.steps[`${prefix}.listing.approve`]?.state ===
          "acknowledged",
      "Order has no independently approved book scenario.",
    );
    const quoted = await command(
      `${scope}.quote`,
      "buyer",
      `/listings/${listingId}/quotes`,
      async () => {
        const listing = await http(`/listings/${listingId}`);
        return {
          expectedListingVersion: listing.version,
          expectedListingRevisionId: listing.revisionId,
          destinationAddressId: addresses.buyer.id,
          expectedDestinationAddressVersion: addresses.buyer.version,
          method: "DirectDelivery",
        };
      },
    );
    const conversation = await command(
      `${scope}.conversation`, "buyer", `/listings/${listingId}/purchase-conversations`, async () => ({
        expectedVersion: (await http(`/me/quotes/${quoted.entityId}`, { actor: "buyer" })).listingVersion,
      }),
    );
    const attached = await command(
      `${scope}.attachQuote`, "buyer", `/me/purchase-conversations/${conversation.entityId}/quote`, async () => {
        const quote = await http(`/me/quotes/${quoted.entityId}`, { actor: "buyer" });
        check(quote.assessment === "Current", "Saved quote is no longer current; retain its intent and investigate.");
        return { expectedVersion: conversation.version, quoteId: quoted.entityId, expectedQuoteVersion: quote.version,
          expectedListingVersion: quote.listingVersion, expectedListingRevisionId: quote.listingRevisionId };
      },
    );
    const created = await command(
      `${scope}.create`, "seller", "/orders", async () => {
        const quote = await http(`/me/quotes/${quoted.entityId}`, { actor: "buyer" });
        check(quote.assessment === "Current", "Saved quote is no longer current; retain its intent and investigate.");
        return { conversationId: conversation.entityId, expectedVersion: attached.version, agreedBookPrice: quote.amounts.bookPrice };
      },
    );
    const id = created.entityId;
    if (slot !== "awaiting") {
      await command(`${scope}.pay`, "buyer", `/orders/${id}/pay`, async () => ({
        expectedVersion: (await http(`/me/orders/${id}`, { actor: "buyer" }))
          .version,
      }));
    }
    if (["preparing", "intransit"].includes(slot)) {
      await command(
        `${scope}.accept`,
        "seller",
        `/orders/${id}/accept`,
        async () => ({
          expectedVersion: (await http(`/me/orders/${id}`, { actor: "seller" }))
            .version,
        }),
      );
    }
    const buyer = await http(`/me/orders/${id}`, { actor: "buyer" });
    const seller = await http(`/me/orders/${id}`, { actor: "seller" });
    check(
      (buyer.state === expectedState ||
        (slot === "intransit" &&
          journal.data.steps["transit.pickup"] &&
          buyer.state === "InTransit")) &&
        seller.state === buyer.state &&
        buyer.role === "Buyer" &&
        seller.role === "Seller" &&
        buyer.quoteId === quoted.entityId &&
        buyer.item.listingId === listingId &&
        buyer.contextId === created.contextId &&
        buyer.demoOnly &&
        buyer.currency === "VND",
      "Order projections differ from the requested scenario.",
    );
    const held = slot === "awaiting" ? 0 : buyer.amounts.buyerTotal;
    check(
      Number.isSafeInteger(buyer.amounts.buyerTotal) &&
        buyer.amounts.buyerTotal > 0 &&
        buyer.moneyHeld === held &&
        seller.moneyHeld === held &&
        buyer.refundedAmount === 0 &&
        buyer.commitment.status === "Active" &&
        seller.commitment.id === buyer.commitment.id &&
        buyer.commitment.version === 1,
      "Order money/commitment projection is inconsistent.",
    );
    check(
      ["preparing", "intransit"].includes(slot)
        ? seller.shippingAddress !== null && buyer.preparation !== null
        : seller.shippingAddress === null && buyer.preparation === null,
      "Shipping contact or preparation was exposed before seller acceptance.",
    );
    const activeDeadline =
      slot === "awaiting"
        ? buyer.paymentDeadline
        : slot === "paid"
          ? buyer.sellerConfirmationDeadline
          : slot === "intransit" && buyer.state === "InTransit"
            ? (await http(`/me/orders/${id}/shipment`, { actor: "buyer" }))
                .pickup?.deliveryDeadline
            : buyer.preparation.pickupDeadline;
    check(
      Number.isFinite(Date.parse(activeDeadline)) &&
        Date.parse(activeDeadline) > Date.now(),
      "Demo obligation deadline elapsed; preserve the order/hold and initialize a fresh run, without changing its clock or state.",
    );
    const privateListing = await http(`/me/listings/${listingId}`, {
      actor: "seller",
    });
    check(
      privateListing.state.trade === "Reserved" &&
        privateListing.version === created.affectedListings[0]?.version,
      "Order has no matching reserved listing projection.",
    );
    await sandbox.checkOrder(id);
    orders[slot] = {
      id,
      listingId,
      quoteId: quoted.entityId,
      contextId: buyer.contextId,
      version: buyer.version,
      state: buyer.state,
      paymentDeadline: buyer.paymentDeadline,
      sellerConfirmationDeadline: buyer.sellerConfirmationDeadline,
      pickupDeadline: buyer.preparation?.pickupDeadline ?? null,
      heldAmount: held,
      amounts: {
        bookPrice: buyer.amounts.bookPrice,
        shippingFee: buyer.amounts.shippingFee,
        buyerTotal: buyer.amounts.buyerTotal,
      },
      commitment: {
        id: buyer.commitment.id,
        version: buyer.commitment.version,
        status: buyer.commitment.status,
      },
    };
  }
  const held = Object.values(orders).reduce(
    (sum, order) => sum + order.heldAmount,
    0,
  );
  const buyerWallet = await http("/me/wallet", { actor: "buyer" }),
    sellerWallet = await http("/me/wallet", { actor: "seller" });
  const history = await http("/me/wallet/history", { actor: "buyer" });
  for (const slot of Object.keys(states).filter((slot) => slot !== "awaiting"))
    check(
      history.items.filter(
        (item) =>
          item.type === "OrderPayment" &&
          item.orderId === orders[slot].id &&
          item.amount === -orders[slot].heldAmount,
      ).length === 1,
      "Payment has no unique immutable debit in history.",
    );
  const reconciliation = await sandbox.reconcileMoney();
  check(
    buyerWallet.available === DEMO_FUNDING - held &&
      buyerWallet.transactionHeld === held &&
      buyerWallet.total === DEMO_FUNDING &&
      sellerWallet.total === 0 &&
      reconciliation.balanced &&
      reconciliation.sourceRemaining === 100_000_000 - DEMO_FUNDING &&
      reconciliation.memberAvailable === buyerWallet.available &&
      reconciliation.transactionHeld === held,
    "Order funding/hold/finite source reconciliation failed; keep the money and books held.",
  );
  const manifest = {
    schema: 1,
    scenario: "H01b-orders",
    run: config.id,
    status: "PASS",
    completedAt: new Date().toISOString(),
    storage:
      config.storage === "live"
        ? "Supabase live"
        : "FAKE fixture — not live storage acceptance",
    demoOnly: true,
    participants: {
      buyerId: config.accounts.buyer.id,
      sellerId: config.accounts.seller.id,
      reviewerId: config.accounts.reviewer.id,
      operatorId: config.accounts.operator.id,
    },
    funding: {
      topupId: funding.topupId,
      journalId: funding.journalId,
      amount: funding.amount,
    },
    orders,
    wallet: {
      available: buyerWallet.available,
      held,
      total: buyerWallet.total,
      sellerAvailable: sellerWallet.available,
    },
    reconciliation,
    receipts: Object.fromEntries(
      Object.entries(journal.data.steps)
        .filter(
          ([name]) => name.startsWith("orders.") && !name.includes(".book."),
        )
        .map(([name, step]) => [name, step.receipt]),
    ),
    limitations: [
      "Simulated data only",
      config.orders.transit
        ? "Shipment scenario is verified separately in transit-manifest.json; Delivered/settlement not performed"
        : "InTransit/Delivered/settlement not performed",
      "No native or human-review gate closed",
    ],
  };
  await writeJson(path.join(directory, "orders-manifest.json"), manifest);
  return manifest;
}
