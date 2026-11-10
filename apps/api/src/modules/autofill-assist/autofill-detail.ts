import sharp from 'sharp';

type Box = { left: number; top: number; right: number; bottom: number };
type Glyph = Box & { mid: number };
type Line = Box & { count: number; letterHeight: number };
type Block = { box: Box; last: Line; lines: number; letters: number };

const ANALYSIS_EDGE = 720;

// Local contrast ignores large areas of dark ink and uneven page lighting.
function glyphs(
  gray: Buffer,
  background: Buffer,
  width: number,
  height: number,
): Glyph[] {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < mask.length; i++)
    mask[i] = background[i]! - gray[i]! >= 20 ? 1 : 0;

  const queue = new Int32Array(mask.length);
  const letters: Glyph[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    let left = i % width,
      right = left,
      top = Math.floor(i / width),
      bottom = top;
    let end = 1;
    queue[0] = i;
    mask[i] = 0;
    for (let start = 0; start < end; start++) {
      const at = queue[start]!;
      const x = at % width,
        y = Math.floor(at / width);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) {
        if (y + dy < 0 || y + dy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= width) continue;
          const neighbor = at + dy * width + dx;
          if (!mask[neighbor]) continue;
          mask[neighbor] = 0;
          queue[end++] = neighbor;
        }
      }
    }
    const w = right - left + 1,
      h = bottom - top + 1;
    if (w >= 2 && h >= 3 && h <= 17 && w <= 24 && w <= h * 2 && end >= 5)
      letters.push({
        left,
        top,
        right: right + 1,
        bottom: bottom + 1,
        mid: (top + bottom) / 2,
      });
  }
  return letters;
}

function linesFrom(letters: Glyph[]): Line[] {
  const bands: Glyph[][] = [];
  for (const letter of letters.sort((a, b) => a.mid - b.mid)) {
    const band = bands.at(-1);
    if (band && letter.mid - band[0]!.mid <= 3) band.push(letter);
    else bands.push([letter]);
  }
  const lines: Line[] = [];
  for (const band of bands) {
    let run: Glyph[] = [];
    const finish = () => {
      if (run.length < 7) return;
      const left = run[0]!.left,
        right = Math.max(...run.map((letter) => letter.right));
      const inkWidth = run.reduce(
        (sum, letter) => sum + letter.right - letter.left,
        0,
      );
      if (right - left < 42 || inkWidth < (right - left) * 0.32) return;
      lines.push({
        left,
        right,
        top: Math.min(...run.map((letter) => letter.top)),
        bottom: Math.max(...run.map((letter) => letter.bottom)),
        count: run.length,
        letterHeight:
          run.reduce((sum, letter) => sum + letter.bottom - letter.top, 0) /
          run.length,
      });
    };
    for (const letter of band.sort((a, b) => a.left - b.left)) {
      const previous = run.at(-1);
      if (previous && letter.left - previous.right > 17) {
        finish();
        run = [];
      }
      run.push(letter);
    }
    finish();
  }
  return lines.sort((a, b) => a.top - b.top);
}

function blocksFrom(lines: Line[]): Block[] {
  const blocks: Block[] = [];
  let active: Block[] = [];
  for (const line of lines) {
    active = active.filter(({ last }) => line.top - last.bottom <= 18);
    const block = active.find(({ last }) => {
      const overlap =
        Math.min(last.right, line.right) - Math.max(last.left, line.left);
      return (
        line.top >= last.bottom - 2 &&
        overlap >=
          0.55 * Math.min(last.right - last.left, line.right - line.left) &&
        line.letterHeight / last.letterHeight >= 0.55 &&
        line.letterHeight / last.letterHeight <= 1.8
      );
    });
    if (!block) {
      const next = {
        box: { ...line },
        last: line,
        lines: 1,
        letters: line.count,
      };
      active.push(next);
      blocks.push(next);
      continue;
    }
    block.box.left = Math.min(block.box.left, line.left);
    block.box.right = Math.max(block.box.right, line.right);
    block.box.bottom = Math.max(block.box.bottom, line.bottom);
    block.last = line;
    block.lines++;
    block.letters += line.count;
  }
  return blocks;
}

// A detail is useful when several lines of small printed text occupy a compact
// portion of the photo. Keep surrounding context and abstain on weak signals.
export async function findAutofillDetail(bytes: Buffer) {
  const source = sharp(bytes, { limitInputPixels: 40_000_000 });
  const { width: sourceWidth, height: sourceHeight } = await source.metadata();
  if (!sourceWidth || !sourceHeight) return null;
  const { data, info } = await source
    .clone()
    .resize({
      width: ANALYSIS_EDGE,
      height: ANALYSIS_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#fff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (Math.max(width, height) < 400) return null;
  const background = await sharp(data, { raw: { width, height, channels: 1 } })
    .blur(3)
    .greyscale()
    .raw()
    .toBuffer();
  const lettersOnPage = glyphs(data, background, width, height);
  const rows = linesFrom(lettersOnPage);
  const candidates = blocksFrom(rows).flatMap(({ box, lines, letters }) => {
    const w = box.right - box.left,
      h = box.bottom - box.top;
    if (lines < 4 || letters < 40 || w > width * 0.55 || h > height * 0.23)
      return [];
    const pad = Math.max(12, Math.round(w * 0.1));
    if (
      box.left < pad ||
      box.top < pad ||
      box.right + pad > width ||
      box.bottom + pad > height
    )
      return [];
    if ((w + 2 * pad) * (h + 2 * pad) > width * height * 0.07) return [];
    // Leave excerpts in their original context when this looks like part of a
    // larger column rather than an isolated imprint or other short text block.
    const outside = lettersOnPage.filter(
      ({ left, right, mid }) =>
        left >= box.left &&
        right <= box.right &&
        (mid < box.top - pad || mid > box.bottom + pad),
    ).length;
    if (outside > letters) return [];
    const left = Math.floor(((box.left - pad) * sourceWidth) / width);
    const top = Math.floor(((box.top - pad) * sourceHeight) / height);
    const right = Math.ceil(((box.right + pad) * sourceWidth) / width);
    const bottom = Math.ceil(((box.bottom + pad) * sourceHeight) / height);
    return [
      {
        crop: { left, top, width: right - left, height: bottom - top },
        score:
          (Math.min(lines, 9) * Math.min(letters / lines, 24)) /
          Math.sqrt(w * h),
      },
    ];
  });
  return candidates.sort((a, b) => b.score - a.score)[0] ?? null;
}
