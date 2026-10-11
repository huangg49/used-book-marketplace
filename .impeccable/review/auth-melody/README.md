# Auth handwriting follow-up — 11 October 2026

Branch `codex/auth-vietnamese-handwriting`, base `41fda2b`.
Checkpoint subject: `fix(web): use Fancy Melody for Vietnamese auth notes`.

Owner supplied `MTD-Fancy-Melody.otf`; original bytes copied unchanged, source/hash
in [font notes](../../../apps/user-web/public/fonts/auth/README.md). Family MTD
Fancy Melody, Regular400. It replaces Caveat only in Auth pencil annotations,
server errors and unavailable-sheet notes. No Athena candidate ships. Controls,
headings, layout, auth API/session/validation and reduced-motion remain unchanged.

FontTools cmap check: no missing characters in all current Vietnamese annotation,
error/recovery strings; all U+1EA0–1EF9 and ĐđĂăƠơƯư covered.

Codex IAB captures, all opened and visually checked; font load/computed family
confirmed and no horizontal overflow at inspected desktop/mobile dimensions:

- `login-laptop.jpg`:1366×768, production localhost5186/login.
- `recovery-mobile.jpg`:320×1000, production localhost5186/forgot-password;
  readable multiline handwritten note and visible photo credit.
- `login-error-laptop.jpg`:1366×900, isolated localhost5187 QA fixture, synthetic401
  response only, no database connection. Clear full error in Auth Melody weight400.
  Displayed reader@example.test is synthetic. Fixture code is not shipped.

TypeScript + Vite production build PASS (existing large-chunk warning).
One scoped type detector over the two changed CSS files: no findings.
No unit suite rerun or API/native/full finish review for this font-only follow-up;
earlier Auth review is historical evidence, not a new verdict for Melody.
Browser viewport reset and production login restored after captures.
