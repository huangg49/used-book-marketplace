import sharp from 'sharp';
// Independent EAN-13 encoder for synthetic tests; no production decoder/generator reuse.
export async function isbnImage(value = '9786041234567') {
  const left = [
    '0001101',
    '0011001',
    '0010011',
    '0111101',
    '0100011',
    '0110001',
    '0101111',
    '0111011',
    '0110111',
    '0001011',
  ];
  const even = [
    '0100111',
    '0110011',
    '0011011',
    '0100001',
    '0011101',
    '0111001',
    '0000101',
    '0010001',
    '0001001',
    '0010111',
  ];
  const parity = [
    'LLLLLL',
    'LLGLGG',
    'LLGGLG',
    'LLGGGL',
    'LGLLGG',
    'LGGLLG',
    'LGGGLL',
    'LGLGLG',
    'LGLGGL',
    'LGGLGL',
  ][Number(value[0])];
  const bits =
    '101' +
    Array.from(value.slice(1, 7))
      .map((n, i) => (parity[i] === 'L' ? left : even)[Number(n)])
      .join('') +
    '01010' +
    Array.from(value.slice(7))
      .map((n) =>
        [...left[Number(n)]].map((b) => (b === '1' ? '0' : '1')).join(''),
      )
      .join('') +
    '101';
  const width = (bits.length + 24) * 4,
    height = 260;
  const pixels = Buffer.alloc(width * height, 255);
  for (let y = 40; y < 200; y++)
    for (let x = 0; x < bits.length * 4; x++)
      if (bits[Math.floor(x / 4)] === '1') pixels[y * width + x + 48] = 0;
  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}
