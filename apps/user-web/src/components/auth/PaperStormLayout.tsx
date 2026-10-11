import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { runPaperStorm, runComposedStorm, stormFrame, type PaperOrigin, type StormMode } from "./paper-storm";
import { createPaperScene, warmPaperScene } from "./paper-scene";
import styles from "./PaperStormLayout.module.css";
import { JourneyContext } from "./paper-journey";
import { lockPageScroll } from "../../lib/page-scroll";

type Journey = { target: string; source: HTMLElement | null; from: string; resolve: () => void; committed: boolean;
  mounted: boolean; onMounted?: () => void };
function afterPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
function paperPalette() {
  const style = getComputedStyle(document.documentElement);
  return ["--shop-cream", "--shop-paper", "--shop-yellow", "--shop-wine"].map(name => style.getPropertyValue(name).trim());
}

/** The overlay outlives AuthLayout so the destination mounts behind solid paper. */
export function PaperStormLayout() {
  const location = useLocation(), navigate = useNavigate();
  const [journey, setJourney] = useState<Journey | null>(null);
  const current = useRef<Journey | null>(null), stop = useRef<() => void>(() => {});
  const focusDestination = useRef(false);
  const content = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null);
  const sceneRoot = useRef<HTMLDivElement>(null), halves = useRef<HTMLDivElement>(null), fallback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (["/login", "/register", "/forgot-password"].includes(location.pathname)) {
      warmPaperScene(innerWidth <= 600 ? "mobile" : "desktop", paperPalette());
    }
  }, [location.pathname]);
  function start(target: string, source: HTMLElement | null) {
    if (current.current) return Promise.resolve();
    const next: Journey = { target, source, from: location.key, committed: false, mounted: false, resolve: () => {} };
    const promise = new Promise<void>((resolve) => { next.resolve = resolve; });
    current.current = next; setJourney(next);
    return promise;
  }
  useLayoutEffect(() => {
    // Focus only after React has removed inert/aria-hidden from the destination.
    if (journey || !focusDestination.current) return;
    focusDestination.current = false;
    const heading = content.current?.querySelector<HTMLElement>("h1") ?? content.current?.querySelector<HTMLElement>("main");
    if (!heading) return;
    const previous = heading.getAttribute("tabindex");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.addEventListener("blur", () => previous === null ? heading.removeAttribute("tabindex") : heading.setAttribute("tabindex", previous), { once: true });
  }, [journey]);
  useLayoutEffect(() => {
    const run = current.current;
    if (!run || location.key === run.from) return;
    if (!run.committed || location.pathname + location.search !== run.target.split("#")[0]) {
      stop.current(); current.current = null; setJourney(null); run.resolve();
    } else {
      // React has committed the actual destination DOM, not just the URL.
      run.mounted = true; run.onMounted?.(); run.onMounted = undefined;
    }
  }, [location.key, location.pathname, location.search]);
  useLayoutEffect(() => {
    if (!journey || !overlay.current || !sceneRoot.current) return;
    const node = overlay.current, source = journey.source;
    const rect = source?.getBoundingClientRect();
    const origin: PaperOrigin = rect ?? { x: innerWidth / 2 - 120, y: innerHeight / 2 - 180, width: 240, height: 360 };
    // Owner policy: keep authored motion regardless of the OS motion preference.
    let mode: StormMode = innerWidth <= 600 ? "mobile" : "desktop";
    const palette = paperPalette();
    const unlockScroll = lockPageScroll();
    const oldVisibility = source?.style.visibility ?? "";
    const sourceStyle = source ? getComputedStyle(source) : null;
    // Two inert local DOM copies carry the actual printed card into the tear.
    // No screenshot library, form serialization, network upload or persisted copy.
    const copies: HTMLElement[] = [];
    if (source && typeof node.animate === "function" && halves.current) {
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
    const scene = createPaperScene(sceneRoot.current, origin, mode, palette, copies, source);
    if (!scene) mode = "reduced";
    node.dataset.mode = mode; node.dataset.pieces = String(scene?.count ?? 0);
    node.dataset.renderer = scene ? "compositor" : "fallback";
    let cancelled = false, navigated = false;
    const restore = () => {
      if (source) source.style.visibility = oldVisibility;
      copies.forEach(copy => copy.remove());
      unlockScroll();
    };
    const finish = () => {
      if (cancelled) return;
      focusDestination.current = navigated;
      restore(); current.current = null; setJourney(null); journey.resolve();
    };
    const commit = async () => {
      if (cancelled || navigated) return;
      // A native animation finishing is not itself proof of an opaque paint.
      await afterPaint();
      if (cancelled || navigated) return;
      node.dataset.phase = "covered"; node.dataset.covered = "true";
      copies.forEach(copy => { copy.style.display = "none"; });
      navigated = true; journey.committed = true;
      const mounted = new Promise<void>(resolve => { if (journey.mounted) resolve(); else journey.onMounted = resolve; });
      await navigate(journey.target, { replace: true });
      await mounted;
      if (cancelled) return;
      if (journey.target.split(/[?#]/)[0] === "/") document.title = "Lật lại — Mua bán sách cũ";
      window.scrollTo({ top: 0, behavior: "instant" });
      await afterPaint();
      node.dataset.routeReady = "true";
    };
    node.dataset.phase = "storm";
    const failed = () => {
      if (fallback.current) fallback.current.style.opacity = "1";
      void commit().then(finish, finish);
    };
    const cancelAnimation = scene ? runComposedStorm({ ...scene, release: async () => {
      node.dataset.phase = "reveal"; node.dataset.covered = "false";
      await scene.release();
    } }, { covered: commit, done: finish, failed }) : runPaperStorm("reduced", {
      draw: (time, release) => {
        const f = stormFrame(time, "reduced", release);
        if (fallback.current) fallback.current.style.opacity = String(f.cover * (1 - f.release));
      }, covered: commit, done: finish, failed,
    });
    const abort = () => { cancelled = true; cancelAnimation(); journey.onMounted?.(); journey.onMounted = undefined; restore(); };
    stop.current = abort;
    // Page geometry uses vw/vh; resizing does not clear a canvas or rebuild flights.
    // A hidden tab must not leave a successful login stuck behind suspended rAF.
    const visibility = () => {
      if (document.visibilityState !== "hidden") return;
      cancelAnimation();
      if (fallback.current) fallback.current.style.opacity = "1";
      journey.committed = true; navigated = true;
      void Promise.resolve(navigate(journey.target, { replace: true })).finally(finish);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [journey, navigate]);
  useEffect(() => () => { stop.current(); current.current?.resolve(); }, []);
  return <JourneyContext.Provider value={start}>
    <div ref={content} className={styles.content} inert={Boolean(journey)} aria-hidden={journey ? true : undefined}><Outlet /></div>
    {journey && <div ref={overlay} className={styles.overlay} data-paper-storm>
      <div ref={fallback} className={styles.fallback} aria-hidden="true" />
      <div ref={halves} className={styles.halves} aria-hidden="true" />
      <div ref={sceneRoot} className={styles.scene} aria-hidden="true" />
      <p className={styles.status} role="status" aria-live="polite">Đăng nhập thành công. Đang mở trang tiếp theo…</p>
    </div>}
  </JourneyContext.Provider>;
}
