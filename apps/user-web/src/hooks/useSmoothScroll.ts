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
 * Manages 60fps/120fps physics, pauses in chat mode, and handles immediate scroll-to-top on route change.
 */
export function useGlobalSmoothScroll() {
  const location = useLocation();
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

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

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      if (activeLenis === lenis) {
        activeLenis = null;
      }
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    const isChat = location.pathname.startsWith("/chat");
    if (isChat) {
      lenis.stop();
    } else {
      lenis.start();
      lenis.scrollTo(0, { immediate: true });
    }
  }, [location.pathname]);

  return lenisRef;
}
