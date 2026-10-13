import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { runPaperStorm, runComposedStorm, stormFrame, type PaperOrigin, type StormMode, type ComposedScene } from "./paper-storm";
import { createPaperScene, warmPaperScene } from "./paper-scene";
import { createPaperBreeze, type PaperBreeze } from "./paper-breeze";
import styles from "./PaperStormLayout.module.css";
import { JourneyContext, PaperArrivalContext } from "./paper-journey";
import { lockPageScroll } from "../../lib/page-scroll";
import { flightModule } from './auth-flight';
import type { AuthFlight } from './wind/login-flight.mjs';

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
  const sceneRoot = useRef<HTMLDivElement>(null), flightRoot = useRef<HTMLCanvasElement>(null), fallback = useRef<HTMLDivElement>(null);
  const breezeRoot = useRef<HTMLDivElement>(null), breeze = useRef<PaperBreeze | null>(null);
  const breezePath = useRef("");
  useEffect(() => {
    if (!journey && location.pathname !== breezePath.current) breeze.current?.dispose();
  }, [journey, location.pathname]);
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
    let domFlight: Animation | null = null;
    let wind: PaperBreeze | null = null;
    let flight: AuthFlight | null = null;
    let hold: Animation | null = null;
    let sceneDisposed = false;
    const startDomStamp = () => {
      const stamp = source?.querySelector<HTMLElement>('[data-auth-stamp]');
      if (stamp) { stamp.style.visibility = 'visible'; stamp.style.animation = ''; }
    };
    const pages = createPaperScene(sceneRoot.current, origin, mode, palette, [], null, { externalOnly: true, schedule: { burst: 700, cover: 1350, release: 700 } });
    const scene: ComposedScene | null = pages ? { count: innerWidth <= 600 ? 18 : 30,
      async enter() {
        if (source && flightRoot.current) {
          try {
            const pending = flightModule().then(module => module.createAuthFlight(flightRoot.current!, source));
            const result = await Promise.race([pending, new Promise<null>(resolve => setTimeout(() => resolve(null), 350))]);
            if (cancelled || sceneDisposed) { result?.dispose(); void pending.then(value => value.dispose(), () => {}); return; }
            flight = result;
            if (!result) void pending.then(value => value.dispose(), () => {});
          } catch { /* Unsupported capture/WebGL uses the intact DOM fallback. */ }
        }
        if (cancelled || sceneDisposed) return;
        const entered = pages.enter();
        sceneRoot.current!.style.visibility = "visible";
        flight?.start();
        if (!flight && source && typeof source.animate === "function") {
          // CSS stamp and fallback flight begin together, never during capture.
          startDomStamp();
          domFlight = source.closest("[data-auth-book]")!.animate([{ transform: "translate3d(0,0,0)", opacity: 1 }, { transform: "translate3d(120vw,-90vh,0) rotate(18deg)", opacity: 0 }], { delay: 280, duration: 1152, easing: "cubic-bezier(.45,0,.85,.65)", fill: "both" });
          void domFlight.finished.catch(() => {});
        }
        node.dataset.renderer = flight ? "webgl-intact" : "compositor-intact";
        breeze.current?.dispose();
        wind = breezeRoot.current ? createPaperBreeze(breezeRoot.current, origin, mode, palette, 280) : null;
        breeze.current = wind; breezePath.current = journey.target.split(/[?#]/)[0]!;
        await entered;
      },
      async release() {
        hold = node.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 150 });
        await hold.finished;
        await pages.release();
      },
      dispose() { sceneDisposed = true; hold?.cancel(); flight?.dispose(); domFlight?.cancel(); pages.dispose(); },
    } : null;
    if (!scene) { mode = "reduced"; startDomStamp(); }
    sceneRoot.current.style.visibility = "hidden";
    node.dataset.mode = mode; node.dataset.pieces = String(scene?.count ?? 0);
    node.dataset.renderer = scene ? "preparing-intact" : "fallback";
    let cancelled = false, navigated = false, completed = false;
    const restore = () => {
      if (source) source.style.visibility = oldVisibility;
      unlockScroll();
    };
    const finish = () => {
      if (cancelled) return;
      completed = true; wind?.settle();
      focusDestination.current = navigated;
      restore(); current.current = null; setJourney(null); journey.resolve();
    };
    const commit = async () => {
      if (cancelled || navigated) return;
      // A native animation finishing is not itself proof of an opaque paint.
      await afterPaint();
      if (cancelled || navigated) return;
      node.dataset.phase = "covered"; node.dataset.covered = "true";
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
      if (cancelled || completed) return;
      cancelAnimation();
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
    const abort = () => { cancelled = true; cancelAnimation(); if (!completed) wind?.dispose(); journey.onMounted?.(); journey.onMounted = undefined; restore(); };
    stop.current = abort;
    // A resized mesh cannot guarantee coverage: commit behind the opaque fallback.
    // A hidden tab must not leave a successful login stuck behind suspended rAF.
    const visibility = () => {
      if (document.visibilityState !== "hidden") return;
      cancelAnimation();
      if (fallback.current) fallback.current.style.opacity = "1";
      journey.committed = true; navigated = true;
      void Promise.resolve(navigate(journey.target, { replace: true })).finally(finish);
    };
    document.addEventListener("visibilitychange", visibility);
    const graphicsFailed = (event: Event) => { event.preventDefault(); failed(); };
    const resize = () => { if (!completed) failed(); };
    flightRoot.current?.addEventListener('webglcontextlost', graphicsFailed);
    flightRoot.current?.addEventListener('paperflightfailed', graphicsFailed);
    const canvas = flightRoot.current;
    window.addEventListener('resize', resize);
    return () => {
      abort(); document.removeEventListener("visibilitychange", visibility);
      canvas?.removeEventListener('webglcontextlost', graphicsFailed);
      canvas?.removeEventListener('paperflightfailed', graphicsFailed);
      window.removeEventListener('resize', resize);
    };
  }, [journey, navigate]);
  useEffect(() => () => { stop.current(); breeze.current?.dispose(); current.current?.resolve(); }, []);
  return <JourneyContext.Provider value={start}>
    <PaperArrivalContext.Provider value={Boolean(journey?.committed && location.pathname + location.search === journey.target.split("#")[0])}>
      <div ref={content} className={styles.content} inert={Boolean(journey)} aria-hidden={journey ? true : undefined}><Outlet /></div>
    </PaperArrivalContext.Provider>
    <div ref={breezeRoot} className={styles.breeze} data-paper-breeze aria-hidden="true" hidden />
    {journey && <div ref={overlay} className={styles.overlay} data-paper-storm>
      <div ref={fallback} className={styles.fallback} aria-hidden="true" />
      <canvas ref={flightRoot} className={styles.flight} data-auth-flight aria-hidden="true" hidden />
      <div ref={sceneRoot} className={styles.scene} aria-hidden="true" />
      <p className={styles.status} role="status" aria-live="polite">Đăng nhập thành công. Đang mở trang tiếp theo…</p>
    </div>}
  </JourneyContext.Provider>;
}
