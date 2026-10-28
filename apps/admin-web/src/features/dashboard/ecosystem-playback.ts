// CSS owns the illustration's clocks; this boundary only controls playback.
// Manual pause survives refetch/period changes and browser visibility changes.
export function attachEcosystemPlayback(host: HTMLElement, playingKey: "forestPlaying" | "skyPlaying" = "forestPlaying") {
  const doc = host.ownerDocument, view = doc.defaultView;
  let disposed = false, paused = false, loaded = false, onscreen = false;
  let focused = doc.hasFocus(), pageVisible = true;
  const sync = () => {
    host.dataset[playingKey] = String(!disposed && loaded && !paused && onscreen && focused && pageVisible && !doc.hidden);
  };
  const bounds = () => {
    const r = host.getBoundingClientRect();
    onscreen = !!view && r.bottom > 0 && r.right > 0 && r.top < view.innerHeight && r.left < view.innerWidth;
    sync();
  };
  const observer = view?.IntersectionObserver ? new view.IntersectionObserver(entries => {
    onscreen = entries.some(entry => entry.isIntersecting); sync();
  }) : null;
  observer?.observe(host);
  const blur = () => { focused = false; sync(); };
  const focus = () => { focused = true; sync(); };
  const hide = () => { pageVisible = false; sync(); };
  const show = () => { pageVisible = true; focused = doc.hasFocus(); bounds(); };
  doc.addEventListener("visibilitychange", sync);
  view?.addEventListener("blur", blur); view?.addEventListener("focus", focus);
  view?.addEventListener("pagehide", hide); view?.addEventListener("pageshow", show);
  view?.addEventListener("resize", bounds);
  if (!observer) view?.addEventListener("scroll", bounds, { capture: true, passive: true });
  bounds();
  return {
    ready(value: boolean) { loaded = value; sync(); },
    pause(value: boolean) { paused = value; sync(); },
    dispose() {
      disposed = true; sync(); observer?.disconnect();
      doc.removeEventListener("visibilitychange", sync);
      view?.removeEventListener("blur", blur); view?.removeEventListener("focus", focus);
      view?.removeEventListener("pagehide", hide); view?.removeEventListener("pageshow", show);
      view?.removeEventListener("resize", bounds); view?.removeEventListener("scroll", bounds, true);
    },
  };
}
