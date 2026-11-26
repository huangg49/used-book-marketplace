import type { z } from "zod";
import {
  authTokensSchema,
  currentUserSchema,
  type AuthTokens,
  type CurrentUser,
  type LoginRequest,
} from "./schemas";
import { ServerClock, serverClock } from "./server-clock";

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
// The latest refresh-token rotation per token store. A provider that remounts
// (a web history jump, StrictMode) builds a second client over the same store
// while the first is still restoring; both read the same rotating refresh
// token. Spending it twice makes the second refresh a 401 that signs the page
// out. A client presenting a token that is being, or was just, rotated in this
// store adopts that result instead. Memory-only, like the tokens themselves;
// cleared on failure, sign-out and new login.
type Rotation = { from: string; result: Promise<AuthTokens> };
const rotations = new WeakMap<TokenStorage, Rotation>();

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
    private readonly clock: ServerClock = serverClock,
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
      const sentAt = this.clock.mark();
      const response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers,
      });
      const receivedAt = this.clock.mark();
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
      // Responses stamped with serverTime keep the shared countdown clock in sync.
      if (body && typeof body === "object")
        this.clock.observe((body as Record<string, unknown>).serverTime, sentAt, receivedAt);
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
    rotations.delete(this.storage);
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

  // `owned` is false for tokens adopted from another client's rotation: they
  // belong to that client too, so this one never revokes them.
  private async accept(tokens: AuthTokens, revision: number, owned = true) {
    if (revision !== this.revision) {
      if (owned) await this.revoke(tokens.refreshToken).catch(() => {});
      return;
    }
    try {
      await this.persist(async () => {
        if (revision === this.revision)
          await this.storage.write(tokens.refreshToken);
      });
    } catch {
      if (owned) await this.revoke(tokens.refreshToken).catch(() => {});
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
      if (owned) await this.revoke(tokens.refreshToken).catch(() => {});
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
    rotations.delete(this.storage);
    const body = await this.send("/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await this.accept(authTokensSchema.parse(body), revision);
  }

  // Spends `token` once per store: a token already being, or just, rotated by
  // any client over this store resolves to that rotation's tokens.
  private rotate(token: string): { tokens: Promise<AuthTokens>; owned: boolean } {
    const last = rotations.get(this.storage);
    if (last && last.from === token) return { tokens: last.result, owned: false };
    const result = this.send("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    }).then((body) => authTokensSchema.parse(body));
    const entry: Rotation = { from: token, result };
    rotations.set(this.storage, entry);
    result.catch(() => {
      if (rotations.get(this.storage) === entry) rotations.delete(this.storage);
    });
    return { tokens: result, owned: true };
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
        const { tokens, owned } = this.rotate(token);
        await this.accept(await tokens, revision, owned);
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

  // Public requests deliberately carry no bearer/refresh token, even while signed in.
  // They must remain usable when a private session expires or cannot be restored.
  async publicRequest<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    return schema.parse(
      await this.send(path, { method: "GET", ...init, cache: "no-store" }),
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

  async reloadUser() {
    const revision = this.revision;
    const user = await this.request('/auth/me', currentUserSchema);
    this.assertCurrent(revision);
    if (this.state.status !== 'authenticated' || this.state.user.id !== user.id)
      throw new ApiError(401, 'SESSION_CHANGED', 'Phiên tài khoản đã thay đổi.');
    this.publish({ status: 'authenticated', user });
    return user;
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
