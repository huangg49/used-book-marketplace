import {
  MAX_WIDTH_RATIO,
  SALE_MAX,
  SALE_MIN,
  type Evidence,
} from './evidence.js';

// JSON schema handed to the provider's structured output. Bounds are enforced
// below, not trusted from the provider.
export const MODEL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['low', 'high', 'factors', 'missing'],
  properties: {
    low: { type: 'integer' },
    high: { type: 'integer' },
    factors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'sourceRefs'],
        properties: {
          text: { type: 'string' },
          sourceRefs: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    missing: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface CheckedOutput {
  low: number;
  high: number;
  factors: { text: string; sourceRefs: string[] }[];
  missing: string[];
}

export class InvalidModelOutput extends Error {}

const fail = (reason: string): never => {
  throw new InvalidModelOutput(reason);
};
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

// Accepts only a range inside the evidence bounds and POL-16, factors that cite
// sources actually shown, and short plain text. Anything else is rejected whole.
export function checkOutput(raw: unknown, evidence: Evidence): CheckedOutput {
  if (!evidence.bounds || evidence.status !== 'Proceed')
    fail('no bounds for a model answer');
  const bounds = evidence.bounds!;
  if (!isObject(raw)) fail('not an object');
  const value = raw as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'factors,high,low,missing') fail(`unexpected keys ${keys}`);
  const { low: rawLow, high: rawHigh, factors, missing } = value;
  if (!Number.isSafeInteger(rawLow) || !Number.isSafeInteger(rawHigh))
    fail('range must be integers');
  const low = Math.round((rawLow as number) / 1000) * 1000;
  const high = Math.round((rawHigh as number) / 1000) * 1000;
  if (low > high) fail('low above high');
  if (low < Math.max(SALE_MIN, bounds.low) || high > Math.min(SALE_MAX, bounds.high))
    fail('range outside evidence bounds');
  if (high > low * MAX_WIDTH_RATIO) fail('range too wide');
  const allowed = new Set([...evidence.used.map((s) => s.ref), 'condition']);
  if (!Array.isArray(factors) || factors.length < 1 || factors.length > 6)
    fail('factors must have 1..6 items');
  const checked = (factors as unknown[]).map((item) => {
    if (!isObject(item)) fail('factor not an object');
    const { text, sourceRefs } = item as Record<string, unknown>;
    if (typeof text !== 'string') fail('factor text');
    const body = clean(text as string);
    if (!body || body.length > 240) fail('factor text length');
    if (/https?:\/\/|www\./i.test(body)) fail('factor contains a link');
    if (!Array.isArray(sourceRefs) || sourceRefs.length > 12)
      fail('factor refs');
    const refs = [...new Set(sourceRefs as unknown[])];
    if (refs.some((r) => typeof r !== 'string' || !allowed.has(r)))
      fail('factor cites an unknown source');
    return { text: body, sourceRefs: refs as string[] };
  });
  if (!checked.some((f) => f.sourceRefs.some((r) => r !== 'condition')))
    fail('no factor cites a price source');
  if (!Array.isArray(missing) || missing.length > 4) fail('missing list');
  const notes = (missing as unknown[]).map((m) => {
    if (typeof m !== 'string') fail('missing item');
    const body = clean(m as string);
    if (!body || body.length > 240) fail('missing item length');
    return body;
  });
  return { low, high, factors: checked, missing: notes };
}
