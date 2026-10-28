import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { MAX_DERIVATIVE_BYTES, MediaStorage } from '../media/media-storage.js';

// Hosted NIM vision endpoints take small inline images; stay under this.
export const MAX_INLINE_IMAGE_BYTES = 180_000;
const STEPS: [number, number][] = [
  [1024, 80],
  [1024, 65],
  [800, 60],
  [640, 55],
];

// Turns a Ready photo's derivative (EXIF already stripped) into a small JPEG
// data URL for the provider. Tests replace this with a fake.
export abstract class AutofillImages {
  abstract dataUrl(derivativeKey: string): Promise<string>;
}

export async function shrinkForModel(bytes: Buffer): Promise<string> {
  for (const [size, quality] of STEPS) {
    const out = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .timeout({ seconds: 10 })
      .toBuffer();
    if (out.length <= MAX_INLINE_IMAGE_BYTES)
      return `data:image/jpeg;base64,${out.toString('base64')}`;
  }
  throw new Error('Photo too large for the provider');
}

@Injectable()
export class StorageAutofillImages extends AutofillImages {
  constructor(private readonly storage: MediaStorage) {
    super();
  }
  async dataUrl(derivativeKey: string) {
    return shrinkForModel(await this.storage.read(derivativeKey, MAX_DERIVATIVE_BYTES));
  }
}
