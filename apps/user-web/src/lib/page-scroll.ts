let locks = 0;
let restore: (() => void) | undefined;

function setStyles(style: CSSStyleDeclaration, values: Record<string, string>) {
  const previous = Object.keys(values).map((name) => ({
    name,
    value: style.getPropertyValue(name),
    priority: style.getPropertyPriority(name),
  }));
  Object.entries(values).forEach(([name, value]) => style.setProperty(name, value));
  return () => previous.forEach(({ name, value, priority }) => {
    if (value) style.setProperty(name, value, priority);
    else style.removeProperty(name);
  });
}

/** Keep the viewport gutter, including for fixed navigation, while an overlay is open. */
export function lockPageScroll(): () => void {
  if (locks === 0) {
    if (typeof CSS !== "undefined" && CSS.supports("scrollbar-gutter", "stable")) {
      // Stable gutters remain reserved with overflow:hidden. Padding compensation
      // here would add the scrollbar width twice.
      restore = setStyles(document.documentElement.style, { "overflow-y": "hidden" });
    } else {
      // Keep the fallback root scrollbar visible; freeze only the page behind it.
      const x = window.scrollX, y = window.scrollY;
      const route = window.location.pathname + window.location.search;
      const restoreBody = setStyles(document.body.style, {
        position: "fixed", top: `${-y}px`, left: "0", right: "0",
      });
      restore = () => {
        restoreBody();
        if (window.location.pathname + window.location.search === route) {
          window.scrollTo({ left: x, top: y, behavior: "instant" });
        }
      };
    }
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      restore?.();
      restore = undefined;
    }
  };
}
