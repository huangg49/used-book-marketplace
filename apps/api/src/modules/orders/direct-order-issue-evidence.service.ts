import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import type { DirectOrderIssueEvidenceDoc, UserDoc } from '../../database/mongo/documents.js';
import type { Tx } from '../../database/mongo/transaction.js';
import { admin, member, MongoCommandService, type Actor, type CommandContext, type OrderChange } from '../commands/mongo-command.service.js';
import { conflict, DomainError, invalidState, notFound, type Wire } from '../commands/domain-error.js';
import { digest, EvidenceStorage, MediaStorage } from '../media/media-storage.js';
import { ImageUploadSlots } from '../media/image-upload-slots.js';
import { validateEvidence } from '../exchanges/evidence-validation.js';
import { loadOrder } from './orders.service.js';
import { packagingPreviewKey } from './packaging-evidence.service.js';

const storageKey = (asset: DirectOrderIssueEvidenceDoc) => `direct-order-issues/${asset.caseId}/${asset._id}/original`;

@Injectable()
export class DirectOrderIssueEvidenceService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly storage: EvidenceStorage,
    private readonly media: MediaStorage,
    private readonly slots: ImageUploadSlots,
  ) {}

  private async access(tx: Tx, caseId: string, actor: UserDoc, write = false) {
    const support = await tx.c.support_cases.findOne({ _id: caseId, 'target.type': 'DirectOrder' });
    if (!support?.target) throw notFound();
    const order = await loadOrder(tx.c, support.target.id);
    const issue = await tx.c.direct_order_journey_events.findOne({ orderId: support.target.id, supportCaseId: caseId });
    if (!order?.context || !issue || issue.actorId !== support.reporterId) throw notFound();
    const owner = support.reporterId === actor._id && order.buyerId === actor._id;
    if (owner) member(actor);
    else {
      if (write || support.assigneeId !== actor._id || support.involvedUserIds.includes(actor._id)) throw notFound();
      admin(actor);
    }
    return { support, order, owner };
  }

  private findAsset(tx: Tx, caseId: string, id: string) {
    return tx.c.direct_order_issue_evidence.findOne({ _id: id, caseId });
  }

  private change(order: NonNullable<Awaited<ReturnType<typeof loadOrder>>>, now: Date, event: string): OrderChange {
    return {
      entityType: 'Order', entityId: order._id, contextId: order.context!._id,
      version: order.version, state: order.state as OrderChange['state'], decidedAt: now,
      paymentDeadline: order.paymentDeadline, affectedListings: [], event,
    };
  }

  list(auth: Actor, caseId: string) {
    return this.commands.readObligation(auth, async (tx, actor) => {
      const { order } = await this.access(tx, caseId, actor);
      const items = await tx.c.direct_order_issue_evidence.find({ caseId }, { sort: { createdAt: 1 }, limit: 5 }).toArray();
      const shipment = await tx.c.direct_shipments.findOne({ orderId: order._id });
      const packaging = shipment
        ? await tx.c.shipment_packaging_evidence.find({ shipmentId: shipment._id }, { sort: { position: 1 } }).toArray()
        : [];
      return {
        items: items.map(({ _id, mimeType, byteSize, sha256, status }) => ({ id: _id, mimeType, byteSize, sha256, status } satisfies Wire['DirectOrderIssueEvidence'])),
        packagingEvidenceIds: packaging.map((item) => item.evidenceId),
      };
    });
  }

  reserve(context: CommandContext, caseId: string, body: Wire['ReserveDirectOrderIssueEvidence']) {
    return this.commands.runOrder(context, 'reserveDirectOrderIssueEvidence', caseId, body, {
      discover: async () => [context.auth.user.id],
      authorize: (tx, actor) => this.access(tx, caseId, actor, true),
      mutate: async (tx, actor, before, receiptId) => {
        await tx.lock('support_cases', [caseId]);
        const { support, order } = await this.access(tx, caseId, actor, true);
        if (support.state === 'Closed' || order.state !== 'ResolutionPending') throw invalidState();
        const existing = await tx.c.direct_order_issue_evidence.findOne({ caseId, sha256: body.sha256 });
        if (existing || await tx.c.direct_order_issue_evidence.countDocuments({ caseId }) >= 5)
          throw invalidState('Tệp này đã có hoặc hồ sơ đã đủ 5 tệp.');
        const now = await tx.now();
        await tx.c.direct_order_issue_evidence.insertOne({
          _id: body.evidenceId, caseId, orderId: before.order._id, uploaderId: actor._id,
          mimeType: body.mimeType, byteSize: body.byteSize, sha256: body.sha256,
          status: 'Pending', createdAt: now, createdReceiptId: receiptId,
          uploadedAt: null, uploadReceiptId: null, lockSeq: 0,
        });
        return this.change(order, now, 'DirectOrderIssueEvidenceReserved');
      },
    });
  }

  async upload(context: CommandContext, caseId: string, id: string, request: Request) {
    const asset = await this.commands.readObligation(context.auth, async (tx, actor) => {
      const { support, order } = await this.access(tx, caseId, actor, true);
      const item = await this.findAsset(tx, caseId, id);
      if (!item || item.uploaderId !== actor._id) throw notFound();
      if (item.status === 'Pending' && (support.state === 'Closed' || order.state !== 'ResolutionPending')) throw invalidState();
      return item;
    });
    if (request.header('content-type')?.split(';')[0] !== 'application/octet-stream')
      throw new DomainError(415, 'UnsupportedMediaType', 'Dùng application/octet-stream.');
    if (Number(request.header('content-length')) > asset.byteSize)
      throw new DomainError(413, 'PayloadTooLarge', 'Tệp vượt quá kích thước đã đăng ký.');
    const release = this.slots.claim();
    const timer = setTimeout(() => request.destroy(), 120_000);
    try {
      const parts: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > asset.byteSize) throw new DomainError(413, 'PayloadTooLarge', 'Tệp vượt quá kích thước đã đăng ký.');
        parts.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(parts);
      if (bytes.length !== asset.byteSize || digest(bytes) !== asset.sha256)
        throw new DomainError(422, 'VALIDATION_ERROR', 'Hãy chọn lại đúng tệp đã đăng ký.');
      if (asset.status === 'Pending') {
        await validateEvidence(bytes, asset);
        await this.storage.check();
        await this.storage.put(storageKey(asset), bytes, asset.mimeType);
      }
      return await this.commands.runOrder(context, 'uploadDirectOrderIssueEvidence', id, { caseId, sha256: asset.sha256 }, {
        discover: async () => [context.auth.user.id],
        authorize: async (tx, actor) => {
          await this.access(tx, caseId, actor, true);
          if ((await this.findAsset(tx, caseId, id))?.uploaderId !== actor._id) throw notFound();
        },
        mutate: async (tx, actor, _before, receiptId) => {
          await tx.lock('support_cases', [caseId]);
          const { support, order } = await this.access(tx, caseId, actor, true);
          if (support.state === 'Closed' || order.state !== 'ResolutionPending') throw invalidState();
          const now = await tx.now();
          const updated = await tx.c.direct_order_issue_evidence.updateOne(
            { _id: id, caseId, uploaderId: actor._id, status: 'Pending' },
            { $set: { status: 'Ready', uploadedAt: now, uploadReceiptId: receiptId } },
          );
          if (!updated.modifiedCount) throw conflict();
          return this.change(order, now, 'DirectOrderIssueEvidenceUploaded');
        },
      });
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  async read(auth: Actor, caseId: string, id: string, requestId: string, reason?: string): Promise<Wire['ExchangeEvidenceRead']> {
    const authorize = async (tx: Tx, actor: UserDoc) => {
      const { owner, order } = await this.access(tx, caseId, actor);
      if (!owner && (!reason || reason.trim().length < 5))
        throw new DomainError(422, 'VALIDATION_ERROR', 'Nhập lý do xem bằng chứng.');
      const asset = await this.findAsset(tx, caseId, id);
      if (asset) {
        if (asset.status !== 'Ready') throw notFound();
        return { asset, order };
      }
      const shipment = await tx.c.direct_shipments.findOne({ orderId: order._id });
      if (!shipment || !await tx.c.shipment_packaging_evidence.findOne({ shipmentId: shipment._id, evidenceId: id }))
        throw notFound();
      return { asset, order };
    };
    const { asset } = await this.commands.readObligation(auth, authorize);
    const storage = asset ? this.storage : this.media;
    await storage.check();
    const signed = asset ? await this.storage.attachment(storageKey(asset)) : await this.media.signedRead(packagingPreviewKey(id));
    await this.commands.readObligation(auth, async (tx, actor) => {
      const { order } = await authorize(tx, actor);
      await tx.c.audit_events.insertOne({
        _id: randomUUID(), actorId: actor._id, systemActor: null, receiptId: null,
        listingId: null, bookId: null, mediaId: null, addressBookId: null,
        quoteId: null, contextId: order.context!._id, topupId: null,
        action: 'readDirectOrderIssueEvidence', before: null, after: { caseId, evidenceId: id, source: asset ? 'Inspection' : 'Packaging' },
        reason: reason?.trim() || null, requestId, createdAt: await tx.now(),
      });
    });
    return { id, ...signed };
  }
}
