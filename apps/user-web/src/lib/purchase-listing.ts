import type { PublicListing } from '../services/public-listings';

/** Acknowledgment belongs to the exact manifest the Buyer read. */
export function purchaseListingKey(listing: Pick<PublicListing, 'id' | 'revisionId'>) {
  return `${listing.id}:${listing.revisionId}`;
}

/** Keep quote retries and confirmation tied to the same displayed contents. */
export function capturePurchaseListing<T extends Pick<PublicListing, 'id' | 'revisionId' | 'bundle'>>(listing: T, acknowledged?: string): T {
  if (listing.bundle && acknowledged !== purchaseListingKey(listing))
    throw new Error('Xem danh sách và xác nhận mua toàn bộ các cuốn trong bộ.');
  return structuredClone(listing);
}
