import { describe, expect, it } from "vitest";
import { ApiError, SessionClient, type SessionState } from "./session-client";
import {
  accountPasswordRequired,
  pendingAccountCommand,
  pendingProfileAvatar,
  readyProfileAvatar,
  sendAccountCommand,
  uploadProfileAvatar,
  readMemberProfile,
} from "./account-commands";
const owner = "1101d28c-80c3-4223-b289-e9446ba940be",
  asset = "2201d28c-80c3-4223-b289-e9446ba940be";
function fake() {
  let state: SessionState = {
    status: "authenticated",
    user: {
      id: owner,
      email: "qa@example.test",
      displayName: "QA",
      status: "ACTIVE",
      roles: ["MEMBER"],
    },
  };
  let failure: unknown = new ApiError(503, "UNAVAILABLE", "Unknown result"),
    delay: Promise<void> | null = null;
  const listeners = new Set<() => void>(),
    calls: { path: string; init: RequestInit }[] = [];
  const client = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    request: async (
      path: string,
      schema: { parse: (v: unknown) => unknown },
      init: RequestInit,
    ) => {
      calls.push({ path, init });
      const captured = failure,
        wait = delay;
      if (wait) await wait;
      if (captured) throw captured;
      return schema.parse({
        id: asset,
        entityType: path.includes("avatar-uploads")
          ? "ProfileAvatar"
          : "MemberProfile",
        entityId: path.includes("avatar-uploads") ? asset : owner,
        version: path.endsWith("content") ? 2 : 1,
        state: path.endsWith("discard")
          ? "Retired"
          : path.endsWith("content")
            ? "Ready"
            : path.includes("avatar-uploads")
              ? "Pending"
              : "Updated",
        serverTime: new Date().toISOString(),
      });
    },
  } as unknown as SessionClient;
  return {
    client,
    calls,
    fail: (value: unknown) => {
      failure = value;
    },
    delay: (value: Promise<void>) => {
      delay = value;
    },
    identity: () => {
      state = {
        status: "authenticated",
        user: {
          id: asset,
          email: "other@example.test",
          displayName: "Other",
          status: "ACTIVE",
          roles: ["MEMBER"],
        },
      };
      listeners.forEach((s) => s());
    },
  };
}
describe("account commands retain uncertain intents and isolate identity", () => {
  it("rejects a profile response after identity changes before synchronizing session", async () => {
    const f = fake();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reloads = 0;
    f.client.request = (async () => {
      await wait;
      return { id: owner };
    }) as typeof f.client.request;
    f.client.reloadUser = async () => {
      reloads++;
    };
    const reading = readMemberProfile(f.client);
    f.identity();
    release();
    await expect(reading).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(reloads).toBe(0);
  });
  it("requires password re-entry after navigation while retaining only the original business target/version/key", async () => {
    const f = fake(),
      body = {
        expectedVersion: 1,
        email: "target@example.test",
        password: "initial-proof",
      };
    await expect(
      sendAccountCommand(
        f.client,
        "profile-email",
        "/me/profile/email-changes",
        body,
        () => "original",
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(accountPasswordRequired(f.client, "profile-email")).toBe(true);
    await expect(
      sendAccountCommand(
        f.client,
        "profile-email",
        "/me/profile/email-changes",
        null,
        () => "new",
      ),
    ).rejects.toMatchObject({ code: "CURRENT_PASSWORD_REQUIRED" });
    expect(f.calls).toHaveLength(1);
    f.fail(null);
    await sendAccountCommand(
      f.client,
      "profile-email",
      "/me/profile/email-changes",
      {
        expectedVersion: 9,
        email: "other@example.test",
        password: "current-proof",
      },
      () => "new",
    );
    expect(JSON.parse(f.calls[1].init.body as string)).toEqual({
      ...body,
      password: "current-proof",
    });
    expect(
      (f.calls[1].init.headers as Record<string, string>)["Idempotency-Key"],
    ).toBe("original");
  });
  it("pins replacement photo and discard key across an uncertain staged-avatar cleanup", async () => {
    const f = fake();
    f.fail(null);
    let keys = 0;
    const key = () => `key-${++keys}`;
    await uploadProfileAvatar(
      f.client,
      {
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        sha256: "a".repeat(64),
      },
      key,
    );
    const original = f.client.request.bind(f.client);
    let drop = true;
    f.client.request = (async (
      ...args: Parameters<SessionClient["request"]>
    ) => {
      if (args[0].endsWith("discard") && drop) {
        drop = false;
        f.fail(new ApiError(408, "HTTP_ERROR", "Lost cleanup receipt"));
        try {
          return await original(...args);
        } finally {
          f.fail(null);
        }
      }
      return original(...args);
    }) as SessionClient["request"];
    const bytes = new Uint8Array([2, 3]);
    await expect(
      uploadProfileAvatar(
        f.client,
        { bytes, mimeType: "image/png", sha256: "b".repeat(64) },
        key,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    bytes.fill(0);
    await uploadProfileAvatar(f.client, null, key);
    const discards = f.calls.filter((c) => c.path.endsWith("discard"));
    expect(discards).toHaveLength(2);
    expect(discards[0].init.headers).toEqual(discards[1].init.headers);
    expect(
      Array.from(new Uint8Array(f.calls.at(-1)!.init.body as ArrayBuffer)),
    ).toEqual([2, 3]);
    expect(
      f.calls.filter((c) => c.path === "/me/profile/avatar-uploads"),
    ).toHaveLength(2);
  });
  it("does not start an old avatar request after an identity change in the preparation gap", async () => {
    const f = fake();
    f.fail(null);
    const upload = uploadProfileAvatar(
      f.client,
      {
        bytes: new Uint8Array([1]),
        mimeType: "image/png",
        sha256: "a".repeat(64),
      },
      () => "original",
    );
    f.identity();
    await expect(upload).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(f.calls).toHaveLength(0);
  });
  it("allows explicit current-password re-entry while retaining original email/version/key after lost ACK and credential denial", async () => {
    const f = fake(),
      body = {
        expectedVersion: 1,
        email: "target@example.test",
        password: "old-proof",
      };
    await expect(
      sendAccountCommand(
        f.client,
        "email",
        "/me/profile/email-changes",
        body,
        () => "original",
      ),
    ).rejects.toBeInstanceOf(ApiError);
    f.fail(
      new ApiError(403, "INVALID_CREDENTIALS", "Current password required"),
    );
    await expect(
      sendAccountCommand(
        f.client,
        "email",
        "/me/profile/email-changes",
        body,
        () => "replacement",
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(accountPasswordRequired(f.client, "email")).toBe(true);
    f.fail(null);
    await sendAccountCommand(
      f.client,
      "email",
      "/me/profile/email-changes",
      {
        expectedVersion: 9,
        email: "different@example.test",
        password: "current-proof",
      },
      () => "replacement",
    );
    const last = f.calls[2].init;
    expect((last.headers as Record<string, string>)["Idempotency-Key"]).toBe(
      "original",
    );
    expect(JSON.parse(last.body as string)).toEqual({
      ...body,
      password: "current-proof",
    });
    expect(accountPasswordRequired(f.client, "email")).toBe(false);
  });
  it("does not acknowledge a receipt for a different target", async () => {
    const f = fake();
    f.fail(null);
    await expect(
      sendAccountCommand(
        f.client,
        "profile",
        "/me/profile",
        {},
        () => "original",
        { entityType: "MemberProfile", entityId: asset },
      ),
    ).rejects.toThrow("Unexpected command receipt");
    expect(pendingAccountCommand(f.client, "profile")).toBe(true);
  });
  it.each(["AvatarQuotaExceeded", "EMAIL_CHANGE_COOLDOWN"])(
    "permits editing after known post-receipt business refusal %s",
    async (code) => {
      const f = fake();
      f.fail(new ApiError(429, code, "Business refusal"));
      await expect(
        sendAccountCommand(f.client, "profile", "/me/profile", {}, () => "old"),
      ).rejects.toBeInstanceOf(ApiError);
      expect(pendingAccountCommand(f.client, "profile")).toBe(false);
    },
  );
  it.each([401, 403, 408, 429, 503, 0])(
    "pins original profile body/key after status %s, even after edited inputs and navigation",
    async (status) => {
      const f = fake(),
        body = { expectedVersion: 1, displayName: "Original" };
      f.fail(new ApiError(status, "HTTP_ERROR", "Unavailable"));
      await expect(
        sendAccountCommand(
          f.client,
          "profile",
          "/me/profile",
          body,
          () => "original",
        ),
      ).rejects.toBeInstanceOf(ApiError);
      body.expectedVersion = 9;
      body.displayName = "Edited";
      expect(pendingAccountCommand(f.client, "profile")).toBe(true);
      await expect(
        sendAccountCommand(
          f.client,
          "profile",
          "/me/profile/email-changes",
          body,
          () => "opposite",
        ),
      ).rejects.toThrow("trước khi đổi");
      f.fail(null);
      await sendAccountCommand(
        f.client,
        "profile",
        "/me/profile",
        body,
        () => "replacement",
      );
      expect(f.calls).toHaveLength(2);
      expect(
        f.calls.every(
          (c) =>
            (c.init.headers as Record<string, string>)["Idempotency-Key"] ===
              "original" &&
            c.init.body ===
              JSON.stringify({ expectedVersion: 1, displayName: "Original" }),
        ),
      ).toBe(true);
      expect(pendingAccountCommand(f.client, "profile")).toBe(false);
    },
  );
  it.each([400, 409, 422])(
    "allows a new decision after definite rejection %s",
    async (status) => {
      const f = fake();
      f.fail(new ApiError(status, "REJECTED", "Rejected"));
      await expect(
        sendAccountCommand(
          f.client,
          "profile",
          "/me/profile",
          { expectedVersion: 1 },
          () => "old",
        ),
      ).rejects.toBeInstanceOf(ApiError);
      expect(pendingAccountCommand(f.client, "profile")).toBe(false);
      f.fail(null);
      await sendAccountCommand(
        f.client,
        "profile",
        "/me/profile",
        { expectedVersion: 2 },
        () => "new",
      );
      expect(
        (f.calls[1].init.headers as Record<string, string>)["Idempotency-Key"],
      ).toBe("new");
    },
  );
  it("drops sensitive pending bodies on identity change and refuses an old late ACK", async () => {
    const f = fake();
    f.fail(null);
    let release!: () => void;
    f.delay(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const request = sendAccountCommand(
      f.client,
      "email",
      "/me/profile/email-changes",
      { password: "temporary-memory-only" },
      () => "old",
    );
    f.identity();
    release();
    await expect(request).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    expect(pendingAccountCommand(f.client, "email")).toBe(false);
  });
  it("does not use missing-body retry as a new mutation", async () => {
    const f = fake();
    await expect(
      sendAccountCommand(f.client, "profile", "/me/profile", null, () => "new"),
    ).rejects.toThrow("Không có thao tác");
    expect(f.calls).toHaveLength(0);
  });
  it("pins upload create metadata/key and original byte window after a lost ACK", async () => {
    const f = fake(),
      bytes = new Uint8Array([99, 1, 2, 3, 88]),
      photo = {
        bytes: bytes.subarray(1, 4),
        mimeType: "image/png" as const,
        sha256: "a".repeat(64),
      };
    let counter = 0;
    const key = () => `key-${++counter}`;
    await expect(
      uploadProfileAvatar(f.client, photo, key),
    ).rejects.toBeInstanceOf(ApiError);
    bytes.fill(0);
    expect(pendingProfileAvatar(f.client)).toBe(true);
    f.fail(null);
    expect(await uploadProfileAvatar(f.client, null, key)).toBe(asset);
    expect(f.calls[0].init.body).toBe(f.calls[1].init.body);
    expect(f.calls[0].init.headers).toEqual(f.calls[1].init.headers);
    expect(
      Array.from(new Uint8Array(f.calls[2].init.body as ArrayBuffer)),
    ).toEqual([1, 2, 3]);
    expect(readyProfileAvatar(f.client)).toBe(asset);
    expect(pendingProfileAvatar(f.client)).toBe(false);
    expect(counter).toBe(2);
  });
  it("does not recreate an acknowledged avatar after upload response was lost", async () => {
    const f = fake();
    f.fail(null);
    const request = f.client.request.bind(f.client);
    let contentCount = 0;
    f.client.request = (async (
      ...args: Parameters<SessionClient["request"]>
    ) => {
      if (args[0].endsWith("content") && contentCount++ === 0) {
        f.fail(new ApiError(408, "HTTP_ERROR", "Lost upload receipt"));
        try {
          return await request(...args);
        } finally {
          f.fail(null);
        }
      }
      return request(...args);
    }) as SessionClient["request"];
    const photo = {
      bytes: new Uint8Array([1]),
      mimeType: "image/png" as const,
      sha256: "a".repeat(64),
    };
    let keys = 0;
    const key = () => `key-${++keys}`;
    await expect(
      uploadProfileAvatar(f.client, photo, key),
    ).rejects.toBeInstanceOf(ApiError);
    await uploadProfileAvatar(f.client, null, key);
    expect(
      f.calls.filter((c) => c.path === "/me/profile/avatar-uploads"),
    ).toHaveLength(1);
    const uploads = f.calls.filter((c) => c.path.endsWith("content"));
    expect(uploads).toHaveLength(2);
    expect(uploads[0].init.headers).toEqual(uploads[1].init.headers);
  });
});
describe("profile changes refresh the existing session owner", () => {
  const original = {
    id: owner,
    email: "qa@example.test",
    displayName: "QA",
    status: "ACTIVE" as const,
    roles: ["MEMBER" as const],
  };
  const tokens = (user = original) => ({
    user,
    accessToken: "qa-access",
    refreshToken: "a".repeat(43),
    expiresIn: 900,
  });
  const storage = {
    read: async () => null,
    write: async () => {},
    clear: async () => {},
  };
  it("publishes updated name/email from auth/me without replacing the token store", async () => {
    let written = 0;
    const client = new SessionClient(
      "https://api.test",
      {
        ...storage,
        write: async () => {
          written++;
        },
      },
      async (url) =>
        Response.json(
          url.endsWith("/auth/me")
            ? { ...original, displayName: "Tên mới", email: "new@example.test" }
            : tokens(),
        ),
    );
    await client.login({ email: original.email, password: "QA-password-42" });
    await client.reloadUser();
    expect(client.getSnapshot()).toMatchObject({
      status: "authenticated",
      user: { id: owner, displayName: "Tên mới", email: "new@example.test" },
    });
    expect(written).toBe(1);
  });
  it("never publishes an old profile response into the next account", async () => {
    let release!: (r: Response) => void,
      loginCount = 0;
    const client = new SessionClient(
      "https://api.test",
      storage,
      async (url) => {
        if (url.endsWith("/auth/me"))
          return new Promise<Response>((resolve) => {
            release = resolve;
          });
        return Response.json(
          tokens(loginCount++ === 0 ? original : { ...original, id: asset }),
        );
      },
    );
    await client.login({ email: original.email, password: "QA-password-42" });
    const stale = client.reloadUser();
    await client.login({
      email: "other@example.test",
      password: "QA-password-42",
    });
    release(Response.json({ ...original, displayName: "Old response" }));
    await expect(stale).rejects.toBeInstanceOf(ApiError);
    expect(client.getSnapshot()).toMatchObject({
      user: { id: asset, displayName: "QA" },
    });
  });
});
