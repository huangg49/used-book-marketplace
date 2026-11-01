// Disposable QA only. Real HTTP/Mongo/Sharp; explicit fake storage, no provider.
import assert from "node:assert/strict";
import {
  createTestApi,
  password,
  base,
} from "../apps/admin-web/tests/test-api.mjs";
export { base, password };
export async function cartFixture(corsOrigin) {
  const u = new URL(process.env.MONGO_TEST_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1"].includes(u.hostname) &&
      u.port === (process.env.TEST_MONGO_PORT ?? "57017") &&
      u.searchParams.get("replicaSet") === "rs-test",
    "Dedicated QA rs-test required",
  );
  const fixture = await createTestApi({ listingCount: 3, corsOrigin });
  try {
    const { api, member: seller } = fixture,
      buyer = await api("/auth/login", null, {
        email: "admin@operations.test",
        password,
      });
    const book = await api(
      `/operations/catalog-requests/${fixture.catalogId}`,
      buyer.accessToken,
    );
    await api(
      `/operations/catalog-requests/${fixture.catalogId}/decision`,
      buyer.accessToken,
      {
        expectedVersion: book.version,
        revisionId: book.currentRevision.id,
        decision: "Confirm",
      },
    );
    const address = async (who, localityCode) =>
      api("/me/addresses", who.accessToken, {
        expectedBookVersion: 0,
        makeDefault: true,
        address: {
          recipientName: "QA only",
          phone: "0900000000",
          serviceAreaCode: "HCM-DEMO-v1",
          localityCode,
          detail: "QA simulated address",
        },
      });
    const source = await address(seller, "DEMO-A");
    await address(buyer, "DEMO-B");
    const approve = async (id) => {
      const l = await api(`/operations/listings/${id}`, buyer.accessToken);
      return api(`/operations/listings/${id}/decision`, buyer.accessToken, {
        expectedVersion: l.version,
        revisionId: l.currentRevision.id,
        decision: "Approve",
        checklist: {
          catalogMatches: true,
          photosClear: true,
          conditionDisclosed: true,
          readable: true,
          pricingValid: true,
          contentAppropriate: true,
        },
      });
    };
    for (const id of fixture.listings) {
      await approve(id);
      const l = await api(`/me/listings/${id}`, seller.accessToken);
      await api(`/listings/${id}/revision`, seller.accessToken, {
        expectedVersion: l.version,
        ownershipDeclared: true,
        content: {
          ...l.currentRevision.content,
          fulfillment: {
            method: "DirectDelivery",
            originAddressId: source.addressId,
            originAddressVersion: 1,
          },
        },
      });
      await approve(id);
    }
    await fixture.db.collection("login_attempts").deleteMany({});
    return { ...fixture, buyer, seller, approve };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
