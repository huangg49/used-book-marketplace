# Web fonts

- Be Vietnam Pro400/700: reused packages/brand/fonts; BeVietnamPro-OFL.txt.
- Anton400: https://github.com/google/fonts/tree/main/ofl/anton ;
  Anton-Regular.ttf downloaded from that official Google Fonts directory on
  2026-10-10, with Anton-OFL.txt. Vietnamese coverage confirmed in METADATA.pb.

Member web serves WOFF2 encodings of these same three faces. The TTF files
remain the source files and the CSS fallback. Each WOFF2 keeps the full glyph
set, including Vietnamese coverage, and uses the corresponding OFL above.
The login paper snapshot uses the same Be Vietnam Pro WOFF2 assets as the page.

To regenerate from this directory with fonttools 4.63.0 and Brotli 1.2.1, run
`python -m fontTools.ttLib.woff2 compress --no-glyf-transform -o FONT.woff2 FONT.ttf` for
`BeVietnamPro-Regular`, `BeVietnamPro-Bold`, and `Anton-Regular`.

Only Anton and Be Vietnam Pro carry the redesigned Home/Search/Detail/Login.
Other existing client pages still contain legacy typography declarations.
