// Lossless sprite export: alpha bounding-box crop only; no generated pixels repainted.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.CURTAIN_SHARP_PATH || 'sharp');
const base = __dirname;
const generated = process.argv[2];
if (!generated) throw new Error('Pass the absolute generated-image directory.');
const pieces = {
  front: ['valance-front'],
  rear: ['valance-rear-left', 'valance-rear-right'],
  outer: ['outer-left', 'outer-right'],
  closed: ['inner-closed-left', 'inner-closed-right'],
  open: ['inner-open-left', 'inner-open-right'],
  accessories: ['rope-left', 'rope-right', 'tassels-left', 'tassels-right', 'pendant-center', 'pendant-side'],
};
const placements = [
  ['inner-underlay-left', 'Lớp lót kín trái · đóng', 0, 0, 1020, 1080, 18, 'closed', [0, 0], 'inner-underlay'],
  ['inner-underlay-right', 'Lớp lót kín phải · đóng', 900, 0, 1020, 1080, 19, 'closed', [1, 0], 'inner-underlay'],
  ['inner-closed-left', 'Rèm trong trái · đóng', -80, -22, 1130, 1170, 20, 'closed', [0, 0]],
  ['inner-closed-right', 'Rèm trong phải · đóng', 870, -22, 1130, 1170, 21, 'closed', [1, 0]],
  ['inner-open-left', 'Rèm trong trái · mở', -8, -10, 212, 1100, 20, 'open', [0, 0]],
  ['inner-open-right', 'Rèm trong phải · mở', 1716, -10, 212, 1100, 21, 'open', [1, 0]],
  ['valance-rear-left', 'Diềm sau trái', -25, -4, 1110, 114, 40, 'both', [0, 0]],
  ['valance-rear-right', 'Diềm sau phải', 835, -4, 1110, 114, 41, 'both', [1, 0]],
  ['pendant-side-outer-left', 'Họa tiết diềm ngoài trái', 282, 96, 20, 23, 42, 'both', [.5, 0], 'pendant-side'],
  ['pendant-side-outer-right', 'Họa tiết diềm ngoài phải', 1618, 96, 20, 23, 42, 'both', [.5, 0], 'pendant-side'],
  ['pendant-side-inner-left', 'Họa tiết diềm trong trái', 442, 58, 20, 23, 42, 'both', [.5, 0], 'pendant-side'],
  ['pendant-side-inner-right', 'Họa tiết diềm trong phải', 1458, 58, 20, 23, 42, 'both', [.5, 0], 'pendant-side'],
  ['valance-front', 'Diềm giữa phía trước', 413, -8, 1094, 142, 50, 'both', [.5, 0]],
  ['pendant-center', 'Họa tiết giữa', 940, 126, 40, 32, 51, 'both', [.5, 0]],
  ['outer-left', 'Rèm ngoài trái', -6, -6, 190, 1092, 60, 'both', [0, 0]],
  ['outer-right', 'Rèm ngoài phải', 1736, -6, 190, 1092, 61, 'both', [1, 0]],
  ['rope-left', 'Dây cài trái', -2, 532, 64, 30, 70, 'both', [.8, .5]],
  ['rope-right', 'Dây cài phải', 1858, 532, 64, 30, 71, 'both', [.2, .5]],
  ['tassels-left', 'Tua trái', 17, 550, 64, 116, 80, 'both', [.5, 0]],
  ['tassels-right', 'Tua phải', 1839, 550, 64, 116, 81, 'both', [.5, 0]],
];
(async () => {
  const provenance = JSON.parse(await fs.readFile(path.join(base, 'generation-prompts.json'), 'utf8'));
  const audit = [];
  for (const source of provenance.sources) {
    const sourcePath = path.join(generated, source.file);
    await fs.copyFile(sourcePath, path.join(base, 'source', source.key + '.png'));
    const metadata = await sharp(sourcePath).metadata();
    if (!metadata.hasAlpha) throw new Error(source.key + ' has no alpha channel');
    const cols = source.key === 'front' ? 1 : 2;
    const rows = source.key === 'accessories' ? 3 : 1;
    for (let index = 0; index < pieces[source.key].length; index++) {
      const id = pieces[source.key][index];
      const col = index % cols, row = Math.floor(index / cols);
      const left = Math.floor(col * metadata.width / cols);
      const top = Math.floor(row * metadata.height / rows);
      const width = Math.floor((col + 1) * metadata.width / cols) - left;
      const height = Math.floor((row + 1) * metadata.height / rows) - top;
      const { data, info } = await sharp(sourcePath).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let x0 = width, y0 = height, x1 = -1, y1 = -1, visible = 0, transparent = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * info.channels + 3];
        if (alpha === 0) transparent++;
        if (alpha > 1) { visible++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      if (!visible || !transparent) throw new Error(id + ' must contain real transparency and visible pixels');
      const crop = { left: left + x0, top: top + y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
      await sharp(sourcePath).extract(crop).png().toFile(path.join(base, 'assets', id + '.png'));
      audit.push({ id, source: source.key, crop, visiblePixels: visible, transparentPixelsInCell: transparent, hasAlpha: true });
    }
  }
  await fs.copyFile(path.join(generated, 'exec-79288963-92b5-4e43-a1b5-13bab380add0.png'), path.join(base, 'reference-board.png'));
  let manifest = {
    version: 1, status: 'draft-awaiting-art-approval', viewport: { width: 1920, height: 1080 },
    art: 'AI-reconstructed layers from approved flat board; hidden regions repainted by image_gen, not original PSD layers.',
    motion: 'Not implemented. Closed and open inner assets are pose references; a later deforming rig must keep motion continuous.',
    navbarSlots: [{ id: 'behind', z: 10, label: 'Sau toàn bộ rèm' }, { id: 'under-frame', z: 30, label: 'Sau khung diềm và rèm ngoài' }, { id: 'between-valances', z: 45, label: 'Giữa diềm sau và diềm trước' }, { id: 'front', z: 90, label: 'Trước toàn bộ rèm' }],
    layers: placements.map(([id, label, x, y, width, height, z, pose, pivot, asset = id]) => ({ id, label, file: 'assets/' + asset + (asset === 'inner-underlay' ? '.svg' : '.png'), x, y, width, height, z, pose, pivot })),
  };
  const {attachLayers}=await import('./attachments.mjs');
  manifest=attachLayers(manifest);
  await fs.writeFile(path.join(base, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(base, 'alpha-audit.json'), JSON.stringify(audit, null, 2) + '\n');
  const template = await fs.readFile(path.join(base, 'preview.template.html'), 'utf8');
  await fs.writeFile(path.join(base, 'index.html'), template.replace('/* MANIFEST */null', JSON.stringify(manifest)));
  console.log(JSON.stringify({ assets: audit.length, layerInstances: manifest.layers.length, width: 1920, height: 1080, alphaValidated: audit.every(a => a.hasAlpha), folder: base }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
