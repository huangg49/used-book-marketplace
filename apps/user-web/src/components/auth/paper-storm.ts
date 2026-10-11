export type PaperOrigin = { x: number; y: number; width: number; height: number };
export type StormPhase = "stamp" | "tear" | "storm" | "covered" | "reveal";
export type StormMode = "desktop" | "mobile" | "reduced";
export const stormTiming = (mode: StormMode) => mode === "reduced"
  ? { tear: 80, burst: 80, cover: 200, reveal: 200, end: 440 }
  : mode === "mobile"
    ? { tear: 280, burst: 430, cover: 820, reveal: 820, end: 1500 }
    : { tear: 280, burst: 450, cover: 900, reveal: 900, end: 1600 };
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => 1 - (1 - clamp(n)) ** 3;
/** Motion time never pauses. Release time is independently gated by destination readiness. */
export function stormFrame(time: number, mode: StormMode, releaseTime = Math.max(0, time - stormTiming(mode).reveal)) {
  const t = stormTiming(mode), release = clamp(releaseTime / (t.end - t.reveal));
  return {
    phase: (time < t.tear ? "stamp" : time < t.burst ? "tear" : time < t.cover ? "storm" : release === 0 ? "covered" : "reveal") as StormPhase,
    tear: ease((time - t.tear) / (t.burst - t.tear)),
    spread: clamp((time - t.burst) / (t.cover - t.burst)),
    cover: mode === "reduced" ? clamp((time - 80) / 120) : clamp((time - (t.burst + 80)) / (t.cover - t.burst - 80)),
    release,
  };
}
/** The curved perimeter stays outside this solid rectangular core at full coverage. */
export function coverSheetBounds(width: number, height: number, time: number, mode: StormMode, releaseTime = 0) {
  const f = stormFrame(time, mode, releaseTime), travel = ease(f.cover);
  const drift = Math.sin((time - stormTiming(mode).cover) / 650) * .035;
  const x = width * (-3 + 2.4 * travel + drift * travel + f.release * 3.2);
  const y = height * (1.6 - 2.2 * travel - drift * travel - f.release * 2.4);
  const w = width * 2.2, h = height * 2.2;
  return { x, y, width: w, height: h,
    covers: x + w * .12 <= 0 && y + h * .12 <= 0 && x + w * .88 >= width && y + h * .88 >= height };
}
function createPaperPath() {
const paperPath = new Path2D();
paperPath.moveTo(.07, .04); paperPath.bezierCurveTo(.37, .015, .74, .08, .94, .04);
paperPath.bezierCurveTo(.985, .34, .92, .65, .96, .93);
paperPath.bezierCurveTo(.66, .985, .38, .91, .06, .96);
paperPath.bezierCurveTo(.015, .67, .085, .31, .07, .04); paperPath.closePath();
return paperPath;
}

/** Cached fragments; only the three large page silhouettes are drawn as vector paths. */
export function createStormPainter(canvas: HTMLCanvasElement, origin: PaperOrigin, mode: StormMode, palette: string[]) {
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  const paperPath = createPaperPath();
  const mobile = mode === "mobile", count = mode === "reduced" ? 0 : mobile ? 18 : 30;
  let width = 0, height = 0;
  const texture = new Image(); texture.src = "/login-art/ivory-paper.webp";
  let grain: CanvasPattern | null = null;
  texture.onload = () => { grain = ctx.createPattern(texture, "repeat"); };
  const sprites = Array.from({ length: 12 }, (_, i) => {
    const sprite = document.createElement("canvas"); sprite.width = 384; sprite.height = 320;
    const s = sprite.getContext("2d")!; s.scale(1.6, 1.6);
    s.filter = i >= 8 ? `blur(${mobile ? .6 : 1}px)` : "none";
    s.fillStyle = i % 7 === 0 ? palette[2]! : palette[i % 2]!;
    s.shadowColor = `${palette[3]}14`; s.shadowOffsetY = 3; s.shadowBlur = 5;
    s.beginPath();
    switch (i % 4) {
      case 0: s.moveTo(28, 30); s.bezierCurveTo(85, 19, 145, 39, 204, 28); s.lineTo(192, 154); s.lineTo(164, 150); s.lineTo(158, 155); s.lineTo(118, 150); s.lineTo(110, 156); s.lineTo(31, 146); break;
      case 1: s.moveTo(32, 82); s.bezierCurveTo(90, 55, 155, 107, 207, 72); s.lineTo(201, 111); s.bezierCurveTo(151, 147, 96, 95, 34, 116); break;
      case 2: s.moveTo(53, 31); s.lineTo(182, 50); s.lineTo(195, 137); s.lineTo(150, 123); s.lineTo(116, 146); s.lineTo(106, 129); s.lineTo(59, 142); break;
      default: s.moveTo(85, 26); s.bezierCurveTo(68, 74, 105, 104, 80, 165); s.lineTo(121, 169); s.bezierCurveTo(144, 116, 111, 73, 136, 30);
    }
    s.closePath(); s.fill(); s.shadowBlur = 0;
    // A few faint ink traces, not a repeated block of printed text.
    if (i % 3 === 0) { s.globalAlpha = .09; s.strokeStyle = palette[3]!; s.lineWidth = .7;
      for (let j = 0; j < 2 + i % 2; j++) { s.beginPath(); s.moveTo(56, 62 + j * 14); s.lineTo(127 + j * 8, 65 + j * 14); s.stroke(); } }
    return sprite;
  });
  function resize() {
    width = innerWidth; height = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  const edgeShade = ctx.createLinearGradient(.78, 0, 1, 0);
  edgeShade.addColorStop(0, `${palette[3]}00`); edgeShade.addColorStop(1, `${palette[3]}0c`);
  function page(x: number, y: number, w: number, h: number, color: string, fold: number, angle = 0) {
    ctx!.save(); ctx!.translate(x, y); ctx!.rotate(angle); ctx!.scale(w, h);
    ctx!.fillStyle = color; ctx!.fill(paperPath);
    ctx!.fillStyle = edgeShade; ctx!.fill(paperPath);
    // Surface texture is the existing paper asset, clipped to the opaque page.
    if (grain) { ctx!.save(); ctx!.clip(paperPath); ctx!.scale(1 / w, 1 / h); ctx!.globalAlpha = .14; ctx!.fillStyle = grain; ctx!.fillRect(0, 0, w, h); ctx!.restore(); }
    ctx!.globalAlpha = .09; ctx!.strokeStyle = palette[3]!; ctx!.lineWidth = .0009;
    ctx!.beginPath(); ctx!.moveTo(.08, .08 + fold); ctx!.bezierCurveTo(.3, .045 + fold, .6, .12 + fold, .94, .07 + fold); ctx!.stroke();
    ctx!.globalAlpha = .05; ctx!.beginPath(); ctx!.moveTo(.12, .09 + fold); ctx!.bezierCurveTo(.37, .06 + fold, .73, .145 + fold, .93, .09 + fold); ctx!.stroke();
    ctx!.restore();
  }
  return { resize, count, dispose: () => { texture.onload = null; }, draw(time: number, releaseTime = 0) {
    const f = stormFrame(time, mode, releaseTime);
    ctx.clearRect(0, 0, width, height);
    if (mode === "reduced") { ctx.globalAlpha = f.cover * (1 - f.release); ctx.fillStyle = palette[0]!; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1; return; }
    if (time < stormTiming(mode).burst) return;
    const b = coverSheetBounds(width, height, time, mode, releaseTime);
    // Solid page, not a fade to a blank color. Its core guarantees occlusion.
    page(b.x, b.y, b.width, b.height, palette[1]!, .14);
    const flow = (time - stormTiming(mode).burst) / 1000;
    for (let i = 0; i < 2; i++) {
      const lag = i * .14, enter = ease(clamp((f.cover - lag) / (1 - lag)));
      const offset = Math.sin(flow * 1.8 + i) * .045;
      page(width * (-2.7 + enter * (2.15 + i * .5) + offset + f.release * (3.4 + i * .4)),
        height * (1.7 - enter * 2.05 - offset - f.release * (2.6 + i * .3)), width * 1.05, height * 1.65,
        palette[i % 2]!, .34 + i * .11, -.16 - i * .1);
    }
    const cx = origin.x + origin.width / 2, cy = origin.y + origin.height * .45;
    for (let i = 0; i < count; i++) {
      const depth = i / (count - 1), u = (time - stormTiming(mode).burst - (i % 6) * 18) / (mobile ? 950 : 1100);
      if (u < 0 || u > 1.5) continue;
      const sway = Math.sin(u * 5 + i * 1.9);
      const lane = ((i * 17) % 19 / 19 - .5);
      const x = cx + width * (u * 1.25 - .18 * Math.sin(u * Math.PI)) + lane * width * .35 * u;
      const y = cy - height * (u * .95) + sway * height * (.055 + depth * .04) * Math.min(u * 3, 1) + lane * height * .2;
      const size = (mobile ? 26 : 32) + depth ** 2 * (mobile ? 135 : 220);
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.25 + lane * .8 + u * (.3 + depth) + sway * .13);
      ctx.scale(1, .78 + Math.cos(u * 3 + i) * .12);
      ctx.globalAlpha = clamp((1.5 - u) * 5);
      ctx.drawImage(sprites[Math.floor(depth * 2.99) * 4 + i % 4]!, -size / 2, -size * .4, size, size * .8); ctx.restore();
    }
    ctx.globalAlpha = 1;
  } };
}

type Clock = { request: (callback: FrameRequestCallback) => number; cancel: (id: number) => void; now: () => number };
type StormDriver = { draw: (time: number, releaseTime: number) => void; covered: () => Promise<void>; done: () => void; failed: () => void };
/** Navigation readiness gates release, never the animation loop or its motion clock. */
export function runPaperStorm(mode: StormMode, driver: StormDriver, clock: Clock = {
  request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id), now: () => performance.now(),
}) {
  const timing = stormTiming(mode), started = clock.now();
  let frame = 0, cancelled = false, coveragePainted = false, committed = false, releaseAt: number | null = null;
  function tick(now: number) {
    if (cancelled) return;
    const time = now - started;
    if (!coveragePainted && time >= timing.cover) {
      driver.draw(timing.cover, 0); coveragePainted = true;
    } else {
      // This later rAF follows an opaque paint; keep drawing while navigate awaits.
      if (coveragePainted && !committed) {
        committed = true;
        void driver.covered().then(() => {
          if (!cancelled) releaseAt = Math.max(timing.reveal, clock.now() - started);
        }).catch(() => { if (!cancelled) { cancelled = true; clock.cancel(frame); driver.failed(); } });
      }
      const releaseTime = releaseAt === null ? 0 : Math.max(0, time - releaseAt);
      driver.draw(time, releaseTime);
      if (releaseAt !== null && releaseTime >= timing.end - timing.reveal) { cancelled = true; driver.done(); return; }
    }
    frame = clock.request(tick);
  }
  frame = clock.request(tick);
  return () => { cancelled = true; clock.cancel(frame); };
}
