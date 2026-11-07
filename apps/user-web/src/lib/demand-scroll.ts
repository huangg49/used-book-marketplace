import Lenis from "lenis";

/** Drive the original Lenis physics only while a smooth scroll is in progress. */
export class DemandScroll extends Lenis {
  private frame: number | null = null;
  private disposed = false;

  override scrollTo(...args: Parameters<Lenis["scrollTo"]>) {
    super.scrollTo(...args);
    // Wheel/touch input also goes through scrollTo inside Lenis. Native scroll,
    // prevented gestures and immediate commands do not need an animation loop.
    if (!this.disposed && this.isScrolling === "smooth" && this.frame === null) {
      // Exclude time spent idle from the next animation's first physics step.
      this.time = performance.now();
      this.frame = requestAnimationFrame(this.advance);
    }
  }

  private advance = (time: number) => {
    this.frame = null;
    if (this.disposed) return;
    this.raf(time);
    // A completion callback may start another scroll and schedule its own frame.
    if (!this.disposed && this.isScrolling === "smooth" && this.frame === null) {
      this.frame = requestAnimationFrame(this.advance);
    }
  };

  override destroy() {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    super.destroy();
  }
}
