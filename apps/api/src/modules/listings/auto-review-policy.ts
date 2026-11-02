import { catalogText, titleSimilarity } from '../autofill-assist/catalog-ranking.js';
import { isbn13 } from '../commands/contract-input.service.js';

// Pure decision rules for AI listing review (ADR 0061, 0063). The only outcomes
// are Approve and Escalate: rejecting a seller stays a Staff decision. Server
// facts always win over a confident model, and no output field can ask for
// publication. Bump POLICY_VERSION whenever a rule, threshold or prompt changes:
// the worker stays off until LISTING_AUTO_REVIEW_APPROVED_POLICY names it.
export const POLICY_VERSION = 'auto-review-v3';

export const AUTO_REVIEW_CHECKLIST = [
  'catalogMatches',
  'photosClear',
  'conditionDisclosed',
  'readable',
  'pricingValid',
  'contentAppropriate',
] as const;

const MIN_PHOTOS = 2;
const USED_CONDITIONS = ['Good', 'Fair', 'Worn'] as const;
export type Condition = 'LikeNew' | (typeof USED_CONDITIONS)[number];

export interface AutoReviewSettings {
  maxAutoPrice: number;
  minAccountAgeDays: number;
  maxSubmissionsPerDay: number;
}

export interface AutoReviewFacts {
  channel: 'Marketplace' | 'Auction';
  bundle: boolean;
  catalogConfirmed: boolean;
  ownerEligible: boolean;
  ownerAccountAgeDays: number;
  // The owner's submissions in the last 24 hours, this one included.
  recentSubmissions: number;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
  condition: Condition | null;
  conditionDisclosed: boolean;
  photoCount: number;
  // A human already ruled on an earlier revision of this listing.
  previouslyDecided: boolean;
  // Historical fee settlement is tied to a Staff decision receipt.
  hasListingFee: boolean;
  // BR-01: a suspected duplicate copy goes to moderation.
  duplicatePhoto: boolean;
  salePrice: number | null;
  exchangeValue: number | null;
  // BR-09: the range trusted sources support, null when none do.
  priceBounds: { low: number; high: number } | null;
  textSignals: string[];
}

// Runs before the provider call, so an ineligible listing costs nothing.
export function precheckAutoReview(
  f: AutoReviewFacts,
  s: AutoReviewSettings,
): string[] {
  const reasons: string[] = [];
  const block = (failed: boolean, code: string) => {
    if (failed) reasons.push(code);
  };
  const prices = [f.salePrice, f.exchangeValue].filter(
    (p): p is number => p !== null,
  );
  block(f.channel === 'Auction', 'AuctionChannel');
  block(f.bundle, 'Bundle');
  block(!f.catalogConfirmed, 'CatalogNotConfirmed');
  block(!f.ownerEligible, 'OwnerIneligible');
  block(f.ownerAccountAgeDays < s.minAccountAgeDays, 'NewSellerAccount');
  block(f.recentSubmissions > s.maxSubmissionsPerDay, 'SellerVelocity');
  block(f.readable !== true, 'NotReadable');
  block(f.hasMissingPages !== false, 'MissingPages');
  block(f.missingEssentialContent !== false, 'MissingEssentialContent');
  block(!f.conditionDisclosed, 'ConditionNotDisclosed');
  // The grade with the most to gain from overstating; a person looks at it.
  block(f.condition === 'LikeNew', 'LikeNewNeedsStaff');
  block(f.photoCount < MIN_PHOTOS, 'TooFewPhotos');
  block(f.previouslyDecided, 'PreviouslyDecided');
  block(f.hasListingFee, 'ListingFee');
  block(f.duplicatePhoto, 'DuplicatePhoto');
  block(prices.length === 0, 'PriceMissing');
  block(
    prices.some((p) => p > s.maxAutoPrice),
    'PriceAboveAutoLimit',
  );
  block(f.priceBounds === null, 'NoTrustedPriceSource');
  block(
    f.priceBounds !== null &&
      prices.some((p) => p < f.priceBounds!.low || p > f.priceBounds!.high),
    'PriceOutsideReference',
  );
  reasons.push(...f.textSignals);
  return reasons;
}

// Below each floor the model is unsure, which means Staff. Set per criterion
// because a wrong pass costs more on some; not calibrated until measured on the
// human-reviewed holdout.
export const CRITERION_FLOORS = {
  contentAppropriate: 0.9,
  noOffPlatformContact: 0.9,
  noReviewerInstructions: 0.9,
  matchesDeclaredCondition: 0.85,
  realPhoto: 0.9,
  // Measured on v2: asked only "is it a real photo", the model passed flat scans.
  physicalCopyVisible: 0.9,
  singleCopy: 0.85,
  coverReadable: 0.85,
  conditionConsistent: 0.85,
  noAuthenticityRedFlags: 0.9,
  imageContentAppropriate: 0.9,
} as const;
export type Criterion = keyof typeof CRITERION_FLOORS;
export const TEXT_CRITERIA = [
  'contentAppropriate',
  'noOffPlatformContact',
  'noReviewerInstructions',
  'matchesDeclaredCondition',
] as const satisfies readonly Criterion[];
export const VISUAL_CRITERIA = [
  'realPhoto',
  'physicalCopyVisible',
  'singleCopy',
  'coverReadable',
  'conditionConsistent',
  'noAuthenticityRedFlags',
  'imageContentAppropriate',
] as const satisfies readonly Criterion[];

export interface Verdict {
  pass: boolean;
  confidence: number;
}
export type TextAssessment = Record<(typeof TEXT_CRITERIA)[number], Verdict>;
export const DAMAGE = ['None', 'Minor', 'Moderate', 'Severe'] as const;
export type Damage = (typeof DAMAGE)[number];
export type VisualAssessment = Record<(typeof VISUAL_CRITERIA)[number], Verdict> & {
  damage: Damage;
};
// What the photos show, read without seeing the seller's text or the catalog.
export interface Extraction {
  title: string | null;
  authors: string[];
  isbn: string | null;
  edition: string | null;
  publisher: string | null;
  contactOrInstructionTextVisible: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (v: Record<string, unknown>, keys: readonly string[]) => {
  const present = Object.keys(v);
  return present.length === keys.length && keys.every((k) => present.includes(k));
};
const verdict = (v: unknown): Verdict | null =>
  isRecord(v) &&
  exactKeys(v, ['pass', 'confidence']) &&
  typeof v.pass === 'boolean' &&
  typeof v.confidence === 'number' &&
  v.confidence >= 0 &&
  v.confidence <= 1
    ? { pass: v.pass, confidence: v.confidence }
    : null;
function verdicts<K extends Criterion>(
  raw: Record<string, unknown>,
  keys: readonly K[],
) {
  const out = {} as Record<K, Verdict>;
  for (const key of keys) {
    const parsed = verdict(raw[key]);
    if (!parsed) return null;
    out[key] = parsed;
  }
  return out;
}
const readText = (v: unknown, max: number): string | null | undefined =>
  v === null
    ? null
    : typeof v === 'string' && v.length <= max
      ? v.trim() || null
      : undefined;

// Each parser takes exactly its shape. An extra key, a wrong type or a value out
// of range counts as no assessment, which escalates: a model steered into adding
// {"approved":true} fails here rather than being ignored.
export function parseText(raw: unknown): TextAssessment | null {
  if (!isRecord(raw) || !exactKeys(raw, TEXT_CRITERIA)) return null;
  return verdicts(raw, TEXT_CRITERIA);
}
export function parseVisual(raw: unknown): VisualAssessment | null {
  if (!isRecord(raw) || !exactKeys(raw, [...VISUAL_CRITERIA, 'damage'])) return null;
  const parsed = verdicts(raw, VISUAL_CRITERIA);
  if (!parsed || !DAMAGE.includes(raw.damage as Damage)) return null;
  return { ...parsed, damage: raw.damage as Damage };
}
export function parseExtraction(raw: unknown): Extraction | null {
  const keys = [
    'title',
    'authors',
    'isbn',
    'edition',
    'publisher',
    'contactOrInstructionTextVisible',
  ];
  if (!isRecord(raw) || !exactKeys(raw, keys)) return null;
  const title = readText(raw.title, 300);
  const isbn = readText(raw.isbn, 40);
  const edition = readText(raw.edition, 120);
  const publisher = readText(raw.publisher, 200);
  if (
    title === undefined ||
    isbn === undefined ||
    edition === undefined ||
    publisher === undefined ||
    typeof raw.contactOrInstructionTextVisible !== 'boolean' ||
    !Array.isArray(raw.authors) ||
    raw.authors.length > 10 ||
    !raw.authors.every((a) => typeof a === 'string' && a.length <= 200)
  )
    return null;
  return {
    title,
    authors: (raw.authors as string[]).map((a) => a.trim()).filter(Boolean),
    isbn,
    edition,
    publisher,
    contactOrInstructionTextVisible: raw.contactOrInstructionTextVisible,
  };
}

export interface CatalogFacts {
  title: string;
  authors: string[];
  isbn: string | null;
  edition: string | null;
  publisher: string | null;
}
export type Match = 'Match' | 'Mismatch' | 'Unread' | 'NotInCatalog';
export interface Comparison {
  title: Match;
  author: Match;
  isbn: Match;
  edition: Match;
  publisher: Match;
  barcodes: string[];
}

const sameTitle = (read: string, catalog: string) => {
  const a = catalogText(read);
  const b = catalogText(catalog);
  if (!a || !b) return false;
  if (a === b) return true;
  // A cover often omits the subtitle; a short title must match exactly.
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  if (short.length >= 5 && ` ${long} `.includes(` ${short} `)) return true;
  return titleSimilarity(a, b) >= 0.85;
};
const sameName = (read: string, catalog: string) => {
  const a = catalogText(read);
  const b = catalogText(catalog);
  if (!a || !b) return false;
  return a === b || titleSimilarity(a, b) >= 0.8 || a.endsWith(` ${b}`) || b.endsWith(` ${a}`);
};
const compareOptional = (
  read: string | null,
  catalog: string | null,
  same: (a: string, b: string) => boolean,
): Match =>
  !catalog ? 'NotInCatalog' : !read ? 'Unread' : same(read, catalog) ? 'Match' : 'Mismatch';

// The server, not the model, decides whether what was read is this catalog book.
// A barcode decoded locally outranks digits the model says it read.
export function compareExtraction(
  read: Extraction,
  catalog: CatalogFacts,
  barcodes: string[],
): Comparison {
  const readIsbn = read.isbn ? isbn13(read.isbn.replace(/[\s-]/g, '')) : null;
  const found = barcodes.length ? barcodes : readIsbn ? [readIsbn] : [];
  const expected = catalog.isbn ? isbn13(catalog.isbn) ?? catalog.isbn : null;
  return {
    title: !read.title
      ? 'Unread'
      : sameTitle(read.title, catalog.title)
        ? 'Match'
        : 'Mismatch',
    author: !catalog.authors.length
      ? 'NotInCatalog'
      : !read.authors.length
        ? 'Unread'
        : read.authors.some((r) => catalog.authors.some((c) => sameName(r, c)))
          ? 'Match'
          : 'Mismatch',
    isbn: !expected
      ? 'NotInCatalog'
      : !found.length
        ? 'Unread'
        : found.includes(expected)
          ? 'Match'
          : 'Mismatch',
    edition: compareOptional(read.edition, catalog.edition, sameTitle),
    publisher: compareOptional(read.publisher, catalog.publisher, sameName),
    barcodes,
  };
}

export function comparisonReasons(c: Comparison, read: Extraction): string[] {
  const reasons: string[] = [];
  if (c.title === 'Unread') reasons.push('TitleUnread');
  if (c.title === 'Mismatch') reasons.push('TitleMismatch');
  if (c.author === 'Mismatch') reasons.push('AuthorMismatch');
  // With no author on the photos, only an ISBN can tie the copy to the record.
  if (c.author === 'Unread' && c.isbn !== 'Match') reasons.push('AuthorUnread');
  if (c.isbn === 'Mismatch') reasons.push('IsbnMismatch');
  if (c.edition === 'Mismatch') reasons.push('EditionMismatch');
  if (c.publisher === 'Mismatch') reasons.push('PublisherMismatch');
  if (read.contactOrInstructionTextVisible) reasons.push('PhotoTextFlagged');
  return reasons;
}

const WORST_DAMAGE: Record<(typeof USED_CONDITIONS)[number], Damage> = {
  Good: 'Minor',
  Fair: 'Moderate',
  Worn: 'Moderate',
};
export function damageReasons(condition: Condition, damage: Damage): string[] {
  if (damage === 'Severe') return ['SevereDamage'];
  if (condition === 'LikeNew') return damage === 'None' ? [] : ['ConditionOverstated'];
  return DAMAGE.indexOf(damage) > DAMAGE.indexOf(WORST_DAMAGE[condition])
    ? ['ConditionOverstated']
    : [];
}

export interface CriterionResult {
  stage: 'Text' | 'Visual';
  criterion: Criterion;
  pass: boolean;
  confidence: number;
  floor: number;
  met: boolean;
}
export function judgeCriteria(
  stage: CriterionResult['stage'],
  assessment: Partial<Record<Criterion, Verdict>>,
  keys: readonly Criterion[],
  minConfidence: number,
): { results: CriterionResult[]; reasons: string[] } {
  const results: CriterionResult[] = [];
  const reasons: string[] = [];
  for (const criterion of keys) {
    const { pass, confidence } = assessment[criterion]!;
    const floor = Math.max(CRITERION_FLOORS[criterion], minConfidence);
    const met = pass && confidence >= floor;
    results.push({ stage, criterion, pass, confidence, floor, met });
    if (!pass) reasons.push(`${criterion}:Failed`);
    else if (!met) reasons.push(`${criterion}:LowConfidence`);
  }
  return { results, reasons };
}

export function checklist() {
  return Object.fromEntries(
    AUTO_REVIEW_CHECKLIST.map((key) => [key, true]),
  ) as Record<(typeof AUTO_REVIEW_CHECKLIST)[number], true>;
}
export type AutoReviewChecklist = ReturnType<typeof checklist>;
