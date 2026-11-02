// Deterministic checks on seller text and photo bytes (ADR 0063). They run with
// no model, so text that tries to steer a model cannot talk its way past them.

const HIDDEN = /[­​-‏‪-‮⁠-⁤﻿]/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|vn|me|io|shop|store)\b/i;
const PHONE = /(?:\+?\d[\s.-]?){8,}/;
const OFF_PLATFORM =
  /\b(?:zalo|facebook|fb|messenger|telegram|viber|whatsapp|instagram|tiktok|shopee|lazada|inbox|ib|chuyen khoan|bank transfer|ngoai san|lien he|ket ban|mua truc tiep|buy direct)\b/;
// Phrases, not single words: "ai" and "hệ thống" are ordinary Vietnamese. A miss
// still reaches the text stage; a false hit only costs a Staff review.
const INSTRUCTION =
  /\b(?:ignore (?:all|any|the|previous|prior|your)|disregard|bypass|bo qua (?:moi|tat ca|cac|quy tac|huong dan)|phot lo|(?:system|assistant|developer)\s*:|system prompt|prompt|instructions?|chi dan|chi dao|quan tri vien|nhan vien da|staff da|ghi chu cho ai|note (?:to|for) (?:the )?ai|\bai\s*:|llm|gpt|approve|approved|phe duyet|duyet bai|hay duyet|tra ve|json|confidence)\b|[{}]|"\s*:/;

// Lowercase, no diacritics: "Bỏ qua" and "bo qua" are the same signal.
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

export type SellerTextSignal =
  | 'SellerTextHiddenCharacters'
  | 'SellerTextContact'
  | 'SellerTextInstruction';

export function sellerTextSignals(fields: string[]): SellerTextSignal[] {
  const raw = fields.join('\n');
  const text = plain(raw);
  const signals: SellerTextSignal[] = [];
  if (HIDDEN.test(raw)) signals.push('SellerTextHiddenCharacters');
  if (EMAIL.test(raw) || URL_LIKE.test(raw) || PHONE.test(raw) || OFF_PLATFORM.test(text))
    signals.push('SellerTextContact');
  if (INSTRUCTION.test(text)) signals.push('SellerTextInstruction');
  return signals;
}

export interface PhotoSignal {
  hash: string;
  width: number;
  height: number;
  brightness: number;
  sharpness: number;
}

// Floors sit below every clean photo in the pilot set: they catch only photos
// no reviewer could use, and the model judges everything above them.
export const MIN_PHOTO_SIDE = 320;
export const MIN_PHOTO_SHARPNESS = 0.5;
export const PHOTO_BRIGHTNESS = [3, 245] as const;
// Out of 64 bits; recompressing or resizing the same photo stays within this.
export const NEAR_DUPLICATE_BITS = 5;

export function photoReasons(photos: PhotoSignal[]): string[] {
  const reasons = new Set<string>();
  for (const p of photos) {
    if (Math.min(p.width, p.height) < MIN_PHOTO_SIDE) reasons.add('PhotoTooSmall');
    if (p.sharpness < MIN_PHOTO_SHARPNESS) reasons.add('PhotoBlurred');
    if (p.brightness < PHOTO_BRIGHTNESS[0]) reasons.add('PhotoTooDark');
    if (p.brightness > PHOTO_BRIGHTNESS[1]) reasons.add('PhotoTooBright');
  }
  return [...reasons];
}

export function hashDistance(a: string, b: string): number {
  let bits = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let distance = 0;
  while (bits > 0n) {
    distance += Number(bits & 1n);
    bits >>= 1n;
  }
  return distance;
}

export function nearDuplicate(hashes: string[], others: string[]): boolean {
  return hashes.some((a) =>
    others.some((b) => hashDistance(a, b) <= NEAR_DUPLICATE_BITS),
  );
}
