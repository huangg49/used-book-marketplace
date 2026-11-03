import styles from './AuctionEmptyArt.module.css'

// Decorative scene for empty auction lists: a reading shelf with one dashed
// gap where the next book will land, a gavel resting beside it and a price
// tag. `filter` adds a magnifier (no match), `mine` swaps the gap for a tag
// waiting on the member's own book. Purely decorative: the heading carries
// the meaning, so the SVG is hidden from assistive technology.
export function AuctionEmptyArt({ variant = 'shelf' }: { variant?: 'shelf' | 'filter' | 'mine' }) {
  return (
    <div className={styles.art} data-variant={variant} aria-hidden="true">
      <svg viewBox="0 0 280 170" role="presentation" focusable="false">
        <defs>
          <linearGradient id="aea-wood" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#b98a5e" />
            <stop offset="1" stopColor="#8a5f3c" />
          </linearGradient>
          <radialGradient id="aea-glow" cx=".5" cy=".55" r=".55">
            <stop offset="0" stopColor="#f6e0a8" stopOpacity=".85" />
            <stop offset="1" stopColor="#f6e0a8" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse className={styles.glow} cx="140" cy="92" rx="128" ry="74" fill="url(#aea-glow)" />

        {/* Sparkles */}
        <g className={styles.sparkles} fill="#d9a441">
          <path d="M52 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          <path d="M228 26l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
          <path d="M244 74l1.6 4 4 1.6-4 1.6-1.6 4-1.6-4-4-1.6 4-1.6z" />
        </g>

        {/* Books on the shelf */}
        <g className={styles.books}>
          <rect x="62" y="70" width="18" height="62" rx="2" fill="#5c0202" />
          <rect x="62" y="80" width="18" height="3" fill="#d9a441" />
          <rect x="62" y="118" width="18" height="3" fill="#d9a441" />
          <rect x="82" y="58" width="22" height="74" rx="2" fill="#254337" />
          <rect x="86" y="68" width="14" height="10" rx="1.5" fill="#f4eddf" opacity=".85" />
          <rect x="106" y="76" width="15" height="56" rx="2" fill="#c96f4a" />
          <rect x="123" y="66" width="19" height="66" rx="2" fill="#e7c98f" transform="rotate(-7 132 132)" />
        </g>

        {/* The gap: a dashed book waiting for the next intake */}
        {variant !== 'mine' && (
          <g className={styles.waiting}>
            <rect x="150" y="64" width="22" height="68" rx="3" fill="#fffaf0" stroke="#5c0202" strokeWidth="1.6" strokeDasharray="4 4" />
            <path d="M161 88v14M154 95h14" stroke="#5c0202" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}

        {/* Price tag hanging from the shelf */}
        <g className={styles.tag}>
          <path d="M196 132v10" stroke="#8a5f3c" strokeWidth="1.4" />
          <path d="M184 142h24l6 9-6 9h-24z" fill="#f6e0a8" stroke="#5c0202" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="188" cy="151" r="2" fill="#5c0202" />
          <path d="M193 151h12" stroke="#5c0202" strokeWidth="1.6" strokeLinecap="round" strokeDasharray={variant === 'mine' ? '0' : '2 3'} />
        </g>

        {/* Shelf board */}
        <rect x="40" y="132" width="200" height="10" rx="3" fill="url(#aea-wood)" />
        <rect x="48" y="142" width="8" height="18" rx="2" fill="#8a5f3c" />
        <rect x="224" y="142" width="8" height="18" rx="2" fill="#8a5f3c" />

        {/* Gavel and its sound block */}
        <g className={styles.gavel}>
          <g className={styles.gavelHead}>
            <rect x="186" y="78" width="40" height="15" rx="4" fill="#5c0202" transform="rotate(-28 206 85)" />
            <rect x="183" y="79" width="7" height="17" rx="2" fill="#7c2320" transform="rotate(-28 206 85)" />
            <rect x="222" y="79" width="7" height="17" rx="2" fill="#7c2320" transform="rotate(-28 206 85)" />
            <rect x="207" y="90" width="5" height="40" rx="2.5" fill="#b98a5e" transform="rotate(-28 206 85)" />
          </g>
          <rect x="200" y="124" width="30" height="8" rx="2" fill="#5c0202" />
        </g>

        {/* No-match: a magnifier over the shelf */}
        {variant === 'filter' && (
          <g className={styles.lens}>
            <circle cx="104" cy="56" r="20" fill="#ffffff" fillOpacity=".45" stroke="#5c0202" strokeWidth="4" />
            <path d="M118 71l14 15" stroke="#5c0202" strokeWidth="6" strokeLinecap="round" />
            <path d="M96 50a10 10 0 0 1 10-5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          </g>
        )}

        {/* Mine: an empty spot marked with a small plus badge */}
        {variant === 'mine' && (
          <g className={styles.waiting}>
            <rect x="150" y="70" width="22" height="62" rx="3" fill="#fffaf0" stroke="#254337" strokeWidth="1.6" strokeDasharray="4 4" />
            <circle cx="161" cy="100" r="9" fill="#254337" />
            <path d="M161 95v10M156 100h10" stroke="#f4eddf" strokeWidth="2" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  )
}
