import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { TransactionReviewDoc as Review } from '../../database/mongo/documents.js';
import { MongoCommandService, member, type CommandContext, type Tx } from '../commands/mongo-command.service.js';
import { conflict, invalidState, notFound, type Wire } from '../commands/domain-error.js';
import { checkExchange } from '../wallet/ledger.service.js';
import { publicationTime, reviewIsEditable } from './review-policy.js';
import { reviewGroup, reviewItem, reviewRevision, reviewTransaction } from './review-record.js';

const ACTION = 'DemoTimeAdvance';
const DEMO_NOTE = '[DỮ LIỆU DEMO] Lịch sử nhập mẫu để thử đánh giá; không xác nhận giao hàng thật.';
const pairToken = (rows: Review[]) => createHash('sha256').update(JSON.stringify(
  [...rows].sort((a, b) => a._id.localeCompare(b._id)).map(r => [r._id, r.version]),
)).digest('hex');

@Injectable()
export class DemoReviewTime {
  constructor(private readonly commands: MongoCommandService, private readonly config: ConfigService) {}

  private enabled(id: string) {
    const mode = this.config.get<string>('NODE_ENV', 'development');
    if (!['development', 'test'].includes(mode) || this.config.get('DEMO_REVIEW_TIME_ENABLED') !== 'true') return false;
    try {
      const url = new URL(this.config.get<string>('MONGODB_URL', ''));
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
    } catch { return false; }
    return this.config.get<string>('DEMO_REVIEW_EXCHANGE_IDS', '').split(',').map(v => v.trim()).includes(id);
  }

  // An allowlist alone cannot turn an actual funded exchange into a sample.
  private async sample(tx: Tx, id: string) {
    const ex = await tx.c.exchanges.findOne({ _id: id });
    if (!ex || ex.status !== 'Completed' || !ex.completedAt || ex.agreement ||
      ex.initiatorDeposit !== 0 || ex.recipientDeposit !== 0 || ex.diffAmount !== 0 ||
      ex.initiatorFundedAt || ex.recipientFundedAt ||
      ex.initiatorShipment?.notes !== DEMO_NOTE || ex.recipientShipment?.notes !== DEMO_NOTE ||
      await tx.c.wallet_accounts.countDocuments({ orderId: { $in: [ex.initiatorOrderId, ex.recipientOrderId] } })) return null;
    return ex;
  }

  async state(tx: Tx, id: string, rows: Review[], now: Date): Promise<Wire['DemoReviewTimeAdvance'] | undefined> {
    if (!this.enabled(id)) return undefined;
    const ex = await this.sample(tx, id);
    if (!ex) return undefined;
    const applied = !!await tx.c.review_revisions.findOne({ reviewId: { $in: rows.map(r => r._id) }, action: ACTION });
    const available = !applied && rows.length === 2 && rows.every(r =>
      [ex.initiatorId, ex.recipientId].includes(r.authorId) &&
      r.targetUserId === (r.authorId === ex.initiatorId ? ex.recipientId : ex.initiatorId) &&
      reviewIsEditable(r, now) && !r.hiddenAt && !r.reply && !r.publishedAt);
    return { available, applied, pairToken: available ? pairToken(rows) : null };
  }

  advance(context: CommandContext, id: string, body: Wire['AdvanceDemoReviewTime']) {
    return this.commands.runReview(context, 'advanceDemoReviewTime', `Exchange:${id}`, body, {
      authorize: async (tx, actor) => {
        member(actor, true);
        if (!this.enabled(id)) throw notFound();
        await reviewTransaction(tx, 'Exchange', id, actor._id);
        if (!await this.sample(tx, id)) throw notFound();
      },
      mutate: async (tx, actor) => {
        await reviewTransaction(tx, 'Exchange', id, actor._id, true);
        let rows = await reviewGroup(tx, 'Exchange', id);
        await tx.lock('transaction_reviews', rows.map(r => r._id));
        rows = await reviewGroup(tx, 'Exchange', id);
        const now = await tx.now(), ex = await this.sample(tx, id);
        if (!ex) throw notFound();
        const mine = rows.find(r => r.authorId === actor._id);
        if (!mine || mine.version !== body.expectedVersion || pairToken(rows) !== body.pairToken) throw conflict();
        if (!(await this.state(tx, id, rows, now))?.available)
          throw invalidState('Chỉ mô phỏng được một lần, khi cả hai bên đã gửi và còn quyền sửa đánh giá.');
        // Shift the complete synthetic timeline by the SAME duration. Original
        // user content and prior immutable revision snapshots remain untouched.
        const deltaMs = Math.max(...rows.map(r => +r.editDeadline)) - +now + 1000;
        const originalTimes: Record<string, string> = {};
        const dates: Record<string, Date> = {};
        for (const [key, value] of Object.entries(ex)) {
          if (value instanceof Date && key !== 'updatedAt') {
            originalTimes[key] = value.toISOString();
            dates[key] = new Date(+value - deltaMs);
          }
        }
        const reason = `LOCAL DEMO ONLY; advanced synthetic history by ${deltaMs}ms; original exchange times=${JSON.stringify(originalTimes)}`;
        await tx.c.exchanges.updateOne({ _id: id }, { $set: { ...dates, updatedAt: now }, $inc: { revision: 1 } });
        const shiftedPublication = new Date(Math.max(...rows.map(r => +r.editDeadline)) - deltaMs);
        for (const r of rows) {
          r.createdAt = new Date(+r.createdAt - deltaMs);
          r.editDeadline = new Date(+r.editDeadline - deltaMs);
          r.publishedAt = shiftedPublication;
          r.version++;
          r.updatedAt = now;
          await tx.c.transaction_reviews.updateOne({ _id: r._id }, { $set: {
            createdAt: r.createdAt, editDeadline: r.editDeadline, publishedAt: r.publishedAt, version: r.version, updatedAt: now,
          } });
          await reviewRevision(tx, r, ACTION, actor._id, reason, now);
        }
        tx.check(`exchange:${id}`, () => checkExchange(tx, id));
        const publication = publicationTime(new Date(+ex.completedAt! - deltaMs), rows);
        return { entityType: 'TransactionReview' as const, entityId: mine._id, version: mine.version,
          state: 'Published', decidedAt: now, review: reviewItem(mine, publication, now, true), event: ACTION, reason };
      },
    });
  }
}
