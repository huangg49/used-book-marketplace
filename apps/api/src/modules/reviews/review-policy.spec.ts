import { describe, expect, it } from 'vitest';
import type { TransactionReviewDoc as Review } from '../../database/mongo/documents.js';
import {
  publicationTime,
  reviewIsEditable,
  reviewIsPublic,
  REVIEW_EDIT_MS,
  REVIEW_SUBMISSION_MS,
} from './review-policy.js';
const completion = new Date('2026-01-01T00:00:00Z');
const record = (created: number, extra: Partial<Review> = {}) =>
  ({
    createdAt: new Date(created),
    editDeadline: new Date(created + REVIEW_EDIT_MS),
    deletedAt: null,
    hiddenAt: null,
    legacyDisclosed: false,
    evidenceHeld: false,
    ...extra,
  }) as Review;
describe('review publication and immutable first-submission windows', () => {
  it('keeps both reviews blind until the later edit deadline including exact boundary', () => {
    const a = record(+completion),
      b = record(+completion + 3600000),
      at = publicationTime(completion, [a, b])!;
    expect(+at).toBe(+b.editDeadline);
    expect(reviewIsPublic(a, at, new Date(+at - 1))).toBe(false);
    expect(reviewIsPublic(a, at, at)).toBe(true);
    expect(reviewIsEditable(b, new Date(+at - 1))).toBe(true);
    expect(reviewIsEditable(b, at)).toBe(false);
  });
  it('gives a review sent at the end of day 7 its entire 48 hours', () => {
    const r = record(+completion + REVIEW_SUBMISSION_MS - 1);
    expect(+publicationTime(completion, [r])!).toBe(+r.editDeadline);
  });
  it('waits out submission when only one participant reviewed early', () => {
    const r = record(+completion);
    expect(+publicationTime(completion, [r])!).toBe(
      +completion + REVIEW_SUBMISSION_MS,
    );
  });
  it('uses deleted tombstones for timing, but never publishes deleted/hidden text', () => {
    const a = record(+completion),
      b = record(+completion + 3600000, { deletedAt: completion });
    const at = publicationTime(completion, [a, b])!;
    expect(+at).toBe(+b.editDeadline);
    expect(reviewIsPublic(b, at, at)).toBe(false);
    expect(reviewIsPublic({ ...a, hiddenAt: at }, at, at)).toBe(false);
  });
  it('locks legacy disclosed or evidence-held reviews regardless of remaining time', () => {
    expect(
      reviewIsEditable(
        record(+completion, { legacyDisclosed: true }),
        completion,
      ),
    ).toBe(false);
    expect(
      reviewIsEditable(record(+completion, { evidenceHeld: true }), completion),
    ).toBe(false);
    expect(publicationTime(null, [record(+completion)])).toBeNull();
  });
});
