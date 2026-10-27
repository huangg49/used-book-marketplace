import { useId } from "react";

/** Reuse the owner-provided owl/letter pixels on paper or wine surfaces. */
export function BrandMark({ wordmark = false, className, tone = "wine" }: { wordmark?: boolean; className: string; tone?: "wine" | "cream" }) {
  const ink = useId();
  return <svg className={className} viewBox={wordmark ? "0 0 187 43" : "0 0 52 42"} aria-hidden="true">
    <defs><filter id={ink} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values={tone === "cream"
        ? "0 0 0 0 .988235 0 0 0 0 .972549 0 0 0 0 .858824 1.59375 0 0 0 -.575"
        : "0 0 0 0 .360784 0 0 0 0 .007843 0 0 0 0 .007843 1.59375 0 0 0 -.575"} />
    </filter></defs>
    <svg width="52" height="42" viewBox="0 0 52 42" overflow="hidden">
      <image href="/brand/logo-original.png" x="-94" y="-72" width="240" height="240" filter={`url(#${ink})`} />
    </svg>
    {wordmark && <svg x="61" width="126" height="43" viewBox="0 0 126 43" overflow="hidden">
      <image href="/brand/logo-original.png" x="-137" y="-198" width="400" height="400" filter={`url(#${ink})`} />
    </svg>}
  </svg>;
}

