import { describe, expect, it } from 'vitest';
import type { BookBundle } from './book-bundle';
import { capturePurchaseListing, purchaseListingKey } from './purchase-listing';

function listing() {
  const bundle: BookBundle = { title: 'Bộ tập 1 và 3', wholeOnly: true, exclusiveOwnershipDeclared: true,
    items: [{ label: 'Tập 1', condition: 'Good', notes: '' }, { label: 'Tập 3', condition: 'Fair', notes: 'Bìa sờn; không có tập 2.' }] };
  return { id: 'listing-a', revisionId: 'revision-a', version: 7, salePrice: 150000, bundle };
}

describe('purchase intent contents', () => {
  it('requires acknowledgment of the currently displayed bundle', () => {
    expect(() => capturePurchaseListing(listing())).toThrow('xác nhận mua toàn bộ');
  });
  it.each([{ revisionId: 'revision-b' }, { id: 'listing-b' }])('rejects acknowledgment reused after identity changes: %j', change => {
    const original = listing();
    expect(() => capturePurchaseListing({ ...original, ...change }, purchaseListingKey(original))).toThrow();
  });
  it('does not revoke manifest acknowledgment for an availability-only version change', () => {
    const original = listing();
    expect(capturePurchaseListing({ ...original, version: 8 }, purchaseListingKey(original)).version).toBe(8);
  });
  it('pins every component, note, price and revision while live data changes during a retry', () => {
    const live = listing(), frozen = capturePurchaseListing(live, purchaseListingKey(live));
    live.bundle.items[1].notes = 'Ghi chú mới'; live.bundle.items.pop();
    live.bundle.title = 'Bộ mới'; live.salePrice = 900000; live.revisionId = 'revision-b';
    expect(frozen).toMatchObject({ revisionId: 'revision-a', salePrice: 150000, bundle: {
      title: 'Bộ tập 1 và 3', items: [{ label: 'Tập 1' }, { label: 'Tập 3', notes: 'Bìa sờn; không có tập 2.' }],
    } });
  });
  it('keeps single-book purchasing compatible without acknowledgment', () => {
    const single = { ...listing(), bundle: null };
    expect(capturePurchaseListing(single)).toEqual(single);
    expect(capturePurchaseListing(single)).not.toBe(single);
  });
});
