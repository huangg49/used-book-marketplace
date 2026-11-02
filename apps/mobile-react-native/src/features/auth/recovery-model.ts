import { z } from "zod";
import { ApiError } from "../../core/api/session-client";
import type { OtpAck } from "./auth-api";

export const recoveryChallenge = (value: unknown) => {
  const parsed = z.string().uuid().safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
export function recoveryFields(
  code: string,
  password: string,
  confirmation: string,
) {
  const errors: Partial<Record<"code" | "password" | "confirmation", string>> =
    {};
  if (!/^[0-9]{6}$/.test(code))
    errors.code = "Nhập đủ 6 chữ số trong thư mới nhất.";
  if (password.length < 10 || password.length > 128)
    errors.password = "Mật khẩu cần từ 10 đến 128 ký tự.";
  if (password !== confirmation)
    errors.confirmation = "Hai mật khẩu chưa giống nhau.";
  return errors;
}
const uncertain = (error: unknown) =>
  !(error instanceof ApiError) ||
  error.status === 0 ||
  error.status === 408 ||
  error.status >= 500;
export type RecoveryView = {
  phase: "email" | "code" | "uncertain" | "done";
  busy: boolean;
  email: string;
  challengeId?: string;
  resendAt: number;
  expiresAt?: number;
  exhausted: boolean;
  error: string;
  codeError: string;
  requestUncertain: boolean;
};
interface RecoveryApi {
  request(email: string): Promise<OtpAck>;
  reset(body: {
    challengeId: string;
    code: string;
    password: string;
  }): Promise<void>;
}

// Only non-secret form state lives here. Code/password are passed once to reset,
// never retained for replay: this API deliberately has no command receipt.
export class RecoveryFlow {
  private active = true;
  private epoch = 0;
  private operation: "request" | "reset" | null = null;
  private listeners = new Set<() => void>();
  private view: RecoveryView;
  constructor(
    private api: RecoveryApi,
    challenge?: string,
    private clock = Date.now,
  ) {
    const id = recoveryChallenge(challenge);
    this.view = {
      phase: id ? "code" : "email",
      busy: false,
      email: "",
      challengeId: id,
      resendAt: id ? clock() + 60_000 : 0,
      exhausted: false,
      error: "",
      codeError: "",
      requestUncertain: false,
    };
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<RecoveryView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  setActive(active: boolean) {
    if (!active) {
      this.epoch++;
      if (this.view.busy) {
        if (this.operation === "reset")
          this.update({
            phase: "uncertain",
            challengeId: undefined,
            busy: false,
          });
        else
          this.update({
            phase: "email",
            challengeId: undefined,
            expiresAt: undefined,
            busy: false,
            requestUncertain: true,
            resendAt: this.clock() + 60_000,
          });
      }
    }
    this.active = active;
  }
  async request(email: string) {
    if (
      !this.active ||
      this.view.busy ||
      ["uncertain", "done"].includes(this.view.phase) ||
      this.clock() < this.view.resendAt
    )
      return;
    const normalized = email.trim().toLowerCase();
    if (!z.string().email().max(254).safeParse(normalized).success) {
      this.update({
        error: "Nhập địa chỉ email hợp lệ của tài khoản.",
        codeError: "",
      });
      return;
    }
    const epoch = ++this.epoch;
    this.operation = "request";
    this.update({ busy: true, email: normalized, error: "", codeError: "" });
    try {
      const ack = await this.api.request(normalized);
      if (!this.active || epoch !== this.epoch) return;
      this.update({
        phase: "code",
        challengeId: ack.challengeId,
        resendAt: this.clock() + ack.resendAfter * 1000,
        expiresAt: this.clock() + ack.expiresIn * 1000,
        exhausted: false,
        requestUncertain: false,
      });
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return;
      this.update(
        uncertain(error)
          ? {
              phase: "email",
              challengeId: undefined,
              expiresAt: undefined,
              requestUncertain: true,
              resendAt: this.clock() + 60_000,
              error:
                "Chưa xác nhận được yêu cầu gửi mã. Đợi 60 giây rồi yêu cầu mã mới; chỉ dùng mã trong thư mới nhất.",
            }
          : {
              error:
                error instanceof ApiError && error.status === 429
                  ? "Bạn đã gửi nhiều yêu cầu. Chờ một lúc rồi thử lại."
                  : "Chưa gửi được yêu cầu. Kiểm tra email và thử lại.",
              resendAt:
                error instanceof ApiError && error.status === 429
                  ? this.clock() + 60_000
                  : this.view.resendAt,
            },
      );
    } finally {
      if (this.active && epoch === this.epoch) this.update({ busy: false });
    }
  }
  async reset(code: string, password: string) {
    if (
      !this.active ||
      this.view.busy ||
      this.view.phase !== "code" ||
      !this.view.challengeId ||
      this.view.exhausted
    )
      return;
    if (
      !/^[0-9]{6}$/.test(code) ||
      password.length < 10 ||
      password.length > 128
    )
      return;
    const epoch = ++this.epoch;
    this.operation = "reset";
    this.update({ busy: true, error: "", codeError: "" });
    try {
      await this.api.reset({
        challengeId: this.view.challengeId!,
        code,
        password,
      });
      if (!this.active || epoch !== this.epoch) return;
      this.update({
        phase: "done",
        challengeId: undefined,
        email: "",
        expiresAt: undefined,
      });
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return;
      if (uncertain(error))
        this.update({ phase: "uncertain", challengeId: undefined });
      else if (
        error instanceof ApiError &&
        ["OTP_INVALID", "OTP_ATTEMPTS_EXCEEDED"].includes(error.code)
      ) {
        const exhausted = error.code === "OTP_ATTEMPTS_EXCEEDED";
        this.update({
          exhausted,
          codeError: exhausted
            ? "Mã đã vượt số lần thử. Hãy gửi mã mới."
            : "Mã không đúng hoặc đã hết hạn. Kiểm tra thư mới nhất hoặc gửi mã mới.",
        });
      } else
        this.update({
          error:
            error instanceof ApiError && error.status === 429
              ? "Bạn đã thử nhiều lần. Chờ một lúc rồi tiếp tục."
              : "Chưa thể đặt mật khẩu. Kiểm tra thông tin và thử lại.",
        });
    } finally {
      if (this.active && epoch === this.epoch) this.update({ busy: false });
    }
  }
}
