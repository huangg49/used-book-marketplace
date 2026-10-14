import { z } from 'zod';
import { session } from './api';

export const exchangeReviewItemSchema = z.object({
    id: z.string().uuid(),
    exchangeId: z.string().uuid(),
    authorId: z.string().uuid(),
    authorName: z.string().optional(),
    targetUserId: z.string().uuid(),
    bookRating: z.number().int().min(1).max(5),
    partnerRating: z.number().int().min(1).max(5),
    tags: z.array(z.string()).default([]),
    comment: z.string().default(''),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
});

export type ExchangeReviewItem = z.infer<typeof exchangeReviewItemSchema>;

export const exchangeReviewsResponseSchema = z.object({
    canReview: z.boolean(),
    deadline: z.string().nullable().optional(),
    myReview: exchangeReviewItemSchema.nullable().optional(),
    partnerReview: exchangeReviewItemSchema.nullable().optional(),
});

export type ExchangeReviewsResponse = z.infer<typeof exchangeReviewsResponseSchema>;

export interface CreateExchangeReviewInput {
    bookRating: number;
    partnerRating: number;
    tags?: string[];
    comment?: string;
}

export async function getExchangeReviews(exchangeId: string): Promise<ExchangeReviewsResponse> {
    return session.request(
        `/exchanges/${encodeURIComponent(exchangeId)}/reviews`,
        exchangeReviewsResponseSchema,
        { method: 'GET' }
    );
}

export async function createExchangeReview(
    exchangeId: string,
    data: CreateExchangeReviewInput
): Promise<ExchangeReviewItem> {
    return session.request(
        `/exchanges/${encodeURIComponent(exchangeId)}/reviews`,
        exchangeReviewItemSchema,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }
    );
}
