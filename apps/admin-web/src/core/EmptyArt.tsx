import type { ReactNode } from "react";
import styles from "./EmptyArt.module.css";

// Decorative scene for empty staff/admin lists: a desk with a soft glow, a
// tick badge for "nothing waiting" and one prop per desk type. The heading
// beside it carries the meaning, so the SVG is hidden from assistive tech.
export type EmptyArtVariant =
  | "shelf" // point desks: an empty shelf, everything handled
  | "review" // listing review: a stamped paper stack
  | "alerts" // AI review alerts: a shield with a tick
  | "stars" // transaction reviews: three stars on a card
  | "inbox" // support: an empty tray
  | "people"; // user directory: id cards under a magnifier

export function EmptyArt({ variant = "shelf" }: { variant?: EmptyArtVariant }) {
  return (
    <div className={styles.art} data-variant={variant} aria-hidden="true">
      <svg viewBox="0 0 240 140" role="presentation" focusable="false">
        <defs>
          <radialGradient id="ea-glow" cx=".5" cy=".55" r=".55">
            <stop offset="0" stopColor="#f6e0a8" stopOpacity=".8" />
            <stop offset="1" stopColor="#f6e0a8" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ea-desk" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b98a5e" />
            <stop offset="1" stopColor="#8a5f3c" />
          </linearGradient>
        </defs>
        <ellipse className={styles.glow} cx="120" cy="74" rx="108" ry="62" fill="url(#ea-glow)" />
        <g className={styles.sparkles} fill="#d9a441">
          <path d="M40 30l2.6 6 6 2.6-6 2.6-2.6 6-2.6-6-6-2.6 6-2.6z" />
          <path d="M204 24l2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2z" />
        </g>

        <g className={styles.prop}>{PROPS[variant]}</g>

        {/* Desk edge */}
        <rect x="28" y="112" width="184" height="9" rx="3" fill="url(#ea-desk)" />
        <rect x="36" y="121" width="7" height="14" rx="2" fill="#8a5f3c" />
        <rect x="197" y="121" width="7" height="14" rx="2" fill="#8a5f3c" />

        {/* "All clear" tick badge; not for a search with no match, nor the
            shield, which carries its own tick. */}
        {variant !== "people" && variant !== "alerts" && (
        <g className={styles.badge}>
          <circle cx="186" cy="58" r="15" fill="#254337" />
          <circle cx="186" cy="58" r="15" fill="none" stroke="#e8efe9" strokeWidth="2" opacity=".6" />
          <path d="M179 58l5 5 9-10" fill="none" stroke="#f4eddf" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        )}
      </svg>
    </div>
  );
}

const PROPS: Record<EmptyArtVariant, ReactNode> = {
  shelf: (
    <>
      <rect x="60" y="54" width="96" height="58" rx="4" fill="#f4eddf" stroke="#d9cbbd" strokeWidth="1.5" />
      <rect x="60" y="82" width="96" height="4" fill="#d9cbbd" />
      <rect x="68" y="60" width="12" height="22" rx="2" fill="#5c0202" />
      <rect x="82" y="64" width="10" height="18" rx="2" fill="#254337" />
      <rect x="120" y="88" width="22" height="20" rx="2" fill="none" stroke="#5c0202" strokeWidth="1.4" strokeDasharray="3 3" className={styles.dash} />
      <rect x="96" y="92" width="14" height="16" rx="2" fill="#e7c98f" />
    </>
  ),
  review: (
    <>
      <rect x="66" y="66" width="80" height="46" rx="3" fill="#ede3d2" transform="rotate(-4 106 89)" />
      <rect x="70" y="58" width="80" height="54" rx="3" fill="#fffdf8" stroke="#d9cbbd" strokeWidth="1.5" />
      <path d="M80 72h44M80 82h56M80 92h38" stroke="#d9cbbd" strokeWidth="3" strokeLinecap="round" />
      <g className={styles.stamp}>
        <rect x="118" y="30" width="22" height="16" rx="3" fill="#5c0202" />
        <rect x="126" y="18" width="6" height="14" rx="3" fill="#b98a5e" />
        <rect x="114" y="46" width="30" height="6" rx="2" fill="#7c2320" />
      </g>
    </>
  ),
  alerts: (
    <>
      <path d="M106 40l32 12v22c0 20-14 32-32 38-18-6-32-18-32-38V52z" fill="#fffdf8" stroke="#5c0202" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M106 50l22 8v16c0 14-9 22-22 27z" fill="#f4eddf" />
      <path d="M95 76l8 8 14-16" fill="none" stroke="#254337" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className={styles.draw} />
    </>
  ),
  stars: (
    <>
      <rect x="62" y="58" width="96" height="54" rx="6" fill="#fffdf8" stroke="#d9cbbd" strokeWidth="1.5" />
      {[84, 110, 136].map((x, i) => (
        <path
          key={x}
          className={styles.star}
          style={{ animationDelay: `${i * 0.25}s` }}
          d={`M${x} 72l3.8 7.7 8.5 1.2-6.1 6 1.4 8.4-7.6-4-7.6 4 1.4-8.4-6.1-6 8.5-1.2z`}
          fill={i < 2 ? "#d9a441" : "#ede3d2"}
          stroke="#b98a5e"
          strokeWidth="1"
        />
      ))}
    </>
  ),
  inbox: (
    <>
      <path d="M60 80l14-26h64l14 26v32H60z" fill="#fffdf8" stroke="#5c0202" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M60 80h28l6 10h24l6-10h28" fill="none" stroke="#5c0202" strokeWidth="2.2" strokeLinejoin="round" />
      <g className={styles.float}>
        <rect x="88" y="26" width="36" height="24" rx="3" fill="#f6e0a8" stroke="#b98a5e" strokeWidth="1.4" />
        <path d="M88 28l18 12 18-12" fill="none" stroke="#b98a5e" strokeWidth="1.4" />
      </g>
    </>
  ),
  people: (
    <>
      <rect x="58" y="66" width="62" height="40" rx="5" fill="#fffdf8" stroke="#d9cbbd" strokeWidth="1.5" />
      <circle cx="74" cy="82" r="7" fill="#e7c98f" />
      <path d="M86 78h24M86 88h18" stroke="#d9cbbd" strokeWidth="3" strokeLinecap="round" />
      <rect x="96" y="76" width="62" height="36" rx="5" fill="#fffdf8" stroke="#d9cbbd" strokeWidth="1.5" />
      <circle cx="112" cy="92" r="7" fill="#c96f4a" />
      <path d="M124 88h24M124 98h16" stroke="#d9cbbd" strokeWidth="3" strokeLinecap="round" />
      <g className={styles.lens}>
        <circle cx="132" cy="54" r="14" fill="#ffffff" fillOpacity=".5" stroke="#5c0202" strokeWidth="3.5" />
        <path d="M142 64l11 11" stroke="#5c0202" strokeWidth="5" strokeLinecap="round" />
      </g>
    </>
  ),
};
