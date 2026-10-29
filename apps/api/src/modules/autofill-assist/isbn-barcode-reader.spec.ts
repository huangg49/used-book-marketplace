import sharp from 'sharp';
import { IsbnBarcodeReader } from './isbn-barcode-reader.js';
import { isbnImage } from '../../../test/helpers/isbn-image.js';
describe('local EAN-13 book decoding (real worker/Sharp/ZXing)', () => {
  it('reads an ISBN without inference, including rotated and reverse-facing barcodes', async () => {
    const reader = new IsbnBarcodeReader(),
      png = await isbnImage();
    expect(
      await reader.read(await sharp(png).ensureAlpha().png().toBuffer()),
    ).toEqual(['9786041234567']);
    for (const angle of [0, 90, 180])
      expect(
        await reader.read(await sharp(png).rotate(angle).png().toBuffer()),
      ).toEqual(['9786041234567']);
  });
  it('rejects a non-book product code, damaged checksum and a blank image', async () => {
    const reader = new IsbnBarcodeReader();
    expect(await reader.read(await isbnImage('4006381333931'))).toEqual([]);
    expect(await reader.read(await isbnImage('9786041234568'))).toEqual([]);
    expect(
      await reader.read(
        await sharp({
          create: { width: 600, height: 300, channels: 3, background: 'white' },
        })
          .png()
          .toBuffer(),
      ),
    ).toEqual([]);
  });
  it('returns ambiguity rather than picking the first of two visible ISBNs', async () => {
    const a = await isbnImage(),
      b = await isbnImage('9780306406157');
    const png = await sharp({
      create: { width: 1000, height: 600, channels: 3, background: 'white' },
    })
      .composite([
        { input: a, top: 10, left: 10 },
        { input: b, top: 310, left: 10 },
      ])
      .png()
      .toBuffer();
    expect(await new IsbnBarcodeReader().read(png)).toEqual([
      '9780306406157',
      '9786041234567',
    ]);
  });
});
