import { ApiError, type SessionClient } from '@used-books/session-client';
import { z } from 'zod';

type Action = { listingId: string; kind: 'archive' } |
  { listingId: string; kind: 'visibility'; visibility: 'Visible' | 'Hidden' };
const receiptSchema = z.object({ entityId: z.string().uuid(), version: z.number().int() });
type Receipt = z.infer<typeof receiptSchema>;
type Intent = { action: Action; path: string; method: string; body: string; key: string;
  flight?: Promise<Receipt>; refusal?: ApiError; reconciliation?: Promise<void> };

/** One memory-only lifecycle intent per listing, attached to the existing session. */
export function createListingActions(client: SessionClient) {
  const intents = new Map<string, Intent>();
  const listeners = new Set<() => void>();
  let initialized = false, owner: string | undefined, generation = 0, version = 0;
  const notify = () => { version++; listeners.forEach(listener => listener()); };
  const identity = () => {
    const state = client.getSnapshot();
    return state.status === 'authenticated' ? state.user.id : undefined;
  };
  function initialize() {
    if (initialized) return;
    initialized = true;
    owner = identity();
    client.subscribe(() => {
      const state = client.getSnapshot();
      if (state.status === 'loading' || state.status === 'unavailable') return;
      const next = identity();
      if (next === owner) return;
      owner = next; generation++; intents.clear(); notify();
    });
  }
  function authorized(epoch = generation) {
    if (!owner || identity() !== owner || generation !== epoch)
      throw new ApiError(401, 'SESSION_CHANGED', 'Phiên tài khoản đã thay đổi.');
  }
  function execute(intent: Intent) {
    authorized();
    if (intent.flight) return intent.flight;
    if (intent.refusal) return Promise.reject(intent.refusal);
    const epoch = generation;
    const flight = Promise.resolve().then(async () => {
      authorized(epoch);
      const receipt = await client.request(intent.path, receiptSchema, {
        method: intent.method, headers: { 'Idempotency-Key': intent.key }, body: intent.body,
      });
      authorized(epoch);
      if (receipt.entityId !== intent.action.listingId) throw new Error('Unexpected listing receipt');
      if (intents.get(intent.action.listingId) === intent) intents.delete(intent.action.listingId);
      return receipt;
    }).catch(error => {
      if (generation === epoch && error instanceof ApiError && error.status >= 400 && error.status < 500 &&
        ![401, 403, 408, 429].includes(error.status) && intents.get(intent.action.listingId) === intent)
        intent.refusal = error;
      throw error;
    }).finally(() => {
      if (generation !== epoch) return;
      intent.flight = undefined;
      notify();
    });
    intent.flight = flight;
    notify();
    return flight;
  }
  return {
    subscribe(listener: () => void) { initialize(); listeners.add(listener); return () => { listeners.delete(listener); }; },
    getVersion() { initialize(); return version; },
    getIdentity() { initialize(); return `${identity()}/${generation}`; },
    pending() {
      initialize();
      return identity() === owner && owner
        ? Array.from(intents.values(), intent => ({ ...intent.action, busy: !!intent.flight || !!intent.reconciliation,
          ...intent.refusal ? { refused: true } : {} })) : [];
    },
    send(action: Action, expectedVersion: number, keyFactory: () => string) {
      initialize(); authorized();
      const previous = intents.get(action.listingId);
      if (previous) {
        if (previous.action.kind !== action.kind || action.kind === 'visibility' &&
          (previous.action.kind !== 'visibility' || previous.action.visibility !== action.visibility))
          throw new ApiError(409, 'LISTING_ACTION_PENDING', 'Cần xác minh thao tác trước khi đổi quyết định.');
        return execute(previous);
      }
      const archive = action.kind === 'archive';
      const intent: Intent = { action: { ...action }, path: `/listings/${action.listingId}/${archive ? 'archive' : 'visibility'}`,
        method: archive ? 'POST' : 'PUT', key: keyFactory(),
        body: JSON.stringify({ expectedVersion, ...archive ? {} : { visibility: action.visibility } }) };
      intents.set(action.listingId, intent);
      return execute(intent);
    },
    retry(listingId: string) {
      initialize(); authorized();
      const pending = intents.get(listingId);
      if (!pending) throw new Error('Không có thao tác bài đăng cần xác minh.');
      return execute(pending);
    },
    reconcile(listingId: string, read: () => Promise<unknown>) {
      initialize(); authorized();
      const intent = intents.get(listingId);
      if (!intent?.refusal || intent.flight) throw new Error('Chỉ đối chiếu thao tác đã bị từ chối.');
      if (intent.reconciliation) return intent.reconciliation;
      const epoch = generation;
      intent.reconciliation = Promise.resolve().then(async () => {
        authorized(epoch);
        await read();
        authorized(epoch);
        if (intents.get(listingId) === intent) intents.delete(listingId);
      }).finally(() => {
        if (generation !== epoch) return;
        intent.reconciliation = undefined;
        notify();
      });
      notify();
      return intent.reconciliation;
    },
  };
}
