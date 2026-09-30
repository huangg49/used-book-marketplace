import { ScenarioError } from "./journal.mjs";

const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const date = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
export function shippingReceipt(value) {
  const fields = [
    "id",
    "entityType",
    "entityId",
    "orderId",
    "contextId",
    "version",
    "state",
    "serverTime",
  ];
  let valid =
    value &&
    [value.id, value.entityId, value.orderId, value.contextId].every(uuid) &&
    date(value.serverTime);
  if (valid)
    switch (value.entityType) {
      case "OrderPackagingEvidence":
        valid =
          (value.version === 1 && value.state === "Pending") ||
          (value.version === 2 && value.state === "Ready");
        break;
      case "Shipment":
        valid = value.version === 1 && value.state === "LabelCreated";
        break;
      case "CarrierEvent":
        valid =
          uuid(value.shipmentId) &&
          Number.isInteger(value.version) &&
          value.version >= 1 &&
          value.version <= 128 &&
          value.state === "Recorded" &&
          ["Applied", "Duplicate", "ReviewRequired"].includes(value.outcome) &&
          Number.isInteger(value.orderVersion) &&
          value.orderVersion >= 3 &&
          value.orderVersion <= 5 &&
          ["Preparing", "InTransit", "ResolutionPending"].includes(
            value.orderState,
          );
        fields.push("shipmentId", "outcome", "orderVersion", "orderState");
        break;
      default:
        valid = false;
    }
  if (!valid)
    throw new ScenarioError(
      "INVALID_RECEIPT",
      "Response is not a packaging/shipment/carrier receipt; keep the intent pending.",
    );
  return Object.fromEntries(fields.map((key) => [key, value[key]]));
}
