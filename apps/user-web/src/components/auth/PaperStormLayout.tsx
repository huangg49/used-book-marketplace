import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { createStormPainter, runPaperStorm, stormFrame, type PaperOrigin, type StormMode } from "./paper-storm";
import styles from "./PaperStormLayout.module.css";
import { JourneyContext } from "./paper-journey";

type Journey = { target: string; source: HTMLElement | null; from: string; resolve: () => void; committed: boolean };
function afterPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

/** The overlay outlives AuthLayout so the destination mounts behind solid paper. */
export function PaperStormLayout() {
  const location = useLocation(), navigate = useNavigate();
  const [journey, setJourney] = useState<Journey | null>(null);
  const current = useRef<Journey | null>(null), stop = useRef<() => void>(() => {});
  const content = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null), halves = useRef<HTMLDivElement>(null), fallback = useRef<HTMLDivElement>(null);
  function start(target: string, source: HTMLElement | null) {
    if (current.current) return Promise.resolve();
    const next = { target, source, from: location.key, committed: false, resolve: () => {} };
    const promise = new Promise<void>((resolve) => { next.resolve = resolve; });
    current.current = next; setJourney(next);
    return promise;
  }
  useLayoutEffect(() => {
    const run = current.current;
    if (!run || location.key === run.from) return;
    if (!run.committed || location.pathname + location.search !== run.target.split("#")[0]) {
      stop.current(); current.current = null; setJourney(null); run.resolve();
    }
  }, [location.key, location.pathname, location.search]);
  useLayoutEffect(() => {
    if (!journey || !overlay.current || !canvas.current) return;
    const node = overlay.current, source = journey.source;
    const rect = source?.getBoundingClientRect();
    const origin: PaperOrigin = rect ?? { x: innerWidth / 2 - 120, y: innerHeight / 2 - 180, width: 240, height: 360 };
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let mode: StormMode = preference.matches ? "reduced" : innerWidth <= 600 ? "mobile" : "desktop";
    const rootStyle = getComputedStyle(document.documentElement);
    const palette = ["--shop-cream", "--shop-paper", "--shop-yellow", "--shop-wine"].map(name => rootStyle.getPropertyValue(name).trim());
    const painter = createStormPainter(canvas.current, origin, mode, palette);
    if (!painter) mode = "reduced";
    node.dataset.mode = mode; node.dataset.pieces = String(painter?.count ?? 0);
    const bodyOverflow = document.body.style.overflow;
    const bodyPadding = document.body.style.paddingRight;
    const gutter = innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (gutter) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`;
    const oldVisibility = source?.style.visibility ?? "";
    const sourceStyle = source ? getComputedStyle(source) : null;
    // Two inert local DOM copies carry the actual printed card into the tear.
    // No screenshot library, form serialization, network upload or persisted copy.
    const copies: HTMLElement[] = [];
    if (source && mode !== "reduced" && painter && halves.current) {
      for (let side = 0; side < 2; side++) {
        const holder = document.createElement("div"); holder.className = styles.half!;
        Object.assign(holder.style, { left: `${origin.x}px`, top: `${origin.y}px`, width: `${origin.width}px`, height: `${origin.height}px`,
          clipPath: side === 0 ? "polygon(0 0,51% 0,49% 9%,52% 18%,48% 29%,51% 40%,49% 52%,52% 63%,48% 74%,51% 86%,49% 100%,0 100%)"
            : "polygon(51% 0,100% 0,100% 100%,49% 100%,51% 86%,48% 74%,52% 63%,49% 52%,51% 40%,48% 29%,52% 18%,49% 9%)" });
        const copy = source.cloneNode(true) as HTMLElement;
        copy.inert = true; copy.setAttribute("aria-hidden", "true");
        copy.style.width = "100%"; copy.style.height = "100%"; copy.style.transform = "none"; copy.style.visibility = "visible";
        for (const name of ["--auth-title", "--auth-hand", "--auth-error"]) copy.style.setProperty(name, sourceStyle?.getPropertyValue(name) ?? "");
        copy.removeAttribute("data-auth-paper");
        for (const element of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
          element.removeAttribute("id"); element.removeAttribute("for");
          element.removeAttribute("data-front-light");
          if (element instanceof HTMLInputElement) {
            element.disabled = true;
            // A revealed password is type=text; never print it onto the tear copy.
            if (element.type === "password" || element.name === "password" || element.autocomplete.includes("password")) element.value = "";
          }
        }
        holder.append(copy); halves.current.append(holder); copies.push(holder);
      }
    }
    let cancelled = false, navigated = false;
    const restore = () => {
      if (source) source.style.visibility = oldVisibility;
      copies.forEach(copy => copy.remove());
      document.body.style.overflow = bodyOverflow; document.body.style.paddingRight = bodyPadding;
    };
    const finish = () => {
      if (cancelled) return;
      restore(); current.current = null; setJourney(null); journey.resolve();
      // Destination focus after controls become operable again.
      requestAnimationFrame(() => {
        if (!navigated) return;
        const heading = content.current?.querySelector<HTMLElement>("h1") ?? content.current?.querySelector<HTMLElement>("main");
        if (heading) { const previous = heading.getAttribute("tabindex"); heading.tabIndex = -1; heading.focus({ preventScroll: true });
          heading.addEventListener("blur", () => previous === null ? heading.removeAttribute("tabindex") : heading.setAttribute("tabindex", previous), { once: true }); }
      });
    };
    const commit = async () => {
      if (cancelled || navigated) return;
      navigated = true; journey.committed = true;
      await navigate(journey.target, { replace: true });
      if (journey.target.split(/[?#]/)[0] === "/") document.title = "Lật lại — Mua bán sách cũ";
      window.scrollTo({ top: 0, behavior: "instant" });
      await afterPaint();
    };
    let lastTime = 0;
    const draw = (time: number) => {
      lastTime = time;
      const f = stormFrame(time, mode);
      node.dataset.phase = f.phase;
      node.dataset.covered = f.cover === 1 && f.release === 0 ? "true" : "false";
      if (painter) painter.draw(time);
      else if (fallback.current) fallback.current.style.opacity = String(f.cover * (1 - f.release));
      if (source && mode !== "reduced" && copies.length) source.style.visibility = time >= (mode === "mobile" ? 280 : 350) ? "hidden" : oldVisibility;
      copies.forEach((copy, index) => {
        const sign = index === 0 ? -1 : 1;
        copy.style.visibility = f.phase === "stamp" || f.spread >= .8 ? "hidden" : "visible";
        copy.style.transform = `translate3d(${sign * (f.tear * 46 + f.spread * innerWidth * .5)}px, ${-f.tear * 18 - f.spread * innerHeight * .32}px, 0) rotate(${sign * (f.tear * 6 + f.spread * 30)}deg)`;
      });
    };
    const cancelAnimation = runPaperStorm(painter ? mode : "reduced", { draw, covered: commit, done: finish,
      failed: () => { void commit().finally(finish); } });
    const abort = () => { cancelled = true; cancelAnimation(); restore(); };
    stop.current = abort;
    const resize = () => { painter?.resize(); draw(lastTime); };
    window.addEventListener("resize", resize);
    // A hidden tab must not leave a successful login stuck behind suspended rAF.
    const visibility = () => {
      if (document.visibilityState !== "hidden") return;
      cancelAnimation(); draw(mode === "reduced" ? 200 : mode === "mobile" ? 850 : 1050);
      journey.committed = true; navigated = true;
      void Promise.resolve(navigate(journey.target, { replace: true })).finally(finish);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { abort(); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibility); };
  }, [journey, navigate]);
  useEffect(() => () => { stop.current(); current.current?.resolve(); }, []);
  return <JourneyContext.Provider value={start}>
    <div ref={content} className={styles.content} inert={Boolean(journey)} aria-hidden={journey ? true : undefined}><Outlet /></div>
    {journey && <div ref={overlay} className={styles.overlay} data-paper-storm>
      <div ref={fallback} className={styles.fallback} aria-hidden="true" />
      <div ref={halves} className={styles.halves} aria-hidden="true" />
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <p className={styles.status} role="status" aria-live="polite">Đăng nhập thành công. Đang mở trang tiếp theo…</p>
    </div>}
  </JourneyContext.Provider>;
}
