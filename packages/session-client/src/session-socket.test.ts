import { describe, expect, it, vi } from 'vitest';
import { watchSessionResource } from './session-socket';

function fixture() {
  let token: string | null = 'first';
  let changeSession = () => {};
  const listeners = new Map<string, (payload: unknown) => void>();
  const acks: ((error: unknown, reply: unknown) => void)[] = [];
  const emit = vi.fn((_event: string, _payload: unknown, ack: (error: unknown, reply: unknown) => void) => {
    acks.push(ack);
  });
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => listeners.set(event, handler),
    off: (event: string) => listeners.delete(event),
    timeout: () => ({ emit }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const unsubscribe = vi.fn();
  const client = {
    getAccessToken: () => token,
    subscribe: (callback: () => void) => {
      changeSession = callback;
      return unsubscribe;
    },
  };
  const refresh = vi.fn();
  const onWatching = vi.fn();
  const stop = watchSessionResource({ client, socket, kind: 'order', id: 'order-a', refresh, onWatching });
  return {
    socket, emit, refresh, onWatching, stop, unsubscribe, acks,
    signal: (event: string, payload?: unknown) => listeners.get(event)?.(payload),
    setToken: (next: string | null) => { token = next; changeSession(); },
  };
}

describe('watchSessionResource', () => {
  it('refreshes on a successful watch and a matching resource event', () => {
    const t = fixture();
    t.signal('connect');
    expect(t.emit).toHaveBeenCalledWith('transaction:watch', { kind: 'order', id: 'order-a' }, expect.any(Function));
    t.acks[0](null, { ok: true });
    expect(t.onWatching).toHaveBeenCalledWith(true);
    t.signal('transaction:changed', { kind: 'exchange', id: 'order-a' });
    t.signal('transaction:changed', { kind: 'order', id: 'other' });
    expect(t.refresh).toHaveBeenCalledTimes(1);
    t.signal('transaction:changed', { kind: 'order', id: 'order-a' });
    expect(t.refresh).toHaveBeenCalledTimes(2);
  });

  it('reconnects on token rotation and ignores obsolete watch acknowledgements', () => {
    const t = fixture();
    t.signal('connect');
    t.setToken('fresh');
    expect(t.socket.disconnect).toHaveBeenCalledOnce();
    expect(t.socket.connect).toHaveBeenCalledTimes(2);
    t.signal('connect');
    t.acks[0](null, { ok: true });
    expect(t.refresh).not.toHaveBeenCalled();
    t.acks[1](null, { ok: true });
    expect(t.refresh).toHaveBeenCalledOnce();
    t.setToken(null);
    expect(t.socket.disconnect).toHaveBeenCalledTimes(2);
    expect(t.socket.connect).toHaveBeenCalledTimes(2);
    t.stop();
    expect(t.unsubscribe).toHaveBeenCalledOnce();
  });
});
