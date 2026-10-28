type TransitionDocument = Pick<Document, "startViewTransition">;

/** Observe visual snapshot failures without changing routing or successful motion. */
export function installViewTransitionFallback(target: TransitionDocument) {
  const start = target.startViewTransition;
  if (typeof start !== "function") return;
  target.startViewTransition = function (...args) {
    const transition = start.apply(this, args);
    // Resize, visibility changes or an interrupted capture can reject ready even
    // though the route update completed. React Router observes finished only.
    // Keep updateCallbackDone/finished untouched so real update errors still fail.
    void transition.ready.catch((error: unknown) => {
      if (error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "InvalidStateError")) return;
      throw error;
    });
    return transition;
  };
}
