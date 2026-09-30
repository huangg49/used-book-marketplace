import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, bindingFor } from "./sandbox.mjs";
import { Commands, ScenarioError, openJournal, writeJson } from "./journal.mjs";
import { createHttp } from "./http.mjs";
import { runOrders } from "./orders.mjs";
import { shippingReceipt } from "./shipping-receipts.mjs";

const require = createRequire(path.join(root, "apps/api/package.json"));
const check = (condition, message) => {
  if (!condition) throw new ScenarioError("TRANSIT_MISMATCH", message);
};
const digest = (value) => createHash("sha256").update(value).digest("hex");
async function packagingPhoto(directory) {
  const file = path.join(directory, "demo-packaging.png");
  try {
    return await readFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Original synthetic artwork with an explicit simulation label. It is an image
  // ingestion fixture, never evidence of an actual parcel, ownership or custody.
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#efe8d8"/><path d="M180 190l220-80 220 80v250l-220 80-220-80z" fill="#bc9068" stroke="#254f46" stroke-width="10"/><path d="M180 190l220 80 220-80M400 270v250" fill="none" stroke="#254f46" stroke-width="10"/><g font-family="Arial,sans-serif" fill="#254f46"><text x="32" y="58" font-size="40">LAT LAI - DEMO PACKAGING</text><text x="32" y="572" font-size="24">Mo phong - khong chung minh hang that hay custody</text></g></svg>';
  const bytes = await require("sharp")(Buffer.from(svg)).png().toBuffer();
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  return bytes;
}

export function previewTarget(config, evidenceId, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    /* Never report a private signed URL. */
  }
  const key = `order-evidence/${evidenceId}/preview-v1.webp`;
  const allowed =
    config.storage === "fixture"
      ? url?.origin === `http://127.0.0.1:${config.port + 1}` &&
        decodeURIComponent(url.pathname) === "/" + key &&
        !url.search
      : url?.origin === config.project &&
        url.pathname === `/storage/v1/object/sign/${config.bucket}/${key}`;
  check(
    allowed && !url.username && !url.password && !url.hash,
    "Packaging preview does not belong to the managed demo storage.",
  );
  return url.href;
}

export async function runTransit(
  config,
  directory,
  sandbox,
  { fetcher = fetch, onStep = () => {} } = {},
) {
  if (!config.orders?.transit)
    throw new ScenarioError(
      "TRANSIT_DISABLED",
      "Initialize a new order run with --in-transit; do not edit or repurpose an existing run.",
    );
  const baseline = await runOrders(config, directory, sandbox, {
    fetcher,
    onStep,
  });
  const target = baseline.orders.intransit,
    id = target.id;
  const journal = await openJournal(directory, bindingFor(config));
  const http = createHttp(sandbox.base, sandbox.tokens, { fetcher });
  const photo = await packagingPhoto(directory),
    photoDigest = digest(photo);
  const commands = new Commands(
    journal,
    async (intent) => {
      if (intent.kind === "packaging-photo") {
        check(
          intent.body.sha256 === photoDigest &&
            intent.body.byteSize === photo.length &&
            intent.body.mimeType === "image/png",
          "Saved packaging bytes changed; preserve the original file and command key.",
        );
        return http(intent.route, {
          actor: intent.actor,
          method: "PUT",
          body: photo,
          binary: true,
          headers: {
            "Idempotency-Key": intent.key,
            "Content-Type": intent.body.mimeType,
          },
        });
      }
      return http(intent.route, {
        actor: intent.actor,
        method: intent.method,
        body: intent.body,
        headers: { "Idempotency-Key": intent.key },
      });
    },
    { projectReceipt: shippingReceipt },
  );
  const command = async (name, build) => {
    const receipt = await commands.execute(name, build);
    check(
      receipt.orderId === id && receipt.contextId === target.contextId,
      "Shipping receipt belongs to a different Order/context.",
    );
    onStep(name, receipt.outcome ?? receipt.state);
    return receipt;
  };
  const reserved = await command("transit.packaging.reserve", async () => ({
    actor: "seller",
    method: "POST",
    route: `/orders/${id}/packaging-evidence`,
    body: {
      expectedVersion: (await http(`/me/orders/${id}`, { actor: "seller" }))
        .version,
      mimeType: "image/png",
      byteSize: photo.length,
      sha256: photoDigest,
    },
  }));
  const ready = await command("transit.packaging.upload", () => ({
    actor: "seller",
    method: "PUT",
    route: `/orders/${id}/packaging-evidence/${reserved.entityId}/content`,
    kind: "packaging-photo",
    body: {
      mimeType: "image/png",
      byteSize: photo.length,
      sha256: photoDigest,
    },
  }));
  check(
    ready.entityId === reserved.entityId &&
      ready.version === 2 &&
      ready.state === "Ready",
    "Packaging upload has no matching Ready receipt.",
  );
  const list = await http(`/me/orders/${id}/packaging-evidence`, {
    actor: "buyer",
  });
  const evidence = list.items.find((item) => item.id === ready.entityId);
  check(
    evidence?.status === "Ready" &&
      evidence.orderId === id &&
      evidence.sha256 === photoDigest &&
      evidence.byteSize === photo.length &&
      evidence.purpose === "Packaging",
    "Private packaging projection differs from the saved bytes.",
  );
  // URLs exist only in memory. Check the actual normalized image on both storage
  // modes; fake objects are still not live Supabase acceptance.
  const preview = await http(
    `/me/orders/${id}/packaging-evidence/${ready.entityId}/read`,
    { actor: "buyer" },
  );
  let response;
  try {
    response = await fetcher(
      previewTarget(config, ready.entityId, preview.url),
      { redirect: "error", signal: AbortSignal.timeout(15_000) },
    );
  } catch (error) {
    if (error instanceof ScenarioError) throw error;
    throw new ScenarioError(
      "MEDIA_BLOCKED",
      "Private packaging preview could not be fetched.",
    );
  }
  check(
    response.ok &&
      response.headers.get("content-type")?.startsWith("image/webp"),
    "Packaging preview is unavailable or has the wrong MIME.",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  check(
    bytes.length > 0 && bytes.length <= 2_000_000,
    "Packaging preview has an invalid size.",
  );
  const dimensions = await require("sharp")(bytes).metadata();
  check(
    dimensions.format === "webp" &&
      dimensions.width === preview.width &&
      dimensions.height === preview.height &&
      Math.max(dimensions.width, dimensions.height) <= 1600,
    "Packaging preview dimensions differ from its API projection.",
  );
  await sandbox.checkPackaging(ready.entityId);
  const label = await command("transit.label", async () => ({
    actor: "seller",
    method: "POST",
    route: `/orders/${id}/shipment`,
    body: {
      expectedOrderVersion: (
        await http(`/me/orders/${id}`, { actor: "seller" })
      ).version,
      carrier: "LatLaiSimulator",
      trackingCode: `LL-${config.id.toUpperCase()}T`,
      packagingEvidenceIds: [ready.entityId],
    },
  }));
  const sellerShipment = await http(`/me/orders/${id}/shipment`, {
    actor: "seller",
  });
  const buyerShipment = await http(`/me/orders/${id}/shipment`, {
    actor: "buyer",
  });
  const orderBeforePickup = await http(`/me/orders/${id}`, { actor: "buyer" });
  check(
    sellerShipment.id === label.entityId &&
      buyerShipment.id === label.entityId &&
      buyerShipment.origin === null &&
      sellerShipment.origin !== null &&
      sellerShipment.demoOnly &&
      sellerShipment.currency === "VND" &&
      sellerShipment.direction === "Outbound" &&
      sellerShipment.method === "DirectDelivery" &&
      sellerShipment.carrier === "LatLaiSimulator" &&
      sellerShipment.shippingFee === target.amounts.shippingFee &&
      sellerShipment.feePolicy === "SellerAdvanceBuyerReimbursement" &&
      sellerShipment.pickupDeadline === target.pickupDeadline &&
      sellerShipment.packagingEvidenceIds.length === 1 &&
      sellerShipment.packagingEvidenceIds[0] === ready.entityId,
    "Shipment does not match the immutable Order agreement/evidence or participant privacy.",
  );
  // A pending pickup may have committed before its response was lost. Label-only
  // checks apply before that intent exists; receipt1 remains historical afterwards.
  if (!journal.data.steps["transit.pickup"])
    check(
      orderBeforePickup.state === "Preparing" &&
        orderBeforePickup.version === 3 &&
        buyerShipment.state === "LabelCreated" &&
        buyerShipment.version === 1 &&
        !buyerShipment.pickupConfirmed &&
        buyerShipment.pickup === null,
      "Label creation alone changed pickup state or Order version.",
    );
  await sandbox.checkShipment(label.entityId);
  assert.deepEqual(
    await sandbox.reconcileMoney(),
    baseline.reconciliation,
    "Packaging/label changed the ledger",
  );
  const pickedUp = await command("transit.pickup", async () => {
    const serverTime = (
      await http(`/me/orders/${id}/packaging-evidence`, { actor: "seller" })
    ).serverTime;
    check(
      Date.parse(serverTime) >= Date.parse(sellerShipment.registeredAt),
      "Server event time precedes label registration.",
    );
    const eventId = randomUUID();
    return {
      actor: "operator",
      method: "POST",
      route: "/operations/simulator/pickup-events",
      key: eventId,
      body: {
        eventId,
        shipmentId: label.entityId,
        orderId: id,
        carrier: "LatLaiSimulator",
        trackingCode: sellerShipment.trackingCode,
        type: "PickedUp",
        occurredAt: serverTime,
      },
    };
  });
  check(
    pickedUp.outcome === "Applied" &&
      pickedUp.version === 1 &&
      pickedUp.shipmentId === label.entityId &&
      pickedUp.entityId === journal.data.steps["transit.pickup"].key &&
      pickedUp.orderState === "InTransit" &&
      pickedUp.orderVersion === 4,
    "Pickup has no single timely Applied event; preserve hold/evidence for review.",
  );
  const current = await http(`/me/orders/${id}`, { actor: "buyer" });
  const shipment = await http(`/me/orders/${id}/shipment`, { actor: "buyer" });
  const history = await http(`/me/orders/${id}/shipment/pickup-events`, {
    actor: "buyer",
  });
  check(
    current.state === "InTransit" &&
      current.version === 4 &&
      current.moneyHeld === target.heldAmount &&
      current.commitment.id === target.commitment.id &&
      current.commitment.version === 1 &&
      current.commitment.status === "Active" &&
      current.preparation.pickupDeadline === target.pickupDeadline &&
      shipment.id === label.entityId &&
      shipment.version === 2 &&
      shipment.state === "PickedUp" &&
      shipment.pickupConfirmed &&
      !shipment.carrierReview &&
      shipment.pickup?.eventId === pickedUp.entityId &&
      history.items.length === 1 &&
      history.items[0].id === pickedUp.entityId &&
      history.items[0].outcome === "Applied" &&
      Date.parse(shipment.pickup.deliveryDeadline) -
        Date.parse(shipment.pickup.occurredAt) ===
        240 * 3_600_000 &&
      Date.parse(shipment.pickup.deliveryDeadline) > Date.now(),
    "InTransit projection/event/deadline/hold differs from the saved scenario.",
  );
  await sandbox.checkShipment(label.entityId);
  await sandbox.checkPackaging(ready.entityId);
  const reconciliation = await sandbox.reconcileMoney();
  assert.deepEqual(
    reconciliation,
    baseline.reconciliation,
    "Pickup changed ledger balances or postings",
  );
  const manifest = {
    ...baseline,
    scenario: "H01b-transit",
    completedAt: new Date().toISOString(),
    orders: {
      ...baseline.orders,
      intransit: { ...target, state: current.state, version: current.version },
    },
    shipment: {
      id: shipment.id,
      orderId: id,
      version: shipment.version,
      state: shipment.state,
      carrier: shipment.carrier,
      registeredAt: shipment.registeredAt,
      pickupDeadline: shipment.pickupDeadline,
      pickupConfirmed: shipment.pickupConfirmed,
      pickup: shipment.pickup,
    },
    packaging: {
      evidenceId: ready.entityId,
      status: evidence.status,
      sha256: evidence.sha256,
      byteSize: evidence.byteSize,
      width: preview.width,
      height: preview.height,
      original: "Synthetic DEMO artwork; not proof of a real parcel or custody",
    },
    reconciliation,
    shippingReceipts: Object.fromEntries(
      Object.entries(journal.data.steps)
        .filter(([name]) => name.startsWith("transit."))
        .map(([name, intent]) => [name, intent.receipt]),
    ),
    limitations: [
      "LatLaiSimulator and explicitly synthetic packaging image; no real carrier or custody verification",
      "Delivered/inspection/settlement not performed",
      "No native, human-review or remote-CI gate closed",
    ],
  };
  await writeJson(path.join(directory, "transit-manifest.json"), manifest);
  return manifest;
}
