/** Synchronize a newly mounted header even when navigation resets scroll without an event. */
export function observeHeaderScroll(
  onChange: (floating: boolean, collapsing: boolean) => void,
) {
  let compact = window.scrollY > 48;
  onChange(compact, false);

  const update = () => {
    // Separate thresholds prevent flicker when scrolling near the top.
    const next = compact ? window.scrollY > 16 : window.scrollY > 48;
    if (next !== compact) {
      compact = next;
      onChange(next, next);
    }
  };

  window.addEventListener("scroll", update, { passive: true });
  // Layouts and the browser can reset scroll after this header mounts.
  const frame = window.requestAnimationFrame(update);
  return () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("scroll", update);
  };
}
