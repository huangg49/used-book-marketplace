# Forest metric assets —27/10/2026

Nine individual raster assets generated with built-in ImageGen for the Admin
“Lượt đã xử lý” metric. Vector-like cartoon appearance; these are WebP bitmaps,
not editable SVG paths. No external stock artwork or dependency was added.

Original PNGs remain in the generator's default directory. Exact prompts,
source basenames and SHA256 are in
[ADMIN_FOREST_PROMPTS](../../../../../docs/design/ADMIN_FOREST_PROMPTS.json).
The [manifest](manifest.json) records dimensions, bytes and alpha. Total189026
bytes; eight transparent cutouts plus one opaque backdrop. Production files
are cropped to opaque silhouette bounds with8px source padding, resized and
encoded WebP95/alpha100; no repainting or invented vector reconstruction.

| File | Role / motion anchor |
| --- | --- |
| forest.webp | Quiet sky, distant tree line, hills and pale ground |
| tree.webp | Three instances, trunk root at bottom center |
| fox-body.webp | Fox holding a closed wine book; slow breathing at feet |
| fox-tail.webp | Separate tail; root near lower left, behind body |
| bird-body.webp | Small songbird, no wing; bounded hopping |
| bird-wing.webp | Root at upper right; independent flapping |
| butterfly.webp | Separate drift and wing-width motion |
| fern.webp | Two foreground plants, rooted at bottom center |
| mushrooms.webp | One static group of three mushrooms |

The three small light motes are CSS circles. Animals/plants are decorative and
never encode counts, acceptance, trust or workflow status. Actual processed
counts and time range remain accessible DOM text supplied by the existing API.
