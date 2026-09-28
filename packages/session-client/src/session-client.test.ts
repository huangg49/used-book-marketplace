import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionClient,
  type Fetcher,
  type TokenStorage,
} from "./session-client";
import { currentUserSchema } from "./schemas";

const user = {
  id: "1101d28c-80c3-4223-b289-e9446ba940be",
  email: "member@example.com",
  displayName: "Reader",
  status: "ACTIVE",
  roles: ["MEMBER"],
};
const tokens = (suffix: string) => ({
  user,
  accessToken: `access-${suffix}`,
  refreshToken: suffix.repeat(43),
  expiresIn: 900,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (token: string) => {
      value = token;
    }),
    clear: vi.fn(async () => {
      value = null;
    }),
  } satisfies TokenStorage;
}

describe("session lifecycle", () => {
  it("does not let an older failed storage write discard a newer login", async () => {
    let rejectWrite!: (error: Error) => void;
    const storage = memoryStorage();
    storage.write.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json(tokens("a")))
      .mockResolvedValueOnce(json(tokens("b")))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new SessionClient("https://api.test", storage, fetcher);
    const first = expect(
      client.login({ email: user.email, password: "first" }),
    ).rejects.toMatchObject({ code: "STORAGE_ERROR" });
    await vi.waitFor(() => expect(storage.write).toHaveBeenCalledOnce());
    const second = client.login({ email: user.email, password: "second" });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    rejectWrite(new Error("device write failed"));
    await Promise.all([first, second]);
    expect(client.getSnapshot()).toEqual({ status: "authenticated", user });
    expect(await storage.read()).toBe(tokens("b").refreshToken);
    expect(storage.clear).not.toHaveBeenCalled();
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({
      refreshToken: tokens("a").refreshToken,
    });
  });

  it("rejects a new login while logout is waiting for revocation", async () => {
    let finishLogout!: (response: Response) => void;
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json(tokens("a")))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishLogout = resolve;
          }),
      )
      .mockResolvedValueOnce(json(tokens("b")));
    const storage = memoryStorage();
    const client = new SessionClient("https://api.test", storage, fetcher);
    await client.login({ email: user.email, password: "first" });
    const logout = client.logout();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    try {
      await expect(
        client.login({ email: user.email, password: "second" }),
      ).rejects.toMatchObject({ code: "SIGNING_OUT" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      finishLogout(new Response(null, { status: 204 }));
      await logout;
    }
    expect(client.getSnapshot().status).toBe("anonymous");
    expect(await storage.read()).toBeNull();
  });

  it.each(["object", "headers", "tuples"] as const)(
    "preserves %s command headers and binary bytes across a refresh",
    async (kind) => {
      const entries: [string, string][] = [
        ["content-type", "image/png"],
        ["idempotency-key", "same-command"],
        ["upload-token", "same-ticket"],
      ];
      const headers =
        kind === "headers"
          ? new Headers(entries)
          : kind === "tuples"
            ? entries
            : Object.fromEntries(entries);
      const storage = memoryStorage();
      const fetcher = vi
        .fn<Fetcher>()
        .mockResolvedValueOnce(json(tokens("a")))
        .mockResolvedValueOnce(json({ code: "TOKEN_EXPIRED" }, 401))
        .mockResolvedValueOnce(json(tokens("b")))
        .mockResolvedValueOnce(json(user));
      const client = new SessionClient("https://api.test", storage, fetcher);
      await client.login({ email: user.email, password: "secret" });
      const body = new Uint8Array([137, 80, 78, 71]).buffer;
      await client.request("/media/content", currentUserSchema, {
        method: "PUT",
        headers,
        body,
      });
      for (const index of [1, 3]) {
        const request = fetcher.mock.calls[index][1]!;
        const sent = new Headers(request.headers);
        expect(request.body).toBe(body);
        for (const [name, value] of entries) expect(sent.get(name)).toBe(value);
        expect(sent.get("authorization")).toBe(
          `Bearer access-${index === 1 ? "a" : "b"}`,
        );
      }
    },
  );

  it("restores a LOCKED profile and preserves its session after a denied new action", async () => {
    const locked = { ...user, status: "LOCKED" };
    const storage = memoryStorage(tokens("a").refreshToken);
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json({ ...tokens("b"), user: locked }))
      .mockResolvedValueOnce(
        json({ code: "AccountIneligible", message: "Locked" }, 403),
      )
      .mockResolvedValueOnce(json(locked));
    const client = new SessionClient("https://api.test", storage, fetcher);
    await client.restore();
    expect(client.getSnapshot()).toEqual({
      status: "authenticated",
      user: locked,
    });
    await expect(
      client.request("/listings", currentUserSchema, {
        method: "POST",
        body: "{}",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(storage.clear).not.toHaveBeenCalled();
    expect(await client.request("/auth/me", currentUserSchema)).toEqual(locked);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps the timeout active while reading a stalled response body", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<Fetcher>(async (_url, init) => {
      const response = json(tokens("a"));
      vi.spyOn(response, "json").mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            );
          }),
      );
      return response;
    });
    const client = new SessionClient(
      "https://api.test",
      memoryStorage(),
      fetcher,
    );
    const pending = expect(
      client.login({ email: user.email, password: "secret" }),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    await vi.advanceTimersByTimeAsync(15000);
    await pending;
  });

  it("rejects a profile response that arrives after logout", async () => {
    let release: (response: Response) => void = () => {};
    const delayed = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json(tokens("a")))
      .mockReturnValueOnce(delayed)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new SessionClient(
      "https://api.test",
      memoryStorage(),
      fetcher,
    );
    await client.login({ email: user.email, password: "secret" });
    const pending = expect(
      client.request("/auth/me", currentUserSchema),
    ).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    await client.logout();
    release(json(user));
    await pending;
    expect(client.getSnapshot().status).toBe("anonymous");
  });

  it("calls the browser fetch function without binding it to SessionClient", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this instanceof SessionClient)
        throw new TypeError("Illegal invocation");
      return Promise.resolve(json(tokens("a")));
    });
    const client = new SessionClient("https://api.test", memoryStorage());
    await client.login({ email: user.email, password: "secret" });
    expect(client.getSnapshot().status).toBe("authenticated");
  });
  it("persists only the refresh token and restores by rotating it", async () => {
    const storage = memoryStorage();
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json(tokens("a")))
      .mockResolvedValueOnce(json(tokens("b")));
    await new SessionClient("https://api.test", storage, fetcher).login({
      email: user.email,
      password: "secret",
    });
    expect(await storage.read()).toBe(tokens("a").refreshToken);
    const restarted = new SessionClient("https://api.test", storage, fetcher);
    await restarted.restore();
    expect(restarted.getSnapshot()).toEqual({ status: "authenticated", user });
    expect(await storage.read()).toBe(tokens("b").refreshToken);
  });

  it("coalesces simultaneous 401 responses into a single refresh", async () => {
    let refreshes = 0;
    const fetcher = vi.fn<Fetcher>(async (input, init) => {
      if (String(input).endsWith("/login")) return json(tokens("a"));
      if (String(input).endsWith("/refresh")) {
        refreshes++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return json(tokens("b"));
      }
      return new Headers(init?.headers).get("Authorization") ===
        "Bearer access-b"
        ? json(user)
        : json({ message: "expired" }, 401);
    });
    const client = new SessionClient(
      "https://api.test",
      memoryStorage(),
      fetcher,
    );
    await client.login({ email: user.email, password: "secret" });
    const results = await Promise.all([
      client.request("/auth/me", currentUserSchema),
      client.request("/auth/me", currentUserSchema),
    ]);
    expect(results).toEqual([user, user]);
    expect(refreshes).toBe(1);
  });

  it("keeps the refresh token during an offline startup, then allows retry", async () => {
    const storage = memoryStorage(tokens("a").refreshToken);
    const fetcher = vi
      .fn<Fetcher>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(json(tokens("b")));
    const client = new SessionClient("https://api.test", storage, fetcher);
    await client.restore();
    expect(client.getSnapshot().status).toBe("unavailable");
    expect(await storage.read()).toBe(tokens("a").refreshToken);
    await client.restore();
    expect(client.getSnapshot().status).toBe("authenticated");
  });

  it("refreshes an expired access token while preserving binary bytes and upload command headers", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer;
    const uploads: RequestInit[] = [];
    const fetcher = vi.fn<Fetcher>(async (url, init) => {
      if (url.endsWith("/login")) return json(tokens("a"));
      if (url.endsWith("/refresh")) return json(tokens("b"));
      uploads.push(init!);
      return uploads.length === 1
        ? json({ code: "TOKEN_EXPIRED" }, 401)
        : json(user);
    });
    const client = new SessionClient(
      "https://api.test",
      memoryStorage(),
      fetcher,
    );
    await client.login({ email: user.email, password: "secret" });
    await client.request(
      "/media/content",
      currentUserSchema,
      {
        method: "PUT",
        body: bytes,
        headers: {
          "Content-Type": "image/png",
          "Idempotency-Key": "same-command",
          "Upload-Token": "same-ticket",
        },
      },
      120000,
    );
    expect(uploads).toHaveLength(2);
    for (const request of uploads) {
      expect(request.body).toBe(bytes);
      const headers = new Headers(request.headers);
      expect(headers.get("Content-Type")).toBe("image/png");
      expect(headers.get("Idempotency-Key")).toBe("same-command");
      expect(headers.get("Upload-Token")).toBe("same-ticket");
    }
    expect(new Headers(uploads[1].headers).get("Authorization")).toBe(
      "Bearer access-b",
    );
  });

  it("clears an invalid refresh token without an endless retry loop", async () => {
    const storage = memoryStorage(tokens("a").refreshToken);
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValue(
        json({ code: "SESSION_EXPIRED", message: "expired" }, 401),
      );
    const client = new SessionClient("https://api.test", storage, fetcher);
    await client.restore();
    expect(client.getSnapshot().status).toBe("anonymous");
    expect(await storage.read()).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not publish a session when secure storage fails and revokes the issued token", async () => {
    const storage = memoryStorage();
    storage.write.mockRejectedValueOnce(new Error("device locked"));
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json(tokens("a")))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new SessionClient("https://api.test", storage, fetcher);
    await expect(
      client.login({ email: user.email, password: "secret" }),
    ).rejects.toMatchObject({ code: "STORAGE_ERROR" });
    expect(client.getSnapshot().status).toBe("anonymous");
    expect(String(fetcher.mock.calls[1][0])).toContain("/logout");
  });

  it("waits for an in-flight rotation and revokes the replacement token on logout", async () => {
    let release: (response: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const storage = memoryStorage(tokens("a").refreshToken);
    const fetcher = vi
      .fn<Fetcher>()
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new SessionClient("https://api.test", storage, fetcher);
    const restore = client.restore();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const logout = client.logout();
    release(json(tokens("b")));
    await Promise.all([restore, logout]);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({
      refreshToken: tokens("b").refreshToken,
    });
    expect(await storage.read()).toBeNull();
    expect(client.getSnapshot().status).toBe("anonymous");
  });

  it("shows a logout network failure and retains the token for retry", async () => {
    const storage = memoryStorage();
    const fetcher = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce(json(tokens("a")))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new SessionClient("https://api.test", storage, fetcher);
    await client.login({ email: user.email, password: "secret" });
    await expect(client.logout()).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    expect(client.getSnapshot().status).toBe("authenticated");
    await client.logout();
    expect(client.getSnapshot().status).toBe("anonymous");
  });
});
