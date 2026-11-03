# Auth typefaces

- `BricolageGrotesque.ttf`: original Google Fonts variable TTF, downloaded11/10/2026
  from google/fonts ofl/bricolagegrotesque; SIL OFL1.1 text kept here with whitespace
  normalization only. Used for Auth headings and success stamp.
- `BricolageGrotesque.woff2`: full variable font compressed from that TTF with
  FontTools 4.63.0 and Brotli 1.2.1. Source outlines, metrics, axes and Vietnamese
  coverage are preserved. Auth CSS and the paper snapshot prefer WOFF2 and use the
  TTF if the WOFF2 request fails. Original OFL and attribution apply to both files.

  To reproduce from this directory with those tools installed:

  ```shell
  python -c "from fontTools.ttLib import woff2; woff2.compress('BricolageGrotesque.ttf', 'BricolageGrotesque.woff2', transform_tables=[])"
  ```

  WOFF2 SHA256: `ccacf156a9d50757c5f28258b8fe94a5f84e928c5766deaf8f960d4d28483a95`.
- `MTD-Fancy-Melody.otf`: supplied by the project owner11/10/2026, original
  bytes unchanged. Family MTD Fancy Melody, Regular400. Used for pencil
  annotations, librarian notes and server errors. No license text supplied with
  this asset; no Google Fonts/OFL licensing claim is made for Fancy Melody.

Be Vietnam Pro remains the functional voice. Both Auth families are served locally
with font-display:swap. Caveat was removed
following the owner's report of Vietnamese diacritic rendering defects.

Fancy Melody SHA256: `86b306ea9a75e5a2d22655a357ac29031472f5f2c5b15d7006ce1a17050efed5`.
