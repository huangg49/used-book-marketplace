import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type Lenis from "lenis";
import { DemandScroll } from "../lib/demand-scroll";
import "lenis/dist/lenis.css";

let activeLenis: Lenis | null = null;

/**
 * Access the active Lenis instance for programmatic smooth scrolling.
 */
export function getLenis(): Lenis | null {
  return activeLenis;
}

/**
 * Mounts Lenis smooth momentum scrolling globally across the application.
 * Manages 60fps/120fps physics, releases completely in chat/order conversation mode,
 * and handles immediate scroll-to-top on route change.
 */
export function useGlobalSmoothScroll() {
  const location = useLocation();
  const lenisRef = useRef<Lenis | null>(null);

  const isChat =
    location.pathname.startsWith("/chat") ||
    location.pathname.startsWith("/orders/");

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isChat) {
      // In chat mode, destroy any Lenis instance so native scrolling is 100% free and responsive
      // without hijacking wheel events or locking the page with .lenis-stopped (overflow: clip)
      if (lenisRef.current) {
        lenisRef.current.destroy();
        if (activeLenis === lenisRef.current) {
          activeLenis = null;
        }
        lenisRef.current = null;
      }
      return;
    }

    if (!lenisRef.current) {
      const lenis = new DemandScroll({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 0.9,
        touchMultiplier: 1.5,
        infinite: false,
        // Owner policy: preserve authored scrolling under either OS preference.
        respectReducedMotion: false,
      });

      lenisRef.current = lenis;
      activeLenis = lenis;

      lenis.scrollTo(0, { immediate: true });

      return () => {
        lenis.destroy();
        if (activeLenis === lenis) {
          activeLenis = null;
        }
        lenisRef.current = null;
      };
    } else {
      lenisRef.current.start();
      lenisRef.current.scrollTo(0, { immediate: true });
    }
  }, [isChat, location.pathname]);

  return lenisRef;
}
