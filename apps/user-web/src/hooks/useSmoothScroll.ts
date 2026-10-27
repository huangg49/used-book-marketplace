import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import Lenis from "lenis";
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
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: "vertical",
        gestureOrientation: "vertical",
        smoothWheel: true,
        wheelMultiplier: 0.9,
        touchMultiplier: 1.5,
        infinite: false,
      });

      lenisRef.current = lenis;
      activeLenis = lenis;

      let rafId: number;
      function raf(time: number) {
        lenis.raf(time);
        rafId = requestAnimationFrame(raf);
      }
      rafId = requestAnimationFrame(raf);

      lenis.scrollTo(0, { immediate: true });

      return () => {
        cancelAnimationFrame(rafId);
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
