import { describe, expect, it } from "vitest";
import { ApiError } from "../api/session-client";
import { presentError } from "./error-presentation";

describe("safe error presentation", () => {
  it("never exposes raw backend or unexpected exception details", () => {
    for (const error of [
      new Error("password=secret"),
      new ApiError(500, "INTERNAL", "SQL password=secret"),
      { message: "token=secret" },
    ]) {
      expect(presentError(error).message).not.toMatch(
        /password|token|SQL|secret/,
      );
    }
  });
  it("keeps invalid login separate from an expired session", () => {
    expect(
      presentError(new ApiError(401, "INVALID_CREDENTIALS", "raw")).recovery,
    ).toBe("edit");
    expect(
      presentError(new ApiError(401, "SESSION_EXPIRED", "raw")).recovery,
    ).toBe("sign-in");
  });
  it("does not suggest immediate retries for permissions or throttling", () => {
    expect(presentError(new ApiError(403, "FORBIDDEN", "raw")).recovery).toBe(
      "none",
    );
    expect(
      presentError(new ApiError(429, "RATE_LIMITED", "raw")).recovery,
    ).toBe("wait");
    expect(presentError(new ApiError(0, "NETWORK_ERROR", "raw")).recovery).toBe(
      "retry",
    );
  });
  it("retains only a bounded support identifier", () => {
    expect(
      presentError(new ApiError(500, "INTERNAL", "raw", "request-123"))
        .requestId,
    ).toBe("request-123");
    for (const id of [
      "<script>secret</script>",
      "x".repeat(81),
      "token=private",
    ]) {
      expect(
        presentError(new ApiError(500, "INTERNAL", "raw", id)).requestId,
      ).toBeUndefined();
    }
  });
});
