import type { components } from '@used-books/api-contract';

type Snapshot = components['schemas']['AuditSnapshot'];
type Scalar = string | number | boolean | null;

// FR-G05/NFR-13: the activity log never returns credentials, tokens, contact
// or address data. Keys are split into words (camelCase/snake_case) and any
// sensitive word drops the field; nested objects are dropped too, so a new
// command that audits a rich payload is hidden until someone reviews it here.
const SENSITIVE_WORDS = new Set([
  'password', 'pass', 'passcode', 'pin', 'token', 'secret', 'hash', 'otp',
  'code', 'signature', 'key', 'phone', 'email', 'address', 'recipient',
  'detail', 'street', 'ward', 'iban', 'bank', 'card', 'ceiling', 'ip', 'agent',
  'note', 'notes', 'message', 'description', 'content', 'url', 'uri', 'cookie',
  'session', 'credential', 'credentials', 'auth', 'authorization',
]);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE = /(?:\+?84|0)\d{8,10}\b/;
const MAX_FIELDS = 60;
const MAX_STRING = 500;
const MAX_ITEMS = 20;
const MAX_ITEM_STRING = 200;

export function keyWords(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

export const sensitiveKey = (key: string) =>
  keyWords(key).some((w) => SENSITIVE_WORDS.has(w));

const looksPersonal = (value: string) => EMAIL.test(value) || PHONE.test(value);

function scalar(value: unknown, max: number): { ok: true; value: Scalar } | { ok: false } {
  if (value === null || typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number') return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  if (value instanceof Date) return { ok: true, value: value.toISOString() };
  if (typeof value === 'string') {
    if (looksPersonal(value)) return { ok: false };
    return { ok: true, value: value.length > max ? `${value.slice(0, max - 1)}…` : value };
  }
  return { ok: false };
}

export function redactSnapshot(raw: unknown): { snapshot: Snapshot | null; redacted: number } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { snapshot: null, redacted: 0 };
  const snapshot: Snapshot = {};
  let redacted = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(snapshot).length >= MAX_FIELDS || sensitiveKey(key)) {
      redacted += 1;
      continue;
    }
    if (Array.isArray(value)) {
      const items: Scalar[] = [];
      let ok = true;
      for (const item of value.slice(0, MAX_ITEMS)) {
        const s = scalar(item, MAX_ITEM_STRING);
        if (!s.ok) { ok = false; break; }
        items.push(s.value);
      }
      if (ok) snapshot[key] = items;
      else redacted += 1;
      continue;
    }
    const s = scalar(value, MAX_STRING);
    if (s.ok) snapshot[key] = s.value;
    else redacted += 1;
  }
  return { snapshot, redacted };
}

// A free-text reason may quote contact data; mask it rather than drop the row.
export function redactReason(reason: string | null) {
  if (!reason) return reason;
  return reason
    .replace(new RegExp(EMAIL.source, 'g'), '[email đã ẩn]')
    .replace(new RegExp(PHONE.source, 'g'), '[SĐT đã ẩn]');
}
