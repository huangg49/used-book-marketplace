import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { getPublicPhoto } from "../services/public-listings";
import { publicListingPhotoOptions } from "./usePublicListingPhoto";

vi.mock("../services/public-listings", () => ({ getPublicPhoto: vi.fn() }));
const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("public photo query reuse", () => {
  it("deduplicates a cover across card/detail and refreshes when its issued lifetime ends", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    const client = new QueryClient();
    clients.push(client);
    vi.mocked(getPublicPhoto).mockImplementation(async () => ({
      id: "photo",
      width: 200,
      height: 300,
      url: "https://example.test/cover",
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    }));
    const options = publicListingPhotoOptions("listing", "revision", "photo");
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    vi.setSystemTime(Date.now() + 60_000);
    await client.fetchQuery(options);
    expect(getPublicPhoto).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 55_000);
    await client.fetchQuery(options);
    expect(getPublicPhoto).toHaveBeenCalledTimes(2);
    await client.fetchQuery(
      publicListingPhotoOptions("listing", "new-revision", "photo"),
    );
    expect(getPublicPhoto).toHaveBeenCalledTimes(3);
    client.clear();
    await client.fetchQuery(options);
    expect(getPublicPhoto).toHaveBeenCalledTimes(4);
  });
});
