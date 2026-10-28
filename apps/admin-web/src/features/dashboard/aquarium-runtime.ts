import { createBubbleSprite, createFrameLoop, renderAquarium } from "./aquarium-scene.mjs";
type Images = Record<string, HTMLImageElement | HTMLCanvasElement>;
type FrameLoop = { start(): void; pause(): void; dispose(): void };
export type AquariumRenderer = {
  createFrameLoop(options: { request(callback: FrameRequestCallback): number; cancel(id: number): void; draw(delta: number): void }): FrameLoop;
  renderAquarium(ctx: CanvasRenderingContext2D, images: Images, frame: { height: number; time: number }): void;
};

const assetNames = ["fish-body", "tail", "ribbon-plant", "broad-plant", "pebbles", "water"];
const detailNames = ["blue-fish-body", "blue-fish-tail", "fan-coral", "branch-coral", "shell", "sea-snail"];
export const aquariumBase = `${import.meta.env.BASE_URL}design/aquarium/`;
export const oceanDetailsBase = `${import.meta.env.BASE_URL}ecosystems/details-v2/`;

// The approved study remains a frozen standalone reference. The application
// renderer lives with the lazy Dashboard feature; the six images stay shared.
export async function loadAquarium(): Promise<{ renderer: AquariumRenderer; images: Images }> {
  const entries = await Promise.all([...assetNames, ...detailNames].map(async name => {
      const image = new Image();
      image.src = `${detailNames.includes(name) ? oceanDetailsBase : `${aquariumBase}assets/`}${name}.webp`;
      await image.decode();
      return [name, image] as const;
    }));
  return { renderer: { createFrameLoop, renderAquarium } as AquariumRenderer, images: {
    ...Object.fromEntries(entries), "bubble-sprite": createBubbleSprite(document.createElement("canvas")),
  } };
}

export function mountAquarium(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  ready: (value: boolean) => void,
  load = loadAquarium,
) {
  let disposed = false, paused = false, onscreen = false, time = 0;
  let focused = document.hasFocus(), pageVisible = true;
  let loop: FrameLoop | undefined;
  let frame = () => {};
  let resize = () => {};
  let loading = false, failed = false;
  const update = () => {
    if (!disposed && !paused && onscreen && focused && pageVisible && !document.hidden) loop?.start();
    else loop?.pause();
  };
  const fail = () => {
    failed = true;
    loop?.dispose();
    delete stage.dataset.aquariumReady;
    if (!disposed) ready(false);
  };
  async function boot() {
    if (disposed || loading) return;
    loading = true;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx || typeof requestAnimationFrame !== "function") return;
      const { renderer, images } = await load();
      if (disposed) return;
      let height = 800;
      frame = () => {
        try { renderer.renderAquarium(ctx, images, { height, time }); }
        catch { fail(); }
      };
      loop = renderer.createFrameLoop({
        request: callback => requestAnimationFrame(callback),
        cancel: id => cancelAnimationFrame(id),
        draw: delta => { time += delta; frame(); },
      });
      resize = () => {
        const bounds = stage.getBoundingClientRect();
        if (!bounds.width || !bounds.height) { loop?.pause(); return; }
        const ratio = bounds.width / 1000;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(bounds.width * dpr);
        canvas.height = Math.round(bounds.height * dpr);
        ctx.setTransform(dpr * ratio, 0, 0, dpr * ratio, 0, 0);
        height = bounds.height / ratio;
        frame(); update();
      };
      resize();
      if (disposed || failed) return;
      stage.dataset.aquariumReady = "true";
      ready(true);
      update();
    } catch { fail(); }
  }
  const boundsVisible = () => {
    const box = stage.getBoundingClientRect();
    onscreen = box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;
    if (onscreen) void boot();
    update();
  };
  const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
    onscreen = entries.some(entry => entry.isIntersecting);
    if (onscreen) void boot();
    update();
  }) : null;
  observer?.observe(stage);
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(() => resize()) : null;
  resizeObserver?.observe(stage);
  const onResize = () => { resize(); if (!observer) boundsVisible(); };
  const blur = () => { focused = false; update(); };
  const focus = () => { focused = true; update(); };
  const hide = () => { pageVisible = false; update(); };
  const show = () => { pageVisible = true; focused = document.hasFocus(); resize(); update(); };
  window.addEventListener("resize", onResize);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  document.addEventListener("visibilitychange", update);
  if (!observer) window.addEventListener("scroll", boundsVisible, { passive: true, capture: true });
  boundsVisible();
  return {
    pause(value: boolean) { paused = value; update(); },
    dispose() {
      disposed = true; loop?.dispose(); observer?.disconnect(); resizeObserver?.disconnect();
      delete stage.dataset.aquariumReady;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", blur); window.removeEventListener("focus", focus);
      window.removeEventListener("pagehide", hide); window.removeEventListener("pageshow", show);
      window.removeEventListener("scroll", boundsVisible, true);
      document.removeEventListener("visibilitychange", update);
    },
  };
}
