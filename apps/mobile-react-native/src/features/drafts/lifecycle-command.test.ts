import { expect, it, vi } from "vitest";
import { ApiError, type SessionClient } from "../../core/api/session-client";
import { executeLifecycle, lifecycleIntent } from "./lifecycle-command";
it.each(["archive", "Hidden", "Visible"] as const)(
  "keeps %s intent after lost acknowledgement and never repeats an acknowledged write",
  async (action) => {
    const intent = lifecycleIntent("book", 8, action, "stable-key");
    const request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "lost"))
      .mockResolvedValue({ version: 9 });
    const client = { request } as unknown as Pick<SessionClient, "request">;
    await expect(executeLifecycle(client, intent)).rejects.toThrow();
    await executeLifecycle(client, intent);
    await executeLifecycle(client, intent);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
    expect(intent.acknowledged).toBe(true);
  },
);
it.each([400, 403, 404, 409, 422])(
  "does not rebase or repeat rejected command %s",
  async (status) => {
    const intent = lifecycleIntent("book", 8, "archive", "key");
    const request = vi
      .fn()
      .mockRejectedValue(new ApiError(status, "REFUSED", "refused"));
    const client = { request } as unknown as Pick<SessionClient, "request">;
    await expect(executeLifecycle(client, intent)).rejects.toThrow();
    await executeLifecycle(client, intent);
    expect(intent.stopped).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  },
);
