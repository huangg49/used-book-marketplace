import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

type QuoteInput = {
  quoteId: string;
  expectedQuoteVersion: number;
  expectedListingVersion: number;
  expectedListingRevisionId: string;
};

// Prepare the public seller-selected flow through HTTP. Callers still issue
// POST /orders themselves, so authorization, races and replay are not bypassed.
export async function prepareSellerOrder(
  app: INestApplication,
  buyer: { token: string },
  quoteBody: QuoteInput,
  agreedBookPrice?: number,
) {
  const post = (path: string, body: object) => request(app.getHttpServer())
    .post('/api/v1' + path)
    .set('Authorization', `Bearer ${buyer.token}`)
    .set('Idempotency-Key', randomUUID())
    .send(body);
  const quote = (await request(app.getHttpServer())
    .get(`/api/v1/me/quotes/${quoteBody.quoteId}`)
    .set('Authorization', `Bearer ${buyer.token}`).expect(200)).body;
  const conversation = (await post(
    `/listings/${quote.listingId}/purchase-conversations`,
    { expectedVersion: quoteBody.expectedListingVersion },
  ).expect(200)).body;
  const attached = (await post(
    `/me/purchase-conversations/${conversation.entityId}/quote`,
    { ...quoteBody, expectedVersion: conversation.version },
  ).expect(200)).body;
  return {
    quoteBody,
    body: {
      conversationId: conversation.entityId as string,
      expectedVersion: attached.version as number,
      agreedBookPrice: agreedBookPrice ?? (quote.amounts.bookPrice as number),
    },
  };
}
