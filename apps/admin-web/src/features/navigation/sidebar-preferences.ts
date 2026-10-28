export type SidebarMode = "expanded" | "collapsed" | "auto";
export const sidebarStorageKey = "latlai.admin.sidebar.v1";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const isMode = (value: unknown): value is SidebarMode =>
  value === "expanded" || value === "collapsed" || value === "auto";

export function readSidebarMode(storage?: PreferenceStorage): SidebarMode {
  try {
    const saved: unknown = JSON.parse((storage ?? window.localStorage).getItem(sidebarStorageKey) ?? "null");
    if (saved && typeof saved === "object" && "version" in saved && saved.version === 1 && "mode" in saved && isMode(saved.mode)) return saved.mode;
  } catch { /* Storage may be unavailable; the interface still works. */ }
  return "expanded";
}

export function saveSidebarMode(mode: SidebarMode, storage?: PreferenceStorage): boolean {
  try {
    (storage ?? window.localStorage).setItem(sidebarStorageKey, JSON.stringify({ version: 1, mode }));
    return true;
  } catch { return false; }
}

/** Ephemeral preview only. Persistent layout is always an explicit user choice. */
export function createSidebarPreview() {
  let enabled = false, open = false, pointer = false, focused = false, held = false, dismissed = false;
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const emit = (next: boolean) => {
    if (next === open) return;
    open = next;
    listeners.forEach(listener => listener());
  };
  const cancel = () => {
    clearTimeout(opening); clearTimeout(closing);
    opening = closing = undefined;
  };
  const closeLater = () => {
    clearTimeout(closing);
    if (enabled && !pointer && !focused && !held) closing = setTimeout(() => emit(false), 300);
  };
  const reset = () => {
    cancel(); pointer = focused = held = dismissed = false; emit(false);
  };
  return {
    snapshot: () => open,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    configure: (next: boolean) => { enabled = next; reset(); },
    reset,
    enter: () => {
      if (!enabled) return;
      pointer = true;
      clearTimeout(closing);
      if (!dismissed && !open && opening === undefined) opening = setTimeout(() => {
        opening = undefined;
        if (enabled && pointer && !dismissed) emit(true);
      }, 400);
    },
    leave: () => {
      pointer = false; dismissed = false;
      clearTimeout(opening); opening = undefined;
      closeLater();
    },
    focus: () => {
      if (!enabled) return;
      focused = true; cancel();
      if (!dismissed) emit(true);
    },
    blur: () => {
      focused = false;
      if (!pointer) dismissed = false;
      closeLater();
    },
    hold: (next: boolean) => {
      held = next;
      if (next) clearTimeout(closing);
      else closeLater();
    },
    dismiss: () => { cancel(); dismissed = true; emit(false); },
  };
}
