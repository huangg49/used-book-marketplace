import { getMyListings, getMyPhoto } from "../services/my-listings";

// Page size is part of the identity: the overview must never replace a shelf page.
export function myListingsQuery(
  ownerId: string | undefined,
  moderation = "",
  cursor?: string,
  limit = 20,
) {
  return {
    queryKey: ["my-listings", ownerId, moderation, cursor, limit] as const,
    queryFn: () => getMyListings(moderation || undefined, cursor, limit),
    enabled: !!ownerId,
  };
}

export function myListingPhotoQuery(
  ownerId: string | undefined,
  listingId: string,
  revisionId: string,
  mediaId: string | undefined,
) {
  return {
    queryKey: ["my-photo", ownerId, listingId, revisionId, mediaId] as const,
    queryFn: () => getMyPhoto(listingId, mediaId!),
    enabled: Boolean(ownerId && mediaId),
  };
}
