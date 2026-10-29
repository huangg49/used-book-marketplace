import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TransactionReviewDoc as Review } from '../../database/mongo/documents.js';
import {
  MongoCommandService,
  member,
  reviewer,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/mongo-command.service.js';
import {
  DomainError,
  conflict,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  publicationTime,
  reviewIsEditable,
  reviewIsPublic,
  REVIEW_EDIT_MS,
  REVIEW_SUBMISSION_MS,
  REVIEW_TYPES,
  type ReviewType,
} from './review-policy.js';
import {
  reviewTransaction,
  reviewGroup,
  reviewItem,
  reviewRevision,
} from './review-record.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly commands: MongoCommandService) {}
  type(value: string): ReviewType {
    if (!REVIEW_TYPES.includes(value as ReviewType))
      invalidField('type', 'Loại giao dịch không hợp lệ.');
    return value as ReviewType;
  }
  get(
    auth: Actor,
    type: ReviewType,
    id: string,
  ): Promise<Wire['TransactionReviewsResponse']> {
    return this.commands.read(auth, async (tx, actor) => {
      member(actor);
      const transaction = await reviewTransaction(tx, type, id, actor._id);
      const rows = await reviewGroup(tx, type, id),
        now = await tx.now();
      const publication = publicationTime(transaction.completedAt, rows);
      const mine = rows.find((r) => r.authorId === actor._id),
        peer = rows.find((r) => r.authorId !== actor._id);
      const deadline = transaction.completedAt
        ? new Date(transaction.completedAt.getTime() + REVIEW_SUBMISSION_MS)
        : null;
      return {
        canReview:
          actor.status === 'ACTIVE' && !!deadline && now < deadline && !mine,
        canEdit:
          actor.status === 'ACTIVE' && !!mine && reviewIsEditable(mine, now),
        canDelete:
          actor.status === 'ACTIVE' && !!mine && reviewIsEditable(mine, now),
        canReply:
          actor.status === 'ACTIVE' &&
          !!peer &&
          reviewIsPublic(peer, publication, now) &&
          !peer.reply,
        partnerId: transaction.partnerId,
        bookRatingRequired: transaction.bookRatingRequired,
        deadline: deadline?.toISOString() ?? null,
        serverTime: now.toISOString(),
        myReview: mine ? reviewItem(mine, publication, now, true, false) : null,
        // Target sees their pending reply, but no third party sees it until approved.
        partnerReview:
          peer && reviewIsPublic(peer, publication, now)
            ? reviewItem(peer, publication, now, true)
            : null,
      };
    });
  }
  getExchangeReviews(auth: Actor, id: string) {
    return this.get(auth, 'Exchange', id);
  }
  private scores(body: Wire['CreateTransactionReview'], required: boolean) {
    if (required && body.bookRating === undefined)
      invalidField('bookRating', 'Cần đánh giá chất lượng sách nhận được.');
    if (!required && body.bookRating !== undefined)
      invalidField(
        'bookRating',
        'Người bán chỉ đánh giá đối tác trong đơn mua.',
      );
    return {
      bookRating: required ? body.bookRating! : null,
      partnerRating: body.partnerRating,
      tags: body.tags ?? [],
      comment: (body.comment ?? '').trim(),
    };
  }
  create(
    context: CommandContext,
    type: ReviewType,
    id: string,
    body: Wire['CreateTransactionReview'],
  ) {
    return this.commands.runReview(
      context,
      'createTransactionReview',
      `${type}:${id}`,
      body,
      {
        authorize: async (tx, actor) => {
          member(actor, true);
          return reviewTransaction(tx, type, id, actor._id);
        },
        mutate: async (tx, actor) => {
          const transaction = await reviewTransaction(
            tx,
            type,
            id,
            actor._id,
            true,
          );
          const now = await tx.now();
          if (
            !transaction.completedAt ||
            now >=
              new Date(transaction.completedAt.getTime() + REVIEW_SUBMISSION_MS)
          )
            throw invalidState();
          if (
            await tx.c.transaction_reviews.findOne({
              transactionType: type,
              transactionId: id,
              authorId: actor._id,
            })
          )
            throw conflict();
          const r: Review = {
            _id: randomUUID(),
            transactionType: type,
            transactionId: id,
            authorId: actor._id,
            authorName: actor.displayName,
            targetUserId: transaction.partnerId,
            ...this.scores(body, transaction.bookRatingRequired),
            version: 1,
            editDeadline: new Date(now.getTime() + REVIEW_EDIT_MS),
            deletedAt: null,
            hiddenAt: null,
            evidenceHeld: false,
            legacyDisclosed: false,
            reply: null,
            publishedAt: null,
            createdAt: now,
            updatedAt: now,
            lockSeq: 0,
          };
          await tx.c.transaction_reviews.insertOne(r);
          await reviewRevision(tx, r, 'Create', actor._id, null, now);
          return {
            entityType: 'TransactionReview' as const,
            entityId: r._id,
            version: r.version,
            state: 'Pending',
            decidedAt: now,
            review: reviewItem(r, null, now, true),
          };
        },
      },
    );
  }
  createExchangeReview(
    context: CommandContext,
    id: string,
    body: Wire['CreateExchangeReview'],
  ) {
    return this.create(context, 'Exchange', id, body);
  }
  private async authorizeReview(
    tx: Tx,
    id: string,
    actorId: string,
    moderate = false,
  ) {
    const r = await tx.c.transaction_reviews.findOne({ _id: id });
    if (!r || (!moderate && ![r.authorId, r.targetUserId].includes(actorId)))
      throw notFound();
    if (moderate && [r.authorId, r.targetUserId].includes(actorId))
      throw new DomainError(
        403,
        'FORBIDDEN',
        'Không được xử lý đánh giá của giao dịch mình tham gia.',
      );
    return r;
  }
  change(
    context: CommandContext,
    id: string,
    action: 'edit' | 'delete' | 'reply' | 'moderate',
    body:
      | Wire['EditTransactionReview']
      | Wire['ReviewVersion']
      | Wire['ReplyTransactionReview']
      | Wire['ModerateTransactionReview'],
  ) {
    return this.commands.runReview(
      context,
      `${action}TransactionReview`,
      id,
      body,
      {
        authorize: async (tx, actor) => {
          if (action === 'moderate') reviewer(actor);
          else member(actor, true);
          const r = await this.authorizeReview(
            tx,
            id,
            actor._id,
            action === 'moderate',
          );
          if (
            action === 'reply'
              ? r.targetUserId !== actor._id
              : action !== 'moderate' && r.authorId !== actor._id
          )
            throw notFound();
          return r;
        },
        mutate: async (tx, actor, current) => {
          const transaction = await reviewTransaction(
            tx,
            current.transactionType,
            current.transactionId,
            current.authorId,
            true,
          );
          await tx.lock('transaction_reviews', [id]);
          const r = (await tx.c.transaction_reviews.findOne({ _id: id }))!;
          if (r.version !== body.expectedVersion) throw conflict();
          const rows = await reviewGroup(
              tx,
              r.transactionType,
              r.transactionId,
            ),
            now = await tx.now();
          const publication = publicationTime(transaction.completedAt, rows);
          let reason: string | null = null;
          if (action === 'edit' || action === 'delete') {
            if (!reviewIsEditable(r, now)) throw invalidState();
            if (action === 'edit')
              Object.assign(
                r,
                this.scores(
                  body as Wire['EditTransactionReview'],
                  transaction.bookRatingRequired,
                ),
              );
            else r.deletedAt = now;
          } else if (action === 'reply') {
            if (!reviewIsPublic(r, publication, now) || r.reply)
              throw invalidState();
            const text = (body as Wire['ReplyTransactionReview']).text.trim();
            if (!text)
              invalidField(
                'text',
                'Phản hồi không được chỉ chứa khoảng trắng.',
              );
            r.reply = { text, status: 'Pending', createdAt: now };
          } else {
            if (!publication || now < publication) throw notFound();
            const command = body as Wire['ModerateTransactionReview'];
            reason = command.reason.trim();
            if (reason.length < 3)
              invalidField('reason', 'Lý do cần ít nhất 3 ký tự có nội dung.');
            switch (command.decision) {
              case 'Hide':
                r.hiddenAt = now;
                break;
              case 'Restore':
                if (r.deletedAt) throw invalidState();
                r.hiddenAt = null;
                break;
              case 'HoldEvidence':
                r.evidenceHeld = true;
                break;
              case 'ReleaseEvidence':
                r.evidenceHeld = false;
                break;
              case 'ApproveReply':
                if (!r.reply) throw invalidState();
                r.reply.status = 'Approved';
                break;
              case 'HideReply':
                if (!r.reply) throw invalidState();
                r.reply.status = 'Hidden';
                break;
            }
          }
          r.version++;
          r.updatedAt = now;
          const { _id: _ignoredId, ...fields } = r;
          await tx.c.transaction_reviews.updateOne(
            { _id: id },
            { $set: fields },
          );
          await reviewRevision(
            tx,
            r,
            action === 'moderate'
              ? (body as Wire['ModerateTransactionReview']).decision
              : action,
            actor._id,
            reason,
            now,
          );
          const item = reviewItem(r, publication, now, true);
          return {
            entityType: 'TransactionReview' as const,
            entityId: id,
            version: r.version,
            state: item.status,
            decidedAt: now,
            review: item,
            ...(reason ? { reason } : {}),
          };
        },
      },
    );
  }
}
