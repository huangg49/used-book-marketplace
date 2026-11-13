import { z } from "zod";
import { ApiError, type SessionClient } from "./session-client";

export type ExchangeCommand =
  | "accept"
  | "reject"
  | "counter"
  | "funding"
  | "cancel"
  | "ship"
  | "receive"
  | "complete"
  | "dispute"
  | "return-resolution";
const stateSchema = z.object({
  id: z.string().uuid(),
  initiatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  revision: z.number().int().positive(),
  status: z.enum([
    "Proposed",
    "AcceptedAwaitingFunding",
    "Preparing",
    "InTransit",
    "Delivered",
    "Completed",
    "Cancelled",
    "ResolutionPending",
  ]),
});
export type ExchangeCommandState = z.infer<typeof stateSchema>;
type Intent = Readonly<{ path: string; key: string; body: string }>;
type Ack = { value: unknown; state: ExchangeCommandState; path: string };
type Entry = {
  intent?: Intent;
  flight?: Promise<unknown>;
  ack?: Ack;
  readRevision?: number;
  readFailed?: boolean;
  latest?: { value: unknown; state: ExchangeCommandState };
};
type Store = {
  owner: string | null;
  generation: number;
  version: number;
  entries: Map<string, Entry>;
  creates: Map<string, string>;
  listeners: Set<() => void>;
};
const stores = new WeakMap<SessionClient, Store>();
const proposalSlot = "$proposal";
function store(client: SessionClient) {
  let current = stores.get(client);
  if (!current) {
    const identity = () => {
      const state = client.getSnapshot();
      return state.status === "authenticated" ? state.user.id : null;
    };
    const value: Store = {
      owner: identity(),
      generation: 0,
      version: 0,
      entries: new Map(),
      creates: new Map(),
      listeners: new Set(),
    };
    client.subscribe(() => {
      const owner = identity();
      if (owner !== value.owner) {
        value.owner = owner;
        value.generation++;
        value.entries.clear();
        value.creates.clear();
        emit(value);
      }
    });
    stores.set(client, value);
    current = value;
  }
  return current;
}
function emit(state: Store) {
  state.version++;
  state.listeners.forEach((listener) => listener());
}
function assertIdentity(state: Store, generation: number) {
  if (!state.owner || state.generation !== generation)
    throw new ApiError(401, "SESSION_CHANGED", "Phiên tài khoản đã thay đổi.");
}
function validate(state: Store, value: unknown, id?: string) {
  const row = stateSchema.parse(value);
  if (
    (id && row.id !== id) ||
    ![row.initiatorId, row.recipientId].includes(state.owner!)
  )
    throw new Error(
      "Chưa xác minh được phản hồi của đúng giao dịch và tài khoản.",
    );
  return row;
}
function definite(error: unknown) {
  // These responses cannot settle an earlier lost ACK. Never replace its key.
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 403, 408, 429].includes(error.status) &&
    error.code !== "IdempotencyConflict"
  );
}
export function exchangeCommandIdentity(client: SessionClient) {
  const state = store(client);
  return `${state.owner}/${state.generation}`;
}
export function exchangeRecoveryVersion(client: SessionClient) {
  return store(client).version;
}
export function subscribeExchangeRecovery(
  client: SessionClient,
  listener: () => void,
) {
  const state = store(client);
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}
export function pendingExchangeIntent(client: SessionClient, id: string) {
  return store(client).entries.get(id)?.intent;
}
export function pendingExchangeProposal(
  client: SessionClient,
): Record<string, unknown> | undefined {
  const body = store(client).entries.get(proposalSlot)?.intent?.body;
  return body ? JSON.parse(body) : undefined;
}
export function acknowledgedExchangeProposal(
  client: SessionClient,
  listingId: string,
) {
  return store(client).creates.get(listingId);
}
export function acknowledgedExchangeAction(client: SessionClient, id: string) {
  return store(client).entries.get(id)?.ack?.path.split("/").pop();
}
export function exchangeCommandInFlight(client: SessionClient, id: string) {
  return Boolean(store(client).entries.get(id)?.flight);
}
export function exchangeReadProblem(client: SessionClient, id: string) {
  const entry = store(client).entries.get(id);
  if (entry?.readFailed) return "unavailable";
  if (
    entry?.ack &&
    entry.readRevision !== undefined &&
    entry.readRevision < entry.ack.state.revision
  )
    return "behind";
  return undefined;
}
export function acknowledgedExchange<T>(
  client: SessionClient,
  id: string,
  schema: z.ZodType<T>,
): T | undefined {
  const entry = store(client).entries.get(id);
  const value = entry?.ack
    ? (entry.latest?.value ?? entry.ack.value)
    : undefined;
  return value ? schema.parse(value) : undefined;
}

// GET is evidence of current state, never evidence that an uncertain command did
// or did not commit. Only an ACK removes that intent. A later GET fences the ACK.
export async function readExchange<T>(
  client: SessionClient,
  id: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const state = store(client),
    generation = state.generation;
  assertIdentity(state, generation);
  let value: T;
  try {
    value = await client.request(
      `/exchanges/${encodeURIComponent(id)}`,
      schema,
    );
  } catch (error) {
    if (state.generation === generation) {
      const entry = state.entries.get(id) ?? {};
      entry.readFailed = true;
      state.entries.set(id, entry);
      emit(state);
    }
    throw error;
  }
  assertIdentity(state, generation);
  const row = validate(state, value, id);
  let entry = state.entries.get(id);
  if (!entry) {
    entry = {};
    state.entries.set(id, entry);
  }
  entry.readFailed = false;
  if (!entry.latest || row.revision >= entry.latest.state.revision)
    entry.latest = { value, state: row };
  if (entry?.ack) {
    entry.readRevision = Math.max(entry.readRevision ?? 0, row.revision);
    emit(state);
  }
  return schema.parse(entry.latest.value);
}

// Called after current query data has reached the UI. A GET resolving before
// TanStack Query publishes its cache must not briefly enable stale commands.
export function confirmExchangeRead(
  client: SessionClient,
  id: string,
  renderedRevision: number,
) {
  const state = store(client),
    entry = state.entries.get(id);
  if (
    entry?.latest &&
    ["Cancelled", "Completed"].includes(entry.latest.state.status) &&
    renderedRevision >= entry.latest.state.revision
  ) {
    let changed = false;
    for (const [listingId, exchangeId] of state.creates)
      if (exchangeId === id) {
        state.creates.delete(listingId);
        changed = true;
      }
    if (changed) emit(state);
  }
  if (
    !entry?.ack ||
    entry.readFailed ||
    !Number.isInteger(renderedRevision) ||
    renderedRevision < entry.ack.state.revision ||
    (entry.readRevision ?? 0) < entry.ack.state.revision
  )
    return;
  entry.ack = undefined;
  entry.readRevision = undefined;
  if (!entry.intent && !entry.flight && !entry.latest) state.entries.delete(id);
  emit(state);
}

async function send<T>(
  client: SessionClient,
  slot: string,
  path: string,
  body: object | null,
  key: () => string,
  schema: z.ZodType<T>,
): Promise<T> {
  const state = store(client),
    generation = state.generation;
  assertIdentity(state, generation);
  let entry = state.entries.get(slot);
  if (!entry) {
    entry = {};
    state.entries.set(slot, entry);
  }
  if (entry.ack)
    throw new Error(
      "Máy chủ đã xác nhận thao tác. Hãy tải lại trạng thái, không gửi lệnh mới.",
    );
  if (entry.intent && entry.intent.path !== path)
    throw new Error("Hãy xác minh kết quả thao tác trước khi đổi quyết định.");
  if (!entry.intent) {
    if (!body) throw new Error("Không có thao tác chưa rõ kết quả để thử lại.");
    entry.intent = Object.freeze({
      path,
      body: JSON.stringify(body),
      key: key(),
    });
  }
  const attempt = entry.intent;
  if (entry.flight) return entry.flight as Promise<T>;
  const value = entry;
  const flight = (async () => {
    try {
      const result = await client.request(attempt.path, schema, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.key },
        body: attempt.body,
      });
      assertIdentity(state, generation);
      const row = validate(
        state,
        result,
        slot === proposalSlot ? undefined : slot,
      );
      const input = JSON.parse(attempt.body);
      const expected = input.expectedVersion ?? input.revision;
      if (typeof expected === "number" && row.revision < expected)
        throw new Error("Chưa xác minh được phiên bản trong phản hồi.");
      if (
        slot === proposalSlot &&
        (row.initiatorId !== state.owner ||
          row.status !== "Proposed" ||
          (result as Record<string, unknown>).recipientListingId !==
            input.recipientListingId)
      )
        throw new Error("Chưa xác minh được đề xuất đã tạo.");
      if (attempt.path.endsWith("/funding")) {
        const received = result as Record<string, unknown>;
        const fundedAt =
          row.initiatorId === state.owner
            ? received.initiatorFundedAt
            : received.recipientFundedAt;
        if (
          !z.iso.datetime().safeParse(fundedAt).success ||
          !["AcceptedAwaitingFunding", "Preparing"].includes(row.status)
        )
          throw new Error("Chưa xác minh được khoản nộp của bạn.");
      }
      const ack = { value: result, state: row, path: attempt.path };
      value.intent = undefined;
      value.readRevision = undefined;
      value.readFailed = false;
      if (slot === proposalSlot) {
        state.entries.delete(proposalSlot);
        const existing = state.entries.get(row.id) ?? {};
        existing.ack = ack;
        existing.readRevision = undefined;
        if (!existing.latest || row.revision >= existing.latest.state.revision)
          existing.latest = { value: result, state: row };
        state.entries.set(row.id, existing);
        state.creates.set(input.recipientListingId, row.id);
      } else {
        value.ack = ack;
        if (!value.latest || row.revision >= value.latest.state.revision)
          value.latest = { value: result, state: row };
      }
      emit(state);
      return result;
    } catch (error) {
      if (
        state.generation === generation &&
        state.entries.get(slot) === value &&
        definite(error)
      ) {
        value.intent = undefined;
        emit(state);
      }
      throw error;
    } finally {
      if (
        state.generation === generation &&
        state.entries.get(slot) === value
      ) {
        value.flight = undefined;
        if (!value.intent && !value.ack && !value.latest)
          state.entries.delete(slot);
        emit(state);
      }
    }
  })();
  entry.flight = flight;
  emit(state);
  return flight;
}
export function sendExchangeCommand<T>(
  client: SessionClient,
  id: string,
  action: ExchangeCommand,
  body: object,
  key: () => string,
  schema: z.ZodType<T>,
) {
  return send(
    client,
    id,
    `/exchanges/${encodeURIComponent(id)}/${action}`,
    body,
    key,
    schema,
  );
}
export function retryExchangeCommand<T>(
  client: SessionClient,
  id: string,
  key: () => string,
  schema: z.ZodType<T>,
) {
  const intent = pendingExchangeIntent(client, id);
  if (!intent) return readExchange(client, id, schema);
  return send(client, id, intent.path, null, key, schema);
}
export async function sendExchangeProposal<T>(
  client: SessionClient,
  body: object | null,
  key: () => string,
  schema: z.ZodType<T>,
) {
  const state = store(client),
    previous = pendingExchangeProposal(client);
  if (body) {
    const candidate = body as Record<string, unknown>;
    if (
      previous &&
      (previous.recipientListingId !== candidate.recipientListingId ||
        previous.conversationId !== candidate.conversationId)
    )
      throw new Error(
        "Hãy thử lại đề nghị chưa rõ kết quả trước khi đổi sách hoặc hội thoại.",
      );
    if (!previous && state.creates.has(String(candidate.recipientListingId)))
      throw new Error("Đề nghị đã được tạo. Hãy mở đề nghị để xem trạng thái.");
  }
  return send(client, proposalSlot, "/exchanges", body, key, schema);
}
