# Sky and ocean detail assets —27/10/2026

Nine new separate cutouts generated with built-in ImageGen for the owner's
request to diversify the sky bird and enrich the first aquarium card. All are
WebP raster images in a minimal vector-cartoon style, not editable SVG paths.
The original PNGs remain under the generator default directory. The exact
prompts, source basenames and SHA256 are in
[ADMIN_ECOSYSTEM_DETAILS_PROMPTS](../../../../../docs/design/ADMIN_ECOSYSTEM_DETAILS_PROMPTS.json).

[manifest.json](manifest.json) lists dimensions, bytes and alpha. Total144014
bytes; all nine have transparent backgrounds. Derivatives trim alpha padding
with8px source margin, resize, encode WebP95/alpha100; no repainting. Existing
sky/forest/aquarium source assets and the standalone aquarium study are retained.

| File | Usage / anchor |
| --- | --- |
| blue-bird-body.webp | Sky swallow, facing right, short forked tail |
| blue-bird-wing.webp | Independent wing, root at upper right |
| feather.webp | Small floating feather, separate bounded rocking |
| blue-fish-body.webp | Right-facing blue reef fish, no caudal tail |
| blue-fish-tail.webp | Independent fan tail, hinge at right tip |
| fan-coral.webp | Peach coral, common bottom root for gentle sway |
| branch-coral.webp | Golden branching coral, bottom root |
| shell.webp | Scallop on sand above the caption clearance |
| sea-snail.webp | Small crawling snail, slow bounded displacement |

The reflective bubble sprite is procedural Canvas geometry,64×64, prepared once
at scene loading and reused per frame. No generated-image bitmap was edited to
create it. No new package, external stock imagery, or fake operational data.
