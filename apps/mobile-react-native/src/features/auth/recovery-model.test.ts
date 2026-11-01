import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../core/api/session-client";
import {
  RecoveryFlow,
  recoveryChallenge,
  recoveryFields,
} from "./recovery-model";
import { requestOtp, resetPasswordWithOtp } from "./auth-api";
import type { SessionClient } from "../../core/api/session-client";

const id = "ca489f32-039a-4f13-9626-296f7db39b94";
const newer = "a29d22c7-0d41-4d59-97a4-b826ac26773f";
const ack = (challengeId = id) => ({
  message: "Generic acknowledgement",
  challengeId,
  expiresIn: 300,
  resendAfter: 60,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture(initial?: string) {
  let now = 1000;
  const api = {
    request: vi.fn(async (_email: string) => ack()),
    reset: vi.fn(
      async (_body: {
        challengeId: string;
        code: string;
        password: string;
      }) => {},
    ),
  };
  return {
    api,
    flow: new RecoveryFlow(api, initial, () => now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("RN password recovery public contract and lifecycle", () => {
  it("uses the existing public OTP endpoints without session or token writes", async () => {
    const publicRequest = vi
      .fn()
      .mockResolvedValueOnce(ack())
      .mockResolvedValueOnce(undefined);
    const client = { publicRequest } as unknown as SessionClient;
    await requestOtp(client, "reader@example.test", "ResetPassword");
    await resetPasswordWithOtp(client, {
      challengeId: id,
      code: "001234",
      password: "New-password-42",
    });
    expect(
      publicRequest.mock.calls.map((c) => [c[0], JSON.parse(c[2].body)]),
    ).toEqual([
      [
        "/auth/otp/request",
        { email: "reader@example.test", purpose: "ResetPassword" },
      ],
      [
        "/auth/otp/reset-password",
        { challengeId: id, code: "001234", password: "New-password-42" },
      ],
    ]);
  });
  it.each([
    undefined,
    [id],
    "https://evil.invalid/",
    "not-a-uuid",
    "",
    id + "?code=123456",
  ])("rejects untrusted challenge input %j", (value) => {
    expect(recoveryChallenge(value)).toBeUndefined();
  });
  it("restores only a validated challenge; email/code/password are not in route state", () => {
    const f = fixture(id);
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "code",
      challengeId: id,
      email: "",
      resendAt: 61000,
    });
    expect(Object.keys(f.flow.getSnapshot())).not.toEqual(
      expect.arrayContaining(["code", "password"]),
    );
  });
  it("normalizes email, suppresses duplicate taps and records expiry/cooldown from ACK", async () => {
    const f = fixture(),
      wait = deferred<ReturnType<typeof ack>>();
    f.api.request.mockReturnValueOnce(wait.promise);
    const first = f.flow.request(" Reader@EXAMPLE.TEST ");
    await f.flow.request("other@example.test");
    expect(f.api.request).toHaveBeenCalledTimes(1);
    expect(f.api.request).toHaveBeenCalledWith("reader@example.test");
    wait.resolve(ack());
    await first;
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "code",
      busy: false,
      resendAt: 61000,
      expiresAt: 301000,
    });
    await f.flow.request("reader@example.test");
    expect(f.api.request).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid email without calling the server", async () => {
    const f = fixture();
    await f.flow.request("bad");
    expect(f.api.request).not.toHaveBeenCalled();
    expect(f.flow.getSnapshot().error).toContain("email hợp lệ");
  });
  it("lost resend ACK clears the old challenge and requires a new request after cooldown", async () => {
    const f = fixture(id);
    f.advance(60000);
    f.api.request.mockRejectedValueOnce(
      new ApiError(0, "NETWORK_ERROR", "network"),
    );
    await f.flow.request("reader@example.test");
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "email",
      challengeId: undefined,
      requestUncertain: true,
      busy: false,
    });
    await f.flow.reset("001234", "New-password-42");
    await f.flow.request("reader@example.test");
    expect(f.api.reset).not.toHaveBeenCalled();
    expect(f.api.request).toHaveBeenCalledTimes(1);
    f.advance(60000);
    f.api.request.mockResolvedValueOnce(ack(newer));
    await f.flow.request("reader@example.test");
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "code",
      challengeId: newer,
      requestUncertain: false,
    });
  });
  it("preserves leading zeros, transitions only after reset ACK and never auto logs in", async () => {
    const f = fixture(id),
      wait = deferred<void>();
    f.api.reset.mockReturnValueOnce(wait.promise);
    const pending = f.flow.reset("001234", "New-password-42");
    await f.flow.reset("999999", "Other-password-42");
    expect(f.api.reset).toHaveBeenCalledTimes(1);
    expect(f.flow.getSnapshot().phase).toBe("code");
    wait.resolve();
    await pending;
    expect(f.api.reset).toHaveBeenCalledWith({
      challengeId: id,
      code: "001234",
      password: "New-password-42",
    });
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "done",
      email: "",
      challengeId: undefined,
      busy: false,
    });
  });
  it.each([0, 408, 500, 503])(
    "uncertain reset HTTP %s forbids another reset and clears route challenge",
    async (status) => {
      const f = fixture(id);
      f.api.reset.mockRejectedValueOnce(
        new ApiError(status, "UNKNOWN", "lost"),
      );
      await f.flow.reset("001234", "New-password-42");
      expect(f.flow.getSnapshot()).toMatchObject({
        phase: "uncertain",
        challengeId: undefined,
        busy: false,
      });
      await f.flow.reset("001234", "Other-password-42");
      await f.flow.request("reader@example.test");
      expect(f.api.reset).toHaveBeenCalledTimes(1);
      expect(f.api.request).not.toHaveBeenCalled();
    },
  );
  it("wrong/expired OTP permits correction but exhausted OTP requires a new challenge", async () => {
    const f = fixture(id);
    f.api.reset.mockRejectedValueOnce(
      new ApiError(400, "OTP_INVALID", "invalid"),
    );
    await f.flow.reset("123456", "New-password-42");
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "code",
      exhausted: false,
    });
    expect(f.flow.getSnapshot().codeError).toContain("hết hạn");
    f.api.reset.mockRejectedValueOnce(
      new ApiError(400, "OTP_ATTEMPTS_EXCEEDED", "exhausted"),
    );
    await f.flow.reset("001234", "New-password-42");
    await f.flow.reset("001234", "New-password-42");
    expect(f.api.reset).toHaveBeenCalledTimes(2);
    f.advance(60000);
    f.api.request.mockResolvedValueOnce(ack(newer));
    await f.flow.request("reader@example.test");
    expect(f.flow.getSnapshot()).toMatchObject({
      exhausted: false,
      challengeId: newer,
    });
  });
  it("leaving during reset ignores late ACK and retains uncertain recovery on return", async () => {
    const f = fixture(id),
      wait = deferred<void>();
    f.api.reset.mockReturnValueOnce(wait.promise);
    const pending = f.flow.reset("001234", "New-password-42");
    f.flow.setActive(false);
    f.flow.setActive(true);
    wait.resolve();
    await pending;
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "uncertain",
      busy: false,
      challengeId: undefined,
    });
  });
  it("leaving during send ignores a late challenge instead of reopening the OTP form", async () => {
    const f = fixture(),
      wait = deferred<ReturnType<typeof ack>>();
    f.api.request.mockReturnValueOnce(wait.promise);
    const pending = f.flow.request("reader@example.test");
    f.flow.setActive(false);
    f.flow.setActive(true);
    wait.resolve(ack());
    await pending;
    expect(f.flow.getSnapshot()).toMatchObject({
      phase: "email",
      busy: false,
      requestUncertain: true,
      challengeId: undefined,
    });
  });
  it("validates confirmation, password bounds and full six-digit codes", () => {
    expect(
      recoveryFields("001234", "New-password-42", "New-password-42"),
    ).toEqual({});
    expect(recoveryFields("12345", "short", "different")).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        password: expect.any(String),
        confirmation: expect.any(String),
      }),
    );
    expect(
      recoveryFields("123456", "x".repeat(129), "x".repeat(129)).password,
    ).toBeDefined();
  });
});
