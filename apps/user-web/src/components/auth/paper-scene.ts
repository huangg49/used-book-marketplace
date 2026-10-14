import { coverSheetBounds, paperHold, stormFrame, stormTiming, type PaperOrigin, type StormMode, type ComposedScene } from "./paper-storm";
import styles from "./PaperStormLayout.module.css";

const svgNS = "http://www.w3.org/2000/svg";
const outline = "M70 40C370 15 740 80 940 40C985 340 920 650 960 930C660 985 380 910 60 960C15 670 85 310 70 40Z";
const fragmentPaths = [
  "M28 30C85 19 145 39 204 28L192 154 164 150 158 155 118 150 110 156 31 146Z",
  "M32 82C90 55 155 107 207 72L201 111C151 147 96 95 34 116Z",
  "M53 31L182 50 195 137 150 123 116 146 106 129 59 142Z",
  "M85 26C68 74 105 104 80 165L121 169C144 116 111 73 136 30Z",
];
const spriteCache = new Map<string, string[]>();
let surfaceId = 0;
function svgNode(name: string, attributes: Record<string, string>) {
  const node = document.createElementNS(svgNS, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function sprites(mode: StormMode, palette: string[]) {
  const key = `${mode}:${palette.join()}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  // Encoded vector sources are tiny; no viewport-sized bitmap cache is allocated.
  const urls = fragmentPaths.flatMap((_, depth) => Array.from({ length: 3 }, (_, tone) => ({ depth, tone })))
    .map(({ depth, tone }, index) => {
      const color = index % 7 === 0 ? palette[2] : palette[index % 2];
      const blur = tone === 2 ? (mode === "mobile" ? .6 : 1) : 0;
      const lines = index % 3 === 0 ? `<path d="M56 62L127 65M56 76L135 79" stroke="${palette[3]}" stroke-width=".7" opacity=".09"/>` : "";
      return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="${svgNS}" viewBox="0 0 240 200" width="384" height="320"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="${palette[3]}" flood-opacity=".08"/><feGaussianBlur stdDeviation="${blur}"/></filter></defs><g filter="url(#s)"><path d="${fragmentPaths[depth]}" fill="${color}"/>${lines}</g></svg>`)}`;
    });
  // Only the current desktop/mobile recipes are retained, even if a theme changes.
  if (spriteCache.size >= 2) spriteCache.clear();
  spriteCache.set(key, urls);
  return urls;
}

/** Called on Auth entry, before successful login; decoding does not delay auth. */
export function warmPaperScene(mode: StormMode, palette: string[]) {
  const texture = new Image(); texture.src = "/login-art/ivory-paper.webp";
  void texture.decode().catch(() => {});
  for (const url of sprites(mode, palette)) {
    const image = new Image(); image.src = url;
    void image.decode().catch(() => {});
  }
}

function material(color: string, wine: string, fold: number, width: number, height: number) {
  const id = `journey-paper-${++surfaceId}`;
  const svg = svgNode("svg", { viewBox: "0 0 1000 1000", preserveAspectRatio: "none", "aria-hidden": "true" });
  const defs = svgNode("defs", {});
  const shade = svgNode("linearGradient", { id: `${id}-shade`, x1: "78%", x2: "100%", y1: "0%", y2: "0%" });
  shade.append(svgNode("stop", { offset: "0", "stop-color": wine, "stop-opacity": "0" }), svgNode("stop", { offset: "1", "stop-color": wine, "stop-opacity": ".047" }));
  const pattern = svgNode("pattern", { id: `${id}-grain`, patternUnits: "userSpaceOnUse", width: String(256000 / width), height: String(256000 / height) });
  pattern.append(svgNode("image", { href: "/login-art/ivory-paper.webp", width: String(256000 / width), height: String(256000 / height), preserveAspectRatio: "none", opacity: ".14" }));
  defs.append(shade, pattern); svg.append(defs);
  for (const fill of [color, `url(#${id}-shade)`, `url(#${id}-grain)`]) svg.append(svgNode("path", { d: outline, fill }));
  for (const [offset, opacity] of [[0, .09], [20, .05]]) {
    const f = fold * 1000 + offset!;
    svg.append(svgNode("path", { d: `M80 ${80 + f}C300 ${45 + f} 600 ${120 + f} 940 ${70 + f}`, fill: "none", stroke: wine, "stroke-width": ".9", opacity: String(opacity) }));
  }
  return svg;
}

function position(index: number, time: number, mode: StormMode) {
  if (index === 0) {
    const b = coverSheetBounds(1, 1, time, mode);
    return { x: b.x, y: b.y, angle: 0 };
  }
  const i = index - 1, f = stormFrame(time, mode, 0);
  const u = Math.max(0, Math.min(1, (f.cover - i * .14) / (1 - i * .14)));
  const enter = 1 - (1 - u) ** 3;
  const offset = Math.sin((time - stormTiming(mode).burst) / 1000 * 1.8 + i) * .045;
  return { x: -2.7 + enter * (2.15 + i * .5) + offset, y: 1.7 - enter * 2.05 - offset, angle: (-.16 - i * .1) * 180 / Math.PI };
}
const transform = (x: number, y: number, angle = 0) => `translate3d(${x * 100}vw,${y * 100}vh,0) rotate(${angle}deg)`;

/** Visible motion is scheduled once in WAAPI, not repainted by a JS frame loop. */
export function createPaperScene(root: HTMLElement, origin: PaperOrigin, mode: StormMode, palette: string[], copies: HTMLElement[], source: HTMLElement | null,
  options: { externalOnly?: boolean; schedule?: { burst: number; cover: number; release: number } } = {}): ComposedScene | null {
  if (typeof root.animate !== "function") return null;
  const timing = stormTiming(mode), animations: Animation[] = [];
  const entryDelay = options.schedule?.burst ?? timing.burst, coveredAt = options.schedule?.cover ?? timing.cover;
  const pages: { element: HTMLElement; base: ReturnType<typeof position> }[] = [];
  const play = (node: Element, frames: Keyframe[], options: KeyframeAnimationOptions) => {
    const animation = node.animate(frames, { fill: "both", ...options });
    animations.push(animation);
    // Cancellation is an expected outcome of Back/unmount.
    void animation.finished.catch(() => {});
    return animation;
  };
  for (let index = 0; index < 3; index++) {
    const page = document.createElement("div"), surface = document.createElement("div");
    page.className = styles.sheet!; surface.className = styles.surface!;
    const w = index === 0 ? 2.2 : 1.05, h = index === 0 ? 2.2 : 1.65;
    page.style.width = `${w * 100}vw`; page.style.height = `${h * 100}vh`;
    surface.append(material(palette[index === 0 ? 1 : (index - 1) % 2]!, palette[3]!, index === 0 ? .14 : .34 + (index - 1) * .11, innerWidth * w, innerHeight * h));
    page.append(surface); root.append(page);
    pages.push({ element: page, base: position(index, timing.cover, mode) });
  }
  const urls = options.externalOnly ? [] : sprites(mode, palette), count = options.externalOnly ? 0 : mode === "mobile" ? 18 : 30;
  const pieces = Array.from({ length: count }, (_, index) => {
    const depth = index / (count - 1), image = document.createElement("img");
    image.className = styles.piece!; image.alt = ""; image.draggable = false;
    image.src = urls[(index % 4) * 3 + Math.floor(depth * 2.99)]!;
    const size = (mode === "mobile" ? 26 : 32) + depth ** 2 * (mode === "mobile" ? 135 : 220);
    image.style.width = `${size}px`; image.style.height = `${size * .8}px`;
    root.append(image);
    return { image, size, depth, index };
  });
  return {
    count,
    async enter() {
      copies.forEach((copy, index) => {
        copy.style.display = "block";
        const sign = index === 0 ? -1 : 1;
        play(copy, [{ transform: "translate3d(0,0,0) rotate(0deg)", opacity: 0 },
          { transform: "translate3d(0,0,0) rotate(0deg)", opacity: 1, offset: .001 },
          { transform: `translate3d(${sign * 3}px,-3px,0) rotate(${sign * .6}deg) rotateX(3deg)`, opacity: 1, offset: .10 },
          { transform: `translate3d(${sign * 12}px,-6px,0) rotate(${sign * 1.8}deg) rotateX(5deg)`, opacity: 1, offset: .25 },
          { transform: `translate3d(${sign * 12 + 34}px,-48px,0) rotate(${sign * 1.8 - 3}deg)`, opacity: 0 }],
        { delay: timing.tear, duration: timing.cover - timing.tear, easing: "ease-out" });
      });
      // Visibility switches discretely at the tear; it does not drive the flight.
      if (source) play(source, [{ visibility: "visible" }, { visibility: "hidden", offset: .001 }, { visibility: "hidden" }], { delay: timing.tear, duration: 1 });
      let covered: Promise<Animation> | undefined;
      pages.forEach(({ element }, index) => {
        const frames = Array.from({ length: 33 }, (_, key) => {
          const p = position(index, timing.burst + (timing.cover - timing.burst) * key / 32, mode);
          return { transform: transform(p.x, p.y, p.angle) };
        });
        const entry = play(element, frames, { delay: entryDelay, duration: coveredAt - entryDelay, easing: "linear" });
        if (index === 0) covered = entry.finished;
        // This delayed native loop is already scheduled before React mounts Home.
        // It starts even if JS is temporarily busy at the coverage boundary.
        const period = paperHold(index, 0, mode).period;
        play(element.firstElementChild!, Array.from({ length: 33 }, (_, key) => {
          const drift = paperHold(index, key / 32 * period, mode);
          return { transform: transform(drift.x, drift.y) };
        }), { delay: coveredAt, duration: period, iterations: Infinity, easing: "linear" });
      });
      pieces.forEach(({ image, size, depth, index }) => {
        const lane = ((index * 17) % 19 / 19 - .5);
        const duration = (mode === "mobile" ? 950 : 1100) * 1.5;
        play(image, Array.from({ length: 41 }, (_, key) => {
          const u = key / 40 * 1.5, sway = Math.sin(u * 5 + index * 1.9);
          const x = origin.x + origin.width / 2 - size / 2 + innerWidth * (u * 1.25 - .18 * Math.sin(u * Math.PI) + lane * .35 * u);
          const y = origin.y + origin.height * .45 - size * .4 - innerHeight * u * .95 + sway * innerHeight * (.055 + depth * .04) * Math.min(u * 3, 1) + lane * innerHeight * .2;
          const angle = (-.25 + lane * .8 + u * (.3 + depth) + sway * .13) * 180 / Math.PI;
          return { transform: `translate3d(${x}px,${y}px,0) rotate(${angle}deg) scaleY(${.78 + Math.cos(u * 3 + index) * .12})`, opacity: key === 0 ? 0 : Math.max(0, Math.min(1, (1.5 - u) * 5)) };
        }), { delay: timing.burst + index % 6 * 18, duration, easing: "linear" });
      });
      await covered;
    },
    async release() {
      const completed = pages.map(({ element, base }, index) => play(element,
        [{ transform: transform(base.x, base.y, base.angle) },
          { transform: transform(base.x + (index === 0 ? 3.2 : 3.4 + (index - 1) * .4), base.y - (index === 0 ? 2.4 : 2.6 + (index - 1) * .3), base.angle) }],
        { duration: options.schedule?.release ?? timing.end - timing.reveal, easing: "cubic-bezier(.18,.12,.3,1)" }).finished);
      await Promise.all(completed);
    },
    dispose() { animations.forEach(animation => animation.cancel()); root.replaceChildren(); },
  };
}
