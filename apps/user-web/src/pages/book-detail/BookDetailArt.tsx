/* Original decorative art for the book detail page (wine / gold / cream).
   Purely ornamental: hidden from assistive technology. */

type ArtProps = { className?: string };

/** An open, slightly worn book under a reading glass, with a ribbon bookmark. */
export function BookCheckArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 120 84" width="120" height="84" aria-hidden="true" focusable="false">
      <ellipse cx="58" cy="76" rx="46" ry="5" fill="#5c0202" opacity=".08" />
      {/* covers */}
      <path d="M10 22c14-6 30-6 48 2v48C40 64 24 64 10 70Z" fill="#7c1a17" />
      <path d="M106 22c-14-6-30-6-48 2v48c18-8 34-8 48-2Z" fill="#5c0202" />
      {/* pages */}
      <path d="M14 20c13-5 28-4 42 3v45c-14-7-29-8-42-3Z" fill="#fffcf5" />
      <path d="M102 20c-13-5-28-4-42 3v45c14-7 29-8 42-3Z" fill="#fbf4e8" />
      <path d="M58 23v46" stroke="#e3cfb4" strokeWidth="1.5" />
      {/* text lines, one dog-eared corner */}
      <g stroke="#d9c2a3" strokeWidth="1.6" strokeLinecap="round">
        <path d="M21 31c9-3 18-3 28 1M21 38c9-3 18-3 28 1M21 45c9-3 18-3 28 1M21 52c6-2 12-2 18 0" />
        <path d="M67 32c9-4 18-4 27-1M67 39c9-4 18-4 27-1M67 46c6-3 12-3 18-1" />
      </g>
      <path d="M102 20l-9-2 2 8Z" fill="#e8d6bd" />
      {/* ribbon bookmark */}
      <path d="M44 22v30l4-4 4 4V24" fill="#f4cb67" />
      {/* reading glass */}
      <circle cx="86" cy="52" r="13" fill="#fff6dc" fillOpacity=".55" stroke="#f4cb67" strokeWidth="4" />
      <path d="M95.5 61.5l11 11" stroke="#7c1a17" strokeWidth="5" strokeLinecap="round" />
      <path d="M80 47a8 8 0 0 1 8-4" stroke="#fffcf5" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A book wrapped in kraft paper and twine, ready to hand over. */
export function BookParcelArt({ className }: ArtProps) {
  return (
    <svg className={className} viewBox="0 0 96 72" width="96" height="72" aria-hidden="true" focusable="false">
      <ellipse cx="48" cy="65" rx="36" ry="4.5" fill="#5c0202" opacity=".08" />
      <path d="M16 26l32-12 32 12-32 12Z" fill="#e9cfa6" />
      <path d="M16 26v26l32 12V38Z" fill="#d8b584" />
      <path d="M80 26v26L48 64V38Z" fill="#c99f6b" />
      {/* twine */}
      <g stroke="#7c1a17" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M32 20l32 12v26" />
        <path d="M64 20L32 32v26" />
      </g>
      <path d="M48 26c-6-8-14-6-12-1s9 3 12 1c3 2 10 4 12-1s-6-7-12 1Z" fill="#f4cb67" stroke="#7c1a17" strokeWidth="1.6" />
      {/* label tag */}
      <path d="M58 44l14-5v9l-14 5Z" fill="#fffcf5" />
      <path d="M61 47l8-3" stroke="#d9c2a3" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
