import { z } from 'zod';
import { session } from './api';

const mediaReadSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  expiresAt: z.string(),
  width: z.number().int(),
  height: z.number().int(),
});

export const myListingSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  state: z.object({
    moderation: z.enum(['Draft', 'PendingReview', 'Approved', 'Rejected']),
    visibility: z.enum(['Visible', 'Hidden', 'Removed']),
    trade: z.enum(['Available', 'Reserved', 'Exchanged', 'Sold']),
  }),
  currentRevision: z.object({
    id: z.string().uuid(),
    bookId: z.string().nullable().optional(),
    content: z.object({
      bookId: z.string().nullable().optional(),
      title: z.string().nullable().optional(), // In case it's in content
      author: z.string().nullable().optional(),
      salePrice: z.number().int().nullable().optional(),
      exchangeValue: z.number().int().nullable().optional(),
      mode: z.enum(['Sale', 'Exchange', 'Both']).nullable().optional(),
      condition: z.enum(['LikeNew', 'Good', 'Fair', 'Worn']).nullable().optional(),
      mediaIds: z.array(z.string().uuid()).optional(),
    }).passthrough()
  }).passthrough(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const myListingPageSchema = z.object({
  items: z.array(myListingSchema),
  nextCursor: z.string().nullable(),
});

export type MyListing = z.infer<typeof myListingSchema>;

export function getMyListings(moderation?: string) {
  const query = moderation ? `?moderation=${moderation}` : '';
  return session.request(`/me/listings${query}`, myListingPageSchema);
}

export function getMyPhoto(listingId: string, mediaId: string) {
  return session.request(`/me/listings/${listingId}/media/${mediaId}/read`, mediaReadSchema);
}
