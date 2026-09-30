import { ScenarioError } from "./journal.mjs";

const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const date = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
export function orderReceipt(value) {
  const validBase =
    value &&
    uuid(value.id) &&
    uuid(value.entityId) &&
    Number.isInteger(value.version) &&
    value.version > 0 &&
    date(value.serverTime);
  const fields = ["id", "entityType", "entityId", "version", "serverTime"];
  let valid = false;
  if (validBase)
    switch (value.entityType) {
      case "AddressBook":
        valid = uuid(value.addressId);
        fields.push("addressId");
        break;
      case "SaleQuote":
        valid = value.version === 1 && date(value.expiresAt);
        fields.push("expiresAt");
        break;
      case "Order":
        valid =
          uuid(value.contextId) &&
          date(value.paymentDeadline) &&
          [
            "AwaitingPayment",
            "PendingSellerConfirmation",
            "Preparing",
            "SettlementPending",
            "Cancelled",
            "PaymentExpired",
            "ResolutionPending",
            "InTransit",
          ].includes(value.state) &&
          Array.isArray(value.affectedListings) &&
          value.affectedListings.length <= 1 &&
          value.affectedListings.every(
            (listing) =>
              uuid(listing.id) &&
              Number.isInteger(listing.version) &&
              listing.version > 0,
          );
        fields.push(
          "contextId",
          "state",
          "paymentDeadline",
          "affectedListings",
        );
        break;
    }
  if (!valid)
    throw new ScenarioError(
      "INVALID_RECEIPT",
      "Response is not an address/quote/order receipt; intent remains pending.",
    );
  const result = Object.fromEntries(fields.map((key) => [key, value[key]]));
  if (result.affectedListings)
    result.affectedListings = result.affectedListings.map(
      ({ id, version }) => ({ id, version }),
    );
  return result;
}
