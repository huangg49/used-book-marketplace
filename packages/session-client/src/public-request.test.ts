import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SessionClient, type Fetcher } from "./session-client";
const storage = {
  read: async () => null,
  write: async () => {},
  clear: async () => {},
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
describe("public reads", () => {
  it("works anonymously without touching refresh or storage", async () => {
    const fetcher = vi.fn<Fetcher>(async () => json({ title: "Sách" }));
    const client = new SessionClient("https://api.test", storage, fetcher);
    expect(
      await client.publicRequest("/listings", z.object({ title: z.string() })),
    ).toEqual({ title: "Sách" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).has("Authorization"),
    ).toBe(false);
    expect(fetcher.mock.calls[0][1]?.cache).toBe("no-store");
  });
  it("never attaches bearer or refreshes even if signed in and a public route rejects", async () => {
    const fetcher = vi.fn<Fetcher>(async (url) =>
      url.endsWith("/auth/login")
        ? json({
            accessToken: "private-access",
            refreshToken: "a".repeat(43),
            expiresIn: 900,
            user: {
              id: crypto.randomUUID(),
              email: "reader@example.test",
              displayName: "Reader",
              status: "ACTIVE",
              roles: ["MEMBER"],
            },
          })
        : json({ code: "UNAUTHORIZED" }, 401),
    );
    const client = new SessionClient("https://api.test", storage, fetcher);
    await client.login({ email: "reader@example.test", password: "test" });
    await expect(
      client.publicRequest("/listings", z.unknown()),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetcher.mock.calls[1][1]?.headers).has("Authorization"),
    ).toBe(false);
    expect(client.getSnapshot().status).toBe("authenticated");
  });
  it("rejects malformed public projections", async () => {
    const client = new SessionClient("https://api.test", storage, async () =>
      json({ photos: "private-key" }),
    );
    await expect(
      client.publicRequest(
        "/listings",
        z.object({ items: z.array(z.unknown()) }),
      ),
    ).rejects.toThrow();
  });
});
