import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ExchangeDoc,
  TransactionReviewDoc,
} from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import {
  member,
  requireActive,
  type Actor,
} from '../commands/mongo-command.service.js';
import {
  DomainError,
  conflict,
  invalidState,
  notFound,
} from '../commands/domain-error.js';
import type { components } from '@used-books/api-contract';

type CreateReviewInput = components['schemas']['CreateExchangeReview'];
type ReviewItem = components['schemas']['ExchangeReviewItem'];
type ReviewsResponse = components['schemas']['ExchangeReviewsResponse'];

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly mongo: MongoService) {}

  private toItem(doc: TransactionReviewDoc): ReviewItem {
    return {
      id: doc._id,
      exchangeId: doc.transactionId,
      authorId: doc.authorId,
      authorName: doc.authorName,
      targetUserId: doc.targetUserId,
      bookRating: doc.bookRating,
      partnerRating: doc.partnerRating,
      tags: doc.tags,
      comment: doc.comment,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async getExchangeReviews(auth: Actor, exchangeId: string): Promise<ReviewsResponse> {
    if (!auth.user.roles.includes('MEMBER')) {
      throw new DomainError(403, 'FORBIDDEN', 'Tài khoản cần quyền thành viên.');
    }
    const userId = auth.user.id;

    return this.mongo.tx(async (tx) => {
      const exchange = await tx.c.exchanges.findOne({ _id: exchangeId });
      if (!exchange) throw notFound();

      if (exchange.initiatorId !== userId && exchange.recipientId !== userId) {
        throw notFound();
      }

      const isCompleted = exchange.status === 'Completed';
      const deadline = exchange.completedAt
        ? new Date(exchange.completedAt.getTime() + 168 * 3_600_000) // 168h per POL-18
        : null;
      const now = await tx.now();
      const withinDeadline = deadline ? now <= deadline : false;

      const myReview = await tx.c.transaction_reviews.findOne({
        transactionId: exchangeId,
        authorId: userId,
      });

      const partnerId =
        userId === exchange.initiatorId
          ? exchange.recipientId
          : exchange.initiatorId;

      const partnerReview = await tx.c.transaction_reviews.findOne({
        transactionId: exchangeId,
        authorId: partnerId,
      });

      const canReview = isCompleted && withinDeadline && !myReview;

      // FR-R03: Only reveal partner review when both have submitted, or when deadline has passed
      const partnerRevealed =
        Boolean(partnerReview) &&
        (Boolean(myReview) || (deadline !== null && now > deadline));

      return {
        canReview,
        deadline: deadline?.toISOString() ?? null,
        myReview: myReview ? this.toItem(myReview) : null,
        partnerReview: partnerRevealed && partnerReview ? this.toItem(partnerReview) : null,
      };
    });
  }

  async createExchangeReview(
    auth: Actor,
    exchangeId: string,
    body: CreateReviewInput,
  ): Promise<ReviewItem> {
    if (!auth.user.roles.includes('MEMBER')) {
      throw new DomainError(403, 'FORBIDDEN', 'Tài khoản cần quyền thành viên.');
    }
    if (auth.user.status !== 'ACTIVE') {
      throw new DomainError(403, 'AccountIneligible', 'Tài khoản chưa sẵn sàng.');
    }
    const userId = auth.user.id;

    return this.mongo.tx(async (tx) => {
      await tx.lock('exchanges', [exchangeId]);
      const exchange = await tx.c.exchanges.findOne({ _id: exchangeId });
      if (!exchange) throw notFound();

      if (exchange.initiatorId !== userId && exchange.recipientId !== userId) {
        throw notFound();
      }

      // FR-R01: Must be Completed and within POL-18 (168 hours)
      if (exchange.status !== 'Completed') {
        throw invalidState();
      }

      const now = await tx.now();
      const deadline = exchange.completedAt
        ? new Date(exchange.completedAt.getTime() + 168 * 3_600_000)
        : null;

      if (!deadline || now > deadline) {
        throw invalidState();
      }

      // Each participant can submit at most 1 review (FR-R01)
      const existing = await tx.c.transaction_reviews.findOne({
        transactionId: exchangeId,
        authorId: userId,
      });
      if (existing) {
        throw conflict();
      }

      const targetUserId =
        userId === exchange.initiatorId
          ? exchange.recipientId
          : exchange.initiatorId;

      const author = await tx.c.users.findOne({ _id: userId });
      const authorName = author?.displayName || auth.user.displayName || 'Người dùng';

      const bookRating = Math.max(1, Math.min(5, Math.floor(body.bookRating)));
      const partnerRating = Math.max(1, Math.min(5, Math.floor(body.partnerRating)));

      const reviewDoc: TransactionReviewDoc = {
        _id: randomUUID(),
        transactionType: 'Exchange',
        transactionId: exchangeId,
        authorId: userId,
        authorName,
        targetUserId,
        bookRating,
        partnerRating,
        tags: Array.isArray(body.tags) ? body.tags.slice(0, 10).map((t) => String(t).slice(0, 60)) : [],
        comment: (body.comment || '').trim().slice(0, 1000),
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
        lockSeq: 0,
      };

      await tx.c.transaction_reviews.insertOne(reviewDoc);

      this.logger.log(
        `[ReviewsService] Created review ${reviewDoc._id} for Exchange ${exchangeId} by ${userId} targeting ${targetUserId}`,
      );

      return this.toItem(reviewDoc);
    });
  }
}
