// Pure decision rules for AI listing review (ADR 0061). The only outcomes are
// Approve and Escalate: rejecting a seller stays a Staff decision. The model
// judges what needs eyes; stored facts always win over a confident model.

export const AUTO_REVIEW_CHECKLIST = [
  'catalogMatches',
  'photosClear',
  'conditionDisclosed',
  'readable',
  'pricingValid',
  'contentAppropriate',
] as const;

const MODEL_CRITERIA = [
  'catalogMatches',
  'photosClear',
  'conditionDisclosed',
  'contentAppropriate',
] as const;
const MIN_PHOTOS = 2;

export interface AutoReviewFacts {
  channel: 'Marketplace' | 'Auction';
  bundle: boolean;
  catalogConfirmed: boolean;
  ownerEligible: boolean;
  readable: boolean | null;
  hasMissingPages: boolean | null;
  missingEssentialContent: boolean | null;
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
  maxAutoPrice: number;
}

export interface CriterionVerdict {
  pass: boolean;
  confidence: number;
}
export type AutoReviewAssessment = Record<
  (typeof MODEL_CRITERIA)[number],
  CriterionVerdict
>;
export type AutoReviewChecklist = Record<
  (typeof AUTO_REVIEW_CHECKLIST)[number],
  true
>;
export type AutoReviewResult =
  | { outcome: 'Approve'; reasons: []; checklist: AutoReviewChecklist }
  | { outcome: 'Escalate'; reasons: string[]; checklist: null };

// Runs before the provider call, so an ineligible listing costs nothing.
export function precheckAutoReview(f: AutoReviewFacts): string[] {
  const reasons: string[] = [];
  const block = (failed: boolean, code: string) => {
    if (failed) reasons.push(code);
  };
  block(f.channel === 'Auction', 'AuctionChannel');
  block(f.bundle, 'Bundle');
  block(!f.catalogConfirmed, 'CatalogNotConfirmed');
  block(!f.ownerEligible, 'OwnerIneligible');
  block(f.readable !== true, 'NotReadable');
  block(f.hasMissingPages !== false, 'MissingPages');
  block(f.missingEssentialContent !== false, 'MissingEssentialContent');
  block(!f.conditionDisclosed, 'ConditionNotDisclosed');
  block(f.photoCount < MIN_PHOTOS, 'TooFewPhotos');
  block(f.previouslyDecided, 'PreviouslyDecided');
  block(f.hasListingFee, 'ListingFee');
  block(f.duplicatePhoto, 'DuplicatePhoto');
  block(f.salePrice === null && f.exchangeValue === null, 'PriceMissing');
  block(
    Math.max(f.salePrice ?? 0, f.exchangeValue ?? 0) > f.maxAutoPrice,
    'PriceAboveAutoLimit',
  );
  return reasons;
}

export function evaluateAutoReview(
  facts: AutoReviewFacts,
  assessment: AutoReviewAssessment | null,
  minConfidence: number,
): AutoReviewResult {
  const reasons = precheckAutoReview(facts);
  if (!assessment) reasons.push('AssessmentUnavailable');
  else
    for (const key of MODEL_CRITERIA) {
      const verdict = assessment[key];
      if (!verdict.pass) reasons.push(`${key}:Failed`);
      else if (verdict.confidence < minConfidence)
        reasons.push(`${key}:LowConfidence`);
    }
  if (reasons.length) return { outcome: 'Escalate', reasons, checklist: null };
  return {
    outcome: 'Approve',
    reasons: [],
    checklist: Object.fromEntries(
      AUTO_REVIEW_CHECKLIST.map((key) => [key, true]),
    ) as AutoReviewChecklist,
  };
}

// Anything but the exact shape counts as no assessment, which escalates.
export function parseAssessment(raw: unknown): AutoReviewAssessment | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = {} as AutoReviewAssessment;
  for (const key of MODEL_CRITERIA) {
    const verdict = (raw as Record<string, unknown>)[key] as
      | Partial<CriterionVerdict>
      | undefined;
    if (
      typeof verdict?.pass !== 'boolean' ||
      typeof verdict.confidence !== 'number' ||
      !(verdict.confidence >= 0 && verdict.confidence <= 1)
    )
      return null;
    parsed[key] = { pass: verdict.pass, confidence: verdict.confidence };
  }
  return parsed;
}
