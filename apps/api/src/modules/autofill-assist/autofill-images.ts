import { Injectable } from '@nestjs/common';
import sharp, { type Region } from 'sharp';
import { MAX_DERIVATIVE_BYTES, MediaStorage } from '../media/media-storage.js';
import { findAutofillDetail } from './autofill-detail.js';

// Hosted NIM vision endpoints take small inline images; stay under this.
export const MAX_INLINE_IMAGE_BYTES = 180_000;
export const AUTOFILL_IMAGE_PROFILE = 'listing-text-v2';
type Profile = typeof AUTOFILL_IMAGE_PROFILE;
const STEPS: [number, number][] = [
  [1024, 80],
  [1024, 65],
  [800, 60],
  [640, 55],
];

// Turns a Ready photo's derivative (EXIF already stripped) into a small JPEG
// data URL for the provider. Tests replace this with a fake.
export abstract class AutofillImages {
  abstract dataUrl(derivativeKey: string, profile?: Profile): Promise<string>;

  readingImages(keys: string[], _includeDetail: boolean): Promise<string[]> {
    return Promise.all(keys.map((key) => this.dataUrl(key, AUTOFILL_IMAGE_PROFILE)));
  }
}

// The interactive reader can use more pixels for fine print without changing
// the input used by the separately versioned moderation pipeline.
const TEXT_STEPS: [number, number][] = [[1536, 80], ...STEPS];
const DETAIL_STEPS: [number, number][] = [[640, 85], [640, 70], [512, 65]];

export async function shrinkForModel(bytes: Buffer, profile?: Profile, crop?: Region): Promise<string> {
  const steps = crop ? DETAIL_STEPS : profile === AUTOFILL_IMAGE_PROFILE ? TEXT_STEPS : STEPS;
  for (const [size, quality] of steps) {
    const image = sharp(bytes, { limitInputPixels: 40_000_000 });
    if (crop) image.extract(crop);
    const out = await image
      .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: !crop })
      .jpeg({ quality, mozjpeg: true })
      .timeout({ seconds: 10 })
      .toBuffer();
    if (out.length <= MAX_INLINE_IMAGE_BYTES)
      return `data:image/jpeg;base64,${out.toString('base64')}`;
  }
  throw new Error('Photo too large for the provider');
}

export async function prepareAutofillImages(photos: Buffer[], includeDetail: boolean): Promise<string[]> {
  const full = await Promise.all(photos.map((bytes) => shrinkForModel(bytes, AUTOFILL_IMAGE_PROFILE)));
  if (!includeDetail) return full;
  const candidates = await Promise.all(
    photos.map(async (bytes) => ({ bytes, detail: await findAutofillDetail(bytes).catch(() => null) })),
  );
  const best = candidates
    .flatMap(({ bytes, detail }) => detail ? [{ bytes, ...detail }] : [])
    .sort((a, b) => b.score - a.score)[0];
  if (!best) return full;
  try {
    const detail = await shrinkForModel(best.bytes, AUTOFILL_IMAGE_PROFILE, best.crop);
    return [...full, detail];
  } catch {
    return full;
  }
}

@Injectable()
export class StorageAutofillImages extends AutofillImages {
  constructor(private readonly storage: MediaStorage) {
    super();
  }
  async dataUrl(derivativeKey: string, profile?: Profile) {
    return shrinkForModel(await this.storage.read(derivativeKey, MAX_DERIVATIVE_BYTES), profile);
  }

  override async readingImages(keys: string[], includeDetail: boolean) {
    if (!includeDetail) return super.readingImages(keys, false);
    const photos = await Promise.all(keys.map((key) => this.storage.read(key, MAX_DERIVATIVE_BYTES)));
    return prepareAutofillImages(photos, true);
  }
}
