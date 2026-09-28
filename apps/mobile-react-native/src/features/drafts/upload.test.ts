import { describe, expect, it } from "vitest";
import { uploadPhoto, type UploadAttempt } from "./upload";
import { ApiError, type SessionClient } from "../../core/api/session-client";
const l = "11111111-1111-4111-8111-111111111111",
  m = "22222222-2222-4222-8222-222222222222";
const attempt = (): UploadAttempt => ({
  listingId: l,
  expectedVersion: 1,
  mimeType: "image/png",
  bytes: new Uint8Array([1, 2, 3]),
  sha256: "a".repeat(64),
  createKey: "create-key",
  uploadKey: "upload-key",
  finalizeKey: "finalize-key",
});
describe("media retry orchestration", () => {
  it("reuses the original intent key when a response is lost", async () => {
    const a = attempt(),
      keys: string[] = [];
    const client = {
      request: async (_path: string, _schema: unknown, init?: RequestInit) => {
        keys.push((init?.headers as Record<string, string>)["Idempotency-Key"]);
        throw new ApiError(0, "NETWORK_ERROR", "");
      },
    } as unknown as SessionClient;
    await expect(uploadPhoto(client, a)).rejects.toBeInstanceOf(ApiError);
    await expect(uploadPhoto(client, a)).rejects.toBeInstanceOf(ApiError);
    expect(keys).toEqual(["create-key", "create-key"]);
    expect(a.mediaId).toBeUndefined();
  });
  it("reconciles Processing after a finalize response was lost without re-uploading", async () => {
    const a = { ...attempt(), mediaId: m };
    let calls = 0;
    const client = {
      request: async () => {
        calls++;
        return { id: m, status: "Processing", version: 3 };
      },
    } as unknown as SessionClient;
    expect((await uploadPhoto(client, a)).status).toBe("Processing");
    expect(calls).toBe(1);
  });
  it("sends exact binary bytes with the shared authenticated transport and fixed keys", async () => {
    const a = attempt(),
      calls: { path: string; init?: RequestInit; timeout?: number }[] = [];
    let reads = 0;
    const client = {
      request: async (
        path: string,
        _schema: unknown,
        init?: RequestInit,
        timeout?: number,
      ) => {
        calls.push({ path, init, timeout });
        if (path.endsWith("/media")) return { entityId: m };
        if (path.endsWith("/upload-ticket"))
          return {
            path: `/listings/${l}/media/${m}/content`,
            headers: { "Content-Type": "image/png", "Upload-Token": "test" },
          };
        if (path.startsWith("/me"))
          return {
            id: m,
            version: ++reads === 1 ? 1 : 2,
            status: reads === 3 ? "Processing" : "Pending",
          };
        return { entityId: m };
      },
    } as unknown as SessionClient;
    await uploadPhoto(client, a);
    const binary = calls.find((c) => c.init?.method === "PUT")!;
    expect(binary.init?.body).toBe(a.bytes.buffer);
    expect(binary.timeout).toBe(120000);
    expect(binary.init?.headers).toMatchObject({
      "Idempotency-Key": "upload-key",
    });
    expect(
      JSON.parse(
        calls.find((c) => c.path.endsWith("/finalize"))!.init!.body as string,
      ),
    ).toEqual({ expectedVersion: 2 });
  });
  it("refuses a ticket pointing at another media target", async () => {
    const a = { ...attempt(), mediaId: m };
    const client = {
      request: async (path: string) =>
        path.endsWith("upload-ticket")
          ? { path: "/other", headers: {} }
          : { status: "Pending" },
    } as unknown as SessionClient;
    await expect(uploadPhoto(client, a)).rejects.toMatchObject({
      code: "INVALID_UPLOAD_TARGET",
    });
  });

  it("uploads only the selected byte view, never adjacent buffer bytes", async () => {
    const a = { ...attempt(), mediaId: m };
    a.bytes = new Uint8Array([99, 1, 2, 3, 88]).subarray(1, 4);
    let sent: ArrayBuffer | undefined;
    const client = {
      request: async (path: string, _schema: unknown, init?: RequestInit) => {
        if (path.endsWith("/upload-ticket"))
          return { path: `/listings/${l}/media/${m}/content`, headers: {} };
        if (init?.method === "PUT") sent = init.body as ArrayBuffer;
        return { status: "Pending", version: 2 };
      },
    } as unknown as SessionClient;
    await uploadPhoto(client, a);
    expect(Array.from(new Uint8Array(sent!))).toEqual([1, 2, 3]);
  });

  it("retries a lost binary acknowledgement with one intent and the same upload key", async () => {
    const a = attempt();
    let creates = 0,
      writes = 0,
      finalized = false;
    const uploadKeys: string[] = [];
    const client = {
      request: async (path: string, _schema: unknown, init?: RequestInit) => {
        if (path.endsWith("/media")) {
          creates++;
          return { entityId: m };
        }
        if (path.endsWith("/upload-ticket"))
          return { path: `/listings/${l}/media/${m}/content`, headers: {} };
        if (path.endsWith("/content")) {
          uploadKeys.push(
            (init!.headers as Record<string, string>)["Idempotency-Key"],
          );
          if (++writes === 1) throw new ApiError(0, "NETWORK_ERROR", "");
          return { entityId: m };
        }
        if (path.endsWith("/finalize")) {
          finalized = true;
          return { entityId: m };
        }
        return {
          status: finalized ? "Processing" : "Pending",
          version: writes ? 2 : 1,
        };
      },
    } as unknown as SessionClient;
    await expect(uploadPhoto(client, a)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    expect((await uploadPhoto(client, a)).status).toBe("Processing");
    expect(creates).toBe(1);
    expect(uploadKeys).toEqual([a.uploadKey, a.uploadKey]);
  });
});
