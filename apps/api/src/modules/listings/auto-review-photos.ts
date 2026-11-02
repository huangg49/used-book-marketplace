import sharp from 'sharp';
import type { PhotoSignal } from './auto-review-signals.js';

export const bytesOf = (dataUrl: string) =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');

// 64-bit difference hash plus the measurements of photoReasons. Bytes come from
// a Ready derivative; nothing here leaves the worker except the hash and numbers.
export async function photoSignal(bytes: Buffer): Promise<PhotoSignal> {
  const input = () => sharp(bytes, { limitInputPixels: 40_000_000 }).timeout({ seconds: 5 });
  const meta = await input().metadata();
  const stats = await input().greyscale().stats();
  const { data } = await input()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
  return {
    hash: bits.toString(16).padStart(16, '0'),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    brightness: stats.channels[0].mean,
    sharpness: stats.sharpness,
  };
}
