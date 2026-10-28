# Sky metric assets —27/10/2026

The “Lượt gửi duyệt” scene uses nine separate raster assets: seven newly generated
with built-in ImageGen plus the existing forest bird body and wing, referenced
directly without copying or regenerating them. Vector-like illustration style;
files are WebP bitmaps, not editable SVG paths.

The [manifest](manifest.json) records the seven new files, dimensions, bytes and
alpha. Total143620bytes, six transparent cutouts and one opaque background.
The two [shared bird files](../forest/README.md) add no duplicate project files.
Original PNGs stay in the generator default directory; exact prompts, source
basenames and SHA256 are in [ADMIN_SKY_PROMPTS](../../../../../docs/design/ADMIN_SKY_PROMPTS.json).
Derivatives trim alpha padding with8px source margin, resize and WebP95/alpha100.
No painting, palette replacement or synthesized vector reconstruction.

| Asset | Placement / animation |
| --- | --- |
| sky.webp | Quiet peach morning, cloud bank at bottom |
| cloud.webp | Three depth layers with slow bounded drift |
| balloon.webp | Envelope, separate from suspended cargo |
| basket.webp | Basket and ropes; pivot at upper center |
| books.webp | Three books placed inside basket |
| paper-plane.webp | Bounded gliding path below number |
| kite.webp | Small kite with ribbon tail, gentle rocking |
| ../forest/bird-body.webp | Shared small songbird body |
| ../forest/bird-wing.webp | Shared independent flapping wing |

Two small CSS circles add quiet glimmers. The scene is decorative and never
encodes queue counts, delivered books, trust or operational events. Actual
submitted revision totals and7/30day period remain separate accessible DOM text.
