import sharp from 'sharp';
import { MAX_DERIVATIVE_BYTES, digest } from './media-storage.js';
import type { Wire } from '../commands/domain-error.js';

export class ImageFailure extends Error {
  constructor(readonly code: NonNullable<Wire['ListingMedia']['failureCode']>) {
    super(code);
  }
}
export async function processImage(
  bytes: Buffer,
  expected: { byteSize: number; sha256: string; mimeType: string },
) {
  if (bytes.length !== expected.byteSize || digest(bytes) !== expected.sha256)
    throw new ImageFailure('InvalidImage');
  try {
    const metadata = await sharp(bytes, {
      limitInputPixels: false,
      animated: true,
    }).metadata();
    const formats: Record<string, string> = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    if (!metadata.format || formats[metadata.format] !== expected.mimeType)
      throw new ImageFailure('UnsupportedFormat');
    if ((metadata.pages ?? 1) !== 1) throw new ImageFailure('MultipleFrames');
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 40_000_000
    )
      throw new ImageFailure('TooManyPixels');
    const { data, info } = await sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: 'warning',
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .timeout({ seconds: 20 })
      .toBuffer({ resolveWithObject: true });
    // Sharp strips EXIF/GPS by default. No crop, retouching or synthetic book details.
    if (data.length > MAX_DERIVATIVE_BYTES) throw new ImageFailure('TooLarge');
    return { bytes: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ImageFailure) throw error;
    throw new ImageFailure('InvalidImage');
  }
}
