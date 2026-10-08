import type { z } from "zod";
import {
  authTokensSchema,
  type AuthTokens,
  type CurrentUser,
  type LoginRequest,
} from "./schemas";

export interface TokenStorage {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}
export type SessionState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: CurrentUser }
  | { status: "unavailable"; message: string };

// Framework-independent so token rotation, recovery and races can be tested without a device.
export class SessionClient {
  private state: SessionState = { status: "loading" };
  private listeners = new Set<() => void>();
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshing: Promise<void> | null = null;
  private revision = 0;
  private signingOut = false;
  private storageQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly baseUrl: string,
    private readonly storage: TokenStorage,
    private readonly fetcher: Fetcher = (url, init) => fetch(url, init),
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(state: SessionState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private persist(operation: () => Promise<void>) {
    const task = this.storageQueue.catch(() => {}).then(operation);
    this.storageQueue = task;
    return task;
  }

  private async send(
    path: string,
    init: RequestInit = {},
    accessToken?: string | null,
    timeoutMs = 15000,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // RequestInit supports records, Headers and tuples. Spreading them loses
      // entries or duplicates differently-cased names (including Content-Type).
      const headers = new Headers(init.headers);
      if (!headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
      if (response.status === 204) return undefined;
      const body: unknown = await response.json().catch(() => null);
      if (controller.signal.aborted)
        throw new Error("Request timed out while reading the response.");
      if (!response.ok) {
        const detail =
          body && typeof body === "object"
            ? (body as Record<string, unknown>)
            : {};
        throw new ApiError(
          response.status,
          typeof detail.code === "string" ? detail.code : "HTTP_ERROR",
          typeof detail.message === "string"
            ? detail.message
            : "Yêu cầu chưa thực hiện được. Vui lòng thử lại.",
          typeof detail.requestId === "string" ? detail.requestId : undefined,
        );
      }
      return body;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        0,
        "NETWORK_ERROR",
        "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private assertCurrent(revision: number) {
    if (revision !== this.revision || this.signingOut)
      throw new ApiError(
        401,
        "SESSION_CHANGED",
        "Phiên đăng nhập đã thay đổi.",
      );
  }

  private async discard() {
    this.revision++;
    this.accessToken = null;
    this.refreshToken = null;
    this.publish({ status: "anonymous" });
    await this.persist(() => this.storage.clear());
  }

  private revoke(token: string) {
    return this.send("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    });
  }

  private async accept(tokens: AuthTokens, revision: number) {
    if (revision !== this.revision) {
      await this.revoke(tokens.refreshToken).catch(() => {});
      return;
    }
    try {
      await this.persist(async () => {
        if (revision === this.revision)
          await this.storage.write(tokens.refreshToken);
      });
    } catch {
      await this.revoke(tokens.refreshToken).catch(() => {});
      // Revocation/storage may have waited while another login took ownership.
      // An obsolete failure must never clear that newer session or its token.
      if (revision === this.revision) await this.discard().catch(() => {});
      throw new ApiError(
        0,
        "STORAGE_ERROR",
        "Không lưu được phiên đăng nhập an toàn. Vui lòng thử lại.",
      );
    }
    if (revision !== this.revision) {
      await this.revoke(tokens.refreshToken).catch(() => {});
      return;
    }
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.publish({ status: "authenticated", user: tokens.user });
  }

  async restore() {
    const revision = this.revision;
    this.publish({ status: "loading" });
    try {
      const token = await this.storage.read();
      if (revision !== this.revision) return;
      this.refreshToken = token;
      if (!token) {
        this.publish({ status: "anonymous" });
        return;
      }
      await this.refresh();
    } catch (error) {
      if (revision !== this.revision) return;
      // A network outage must not destroy a valid persisted session.
      this.publish({
        status: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Không khôi phục được phiên đăng nhập.",
      });
    }
  }

  async login(input: LoginRequest) {
    if (this.signingOut)
      throw new ApiError(401, "SIGNING_OUT", "Đang đăng xuất.");
    const revision = ++this.revision;
    const body = await this.send("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await this.accept(authTokensSchema.parse(body), revision);
  }

  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (this.signingOut)
      return Promise.reject(
        new ApiError(401, "SIGNING_OUT", "Đang đăng xuất."),
      );
    const revision = this.revision;
    const token = this.refreshToken;
    this.refreshing = (async () => {
      if (!token)
        throw new ApiError(401, "SESSION_EXPIRED", "Vui lòng đăng nhập lại.");
      try {
        const body = await this.send("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken: token }),
        });
        await this.accept(authTokensSchema.parse(body), revision);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          revision === this.revision
        )
          await this.discard();
        throw error;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  // Public reads deliberately carry no bearer/refresh token, even while signed in.
  // They must remain usable when a private session expires or cannot be restored.
  async publicRequest<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return schema.parse(
      await this.send(path, { method: "GET", cache: "no-store" }),
    );
  }

  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    timeoutMs = 15000,
  ): Promise<T> {
    if (this.signingOut)
      throw new ApiError(401, "SIGNING_OUT", "Đang đăng xuất.");
    const revision = this.revision;
    const originalToken = this.accessToken;
    try {
      const body = await this.send(path, init, originalToken, timeoutMs);
      this.assertCurrent(revision);
      return schema.parse(body);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        error.code === "SESSION_CHANGED" ||
        revision !== this.revision
      )
        throw error;
      // Another request may already have rotated the token while this request was in flight.
      if (originalToken === this.accessToken) await this.refresh();
      if (revision !== this.revision || !this.accessToken) throw error;
      try {
        const body = await this.send(path, init, this.accessToken, timeoutMs);
        this.assertCurrent(revision);
        return schema.parse(body);
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          retryError.code !== "SESSION_CHANGED" &&
          revision === this.revision
        )
          await this.discard();
        throw retryError;
      }
    }
  }

  async logout() {
    // Revoke first so network failure is visible and the user can retry.
    // If a refresh is pending, wait for the current token rather than revoking its predecessor.
    if (this.signingOut) return;
    this.signingOut = true;
    try {
      await this.refreshing?.catch(() => {});
      const token = this.refreshToken;
      if (token) await this.revoke(token);
      await this.discard();
    } finally {
      this.signingOut = false;
    }
  }

  // WebSocket clients need the short-lived access token for their initial
  // handshake. It remains memory-only, just like HTTP authorization.
  getAccessToken(): string | null {
    return this.accessToken;
  }
}
