// Motion never owns product state. All callers expose the committed final
// content on interruption, including a hidden tab or a frame leaving view.
export function motionVisible(element: Element) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const rect = element.getBoundingClientRect();
  return !!view && !doc.hidden && !!element.getClientRects().length &&
    rect.bottom > 0 && rect.right > 0 &&
    rect.top < view.innerHeight && rect.left < view.innerWidth;
}

export function watchMotionBoundary(element: Element, stop: () => void) {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const visibility = () => { if (doc.hidden) stop(); };
  const observer = view?.IntersectionObserver
    ? new view.IntersectionObserver(entries => {
        if (entries.some(entry => !entry.isIntersecting)) stop();
      })
    : undefined;
  observer?.observe(element);
  doc.addEventListener("visibilitychange", visibility);
  view?.addEventListener("blur", stop);
  view?.addEventListener("pagehide", stop);
  return () => {
    observer?.disconnect();
    doc.removeEventListener("visibilitychange", visibility);
    view?.removeEventListener("blur", stop);
    view?.removeEventListener("pagehide", stop);
  };
}
