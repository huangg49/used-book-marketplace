import {
  AUTO_REVIEW_CHECKLIST,
  evaluateAutoReview,
  parseAssessment,
  precheckAutoReview,
  type AutoReviewAssessment,
  type AutoReviewFacts,
} from './auto-review-policy.js';

const facts = (over: Partial<AutoReviewFacts> = {}): AutoReviewFacts => ({
  channel: 'Marketplace',
  bundle: false,
  catalogConfirmed: true,
  ownerEligible: true,
  readable: true,
  hasMissingPages: false,
  missingEssentialContent: false,
  conditionDisclosed: true,
  photoCount: 2,
  previouslyDecided: false,
  hasListingFee: false,
  duplicatePhoto: false,
  salePrice: 100_000,
  exchangeValue: null,
  maxAutoPrice: 500_000,
  ...over,
});
const passing: AutoReviewAssessment = {
  catalogMatches: { pass: true, confidence: 0.95 },
  photosClear: { pass: true, confidence: 0.95 },
  conditionDisclosed: { pass: true, confidence: 0.95 },
  contentAppropriate: { pass: true, confidence: 0.95 },
};
const MIN = 0.85;

describe('precheckAutoReview', () => {
  it('finds no blocker for a plain confirmed single book', () => {
    expect(precheckAutoReview(facts())).toEqual([]);
  });

  it.each([
    ['AuctionChannel', { channel: 'Auction' as const }],
    ['Bundle', { bundle: true }],
    ['CatalogNotConfirmed', { catalogConfirmed: false }],
    ['OwnerIneligible', { ownerEligible: false }],
    ['NotReadable', { readable: false }],
    ['NotReadable', { readable: null }],
    ['MissingPages', { hasMissingPages: true }],
    ['MissingPages', { hasMissingPages: null }],
    ['MissingEssentialContent', { missingEssentialContent: true }],
    ['ConditionNotDisclosed', { conditionDisclosed: false }],
    ['TooFewPhotos', { photoCount: 1 }],
    ['PreviouslyDecided', { previouslyDecided: true }],
    ['ListingFee', { hasListingFee: true }],
    ['DuplicatePhoto', { duplicatePhoto: true }],
    ['PriceAboveAutoLimit', { salePrice: 500_001 }],
    ['PriceAboveAutoLimit', { exchangeValue: 500_001 }],
  ])('escalates with %s', (code, over) => {
    expect(precheckAutoReview(facts(over))).toContain(code);
  });

  it('accepts a price exactly at the limit', () => {
    expect(precheckAutoReview(facts({ salePrice: 500_000 }))).toEqual([]);
  });

  it('requires at least one price', () => {
    expect(
      precheckAutoReview(facts({ salePrice: null, exchangeValue: null })),
    ).toContain('PriceMissing');
  });
});

describe('evaluateAutoReview', () => {
  it('approves only when facts and all model criteria pass', () => {
    const result = evaluateAutoReview(facts(), passing, MIN);
    expect(result.outcome).toBe('Approve');
    expect(result.reasons).toEqual([]);
    expect(Object.keys(result.checklist!).sort()).toEqual(
      [...AUTO_REVIEW_CHECKLIST].sort(),
    );
    expect(Object.values(result.checklist!).every((v) => v === true)).toBe(true);
  });

  it('never rejects: a failed criterion escalates to Staff', () => {
    const result = evaluateAutoReview(
      facts(),
      { ...passing, contentAppropriate: { pass: false, confidence: 0.99 } },
      MIN,
    );
    expect(result).toEqual({
      outcome: 'Escalate',
      reasons: ['contentAppropriate:Failed'],
      checklist: null,
    });
  });

  it('escalates when confidence is below the threshold', () => {
    const result = evaluateAutoReview(
      facts(),
      { ...passing, photosClear: { pass: true, confidence: 0.84 } },
      MIN,
    );
    expect(result.outcome).toBe('Escalate');
    expect(result.reasons).toEqual(['photosClear:LowConfidence']);
  });

  it('accepts confidence exactly at the threshold', () => {
    const result = evaluateAutoReview(
      facts(),
      { ...passing, photosClear: { pass: true, confidence: MIN } },
      MIN,
    );
    expect(result.outcome).toBe('Approve');
  });

  it('a confident model cannot override a failed fact', () => {
    const result = evaluateAutoReview(facts({ readable: false }), passing, MIN);
    expect(result.outcome).toBe('Escalate');
    expect(result.reasons).toContain('NotReadable');
  });

  it('escalates when no assessment is available', () => {
    expect(evaluateAutoReview(facts(), null, MIN)).toEqual({
      outcome: 'Escalate',
      reasons: ['AssessmentUnavailable'],
      checklist: null,
    });
  });
});

describe('parseAssessment', () => {
  it('reads a complete assessment', () => {
    expect(parseAssessment(passing)).toEqual(passing);
  });

  it('drops unknown fields from the model', () => {
    const parsed = parseAssessment({ ...passing, approve: true });
    expect(parsed).toEqual(passing);
  });

  it.each([
    ['null', null],
    ['a string', 'approve'],
    ['a missing criterion', { ...passing, photosClear: undefined }],
    ['a string verdict', { ...passing, photosClear: { pass: 'true', confidence: 1 } }],
    ['confidence over 1', { ...passing, photosClear: { pass: true, confidence: 1.1 } }],
    ['negative confidence', { ...passing, photosClear: { pass: true, confidence: -0.1 } }],
    ['NaN confidence', { ...passing, photosClear: { pass: true, confidence: Number.NaN } }],
  ])('rejects %s', (_name, raw) => {
    expect(parseAssessment(raw)).toBeNull();
  });
});
