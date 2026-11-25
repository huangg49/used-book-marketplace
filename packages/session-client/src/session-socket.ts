import type { SessionClient } from './session-client';

export type TransactionKind = 'exchange' | 'order' | 'conversation' | 'inbox';
export type StaffTopic = 'work-items' | 'support' | 'listings' | 'catalog' | 'withdrawals' | 'operations';
// `staff` watches take a StaffTopic as their id.
export type TransactionWatch = TransactionKind | 'point-order' | 'staff';
export type LiveNamespace = 'transactions' | 'point-orders' | 'staff';

export const sessionSocketOptions = {
  autoConnect: false,
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  tryAllTransports: true,
  timeout: 10_000,
};

export const liveNamespace = (kind: TransactionWatch): LiveNamespace =>
  kind === 'point-order' ? 'point-orders' : kind === 'staff' ? 'staff' : 'transactions';

// Event names per namespace, and whether a watch is addressed by id alone.
const PROTOCOL: Record<LiveNamespace, { watch: string; unwatch: string; update: string; bare: boolean }> = {
  transactions: { watch: 'transaction:watch', unwatch: 'transaction:unwatch', update: 'transaction:changed', bare: false },
  'point-orders': { watch: 'point-order:watch', unwatch: 'point-order:unwatch', update: 'point-order:update', bare: true },
  staff: { watch: 'staff:watch', unwatch: 'staff:unwatch', update: 'staff:changed', bare: true },
};

export interface SessionSocket {
  on(event: string, handler: (payload: unknown) => void): unknown;
  off(event: string, handler: (payload: unknown) => void): unknown;
  emit(event: string, payload: unknown): unknown;
  timeout(ms: number): {
    emit(event: string, target: unknown, ack: (error: unknown, reply: unknown) => void): unknown;
  };
  connect(): unknown;
  disconnect(): unknown;
}

export interface LiveListener {
  refresh: () => void;
  onWatching: (active: boolean) => void;
}

type Target = {
  kind: TransactionWatch;
  id: string;
  key: string;
  listeners: Set<LiveListener>;
  active: boolean;
  attempt: number;
};

type Channel = {
  targets: Map<string, Target>;
  connected: () => boolean;
  subscribe: (target: Target) => void;
  unwatch: (target: Target) => void;
  dispose: () => void;
};

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

/**
 * One socket per namespace for a session client, shared by every screen.
 * Screens watching the same resource share one server subscription; the server
 * unwatch is sent only when the last screen releases it, and the socket closes
 * when nothing is watched. Pushes are invalidation hints: REST stays the source
 * of data, so every (re)subscription refreshes once.
 */
export function createLiveWatcher({
  client, open,
}: {
  client: Pick<SessionClient, 'getAccessToken' | 'subscribe'>;
  open: (namespace: LiveNamespace) => SessionSocket;
}) {
  const channels = new Map<LiveNamespace, Channel>();

  function channelFor(namespace: LiveNamespace): Channel {
    const existing = channels.get(namespace);
    if (existing) return existing;
    const { watch: watchEvent, unwatch: unwatchEvent, update: updateEvent, bare } = PROTOCOL[namespace];
    const payload = (target: Target) =>
      bare ? target.id : { kind: target.kind, id: target.id };
    const socket = open(namespace);
    const targets = new Map<string, Target>();
    let connected = false;
    let token = client.getAccessToken();

    const setActive = (target: Target, active: boolean) => {
      if (target.active === active) return;
      target.active = active;
      for (const listener of [...target.listeners]) listener.onWatching(active);
    };
    const subscribe = (target: Target) => {
      const attempt = ++target.attempt;
      socket.timeout(4_000).emit(watchEvent, payload(target), (error, reply) => {
        if (attempt !== target.attempt || targets.get(target.key) !== target) return;
        const ok = !error && object(reply) && reply.ok === true;
        setActive(target, ok);
        if (ok) for (const listener of [...target.listeners]) listener.refresh();
      });
    };
    const onConnect = () => {
      connected = true;
      for (const target of targets.values()) subscribe(target);
    };
    const lost = () => {
      connected = false;
      for (const target of targets.values()) {
        target.attempt++;
        setActive(target, false);
      }
    };
    const onUpdate = (value: unknown) => {
      if (!object(value)) return;
      const id = namespace === 'staff' ? value.topic : value.id;
      if (typeof id !== 'string') return;
      const key = bare ? id : `${String(value.kind)}:${id}`;
      for (const listener of [...(targets.get(key)?.listeners ?? [])]) listener.refresh();
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', lost);
    socket.on('disconnect', lost);
    socket.on(updateEvent, onUpdate);
    const stopSession = client.subscribe(() => {
      const next = client.getAccessToken();
      if (next === token) return;
      token = next;
      lost();
      socket.disconnect();
      if (next) socket.connect();
    });

    const channel: Channel = {
      targets,
      connected: () => connected,
      subscribe,
      unwatch: target => socket.emit(unwatchEvent, payload(target)),
      dispose: () => {
        channels.delete(namespace);
        stopSession();
        socket.off('connect', onConnect);
        socket.off('connect_error', lost);
        socket.off('disconnect', lost);
        socket.off(updateEvent, onUpdate);
        socket.disconnect();
      },
    };
    channels.set(namespace, channel);
    if (token) socket.connect();
    return channel;
  }

  return {
    watch(kind: TransactionWatch, id: string, listener: LiveListener): () => void {
      const channel = channelFor(liveNamespace(kind));
      // Staff topics are case-sensitive names; resource ids are UUIDs.
      const resourceId = kind === 'staff' ? id : id.toLowerCase();
      const key = PROTOCOL[liveNamespace(kind)].bare ? resourceId : `${kind}:${resourceId}`;
      let target = channel.targets.get(key);
      if (!target) {
        target = { kind, id: resourceId, key, listeners: new Set(), active: false, attempt: 0 };
        channel.targets.set(key, target);
        if (channel.connected()) channel.subscribe(target);
      }
      const watched = target;
      watched.listeners.add(listener);
      if (watched.active) listener.onWatching(true);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        watched.listeners.delete(listener);
        if (watched.listeners.size) return;
        watched.attempt++;
        channel.targets.delete(key);
        if (channel.connected()) channel.unwatch(watched);
        if (!channel.targets.size) channel.dispose();
      };
    },
  };
}

export type LiveWatcher = ReturnType<typeof createLiveWatcher>;
