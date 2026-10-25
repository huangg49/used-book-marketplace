import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCooldownController } from "./useActionCooldown";

describe("createCooldownController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("immediately notifies initial seconds and counts down every second until 0", () => {
    const ticks: number[] = [];
    const stop = createCooldownController(3, (remaining) => ticks.push(remaining));

    expect(ticks).toEqual([3]);

    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([3, 2]);

    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([3, 2, 1]);

    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([3, 2, 1, 0]);

    // Timers stopped after 0
    vi.advanceTimersByTime(3000);
    expect(ticks).toEqual([3, 2, 1, 0]);

    stop();
  });

  it("can be stopped early before countdown completes", () => {
    const ticks: number[] = [];
    const stop = createCooldownController(5, (remaining) => ticks.push(remaining));

    expect(ticks).toEqual([5]);
    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([5, 4]);

    stop();
    vi.advanceTimersByTime(3000);
    expect(ticks).toEqual([5, 4]);
  });

  it("handles 0 seconds gracefully", () => {
    const ticks: number[] = [];
    createCooldownController(0, (remaining) => ticks.push(remaining));
    expect(ticks).toEqual([0]);
    vi.advanceTimersByTime(2000);
    expect(ticks).toEqual([0]);
  });
});
