# Bundled UI font

`Lora-SemiBold.ttf` is a static weight-600 instance of
`packages/brand/fonts/Lora[wght].ttf`, generated using fontTools 4.63.0.
The source SIL OFL license is in `lora-OFL.txt`. Be Vietnam Pro 400/700 is loaded
directly from the licensed files in the brand package. BrandProvider owns loading.

Recreate from the repository root:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
font = instantiateVariableFont(TTFont('packages/brand/fonts/Lora[wght].ttf'), {'wght': 600})
font.save('apps/mobile-react-native/assets/fonts/Lora-SemiBold.ttf')
```

Use Be Vietnam Pro for money: the bundled Lora source lacks U+20AB.
