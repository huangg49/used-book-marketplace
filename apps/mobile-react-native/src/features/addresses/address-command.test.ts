import { expect, it, vi } from "vitest";
import { ApiError, type SessionClient } from "../../core/api/session-client";
import { executeAddress, type AddressIntent } from "./address-command";
import { validateAddress, type AddressInput } from "./contracts";
const intent = (): AddressIntent => ({
  path: "/me/addresses",
  method: "POST",
  body: '{"expectedBookVersion":3}',
  key: "stable-key",
});
const client = (request: unknown) =>
  ({ request }) as Pick<SessionClient, "request">;
it("retries lost acknowledgement with the same frozen key and body", async () => {
  const i = intent(),
    request = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "lost"))
      .mockResolvedValue({ version: 4, items: [] });
  await expect(executeAddress(client(request), i)).rejects.toThrow();
  await executeAddress(client(request), i);
  expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
  expect(i.acknowledged).toBe(true);
  expect(request).toHaveBeenCalledTimes(3);
});
it("after acknowledgement retries only reads, never another write", async () => {
  const i = intent(),
    request = vi
      .fn()
      .mockResolvedValueOnce({ version: 4 })
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "lost"))
      .mockResolvedValue({ version: 4, items: [] });
  await expect(executeAddress(client(request), i)).rejects.toThrow();
  await executeAddress(client(request), i);
  expect(
    request.mock.calls.filter((c) => c[2]?.method === "POST"),
  ).toHaveLength(1);
});
it.each([400, 403, 404, 409, 422, 429])(
  "stops rejected %s intent without silently rebasing",
  async (status) => {
    const i = intent(),
      request = vi
        .fn()
        .mockRejectedValue(new ApiError(status, "REFUSED", "refused"));
    await expect(executeAddress(client(request), i)).rejects.toThrow();
    await expect(executeAddress(client(request), i)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    expect(i.body).toContain(":3");
  },
);
const valid: AddressInput = {
  recipientName: "Bạn đọc",
  phone: "0900000000",
  serviceAreaCode: "HCM-DEMO-v1",
  localityCode: "DEMO-A",
  detail: "Bàn thử nghiệm",
};
it("uses trimmed Unicode limits, rejects phone/region/control characters", () => {
  expect(
    validateAddress(
      {
        ...valid,
        recipientName: " " + "📚".repeat(100) + " ",
        detail: "📚".repeat(300),
      },
      ["DEMO-A"],
    ),
  ).toEqual({});
  expect(
    validateAddress(
      {
        ...valid,
        recipientName: "📚".repeat(101),
        detail: "📚".repeat(301),
        phone: "+84900000000",
        localityCode: "unknown",
      },
      ["DEMO-A"],
    ),
  ).toMatchObject({
    recipientName: expect.any(String),
    detail: expect.any(String),
    phone: expect.any(String),
    localityCode: expect.any(String),
  });
  expect(
    validateAddress({ ...valid, detail: "Line one\nLine two" }, ["DEMO-A"])
      .detail,
  ).toBeTruthy();
});
