import sharp from 'sharp';
import { processImage } from '../src/modules/media/image-processor.js';
import { digest } from '../src/modules/media/media-storage.js';
describe('image decoder boundary', () => {
  it('applies EXIF orientation and removes GPS before displaying the derivative', async () => {
    const bytes = await sharp({
      create: { width: 80, height: 40, channels: 3, background: '#345678' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '10/1 46/1 0/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '106/1 40/1 0/1',
        },
      })
      .toBuffer();
    const input = await sharp(bytes).metadata();
    expect(input.orientation).toBe(6);
    expect(input.exif).toBeDefined();
    const result = await processImage(bytes, {
      byteSize: bytes.length,
      sha256: digest(bytes),
      mimeType: 'image/jpeg',
    });
    const output = await sharp(result.bytes).metadata();
    expect([result.width, result.height]).toEqual([40, 80]);
    expect(output.orientation).toBeUndefined();
    expect(output.exif).toBeUndefined();
  });
  it('rejects a valid PNG presented as JPEG and truncated raster bytes', async () => {
    const bytes = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#345678' },
    })
      .png()
      .toBuffer();
    await expect(
      processImage(bytes, {
        byteSize: bytes.length,
        sha256: digest(bytes),
        mimeType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ code: 'UnsupportedFormat' });
    const broken = bytes.subarray(0, 30);
    await expect(
      processImage(broken, {
        byteSize: broken.length,
        sha256: digest(broken),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'InvalidImage' });
  });
  it('rejects a multi-frame WebP even with its correct MIME and checksum', async () => {
    const pixels = Buffer.alloc(4 * 4 * 3);
    pixels.fill(255, 4 * 2 * 3);
    const bytes = await sharp(pixels, {
      raw: { width: 4, height: 4, channels: 3, pageHeight: 2 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(bytes, { animated: true }).metadata()).pages).toBe(2);
    await expect(
      processImage(bytes, {
        byteSize: bytes.length,
        sha256: digest(bytes),
        mimeType: 'image/webp',
      }),
    ).rejects.toMatchObject({ code: 'MultipleFrames' });
  });
  it('rejects a compressed raster above 40 megapixels before decoding the derivative', async () => {
    const bytes = await sharp({
      create: { width: 8001, height: 5000, channels: 3, background: '#345678' },
    })
      .png()
      .toBuffer();
    await expect(
      processImage(bytes, {
        byteSize: bytes.length,
        sha256: digest(bytes),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'TooManyPixels' });
  });
  it('strips metadata, preserves aspect and bounds dimensions', async () => {
    const bytes = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#123456' },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const result = await processImage(bytes, {
      byteSize: bytes.length,
      sha256: digest(bytes),
      mimeType: 'image/jpeg',
    });
    const meta = await sharp(result.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 800]);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });
  it('rejects wrong hash, wrong MIME and SVG even with a matching checksum', async () => {
    const bytes = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
    );
    await expect(
      processImage(bytes, {
        byteSize: bytes.length,
        sha256: digest(bytes),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'UnsupportedFormat' });
    await expect(
      processImage(bytes, {
        byteSize: bytes.length,
        sha256: '0'.repeat(64),
        mimeType: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'InvalidImage' });
  });
});
