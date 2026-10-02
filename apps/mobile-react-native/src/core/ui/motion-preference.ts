type Source = {
  read: () => Promise<boolean>;
  listen: (changed: (reduced: boolean) => void) => () => void;
};

// Share one OS subscription across all visible covers and sheets. Unknown = reduced.
export function createMotionPreference(source: Source) {
  let reduced = true;
  let generation = 0;
  let disconnect: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const update = (value: boolean) => {
    if (reduced === value) return;
    reduced = value;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => reduced,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        const current = ++generation;
        let changed = false;
        disconnect = source.listen((value) => {
          if (generation !== current) return;
          changed = true;
          update(value);
        });
        void source.read().then(
          (value) => {
            if (generation === current && !changed) update(value);
          },
          () => {}, // Keep the safe default when the platform cannot answer.
        );
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          ++generation;
          disconnect?.();
          disconnect = undefined;
          reduced = true;
        }
      };
    },
  };
}
