# Design-study assets

These are archival book images for the opt-in `/design` prototype and the
development/opt-in `/showcase` review screens, not evidence of
an offered physical book. Prices, sellers and condition notes are explicit demo data.
The fourth book is an invented long-title/no-image fixture. No generated photography
or fabricated ratings are used.

Original files were downloaded unmodified on 2026-09-24/25. Exact source URLs and
sizes are in `sources.json`. Rendering uses `contain`; no book cover is recolored.

| File | Credit and source | Rights stated by source |
|---|---|---|
| pride.jpg | National Library NZ on The Commons, [1894 Peacock edition](https://commons.wikimedia.org/wiki/File:AUSTEN(1894)_Pride_and_prejudice_(15811958311).jpg) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/); no edits to image |
| alice.jpg | [Alice's Adventures in Wonderland, 1865 cover](https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_(1865).jpg), Wikimedia Commons | Public domain as stated on file page |
| oz.jpg | W. W. Denslow, [The Wonderful Wizard of Oz first edition cover](https://commons.wikimedia.org/wiki/File:The_Wonderful_Wizard_of_Oz_first_edition_cover.jpg), Wikimedia Commons | Public domain, PD-old-70-expired |

Attribution and links to the source/license are available from each corresponding
detail screen. No source institution endorses this prototype.

`../fonts/Lora-SemiBold.ttf` is the weight-600 static instance of the bundled variable font
`packages/brand/fonts/Lora[wght].ttf`, made with fontTools 4.63.0 to avoid relying on
variable-font support on native devices. The original OFL license is reproduced in
`../fonts/lora-OFL.txt`. Be Vietnam Pro is loaded directly from the existing licensed brand
font files. Font loading has been checked in web; native rendering still needs a
device check.

Recreate the static font from repository root:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = instantiateVariableFont(TTFont('packages/brand/fonts/Lora[wght].ttf'), {'wght': 600})
font.save('apps/mobile-react-native/assets/fonts/Lora-SemiBold.ttf')
```
