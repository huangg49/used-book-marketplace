import { ApiError, type SessionClient } from "@used-books/session-client";
import {
  shippingReceipt,
  ShippingInputError,
  type PackagingInput,
  type ShipmentInput,
} from "./shipping-contracts";

type Upload = {
  body: string;
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: string;
  key: string;
  contentKey: string;
  id?: string;
};
type Entry = {
  upload?: Upload;
  uploadFlight?: Promise<string>;
  shipment?: { body: string; key: string; trackingCode: string };
  shipmentFlight?: Promise<string>;
  acknowledged?: string;
};
type Store = {
  owner: string | null;
  generation: number;
  entries: Map<string, Entry>;
};
const stores = new WeakMap<SessionClient, Store>();
function store(client: SessionClient) {
  let current = stores.get(client);
  if (!current) {
    const identity = () => {
      const s = client.getSnapshot();
      return s.status === "authenticated" ? s.user.id : null;
    };
    current = { owner: identity(), generation: 0, entries: new Map() };
    const value = current;
    client.subscribe(() => {
      const owner = identity();
      if (value.owner !== owner) {
        value.entries.clear();
        value.owner = owner;
        value.generation++;
      }
    });
    stores.set(client, value);
  }
  return current;
}
function context(client: SessionClient, id: string) {
  const s = store(client);
  if (!s.owner)
    throw new ApiError(401, "SESSION_EXPIRED", "Đăng nhập để tiếp tục đơn.");
  let entry = s.entries.get(id);
  if (!entry) {
    entry = {};
    s.entries.set(id, entry);
  }
  return { s, entry, generation: s.generation };
}
function definite(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 403, 408, 429].includes(error.status)
  );
}
function checkIdentity(s: Store, generation: number) {
  if (s.generation !== generation)
    throw new ApiError(401, "SESSION_EXPIRED", "Phiên tài khoản đã thay đổi.");
}
export function shippingIntent(client: SessionClient, id: string) {
  const e = store(client).entries.get(id);
  return {
    uploadPending: !!e?.upload,
    shipmentPending: !!e?.shipment,
    trackingCode: e?.shipment?.trackingCode,
    acknowledged: e?.acknowledged,
  };
}

// Byte/key/body snapshots live only while the upload is uncertain, across Back.
// They are erased on ACK/definite rejection/account change, never persisted.
export async function sendPackaging(
  client: SessionClient,
  id: string,
  input: PackagingInput | null,
  key: () => string,
): Promise<string> {
  const { s, entry, generation } = context(client, id);
  if (entry.shipment || entry.acknowledged)
    throw new ShippingInputError("PendingShipment");
  if (entry.uploadFlight) return entry.uploadFlight;
  if (!entry.upload) {
    if (!input) throw new ShippingInputError("PhotoRequired");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType) ||
      !input.bytes.length ||
      input.bytes.length > 10000000 ||
      !/^[a-f0-9]{64}$/.test(input.sha256)
    )
      throw new ShippingInputError("InvalidPhoto");
    entry.upload = {
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        mimeType: input.mimeType,
        byteSize: input.bytes.length,
        sha256: input.sha256,
      }),
      bytes: new Uint8Array(input.bytes),
      mimeType: input.mimeType,
      key: key(),
      contentKey: key(),
    };
  }
  const attempt = entry.upload;
  entry.uploadFlight = (async () => {
    try {
      if (!attempt.id) {
        const receipt = await client.request(
          `/orders/${id}/packaging-evidence`,
          shippingReceipt,
          {
            method: "POST",
            headers: { "Idempotency-Key": attempt.key },
            body: attempt.body,
          },
        );
        checkIdentity(s, generation);
        attempt.id = receipt.entityId;
      }
      await client.request(
        `/orders/${id}/packaging-evidence/${attempt.id}/content`,
        shippingReceipt,
        {
          method: "PUT",
          headers: {
            "Idempotency-Key": attempt.contentKey,
            "Content-Type": attempt.mimeType,
          },
          body: attempt.bytes.buffer,
        },
        120000,
      );
      checkIdentity(s, generation);
      entry.upload = undefined;
      return attempt.id;
    } catch (error) {
      if (s.generation === generation && definite(error))
        entry.upload = undefined;
      throw error;
    } finally {
      entry.uploadFlight = undefined;
    }
  })();
  return entry.uploadFlight;
}

export async function sendShipment(
  client: SessionClient,
  id: string,
  input: ShipmentInput | null,
  key: () => string,
): Promise<string> {
  const { s, entry, generation } = context(client, id);
  if (entry.upload) throw new ShippingInputError("PendingPhoto");
  if (entry.acknowledged) return entry.acknowledged;
  if (entry.shipmentFlight) return entry.shipmentFlight;
  if (!entry.shipment) {
    if (!input) throw new ShippingInputError("ShipmentRequired");
    if (
      !/^LL-[A-Z0-9]{8,32}$/.test(input.trackingCode) ||
      input.packagingEvidenceIds.length < 1 ||
      input.packagingEvidenceIds.length > 8
    )
      throw new ShippingInputError("InvalidShipment");
    entry.shipment = {
      body: JSON.stringify(input),
      key: key(),
      trackingCode: input.trackingCode,
    };
  }
  const attempt = entry.shipment;
  entry.shipmentFlight = (async () => {
    try {
      const receipt = await client.request(
        `/orders/${id}/shipment`,
        shippingReceipt,
        {
          method: "POST",
          headers: { "Idempotency-Key": attempt.key },
          body: attempt.body,
        },
      );
      checkIdentity(s, generation);
      entry.shipment = undefined;
      entry.acknowledged = receipt.entityId;
      return receipt.entityId;
    } catch (error) {
      if (s.generation === generation && definite(error))
        entry.shipment = undefined;
      throw error;
    } finally {
      entry.shipmentFlight = undefined;
    }
  })();
  return entry.shipmentFlight;
}
