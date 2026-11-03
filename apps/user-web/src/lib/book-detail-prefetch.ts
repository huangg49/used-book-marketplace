/** Warm the built route's files through the HTTP cache without evaluating modules. */
export function prefetchBookDetail() {
  if (document.visibilityState === "hidden") return;
  const hint = document.querySelector<HTMLMetaElement>(
    'meta[name="latlai-book-detail-assets"]',
  );
  if (!hint) return;
  const assets: string[] = JSON.parse(hint.content);
  const loaded = new Set(
    [...document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(
      'link[href], script[src]',
    )].map(node => node instanceof HTMLLinkElement ? node.href : node.src),
  );
  for (const asset of assets) {
    const url = new URL(asset, location.href);
    if (loaded.has(url.href)) continue;
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = url.pathname.endsWith(".css") ? "style" : "script";
    link.href = url.href;
    link.addEventListener("error", () => link.remove(), { once: true });
    document.head.append(link);
  }
}
