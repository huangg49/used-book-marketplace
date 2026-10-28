import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { ApiError } from "@used-books/session-client";
import type { CurrentUser } from "@used-books/session-client";
import { createCommand, runCommand, type Request } from "../src/core/command";
import { dashboardSources } from "../src/features/dashboard/sources";
import { shelfReference } from "../src/features/dashboard/shelf-model";
import {
  catalog,
  mediaRead,
  listing,
  pageOf,
  revision,
} from "../src/features/review/contracts";
import { compareRevisions } from "../src/features/review/revision-diff";
import {
  createIntent,
  executeIntent,
} from "../src/features/review/decision-command";
import {
  recordedDecision,
  matchesRecordedDecision,
} from "../src/features/review/decision-feedback";
import {
  simulatorCommand,
  simulatorReceipts,
  walletEventReceipt,
} from "../src/features/operations/simulator-contracts";
import { createTestApi, base, password } from "./test-api.mjs";
const sharp = createRequire(new URL("../../api/package.json", import.meta.url))(
  "sharp",
);

describe("Admin adapters against isolated HTTP/MongoDB", () => {
  let fixture: Awaited<ReturnType<typeof createTestApi>>;
  let admin: { user: CurrentUser; accessToken: string },
    staff: typeof admin,
    operator: typeof admin;
  const originalSecret = process.env.PAYMENT_SIMULATOR_SECRET;
  const requestFor =
    (token: string): Request =>
    async (path, schema, init) => {
      const response = await fetch(base + path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...init?.headers,
        },
      });
      const body = await response.json();
      if (!response.ok)
        throw new ApiError(
          response.status,
          body.code || "HTTP_ERROR",
          "Integration request rejected",
        );
      return schema.parse(body);
    };
  beforeAll(async () => {
    if (!process.env.MONGO_TEST_URL?.includes("57017"))
      throw Error("Only the isolated QA replica set on 57017 is allowed");
    process.env.PAYMENT_SIMULATOR_SECRET =
      "admin-http-integration-test-only-secret-2026";
    fixture = await createTestApi({ listingCount: 1 });
    const template = await fixture.db
      .collection("users")
      .findOne({ emailNormalized: "member@operations.test" });
    await fixture.db.collection("users").insertOne({
      ...template,
      _id: randomUUID(),
      emailNormalized: "operator@operations.test",
      roles: [{ role: "TEST_OPERATOR", grantedAt: new Date() }],
    });
    admin = await fixture.api("/auth/login", null, {
      email: "admin@operations.test",
      password,
    });
    staff = await fixture.api("/auth/login", null, {
      email: "staff@operations.test",
      password,
    });
    operator = await fixture.api("/auth/login", null, {
      email: "operator@operations.test",
      password,
    });
  });
  afterAll(async () => {
    await fixture?.close();
    if (originalSecret === undefined)
      delete process.env.PAYMENT_SIMULATOR_SECRET;
    else process.env.PAYMENT_SIMULATOR_SECRET = originalSecret;
  });
  it("parses every permitted Dashboard response for Admin, Staff and TEST_OPERATOR", async () => {
    for (const actor of [admin, staff, operator]) {
      const sources = dashboardSources(actor.user);
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        const snapshot = await source.load(requestFor(actor.accessToken));
        expect(snapshot.value).toBeGreaterThanOrEqual(0);
      }
    }
  });
  it("loads pending shelf photographs for reviewers while keeping pending metadata Admin-only", async () => {
    for (const actor of [admin, staff]) {
      const source = dashboardSources(actor.user).find(
        (value) => value.id === "listings",
      )!;
      const snapshot = await source.load(requestFor(actor.accessToken));
      const item = snapshot.reviewItems![0];
      expect(item.id).toBe(fixture.listings[0]);
      const ref = shelfReference(item, actor.user.roles.includes("ADMIN"));
      if (actor === admin) {
        const data = await requestFor(actor.accessToken)(ref!.path, catalog);
        expect(data.currentRevision.metadata.title).toBe(
          fixture.metadata.title,
        );
      } else {
        expect(ref).toBeNull();
        const denied = await fetch(
          base +
            `/operations/catalog-requests/${item.currentRevision.content.bookId}`,
          { headers: { Authorization: `Bearer ${actor.accessToken}` } },
        );
        expect(denied.status).toBe(403);
      }
      const path = `/operations/listings/${item.id}/media/${item.currentRevision.content.mediaIds[0]}/read`;
      const media = await requestFor(actor.accessToken)(path, mediaRead);
      const photo = await fetch(media.url);
      expect(photo.status).toBe(200);
      // The real MediaWorker converts uploaded PNGs to sanitized WebP variants.
      const image = await sharp(
        Buffer.from(await photo.arrayBuffer()),
      ).metadata();
      expect(image).toMatchObject({
        format: "webp",
        width: media.width,
        height: media.height,
      });
      const operatorRead = await fetch(base + path, {
        headers: { Authorization: `Bearer ${operator.accessToken}` },
      });
      expect(operatorRead.status).toBe(403);
      expect((await fetch(base + path)).status).toBe(401);
    }
  });
  it("compares immutable submitted revisions over the real API and denies non-reviewers", async () => {
    const request = requestFor(admin.accessToken);
    const id = fixture.listings[0];
    const before = await request(`/operations/listings/${id}`, listing);
    await fixture.api(
      `/operations/listings/${id}/decision`,
      admin.accessToken,
      {
        expectedVersion: before.version,
        revisionId: before.currentRevision.id,
        decision: "Reject",
        reason: "Dữ liệu kiểm thử: bổ sung mô tả vết gấp ở bìa.",
      },
    );
    const rejected = await fixture.api(
      `/me/listings/${id}`,
      fixture.member.accessToken,
    );
    const saved = await fixture.api(
      `/listings/${id}/draft`,
      fixture.member.accessToken,
      {
        expectedVersion: rejected.version,
        content: {
          ...rejected.currentRevision.content,
          notes: "Đã bổ sung vết gấp ở bìa.",
          salePrice: 95000,
        },
      },
      "PUT",
    );
    await fixture.api(`/listings/${id}/submit`, fixture.member.accessToken, {
      expectedVersion: saved.version,
      ownershipDeclared: true,
    });
    const current = await request(`/operations/listings/${id}`, listing);
    const path = `/operations/listings/${id}/revisions?limit=10`;
    for (const reviewer of [admin, staff]) {
      const history = await requestFor(reviewer.accessToken)(
        path,
        pageOf(revision),
      );
      const old = history.items.find(
        (r) => r.id === before.currentRevision.id,
      )!;
      expect(old.content).toEqual(before.currentRevision.content);
      expect(current.currentRevision.number).toBe(2);
      expect(
        compareRevisions(old, current.currentRevision)
          .filter((r) => r.changed)
          .map((r) => r.label),
      ).toEqual(["Giá bán", "Ghi chú / đánh dấu"]);
    }
    await expect(
      requestFor(operator.accessToken)(path, pageOf(revision)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("only enables the approval stamp after a lost-ack command is replayed and reconciled with its actual revision", async () => {
    const request = requestFor(admin.accessToken);
    const metadata = await request(
      `/operations/catalog-requests/${fixture.catalogId}`,
      catalog,
    );
    await fixture.api(
      `/operations/catalog-requests/${fixture.catalogId}/decision`,
      admin.accessToken,
      {
        expectedVersion: metadata.version,
        revisionId: metadata.currentRevision.id,
        decision: "Confirm",
      },
    );
    const path = `/operations/listings/${fixture.listings[0]}`;
    let view = await request(path, listing);
    const intent = createIntent("listings", view.id, {
      expectedVersion: view.version,
      revisionId: view.currentRevision.id,
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
    const keys: string[] = [];
    const lossy: Request = async (route, schema, init) => {
      keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
      const response = await request(route, schema, init);
      if (keys.length === 1)
        throw new ApiError(
          0,
          "NETWORK_ERROR",
          "Simulated lost acknowledgement after commit",
        );
      return response;
    };
    const reconcile = async () => {
      view = await request(path, listing);
    };
    await expect(executeIntent(intent, lossy, reconcile)).rejects.toThrow(
      "Simulated lost acknowledgement",
    );
    expect(recordedDecision(intent, "listings", view.id)).toBeNull();
    await executeIntent(intent, lossy, reconcile);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(
      matchesRecordedDecision(
        view,
        recordedDecision(intent, "listings", view.id),
      ),
    ).toBe(true);
    expect(
      await fixture.db
        .collection("listing_decisions")
        .countDocuments({ revisionId: view.currentRevision.id }),
    ).toBe(1);
  });
  it("rejects Admin and Staff for all three operator-only commands", async () => {
    for (const kind of ["topups", "pickups", "deliveries"] as const) {
      const command = simulatorCommand(
        kind,
        {
          eventId: randomUUID(),
          intentId: randomUUID(),
          recipientId: fixture.member.user.id,
          amount: "5000",
          currency: "VND",
          outcome: "Succeeded",
          occurredAt: new Date().toISOString(),
          orderId: randomUUID(),
          shipmentId: randomUUID(),
          trackingCode: "LL-ABCDEFGH",
        },
        operator.user.id,
      );
      for (const actor of [admin, staff]) {
        const intent = createCommand(command.path, command.body, command.key);
        await expect(
          runCommand(
            intent,
            simulatorReceipts[kind],
            requestFor(actor.accessToken),
            async () => {},
          ),
        ).rejects.toMatchObject({ status: 403 });
      }
    }
  });
  it("routes valid carrier envelopes to the real API and rejects nonexistent shipment targets", async () => {
    for (const kind of ["pickups", "deliveries"] as const) {
      const command = simulatorCommand(
        kind,
        {
          eventId: randomUUID(),
          orderId: randomUUID(),
          shipmentId: randomUUID(),
          trackingCode: "LL-ABCDEFGH",
          occurredAt: new Date().toISOString(),
        },
        operator.user.id,
      );
      const intent = createCommand(command.path, command.body, command.key);
      await expect(
        runCommand(
          intent,
          simulatorReceipts[kind],
          requestFor(operator.accessToken),
          async () => {},
        ),
      ).rejects.toMatchObject({ status: 404 });
    }
  });
  it("recovers a committed topup after a lost response without crediting twice", async () => {
    const pending = await fixture.api(
      "/me/topups",
      fixture.member.accessToken,
      { amount: 5000 },
    );
    const view = await fixture.api(
      `/me/topups/${pending.entityId}`,
      fixture.member.accessToken,
    );
    const command = simulatorCommand(
      "topups",
      {
        eventId: randomUUID(),
        intentId: pending.entityId,
        recipientId: fixture.member.user.id,
        amount: "5000",
        currency: "VND",
        outcome: "Succeeded",
        occurredAt: view.createdAt,
      },
      operator.user.id,
    );
    const intent = createCommand(command.path, command.body, command.key);
    const actual = requestFor(operator.accessToken);
    let lost = true;
    const flaky: Request = async (path, schema, init) => {
      const result = await actual(path, schema, init);
      if (lost) {
        lost = false;
        throw new ApiError(0, "NETWORK_ERROR", "lost response");
      }
      return result;
    };
    await expect(
      runCommand(intent, walletEventReceipt, flaky, async () => {}),
    ).rejects.toMatchObject({ status: 0 });
    const receipt = await runCommand(
      intent,
      walletEventReceipt,
      flaky,
      async () => {},
    );
    expect(receipt).toMatchObject({ state: "Succeeded", credited: true });
    const wallet = await fixture.api("/me/wallet", fixture.member.accessToken);
    expect(wallet.available).toBe(5000);
    const history = await fixture.api(
      "/me/wallet/history",
      fixture.member.accessToken,
    );
    expect(
      history.items.filter((item: { type: string }) => item.type === "Topup"),
    ).toHaveLength(1);
  });
});
