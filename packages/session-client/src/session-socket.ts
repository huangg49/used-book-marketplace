import type { SessionClient } from './session-client';

export type TransactionKind = 'exchange' | 'order' | 'conversation' | 'inbox';
export type TransactionWatch = TransactionKind | 'point-order';

export const sessionSocketOptions = {
  autoConnect: false,
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  tryAllTransports: true,
  timeout: 10_000,
};

interface SessionSocket {
  on(event: string, handler: (payload: unknown) => void): unknown;
  off(event: string, handler: (payload: unknown) => void): unknown;
  timeout(ms: number): {
    emit(event: string, target: unknown, ack: (error: unknown, reply: unknown) => void): unknown;
  };
  connect(): unknown;
  disconnect(): unknown;
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

export function watchSessionResource({
  client, socket, kind, id, refresh, onWatching,
}: {
  client: Pick<SessionClient, 'getAccessToken' | 'subscribe'>;
  socket: SessionSocket;
  kind: TransactionWatch;
  id: string;
  refresh: () => void;
  onWatching: (active: boolean) => void;
}): () => void {
  const pointOrder = kind === 'point-order';
  const resourceId = id.toLowerCase();
  const watchEvent = pointOrder ? 'point-order:watch' : 'transaction:watch';
  const updateEvent = pointOrder ? 'point-order:update' : 'transaction:changed';
  let token = client.getAccessToken();
  let disposed = false;
  let connection = 0;
  const connect = () => {
    const attempt = ++connection;
    socket.timeout(4_000).emit(watchEvent, pointOrder ? resourceId : { kind, id: resourceId }, (error, reply) => {
      if (disposed || attempt !== connection) return;
      const subscribed = !error && object(reply) && reply.ok === true;
      onWatching(subscribed);
      if (subscribed) refresh();
    });
  };
  const lost = () => {
    connection++;
    if (!disposed) onWatching(false);
  };
  const update = (payload: unknown) => {
    if (!disposed && object(payload) && payload.id === resourceId && (pointOrder || payload.kind === kind))
      refresh();
  };

  socket.on('connect', connect);
  socket.on('connect_error', lost);
  socket.on('disconnect', lost);
  socket.on(updateEvent, update);
  const unsubscribe = client.subscribe(() => {
    const next = client.getAccessToken();
    if (next === token) return;
    token = next;
    lost();
    socket.disconnect();
    if (next) socket.connect();
  });
  if (token) socket.connect();
  return () => {
    disposed = true;
    unsubscribe();
    socket.off('connect', connect);
    socket.off('connect_error', lost);
    socket.off('disconnect', lost);
    socket.off(updateEvent, update);
    socket.disconnect();
  };
}
