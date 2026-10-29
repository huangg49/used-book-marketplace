import { createHash } from 'node:crypto';
import { canonicalJson } from '../../common/canonical-json.js';
import type { Wire } from '../commands/domain-error.js';
import { originGroups, sourceAliases } from './source-origin.js';

// Deterministic evidence rules (ADR 0028). Refusal, missing data and the
// evidence level are decided here; the model may only draft a range inside
// the bounds computed from the sources it is shown.

export const SALE_MIN = 10_000;
export const SALE_MAX = 1_000_000;
export const MAX_WIDTH_RATIO = 2.5;
const MONTH_MS = 30 * 24 * 3_600_000;
// Online shop prices change often; the lookup refreshes them monthly.
const STALE_MONTHS = { CoverPrice: 36, OnlineRetail: 3, other: 24 } as const;
const FRESH_MONTHS = 12;
const MAX_SOURCES = 20;

// Policy: what a used copy sells for, as a share of the new-book price, by
// condition. The range comes from this band, not from the model; the
// owner adjusts these numbers (ADR 0028). Missing pages cap it at Fair.
export const CONDITION_BANDS = {
  LikeNew: [0.55, 0.75],
  Good: [0.4, 0.6],
  Fair: [0.25, 0.45],
  Worn: [0.15, 0.3],
} as const satisfies Record<Condition, readonly [number, number]>;
// Sources that state a new-book price; the band is applied to their median.
// Staff-entered cover prices win over prices found online when both exist.
const NEW_PRICE_KINDS: ReadonlySet<SourceKind> = new Set([
  'CoverPrice',
  'OnlineRetail',
]);

export type Condition = Wire['BookCondition'];
export type SourceKind = Wire['PriceSourceKind'];

export interface PriceInput {
  bookId: string;
  condition: Condition | null;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
  conditionNote: string;
}
export interface BookFacts {
  id: string;
  title: string;
  authors: string[];
  publisher: string | null;
  publicationYear: number | null;
  language: string;
  edition: string | null;
  category: string;
  isbn: string | null;
  confirmed: boolean;
}
export interface RawSource {
  sourceGroup?: string | null;
  id: string;
  kind: SourceKind;
  amount: number;
  condition: Condition | null;
  label: string;
  url: string | null;
  observedAt: Date;
  isbn: string | null;
}
export interface Source extends Omit<Wire['PriceSource'], 'observedAt'> {
  observedAt: Date;
}
export interface Evidence {
  status: 'Proceed' | 'NeedsMoreData' | 'Refused';
  level: Wire['PriceEvidenceLevel'];
  rules: string[];
  sources: Source[];
  used: Source[];
  missing: string[];
  dataAsOf: Date | null;
  bounds: { low: number; high: number } | null;
}

// Contact-like text never reaches the provider: e-mail, URLs, and runs of 8+
// digits (phone/account numbers) are replaced before prompting or hashing.
export function sanitizeNote(note: string): string {
  return note
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[đã ẩn]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[đã ẩn]')
    .replace(/(?:\+?\d[\s.-]?){8,}/g, '[đã ẩn]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const roundTo = (value: number, step = 1000) => Math.round(value / step) * step;

// What the rules need to know about the listing besides the request body.
export interface ListingFacts {
  hasPhoto: boolean;
  // An online lookup for this book is running (ADR 0029).
  lookupPending?: boolean;
}

export function evaluate(
  input: PriceInput,
  book: BookFacts,
  raw: RawSource[],
  now: Date,
  listing: ListingFacts = { hasPhoto: true },
): Evidence {
  const rules: string[] = [];
  const missing: string[] = [];
  const ordered = [...raw]
    .sort(
      (a, b) =>
        b.observedAt.getTime() - a.observedAt.getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, MAX_SOURCES);
  const groups = originGroups(ordered);
  const sources: Source[] = ordered.map((s, i) => {
    const months = (now.getTime() - s.observedAt.getTime()) / MONTH_MS;
    const otherEdition =
      !!s.isbn &&
      !!book.isbn &&
      s.isbn.toUpperCase() !== book.isbn.toUpperCase();
    const stale =
      months >
      (s.kind === 'CoverPrice'
        ? STALE_MONTHS.CoverPrice
        : s.kind === 'OnlineRetail'
          ? STALE_MONTHS.OnlineRetail
          : STALE_MONTHS.other);
    return {
      ref: `s${i + 1}`,
      originGroup: groups[i],
      kind: s.kind,
      label: s.label,
      amount: s.amount,
      condition: s.condition,
      observedAt: s.observedAt,
      url: s.url,
      // Other sellers' asking prices are shown but never set the range: a
      // few coordinated listings could otherwise move every suggestion.
      excluded: otherEdition
        ? 'OtherEdition'
        : stale
          ? 'Stale'
          : s.kind === 'InternalAsking'
            ? 'AskingPrice'
            : null,
    };
  });
  const seen = new Map<string, Source>();
  for (const source of sources) {
    if (source.excluded || !source.originGroup) continue;
    const family = NEW_PRICE_KINDS.has(source.kind) ? 'new' : 'used';
    const key = `${source.originGroup}:${family}`;
    const previous = seen.get(key);
    // Preserve ADR0028: curated cover prices win over online shop prices.
    if (
      previous &&
      source.kind === 'CoverPrice' &&
      previous.kind === 'OnlineRetail'
    ) {
      previous.excluded = 'DuplicateSource';
      seen.set(key, source);
    } else if (previous) source.excluded = 'DuplicateSource';
    else seen.set(key, source);
  }
  if (sources.some((s) => s.excluded === 'DuplicateSource'))
    rules.push('R-EXCLUDED-DUPLICATE-SOURCE');
  // Outliers are judged only when enough sources remain to have a centre.
  const kept = sources.filter((s) => !s.excluded);
  if (kept.length >= 3) {
    const m = median(kept.map((s) => s.amount));
    for (const s of kept)
      if (s.amount < m / 3 || s.amount > m * 3) s.excluded = 'Outlier';
  }
  if (sources.some((s) => s.excluded === 'OtherEdition'))
    rules.push('R-EXCLUDED-OTHER-EDITION');
  if (sources.some((s) => s.excluded === 'Stale'))
    rules.push('R-EXCLUDED-STALE');
  if (sources.some((s) => s.excluded === 'Outlier'))
    rules.push('R-EXCLUDED-OUTLIER');
  if (sources.some((s) => s.excluded === 'AskingPrice'))
    rules.push('R-EXCLUDED-ASKING');
  const used = sources.filter((s) => !s.excluded);
  const dataAsOf = used.length ? used[0].observedAt : null;
  const answer = (
    status: Evidence['status'],
    level: Evidence['level'],
    bounds: Evidence['bounds'] = null,
  ): Evidence => ({
    status,
    level,
    rules,
    sources,
    used,
    missing,
    dataAsOf,
    bounds,
  });

  // Refusals first: the copy cannot be priced as a readable used book.
  // `missing` holds only the reason; clients add the lead-in and the
  // manual-pricing line, so neither is repeated here.
  if (input.readable === false) rules.push('R-REFUSE-UNREADABLE');
  if (input.missingEssentialContent === true) rules.push('R-REFUSE-ESSENTIAL');
  if (rules.some((r) => r.startsWith('R-REFUSE'))) {
    missing.push('Sách không còn đọc rõ hoặc thiếu nội dung trọng yếu.');
    return answer('Refused', 'Insufficient');
  }
  if (!listing.hasPhoto) {
    rules.push('R-NEED-PHOTO');
    missing.push('Thêm ít nhất 1 ảnh của bản sách ở bước Ảnh và tình trạng.');
  }
  if (!input.condition) {
    rules.push('R-NEED-CONDITION');
    missing.push('Chọn tình trạng bản sách ở bước Ảnh và tình trạng.');
  }
  if (input.readable === null || input.hasMissingPages === null) {
    rules.push('R-NEED-CONDITION-ANSWERS');
    missing.push('Trả lời các câu hỏi về độ đọc rõ và trang bị thiếu.');
  }
  if (input.missingEssentialContent === null) {
    if (!rules.includes('R-NEED-CONDITION-ANSWERS'))
      rules.push('R-NEED-CONDITION-ANSWERS');
    missing.push('Cho biết sách có thiếu nội dung trọng yếu hay không.');
  }
  if (!used.length) {
    rules.push(listing.lookupPending ? 'R-LOOKUP-PENDING' : 'R-NEED-SOURCES');
    missing.push(
      listing.lookupPending
        ? 'Đang tìm giá trên các nhà sách trực tuyến; thử lại sau ít phút.'
        : sources.some((s) => s.excluded === 'AskingPrice')
          ? 'Chỉ có giá rao của người bán khác; chưa có giá có nguồn để so sánh.'
          : 'Chưa có dữ liệu giá có nguồn cho đầu sách này.',
    );
  }
  if (missing.length) return answer('NeedsMoreData', 'Insufficient');

  // With a new-book price, the condition band sets the range. Without one,
  // the bounds come from the used-copy prices (editorial, completed sales).
  const newPrices = used.filter((s) => NEW_PRICE_KINDS.has(s.kind));
  let low: number;
  let high: number;
  if (newPrices.length) {
    const band = CONDITION_BANDS[bandCondition(input)];
    const staff = newPrices.filter((s) => s.kind === 'CoverPrice');
    const reference = median(
      (staff.length ? staff : newPrices).map((s) => s.amount),
    );
    rules.push(`R-BAND-${bandCondition(input).toUpperCase()}`);
    low = Math.max(SALE_MIN, roundTo(reference * band[0]));
    high = Math.min(SALE_MAX, roundTo(reference * band[1]));
  } else {
    rules.push('R-BAND-USED-PRICES');
    const amounts = used.map((s) => s.amount);
    low = Math.max(SALE_MIN, roundTo(Math.min(...amounts) * 0.3));
    high = Math.min(SALE_MAX, roundTo(Math.max(...amounts) * 1.1));
  }
  if (high < SALE_MIN) {
    rules.push('R-REFUSE-BELOW-MIN');
    missing.push('Giá tham chiếu thấp hơn mức bán tối thiểu 10.000 đồng.');
    return answer('Refused', 'Insufficient');
  }
  if (low > SALE_MAX) {
    rules.push('R-REFUSE-ABOVE-MAX');
    missing.push(
      'Giá tham chiếu cao hơn mức bán tối đa 1.000.000 đồng; cần nhân viên xét.',
    );
    return answer('Refused', 'Insufficient');
  }

  const independent = new Set(
    used.flatMap((s) => (s.originGroup ? [s.originGroup] : [])),
  );
  const fresh =
    now.getTime() - used[0].observedAt.getTime() <= FRESH_MONTHS * MONTH_MS;
  const editionUnverified = !book.isbn && !book.edition;
  // Strong needs a new-book price to band from and a used-copy price from
  // an independent source to place the range inside it.
  let strong = true;
  if (used.some((s) => !s.originGroup)) {
    rules.push('R-LIMITED-SOURCE-ORIGIN');
    strong = false;
  }
  if (used.length < 2 || independent.size < 2) {
    rules.push('R-LIMITED-FEW-SOURCES');
    strong = false;
  }
  if (!newPrices.length) {
    rules.push('R-LIMITED-NO-NEW-PRICE');
    strong = false;
  } else if (newPrices.length === used.length) {
    rules.push('R-LIMITED-COVER-ONLY');
    strong = false;
  }
  if (!fresh) {
    rules.push('R-LIMITED-OLD-DATA');
    strong = false;
  }
  if (editionUnverified) {
    rules.push('R-LIMITED-EDITION-UNVERIFIED');
    missing.push(
      'Đầu sách chưa có ISBN hoặc ấn bản; khoảng giá chỉ mang tính tham khảo rộng.',
    );
    strong = false;
  }
  if (!book.confirmed) {
    rules.push('R-LIMITED-CATALOG-PENDING');
    strong = false;
  }
  if (strong) rules.push('R-STRONG');
  return answer('Proceed', strong ? 'Strong' : 'Limited', { low, high });
}

// Missing pages cap the band at Fair whatever condition was chosen.
function bandCondition(input: PriceInput): Condition {
  const condition = input.condition!;
  if (!input.hasMissingPages) return condition;
  return condition === 'Worn' ? 'Worn' : 'Fair';
}

export function fingerprint(
  input: PriceInput,
  raw: RawSource[],
  listing: ListingFacts = { hasPhoto: true },
) {
  return createHash('sha256')
    .update(
      canonicalJson({
        input: { ...input, conditionNote: sanitizeNote(input.conditionNote) },
        listing,
        sources: raw
          .map((s) => ({
            id: s.id,
            kind: s.kind,
            amount: s.amount,
            condition: s.condition,
            observedAt: s.observedAt.toISOString(),
            isbn: s.isbn,
            sourceGroup: s.sourceGroup ?? null,
            originAliases: sourceAliases(s),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest('hex');
}
