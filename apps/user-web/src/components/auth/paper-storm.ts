export type PaperOrigin = { x: number; y: number; width: number; height: number };
export type StormPhase = "stamp" | "tear" | "storm" | "covered" | "reveal";
export type StormMode = "desktop" | "mobile" | "reduced";
export const stormTiming = (mode: StormMode) => mode === "reduced"
  ? { tear: 80, burst: 80, cover: 200, reveal: 240, end: 440 }
  : mode === "mobile"
    ? { tear: 280, burst: 480, cover: 850, reveal: 1000, end: 1600 }
    : { tear: 350, burst: 600, cover: 1050, reveal: 1220, end: 1850 };

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => 1 - (1 - clamp(n)) ** 3;
export function stormFrame(time: number, mode: StormMode) {
  const t = stormTiming(mode);
  return {
    phase: (time < t.tear ? "stamp" : time < t.burst ? "tear" : time < t.cover ? "storm" : time < t.reveal ? "covered" : "reveal") as StormPhase,
    tear: ease((time - t.tear) / (t.burst - t.tear)),
    spread: ease((time - t.burst) / (t.cover - t.burst)),
    // Fully opaque before navigation; never infer coverage from random particles.
    cover: mode === "reduced" ? clamp((time - 80) / 120) : clamp((time - (t.cover - 180)) / 180),
    release: ease((time - t.reveal) / (t.end - t.reveal)),
  };
}

/** Small, pre-rendered paper sprites; no per-frame text, shadows or blur. */
export function createStormPainter(canvas: HTMLCanvasElement, origin: PaperOrigin, mode: StormMode, palette: string[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const mobile = mode === "mobile";
  const count = mode === "reduced" ? 0 : mobile ? 36 : 68;
  let width = 0, height = 0;
  const sprites = Array.from({ length: 12 }, (_, i) => {
    const sprite = document.createElement("canvas");
    sprite.width = 220; sprite.height = 180;
    const s = sprite.getContext("2d")!;
    const near = i >= 8;
    // Blur is baked into four foreground sprites once, capped on phones.
    s.filter = near ? `blur(${mobile ? 1 : 2}px)` : "none";
    s.fillStyle = palette[i % palette.length]!;
    s.shadowColor = palette[3]!; s.shadowOffsetY = 6; s.shadowBlur = 8;
    s.beginPath();
    if (i % 3 === 0) {
      s.moveTo(24, 24); s.lineTo(192, 30); s.lineTo(184, 142);
      s.lineTo(156, 148); s.lineTo(139, 137); s.lineTo(116, 148); s.lineTo(94, 139); s.lineTo(71, 148); s.lineTo(28, 138);
    } else if (i % 3 === 1) {
      s.moveTo(22, 48); s.lineTo(194, 36); s.lineTo(186, 106);
      s.lineTo(150, 114); s.lineTo(122, 106); s.lineTo(96, 118); s.lineTo(26, 108);
    } else {
      s.moveTo(46, 22); s.lineTo(170, 32); s.lineTo(186, 138);
      s.lineTo(152, 149); s.lineTo(129, 138); s.lineTo(82, 146); s.lineTo(36, 128);
    }
    s.closePath(); s.fill(); s.shadowBlur = 0;
    s.globalAlpha = .16; s.strokeStyle = palette[(i % palette.length === 3) ? 0 : 3]!;
    s.lineWidth = 1.5;
    for (let line = 0; line < 4; line++) {
      s.beginPath(); s.moveTo(49, 58 + line * 13); s.lineTo(line === 3 ? 128 : 161, 58 + line * 13); s.stroke();
    }
    return sprite;
  });
  // Deterministic layers keep far fragments behind the larger near fragments.
  const pieces = Array.from({ length: count }, (_, i) => {
    const depth = i / Math.max(1, count - 1);
    return { depth, angle: i * 2.399963, turn: (i % 2 ? -1 : 1) * (1.2 + depth),
      sprite: sprites[Math.floor(depth * 2.99) * 4 + i % 4]!,
      size: (mobile ? 44 : 54) + depth ** 2 * (mobile ? 170 : 300),
      reach: .32 + ((i * 17) % 31) / 31 * .68,
    };
  });
  function resize() {
    width = window.innerWidth; height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  return { resize, count, draw(time: number) {
    const f = stormFrame(time, mode);
    ctx.clearRect(0, 0, width, height);
    // Coverage is a dedicated solid sheet, independent of density and viewport.
    ctx.globalAlpha = f.cover * (1 - f.release);
    ctx.fillStyle = palette[0]!; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    if (mode === "reduced" || time < stormTiming(mode).burst) return;
    const cx = origin.x + origin.width / 2, cy = origin.y + origin.height / 2;
    const radius = Math.hypot(width, height) * .72;
    for (const p of pieces) {
      const progress = f.spread;
      const angle = p.angle + progress * .7 * p.turn + f.release * p.turn;
      const distance = progress * radius * p.reach + f.release * radius * (1 + p.depth);
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance * .8;
      const size = p.size * (.2 + progress * 1.4 + f.release * .3);
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + p.turn * progress);
      ctx.scale(1, .65 + Math.abs(Math.cos(angle + progress * 3)) * .35);
      ctx.globalAlpha = 1 - f.release;
      ctx.drawImage(p.sprite, -size / 2, -size * .4, size, size * .8);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } };
}

type Clock = { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void; now: () => number };
type StormDriver = { draw: (time: number) => void; covered: () => Promise<void>; done: () => void; failed: () => void };
/** Draw an opaque frame, keep it through route commit, then release on later frames. */
export function runPaperStorm(mode: StormMode, driver: StormDriver, clock: Clock = {
  request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id), now: () => performance.now(),
}) {
  const timing = stormTiming(mode), started = clock.now();
  let frame = 0, cancelled = false, covered = false, ready = false, pause = 0, coverAt = 0;
  function tick(now: number) {
    if (cancelled) return;
    const time = now - started - pause;
    if (!covered && time >= timing.cover) {
      covered = true; coverAt = now;
      driver.draw(timing.cover);
      // The previous opaque draw must reach a paint before any route mutation.
      frame = clock.request(() => {
        if (cancelled) return;
        void driver.covered().then(() => {
          if (cancelled) return;
          pause = clock.now() - coverAt;
          ready = true;
          frame = clock.request(tick);
        }).catch(() => { if (!cancelled) { cancelled = true; driver.failed(); } });
      });
      return;
    }
    driver.draw(covered && !ready ? timing.cover : time);
    if (time >= timing.end) { cancelled = true; driver.done(); return; }
    frame = clock.request(tick);
  }
  frame = clock.request(tick);
  return () => { cancelled = true; clock.cancel(frame); };
}
