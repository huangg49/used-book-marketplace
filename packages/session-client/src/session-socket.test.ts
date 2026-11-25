import { describe, expect, it, vi } from 'vitest';
import { createLiveWatcher, type LiveNamespace } from './session-socket';

function fakeSocket(namespace: LiveNamespace) {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const acks: { event: string; payload: unknown; ack: (error: unknown, reply: unknown) => void }[] = [];
  const socket = {
    namespace,
    on: (event: string, handler: (payload: unknown) => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(handler));
    },
    off: (event: string, handler: (payload: unknown) => void) => listeners.get(event)?.delete(handler),
    emit: vi.fn(),
    timeout: () => ({
      emit: (event: string, payload: unknown, ack: (error: unknown, reply: unknown) => void) => {
        acks.push({ event, payload, ack });
      },
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    acks,
    signal: (event: string, payload?: unknown) => {
      for (const handler of [...(listeners.get(event) ?? [])]) handler(payload);
    },
    handlers: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
  return socket;
}

function fixture() {
  let token: string | null = 'first';
  let changeSession = () => {};
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const unsubscribe = vi.fn();
  const client = {
    getAccessToken: () => token,
    subscribe: (callback: () => void) => {
      changeSession = callback;
      return unsubscribe;
    },
  };
  const watcher = createLiveWatcher({
    client,
    open: namespace => {
      const socket = fakeSocket(namespace);
      sockets.push(socket);
      return socket;
    },
  });
  const listener = () => ({ refresh: vi.fn(), onWatching: vi.fn() });
  return {
    watcher, sockets, unsubscribe, listener,
    setToken: (next: string | null) => { token = next; changeSession(); },
  };
}

describe('createLiveWatcher', () => {
  it('refreshes on a successful watch and on a matching resource event only', () => {
    const t = fixture();
    const screen = t.listener();
    t.watcher.watch('order', 'ORDER-A', screen);
    const [socket] = t.sockets;
    expect(socket.connect).toHaveBeenCalledOnce();
    socket.signal('connect');
    expect(socket.acks[0]).toMatchObject({ event: 'transaction:watch', payload: { kind: 'order', id: 'order-a' } });
    socket.acks[0].ack(null, { ok: true });
    expect(screen.onWatching).toHaveBeenCalledWith(true);
    expect(screen.refresh).toHaveBeenCalledOnce();
    socket.signal('transaction:changed', { kind: 'exchange', id: 'order-a' });
    socket.signal('transaction:changed', { kind: 'order', id: 'other' });
    expect(screen.refresh).toHaveBeenCalledOnce();
    socket.signal('transaction:changed', { kind: 'order', id: 'order-a' });
    expect(screen.refresh).toHaveBeenCalledTimes(2);
  });

  it('shares one socket and one server watch between screens of the same resource', () => {
    const t = fixture();
    const bell = t.listener();
    const page = t.listener();
    const order = t.listener();
    const releaseBell = t.watcher.watch('inbox', 'member-a', bell);
    const [socket] = t.sockets;
    socket.signal('connect');
    socket.acks[0].ack(null, { ok: true });
    const releasePage = t.watcher.watch('inbox', 'member-a', page);
    const releaseOrder = t.watcher.watch('order', 'order-a', order);
    expect(t.sockets).toHaveLength(1);
    // The second inbox screen joins the live subscription without a new watch.
    expect(page.onWatching).toHaveBeenCalledWith(true);
    expect(socket.acks.map(a => a.payload)).toEqual([
      { kind: 'inbox', id: 'member-a' },
      { kind: 'order', id: 'order-a' },
    ]);
    socket.signal('transaction:changed', { kind: 'inbox', id: 'member-a' });
    expect(bell.refresh).toHaveBeenCalledTimes(2);
    expect(page.refresh).toHaveBeenCalledOnce();
    expect(order.refresh).not.toHaveBeenCalled();

    releaseBell();
    releaseBell();
    expect(socket.emit).not.toHaveBeenCalled();
    releasePage();
    expect(socket.emit).toHaveBeenCalledExactlyOnceWith('transaction:unwatch', { kind: 'inbox', id: 'member-a' });
    expect(socket.disconnect).not.toHaveBeenCalled();
    releaseOrder();
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.handlers()).toBe(0);
    expect(t.unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps point orders on their own namespace and payload', () => {
    const t = fixture();
    t.watcher.watch('inbox', 'member-a', t.listener());
    t.watcher.watch('point-order', 'PO-1', t.listener());
    expect(t.sockets.map(s => s.namespace)).toEqual(['transactions', 'point-orders']);
    const pointOrders = t.sockets[1];
    pointOrders.signal('connect');
    expect(pointOrders.acks[0]).toMatchObject({ event: 'point-order:watch', payload: 'po-1' });
  });

  it('watches staff topics by name on their own namespace', () => {
    const t = fixture();
    const queue = t.listener();
    t.watcher.watch('staff', 'work-items', queue);
    const [staff] = t.sockets;
    expect(staff.namespace).toBe('staff');
    staff.signal('connect');
    expect(staff.acks[0]).toMatchObject({ event: 'staff:watch', payload: 'work-items' });
    staff.acks[0].ack(null, { ok: true });
    staff.signal('staff:changed', { topic: 'support' });
    expect(queue.refresh).toHaveBeenCalledOnce();
    staff.signal('staff:changed', { topic: 'work-items' });
    expect(queue.refresh).toHaveBeenCalledTimes(2);
  });

  it('reconnects once on token rotation and ignores obsolete acknowledgements', () => {
    const t = fixture();
    const screen = t.listener();
    t.watcher.watch('order', 'order-a', screen);
    t.watcher.watch('exchange', 'exchange-a', t.listener());
    const [socket] = t.sockets;
    socket.signal('connect');
    t.setToken('fresh');
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(socket.connect).toHaveBeenCalledTimes(2);
    socket.signal('connect');
    socket.acks[0].ack(null, { ok: true });
    expect(screen.refresh).not.toHaveBeenCalled();
    socket.acks[2].ack(null, { ok: true });
    expect(screen.refresh).toHaveBeenCalledOnce();
    t.setToken(null);
    expect(screen.onWatching).toHaveBeenLastCalledWith(false);
    expect(socket.disconnect).toHaveBeenCalledTimes(2);
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('drops an acknowledgement that arrives after the screen left', () => {
    const t = fixture();
    const screen = t.listener();
    const release = t.watcher.watch('order', 'order-a', screen);
    const [socket] = t.sockets;
    socket.signal('connect');
    release();
    socket.acks[0].ack(null, { ok: true });
    expect(screen.onWatching).not.toHaveBeenCalled();
    expect(screen.refresh).not.toHaveBeenCalled();
  });

  it('reports a rejected or timed-out watch so the screen keeps polling', () => {
    const t = fixture();
    const rejected = t.listener();
    t.watcher.watch('order', 'order-a', rejected);
    const [socket] = t.sockets;
    socket.signal('connect');
    socket.acks[0].ack(null, { ok: false });
    expect(rejected.onWatching).not.toHaveBeenCalled();
    expect(rejected.refresh).not.toHaveBeenCalled();
    socket.signal('disconnect');
    socket.signal('connect');
    socket.acks[1].ack(null, { ok: true });
    expect(rejected.onWatching).toHaveBeenLastCalledWith(true);
    socket.signal('disconnect');
    expect(rejected.onWatching).toHaveBeenLastCalledWith(false);
  });
});
