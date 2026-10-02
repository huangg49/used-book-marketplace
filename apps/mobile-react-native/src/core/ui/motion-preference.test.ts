import { describe, expect, it, vi } from "vitest";
import { createMotionPreference } from "./motion-preference";

function deferred() {
  let resolve!: (value: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((accept, refuse) => {
    resolve = accept;
    reject = refuse;
  });
  return { promise, resolve, reject };
}

function platform() {
  const reads: ReturnType<typeof deferred>[] = [];
  const changes: ((value: boolean) => void)[] = [];
  const disconnects: ReturnType<typeof vi.fn>[] = [];
  const source = {
    read: vi.fn(() => {
      const result = deferred();
      reads.push(result);
      return result.promise;
    }),
    listen: vi.fn((changed: (value: boolean) => void) => {
      changes.push(changed);
      const disconnect = vi.fn();
      disconnects.push(disconnect);
      return disconnect;
    }),
  };
  return { source, reads, changes, disconnects };
}

describe("live motion preference", () => {
  it("shares one OS subscription and disconnects only after the last consumer", async () => {
    const device = platform();
    const preference = createMotionPreference(device.source);
    const first = vi.fn();
    const second = vi.fn();
    expect(preference.getSnapshot()).toBe(true);
    const stopFirst = preference.subscribe(first);
    const stopSecond = preference.subscribe(second);
    expect(device.source.listen).toHaveBeenCalledTimes(1);
    expect(device.source.read).toHaveBeenCalledTimes(1);

    device.reads[0].resolve(false);
    await device.reads[0].promise;
    expect(preference.getSnapshot()).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    stopFirst();
    expect(device.disconnects[0]).not.toHaveBeenCalled();
    device.changes[0](true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    stopSecond();
    expect(device.disconnects[0]).toHaveBeenCalledTimes(1);
  });

  it("does not let an older startup read overwrite a newer OS event", async () => {
    const device = platform();
    const preference = createMotionPreference(device.source);
    const changed = vi.fn();
    const stop = preference.subscribe(changed);
    device.changes[0](false);
    expect(preference.getSnapshot()).toBe(false);
    device.reads[0].resolve(true);
    await device.reads[0].promise;
    expect(preference.getSnapshot()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    stop();
  });

  it("ignores a pending read and retired event callback after unsubscribe", async () => {
    const device = platform();
    const preference = createMotionPreference(device.source);
    const changed = vi.fn();
    const stop = preference.subscribe(changed);
    stop();
    device.changes[0](false);
    device.reads[0].resolve(false);
    await device.reads[0].promise;
    expect(preference.getSnapshot()).toBe(true);
    expect(changed).not.toHaveBeenCalled();
    expect(device.disconnects[0]).toHaveBeenCalledTimes(1);
  });

  it("starts fresh when remounted while an older platform read is unresolved", async () => {
    const device = platform();
    const preference = createMotionPreference(device.source);
    const stopFirst = preference.subscribe(vi.fn());
    stopFirst();
    const changed = vi.fn();
    const stopSecond = preference.subscribe(changed);
    expect(device.source.listen).toHaveBeenCalledTimes(2);
    device.reads[1].resolve(false);
    await device.reads[1].promise;
    device.reads[0].resolve(true);
    await device.reads[0].promise;
    device.changes[0](true);
    expect(preference.getSnapshot()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    stopSecond();
  });

  it("keeps motion reduced on read failure and still follows live setting changes", async () => {
    const device = platform();
    const preference = createMotionPreference(device.source);
    const changed = vi.fn();
    const stop = preference.subscribe(changed);
    device.reads[0].reject(new Error("Platform preference unavailable"));
    await device.reads[0].promise.catch(() => {});
    expect(preference.getSnapshot()).toBe(true);
    expect(changed).not.toHaveBeenCalled();

    device.changes[0](false);
    device.changes[0](false);
    expect(preference.getSnapshot()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(1);
    device.changes[0](true);
    expect(preference.getSnapshot()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
    stop();
  });
});
