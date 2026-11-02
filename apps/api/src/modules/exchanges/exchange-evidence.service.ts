import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import type {
  ExchangeEvidenceDoc,
  UserDoc,
} from '../../database/mongo/documents.js';
import {
  MongoCommandService,
  member,
  staff,
  type Actor,
  type CommandContext,
  type Tx,
} from '../commands/mongo-command.service.js';
import {
  conflict,
  DomainError,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import { EvidenceStorage, digest } from '../media/media-storage.js';
import { ImageUploadSlots } from '../media/image-upload-slots.js';
import {
  lockStorageBudget,
  reservedStorage,
  recentUploads,
} from '../media/media.service.js';
import { validateEvidence, evidenceLimit } from './evidence-validation.js';
const key = (id: string) => `exchange-evidence/${id}/original`;
const quota = () =>
  new DomainError(
    429,
    'MediaQuotaExceeded',
    'Đã đạt giới hạn bằng chứng. Tối đa 10 tệp mỗi thành viên; tệp đang chờ cũng chiếm chỗ.',
  );
const projection = (m: ExchangeEvidenceDoc): Wire['ExchangeEvidence'] => ({
  id: m._id,
  exchangeId: m.exchangeId,
  uploaderId: m.uploaderId,
  fileName: m.fileName,
  mimeType: m.mimeType,
  byteSize: m.byteSize,
  sha256: m.sha256,
  status: m.status,
  createdAt: m.createdAt.toISOString(),
  uploadedAt: m.uploadedAt?.toISOString() ?? null,
});
@Injectable()
export class ExchangeEvidenceService {
  constructor(
    private readonly commands: MongoCommandService,
    private readonly storage: EvidenceStorage,
    private readonly slots: ImageUploadSlots,
    private readonly config: ConfigService,
  ) {}
  private async exchange(
    tx: Tx,
    id: string,
    actor: UserDoc,
    operations = false,
    assigned = true,
  ) {
    const e = await tx.c.exchanges.findOne({ _id: id });
    if (!e) throw notFound();
    if (operations) {
      staff(actor);
      if ([e.initiatorId, e.recipientId].includes(actor._id))
        throw new DomainError(
          403,
          'SelfReviewForbidden',
          'Không được xem bằng chứng với vai trò vận hành trong giao dịch của mình.',
        );
      if (assigned) {
        const a = await tx.c.exchange_evidence_assignments.findOne({ _id: id });
        if (a?.assigneeId !== actor._id)
          throw new DomainError(
            403,
            'FORBIDDEN',
            'Nhận phụ trách bằng chứng trước khi xem tệp.',
          );
      }
    } else {
      member(actor);
      if (![e.initiatorId, e.recipientId].includes(actor._id)) throw notFound();
    }
    return e;
  }
  private async asset(tx: Tx, id: string, eid: string) {
    const m = await tx.c.exchange_evidence.findOne({
      _id: eid,
      exchangeId: id,
    });
    if (!m) throw notFound();
    return m;
  }
  private async discover(tx: Tx, id: string) {
    const e = await tx.c.exchanges.findOne({ _id: id });
    const a = await tx.c.exchange_evidence_assignments.findOne({ _id: id });
    return [e?.initiatorId, e?.recipientId, a?.assigneeId].filter(
      Boolean,
    ) as string[];
  }
  private change(
    e: { _id: string; initiatorListingId: string },
    id: string,
    version: number,
    state: Wire['ExchangeEvidenceReceipt']['state'],
    now: Date,
    reason?: string,
  ) {
    return {
      entityType: 'ExchangeEvidence' as const,
      entityId: id,
      exchangeId: e._id,
      initiatorListingId: e.initiatorListingId,
      version,
      state,
      decidedAt: now,
      reason,
    };
  }
  create(
    context: CommandContext,
    id: string,
    body: Wire['CreateExchangeEvidence'],
  ) {
    return this.commands.runEvidence(
      context,
      'createExchangeEvidence',
      id,
      body,
      {
        discover: (tx) => this.discover(tx, id),
        authorize: async (tx, actor) => {
          const e = await this.exchange(tx, id, actor);
          return e;
        },
        mutate: async (tx, actor, _e, receiptId) => {
          await tx.lock('exchanges', [id]);
          const e = await this.exchange(tx, id, actor);
          if (e.status !== 'ResolutionPending')
            throw invalidState('Gửi báo sự cố trước khi bổ sung bằng chứng.');
          if (e.revision !== body.expectedVersion) throw conflict();
          if (
            body.byteSize > evidenceLimit(body.mimeType) ||
            !body.fileName.trim() ||
            body.fileName.includes('/') ||
            body.fileName.includes('\\') ||
            [...body.fileName].some(
              (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
            )
          )
            throw new DomainError(
              422,
              'VALIDATION_ERROR',
              'Tên hoặc dung lượng tệp không hợp lệ.',
            );
          if (
            await tx.c.exchange_evidence.findOne({
              exchangeId: id,
              uploaderId: actor._id,
              sha256: body.sha256,
            })
          )
            throw conflict();
          await lockStorageBudget(tx);
          const now = await tx.now();
          if (
            (await tx.c.exchange_evidence.countDocuments({
              exchangeId: id,
              uploaderId: actor._id,
            })) >= 10 ||
            (await recentUploads(tx, actor._id, now)) >= 20 ||
            (await reservedStorage(tx)) + body.byteSize >
              this.config.get<number>('MEDIA_STORAGE_BUDGET_BYTES', 800000000)
          )
            throw quota();
          const eid = randomUUID();
          await tx.c.exchange_evidence.insertOne({
            _id: eid,
            exchangeId: id,
            uploaderId: actor._id,
            fileName: body.fileName.trim(),
            mimeType: body.mimeType,
            byteSize: body.byteSize,
            sha256: body.sha256,
            reservedBytes: body.byteSize,
            status: 'Pending',
            version: 1,
            createdAt: now,
            uploadedAt: null,
            createReceiptId: receiptId,
            uploadReceiptId: null,
          });
          return this.change(e, eid, 1, 'Pending', now);
        },
      },
    );
  }
  list(
    auth: Actor,
    id: string,
    operations = false,
  ): Promise<Wire['ExchangeEvidenceList']> {
    return this.commands.readObligation(
      auth,
      async (tx, actor) => {
        await this.exchange(tx, id, actor, operations);
        const items = await tx.c.exchange_evidence
          .find(
            {
              exchangeId: id,
              ...(operations
                ? { status: 'Ready' as const }
                : {
                    $or: [
                      { status: 'Ready' as const },
                      { uploaderId: actor._id },
                    ],
                  }),
            },
            { sort: { createdAt: 1, _id: 1 }, limit: 20 },
          )
          .toArray();
        return { items: items.map(projection) };
      },
      (tx) => this.discover(tx, id),
    );
  }
  async upload(context: CommandContext, id: string, eid: string, req: Request) {
    const m = await this.commands.readObligation(
      context.auth,
      async (tx, actor) => {
        const e = await this.exchange(tx, id, actor);
        const m = await this.asset(tx, id, eid);
        if (m.uploaderId !== actor._id) throw notFound();
        if (m.status === 'Pending' && e.status !== 'ResolutionPending')
          throw invalidState();
        return m;
      },
    );
    if (
      req.header('content-type')?.split(';')[0] !== 'application/octet-stream'
    )
      throw new DomainError(
        415,
        'UnsupportedMediaType',
        'Dùng application/octet-stream.',
      );
    if (Number(req.header('content-length')) > m.byteSize)
      throw new DomainError(
        413,
        'PayloadTooLarge',
        'Tệp vượt dung lượng đã khai báo.',
      );
    const release = this.slots.claim();
    const deadline = Date.now() + 180000;
    const timer = setTimeout(() => req.destroy(), 180000);
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > m.byteSize)
          throw new DomainError(
            413,
            'PayloadTooLarge',
            'Tệp vượt dung lượng đã khai báo.',
          );
        chunks.push(Buffer.from(c));
      }
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== m.byteSize || digest(bytes) !== m.sha256)
        throw new DomainError(
          422,
          'VALIDATION_ERROR',
          'Nội dung tệp đã thay đổi; không gửi thay thế vào yêu cầu cũ.',
        );
      if (m.status === 'Pending') {
        await validateEvidence(bytes, m);
        await this.storage.check();
        await this.storage.put(key(eid), bytes, m.mimeType);
      }
      return await this.commands.runEvidence(
        context,
        'uploadExchangeEvidence',
        eid,
        { exchangeId: id, sha256: m.sha256 },
        {
          discover: (tx) => this.discover(tx, id),
          authorize: async (tx, actor) => {
            const e = await this.exchange(tx, id, actor);
            const a = await this.asset(tx, id, eid);
            if (a.uploaderId !== actor._id) throw notFound();
            return { e, a };
          },
          mutate: async (tx, actor, _current, receiptId) => {
            await tx.lock('exchanges', [id]);
            const e = await this.exchange(tx, id, actor);
            const a = await this.asset(tx, id, eid);
            if (
              e.status !== 'ResolutionPending' ||
              a.status !== 'Pending' ||
              Date.now() > deadline
            )
              throw invalidState();
            const now = await tx.now();
            await tx.c.exchange_evidence.updateOne(
              { _id: eid, status: 'Pending', version: 1 },
              {
                $set: {
                  status: 'Ready',
                  version: 2,
                  uploadedAt: now,
                  uploadReceiptId: receiptId,
                },
              },
            );
            return this.change(e, eid, 2, 'Ready', now);
          },
        },
      );
    } finally {
      clearTimeout(timer);
      release();
    }
  }
  access(auth: Actor, id: string): Promise<Wire['ExchangeEvidenceAccess']> {
    return this.commands.read(
      auth,
      async (tx, actor) => {
        await this.exchange(tx, id, actor, true, false);
        const a = await tx.c.exchange_evidence_assignments.findOne({ _id: id });
        return { version: a?.version ?? 0, assigneeId: a?.assigneeId ?? null };
      },
      (tx) => this.discover(tx, id),
    );
  }
  assign(
    context: CommandContext,
    id: string,
    body: Wire['AssignExchangeEvidence'],
  ) {
    return this.commands.runEvidence(
      context,
      'assignExchangeEvidence',
      id,
      body,
      {
        discover: (tx) => this.discover(tx, id),
        authorize: (tx, actor) => this.exchange(tx, id, actor, true, false),
        mutate: async (tx, actor) => {
          if (body.reason.trim().length < 5)
            throw new DomainError(
              422,
              'VALIDATION_ERROR',
              'Nhập lý do tiếp nhận.',
            );
          await tx.lock('exchanges', [id]);
          const e = await this.exchange(tx, id, actor, true, false);
          if (e.status !== 'ResolutionPending') throw invalidState();
          const a = await tx.c.exchange_evidence_assignments.findOne({
            _id: id,
          });
          if ((a?.version ?? 0) !== body.expectedVersion) throw conflict();
          if (
            a &&
            a.assigneeId !== actor._id &&
            !actor.roles.some((r) => r.role === 'ADMIN')
          )
            throw new DomainError(
              403,
              'FORBIDDEN',
              'Hồ sơ đã có người phụ trách. Admin có thể nhận lại với lý do.',
            );
          const now = await tx.now();
          const version = (a?.version ?? 0) + 1;
          await tx.c.exchange_evidence_assignments.updateOne(
            { _id: id },
            {
              $set: { assigneeId: actor._id, version, updatedAt: now },
              $setOnInsert: { lockSeq: 0 },
            },
            { upsert: true },
          );
          return this.change(
            e,
            id,
            version,
            'Assigned',
            now,
            body.reason.trim(),
          );
        },
      },
    );
  }
  async read(
    auth: Actor,
    id: string,
    eid: string,
    requestId: string,
    operations = false,
    reason?: string,
  ): Promise<Wire['ExchangeEvidenceRead']> {
    const authorize = async (tx: Tx, actor: UserDoc) => {
      const e = await this.exchange(tx, id, actor, operations);
      const m = await this.asset(tx, id, eid);
      if (m.status !== 'Ready') throw invalidState('Tệp chưa gửi thành công.');
      if (operations && (!reason || reason.trim().length < 5))
        throw new DomainError(
          422,
          'VALIDATION_ERROR',
          'Cần lý do xem bằng chứng.',
        );
      return { e, m };
    };
    await this.commands.readObligation(auth, authorize, (tx) =>
      this.discover(tx, id),
    );
    await this.storage.check();
    const signed = await this.storage.attachment(key(eid));
    await this.commands.readObligation(
      auth,
      async (tx, actor) => {
        const { e } = await authorize(tx, actor);
        await tx.c.audit_events.insertOne({
          _id: randomUUID(),
          actorId: actor._id,
          systemActor: null,
          receiptId: null,
          listingId: e.initiatorListingId,
          bookId: null,
          mediaId: null,
          addressBookId: null,
          quoteId: null,
          contextId: null,
          topupId: null,
          action: 'readExchangeEvidence',
          before: null,
          after: {
            exchangeId: id,
            evidenceId: eid,
            representation: 'OriginalAttachment',
          },
          reason: operations ? reason!.trim() : null,
          requestId,
          createdAt: await tx.now(),
        });
      },
      (tx) => this.discover(tx, id),
    );
    return { id: eid, ...signed };
  }
}
