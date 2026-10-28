import { describe, expect, it, vi } from "vitest";
import { bubblePose, canPlay, createBubbleSprite, createFrameLoop, fishPoint, fishPose, fishSpecs, renderAquarium } from "../src/features/dashboard/aquarium-scene.mjs";

describe("aquarium scene boundaries and independent motion", () => {
  it("keeps all fish inside readable scene bounds across large and card aspect ratios", () => {
    for (const height of [600, 770, 885]) for (let time = 0; time <= 400; time += .37) {
      for (let index = 0; index < fishSpecs.length; index++) {
        const p = fishPose(time, index, height);
        expect(p.x).toBeGreaterThanOrEqual(220); expect(p.x).toBeLessThanOrEqual(900);
        expect(p.y).toBeGreaterThanOrEqual(height * .32); expect(p.y).toBeLessThanOrEqual(height * .75);
        expect(Math.abs(p.facing)).toBeGreaterThanOrEqual(.06);
        expect(p.tailWidth).toBeGreaterThanOrEqual(.48); expect(p.tailWidth).toBeLessThanOrEqual(.96);
        expect(Number.isFinite(p.tilt)).toBe(true);
      }
    }
  });
  it("eases toward a bounded touch target and returns to its original route without a position jump", () => {
    const attraction = { x: -10000, y: -10000, at: 10 };
    expect(fishPoint(10, 0, 600, attraction)).toEqual(fishPoint(10, 0, 600));
    expect(fishPoint(12, 0, 600, attraction).x).toBeLessThan(fishPoint(12, 0, 600).x);
    expect(fishPoint(14, 0, 600, attraction)).toEqual(fishPoint(14, 0, 600));
    expect(fishPoint(12, 0, 600, attraction).y).toBeGreaterThanOrEqual(600 * .32);
  });
  it("keeps the upper-left metric area clear in tall card layouts", () => {
    for (let time = 0; time < 100; time += .23) for (let index = 0; index < fishSpecs.length; index++) {
      const point = fishPoint(time, index, 885);
      if (point.x <= 400) expect(point.y).toBeGreaterThanOrEqual(885 * .56);
    }
  });
  it("gates playback for manual pause, viewport, visibility, focus and destruction", () => {
    const state = { paused: false, visible: true, onscreen: true, focused: true, disposed: false };
    expect(canPlay(state)).toBe(true);
    for (const [key, value] of [["paused", true], ["visible", false], ["onscreen", false], ["focused", false], ["disposed", true]]) {
      expect(canPlay({ ...state, [key]: value })).toBe(false);
    }
  });
  it("cancels frames on pause, ignores an old callback after restart, caps deltas and disposes permanently", () => {
    let id = 0; const callbacks = new Map(); const draw = vi.fn();
    const loop = createFrameLoop({ request: callback => { callbacks.set(++id, callback); return id; }, cancel: key => callbacks.delete(key), draw });
    loop.start(); loop.start(); expect(callbacks.size).toBe(1);
    const old = callbacks.get(1);
    loop.pause(); expect(callbacks.size).toBe(0);
    loop.start(); old(10000); expect(draw).not.toHaveBeenCalled(); expect(callbacks.size).toBe(1);
    function step(time) { const [key, callback] = [...callbacks.entries()][0]; callbacks.delete(key); callback(time); }
    step(10); step(20); expect(draw).toHaveBeenCalledTimes(1);
    step(10000); expect(draw.mock.calls.at(-1)[0]).toBe(.05);
    loop.dispose(); expect(callbacks.size).toBe(0); loop.start(); expect(callbacks.size).toBe(0);
  });
  it("draws body and tail independently, balances transform stacks and bounds plant draw work", () => {
    let depth = 0;
    const ctx = { clearRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(), transform: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), ellipse: vi.fn(), stroke: vi.fn(), save: () => depth++, restore: () => depth-- };
    const images = Object.fromEntries(["water", "fish-body", "tail", "ribbon-plant", "broad-plant", "pebbles", "blue-fish-body", "blue-fish-tail", "fan-coral", "branch-coral", "shell", "sea-snail", "bubble-sprite"].map(id => [id, { id, width: 512, height: 347 }]));
    renderAquarium(ctx, images, { height: 650, time: 15 });
    const bodyDraws = ctx.drawImage.mock.calls.filter(([image]) => image.id === "fish-body");
    const tailDraws = ctx.drawImage.mock.calls.filter(([image]) => image.id === "tail");
    expect(bodyDraws).toHaveLength(2); expect(tailDraws).toHaveLength(2);
    expect(ctx.drawImage.mock.calls.filter(([image]) => image.id === "blue-fish-body")).toHaveLength(2);
    expect(ctx.drawImage.mock.calls.filter(([image]) => image.id === "blue-fish-tail")).toHaveLength(2);
    expect(ctx.drawImage.mock.calls.filter(([image]) => image.id === "bubble-sprite")).toHaveLength(14);
    for (const id of ["fan-coral", "branch-coral", "shell", "sea-snail"]) expect(ctx.drawImage.mock.calls.some(([image]) => image.id === id)).toBe(true);
    expect(ctx.drawImage.mock.calls.length).toBeLessThan(36); // bounded props + cached geometric bubble sprites
    expect(depth).toBe(0);
  });
  it("keeps bubbles away from metric copy and smoothly fades their wrap at the surface", () => {
    for (const height of [480, 800, 1080]) for (let time = 0; time < 120; time += .41) for (let index = 0; index < 14; index++) {
      const p = bubblePose(time, index, height);
      expect(p.x).toBeGreaterThanOrEqual(440); expect(p.x).toBeLessThanOrEqual(920);
      expect(p.y).toBeGreaterThanOrEqual(height * .12); expect(p.y).toBeLessThanOrEqual(height * .87);
      expect(p.radius).toBeGreaterThan(0); expect(p.radius).toBeLessThan(24);
      expect(p.alpha).toBeGreaterThanOrEqual(0); expect(p.alpha).toBeLessThanOrEqual(.9);
    }
    expect(bubblePose(0, 0, 800).alpha).toBe(0);
  });
  it("prepares reflection and transparent interior on a small reusable sprite", () => {
    const gradient = { addColorStop: vi.fn() };
    const ctx = { setTransform: vi.fn(), createRadialGradient: vi.fn(() => gradient), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn() };
    const canvas = { getContext: () => ctx };
    expect(createBubbleSprite(canvas)).toBe(canvas);
    expect(canvas.width).toBe(64); expect(canvas.height).toBe(64);
    expect(ctx.createRadialGradient).toHaveBeenCalledOnce(); expect(gradient.addColorStop).toHaveBeenCalledTimes(4);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
  });
});
