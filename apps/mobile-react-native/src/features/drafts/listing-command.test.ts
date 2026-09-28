import { describe, expect, it } from "vitest";
import { ApiError, type SessionClient } from "../../core/api/session-client";
import { emptyContent } from "./contracts";
import { listingIntent, runListingIntent } from "./listing-command";

const id = "11111111-1111-4111-8111-111111111111";
const intent = () => {
  let n = 0;
  return listingIntent(id, 7, emptyContent, true, () => `key-${++n}`);
};
type Call = { path: string; init?: RequestInit };
function mock(fn: (call: Call) => unknown) {
  return {
    request: async (path: string, _schema: unknown, init?: RequestInit) =>
      fn({ path, init }),
  } as Pick<SessionClient, "request">;
}
describe("listing save and submission reconciliation", () => {
  it("freezes the selected origin version across lost acknowledgement and requires a new intent after conflict", async () => {
    const selected = {
      originAddressId: id,
      originAddressVersion: 2,
      method: "DirectDelivery" as const,
    };
    const a = listingIntent(
      id,
      7,
      { ...emptyContent, fulfillment: selected },
      false,
      () => "origin-key",
    );
    selected.originAddressVersion = 3;
    const calls: Call[] = [];
    const client = mock((c) => {
      calls.push(c);
      if (c.path.endsWith("/draft"))
        throw new ApiError(calls.length === 1 ? 0 : 409, "CONFLICT", "");
      return { version: 7 };
    });
    await expect(runListingIntent(client, a)).rejects.toThrow();
    await expect(runListingIntent(client, a)).rejects.toThrow();
    expect(calls[0].init).toEqual(calls[1].init);
    expect(
      JSON.parse(a.saveBody).content.fulfillment.originAddressVersion,
    ).toBe(2);
    expect(a.stopped).toBe(true);
    await runListingIntent(client, a);
    expect(calls[2].path).toBe(`/me/listings/${id}`);
  });
  it("retries approved replacement with one frozen revision command, then only reads after acknowledgement", async () => {
    const a = listingIntent(
        id,
        7,
        emptyContent,
        true,
        () => "revision-key",
        true,
      ),
      calls: Call[] = [];
    let lose = true,
      readFails = true;
    const client = mock((c) => {
      calls.push(c);
      if (c.path.endsWith("/revision")) {
        if (lose) {
          lose = false;
          throw new ApiError(0, "NETWORK_ERROR", "lost");
        }
        return { version: 8 };
      }
      if (readFails) {
        readFails = false;
        throw new ApiError(0, "NETWORK_ERROR", "read");
      }
      return { version: 8 };
    });
    await expect(runListingIntent(client, a)).rejects.toThrow();
    await expect(runListingIntent(client, a)).rejects.toThrow();
    await runListingIntent(client, a);
    expect(calls.filter((c) => c.path.endsWith("/revision"))).toHaveLength(2);
    expect(calls[0].init).toEqual(calls[1].init);
    expect(JSON.parse(calls[0].init!.body as string).ownershipDeclared).toBe(
      true,
    );
    expect(
      calls.some(
        (c) => c.path.endsWith("/draft") || c.path.endsWith("/submit"),
      ),
    ).toBe(false);
  });
  it.each(["save", "submit"])(
    "retries a lost %s acknowledgement with identical keys and payload",
    async (stage) => {
      const a = intent(),
        calls: Call[] = [];
      let lost = false;
      const client = mock((c) => {
        calls.push(c);
        if (
          (stage === "save"
            ? c.path.endsWith("/draft")
            : c.path.endsWith("/submit")) &&
          !lost
        ) {
          lost = true;
          throw new ApiError(0, "NETWORK_ERROR", "");
        }
        return c.path.endsWith("/draft")
          ? { version: 8 }
          : c.path.endsWith("/submit")
            ? { version: 9 }
            : { version: 9, state: { moderation: "PendingReview" } };
      });
      await expect(runListingIntent(client, a)).rejects.toThrow();
      expect(await runListingIntent(client, a)).toMatchObject({ version: 9 });
      const retried = calls.filter((c) =>
        c.path.endsWith(stage === "save" ? "/draft" : "/submit"),
      );
      expect(retried).toHaveLength(2);
      expect(retried[0].init).toEqual(retried[1].init);
      expect(
        JSON.parse(
          calls.find((c) => c.path.endsWith("/submit"))!.init!.body as string,
        ),
      ).toEqual({ expectedVersion: 8, ownershipDeclared: true });
      if (stage === "submit")
        expect(calls.filter((c) => c.path.endsWith("/draft"))).toHaveLength(1);
    },
  );
  it("retries only the read after submission committed, even if a reviewer already decided", async () => {
    const a = intent(),
      calls: Call[] = [];
    let lost = false;
    const client = mock((c) => {
      calls.push(c);
      if (c.path.startsWith("/me") && !lost) {
        lost = true;
        throw new ApiError(0, "NETWORK_ERROR", "");
      }
      return c.path.endsWith("/draft")
        ? { version: 8 }
        : { version: 10, state: { moderation: "Rejected" } };
    });
    await expect(runListingIntent(client, a)).rejects.toThrow();
    expect(await runListingIntent(client, a)).toMatchObject({
      state: { moderation: "Rejected" },
    });
    expect(calls.filter((c) => c.init)).toHaveLength(2);
    expect(calls.filter((c) => c.path.startsWith("/me"))).toHaveLength(2);
  });
  it.each([403, 409, 422])(
    "never resaves at a new version after a definitive %s rejection",
    async (status) => {
      const a = intent(),
        calls: Call[] = [];
      const client = mock((c) => {
        calls.push(c);
        if (c.init) throw new ApiError(status, "STOP", "");
        return { version: 11 };
      });
      await expect(runListingIntent(client, a)).rejects.toThrow();
      expect(a.stopped).toBe(true);
      expect(await runListingIntent(client, a)).toMatchObject({ version: 11 });
      expect(calls.filter((c) => c.init)).toHaveLength(1);
    },
  );
  it("keeps frozen form content even if the caller changes its input after creating the intent", async () => {
    const content = { ...emptyContent, description: "Trước khi gửi" };
    const a = listingIntent(id, 7, content, false, () => "key");
    content.description = "Sau khi gửi";
    const calls: Call[] = [];
    await runListingIntent(
      mock((c) => {
        calls.push(c);
        return { version: 8 };
      }),
      a,
    );
    expect(JSON.parse(calls[0].init!.body as string).content.description).toBe(
      "Trước khi gửi",
    );
    expect(calls.some((c) => c.path.endsWith("/submit"))).toBe(false);
  });
});
