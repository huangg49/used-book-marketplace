import { describe, expect, it, vi } from "vitest";
import { ApiError, type SessionClient } from "@used-books/session-client";
import {
  sendPackaging,
  sendShipment,
  shippingIntent,
} from "./shipping-intents";
import {
  directShipment,
  packagingPage,
  type PackagingInput,
  type ShipmentInput,
} from "./shipping-contracts";
const id = "11111111-1111-4111-8111-111111111111",
  asset = "22222222-2222-4222-8222-222222222222";
const photo = (): PackagingInput => ({
  expectedVersion: 3,
  mimeType: "image/png",
  sha256: "a".repeat(64),
  bytes: new Uint8Array([1, 2, 3]),
});
const shipment = (): ShipmentInput => ({
  expectedOrderVersion: 3,
  carrier: "LatLaiSimulator",
  trackingCode: "LL-12345678",
  packagingEvidenceIds: [asset],
});
function fixture() {
  let owner: string | null = "seller";
  const subscribers = new Set<() => void>();
  const request = vi.fn().mockResolvedValue({ entityId: asset });
  const client = {
    request,
    getSnapshot: () =>
      owner
        ? { status: "authenticated", user: { id: owner } }
        : { status: "guest" },
    subscribe: (fn: () => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  } as unknown as SessionClient;
  let key = 0;
  return {
    client,
    request,
    key: () => `key-${++key}`,
    identity: (value: string | null) => {
      owner = value;
      subscribers.forEach((fn) => fn());
    },
  };
}
describe("seller shipping command recovery", () => {
  it("pins create/content keys and copied bytes across a lost create ACK and Back", async () => {
    const f = fixture(),
      input = photo();
    f.request.mockRejectedValueOnce(new TypeError("lost ACK"));
    await expect(sendPackaging(f.client, id, input, f.key)).rejects.toThrow();
    input.bytes[0] = 99;
    input.expectedVersion = 9;
    expect(shippingIntent(f.client, id).uploadPending).toBe(true);
    await expect(sendShipment(f.client, id, shipment(), f.key)).rejects.toThrow(
      "ảnh đóng gói",
    );
    await sendPackaging(f.client, id, null, () => "wrong");
    expect(f.request.mock.calls[0]).toEqual(f.request.mock.calls[1]);
    expect(JSON.parse(f.request.mock.calls[1][2].body).expectedVersion).toBe(3);
    expect([...new Uint8Array(f.request.mock.calls[2][2].body)]).toEqual([
      1, 2, 3,
    ]);
    expect(shippingIntent(f.client, id).uploadPending).toBe(false);
  });
  it.each([401, 403, 408, 429, 503])(
    "retains the original content after uncertain %s without a new asset",
    async (status) => {
      const f = fixture();
      f.request
        .mockResolvedValueOnce({ entityId: asset })
        .mockRejectedValueOnce(new ApiError(status, "UNAVAILABLE", "QA"));
      await expect(
        sendPackaging(f.client, id, photo(), f.key),
      ).rejects.toThrow();
      await sendPackaging(f.client, id, null, () => "wrong");
      expect(
        f.request.mock.calls.filter((c) => c[2].method === "POST"),
      ).toHaveLength(1);
      expect(f.request.mock.calls[1]).toEqual(f.request.mock.calls[2]);
    },
  );
  it("permits choosing a different photo after a definite server rejection", async () => {
    const f = fixture();
    f.request.mockRejectedValueOnce(
      new ApiError(422, "VALIDATION_ERROR", "QA"),
    );
    await expect(sendPackaging(f.client, id, photo(), f.key)).rejects.toThrow();
    expect(shippingIntent(f.client, id).uploadPending).toBe(false);
    await sendPackaging(f.client, id, photo(), f.key);
    expect(f.request.mock.calls[0][2].headers).not.toEqual(
      f.request.mock.calls[1][2].headers,
    );
  });
  it("freezes shipment key/body/version/evidence across lost ACK and blocks opposite writes", async () => {
    const f = fixture(),
      input = shipment();
    f.request.mockRejectedValueOnce(new TypeError("lost ACK"));
    await expect(sendShipment(f.client, id, input, f.key)).rejects.toThrow();
    input.expectedOrderVersion = 9;
    input.trackingCode = "LL-DIFFERENT";
    input.packagingEvidenceIds = [];
    await expect(sendPackaging(f.client, id, photo(), f.key)).rejects.toThrow(
      "vận đơn",
    );
    expect(shippingIntent(f.client, id).trackingCode).toBe("LL-12345678");
    await sendShipment(f.client, id, null, () => "wrong");
    expect(f.request.mock.calls[0]).toEqual(f.request.mock.calls[1]);
    expect(shippingIntent(f.client, id).acknowledged).toBe(asset);
    await sendShipment(f.client, id, shipment(), f.key);
    expect(f.request).toHaveBeenCalledTimes(2);
  });
  it.each([400, 404, 409, 422])(
    "allows deliberate new shipment data after definite %s",
    async (status) => {
      const f = fixture();
      f.request.mockRejectedValueOnce(
        new ApiError(status, "InvalidState", "QA"),
      );
      await expect(
        sendShipment(f.client, id, shipment(), f.key),
      ).rejects.toThrow();
      expect(shippingIntent(f.client, id).shipmentPending).toBe(false);
      await sendShipment(
        f.client,
        id,
        { ...shipment(), expectedOrderVersion: 4 },
        f.key,
      );
      expect(
        JSON.parse(f.request.mock.calls[1][2].body).expectedOrderVersion,
      ).toBe(4);
    },
  );
  it("coalesces double submit without issuing a second POST", async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = sendShipment(f.client, id, shipment(), f.key),
      second = sendShipment(f.client, id, null, () => "wrong");
    finish({ entityId: asset });
    expect(await first).toBe(await second);
    expect(f.request).toHaveBeenCalledTimes(1);
  });
  it("drops pending private bytes on account change and cannot continue the old PUT", async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = sendPackaging(f.client, id, photo(), f.key);
    f.identity("another-member");
    finish({ entityId: asset });
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(shippingIntent(f.client, id).uploadPending).toBe(false);
    expect(f.request).toHaveBeenCalledTimes(1);
    await expect(sendPackaging(f.client, id, null, f.key)).rejects.toThrow(
      "Chọn ảnh",
    );
  });
  it("does not let a late old shipment ACK erase a new owner's intent", async () => {
    const f = fixture();
    let finish!: (value: unknown) => void;
    f.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = sendShipment(f.client, id, shipment(), f.key);
    f.identity("another-member");
    f.request.mockRejectedValueOnce(new TypeError("new owner's lost ACK"));
    await expect(
      sendShipment(f.client, id, shipment(), f.key),
    ).rejects.toThrow();
    finish({ entityId: asset });
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(shippingIntent(f.client, id).shipmentPending).toBe(true);
  });
  it("rejects malformed local media or shipment data before any request", async () => {
    const f = fixture();
    await expect(
      sendPackaging(
        f.client,
        id,
        { ...photo(), bytes: new Uint8Array() },
        f.key,
      ),
    ).rejects.toThrow();
    await expect(
      sendShipment(
        f.client,
        id,
        { ...shipment(), packagingEvidenceIds: [] },
        f.key,
      ),
    ).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
    f.identity(null);
    await expect(
      sendShipment(f.client, id, shipment(), f.key),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("reads actual packaging states and refuses an unsupported carrier projection", () => {
    const when = "2026-11-02T00:00:00.000Z";
    expect(
      packagingPage.parse({
        items: [{ id: asset, status: "Ready", createdAt: when }],
        serverTime: when,
      }).items,
    ).toHaveLength(1);
    expect(
      directShipment.safeParse({
        id: asset,
        orderId: id,
        carrier: "GHN",
        trackingCode: "LL-12345678",
        state: "LabelCreated",
        pickupConfirmed: false,
        demoOnly: true,
      }).success,
    ).toBe(false);
  });
});
