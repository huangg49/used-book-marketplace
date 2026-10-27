import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJson } from '../../common/canonical-json.js';
import type {
  AutofillSuggestionDoc,
  CatalogBookDoc,
  CatalogRevisionDoc,
} from '../../database/mongo/documents.js';
import { titleKey } from '../../database/mongo/migrations/0003-catalog-title-key.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import { publicBookOf } from '../catalog/catalog.service.js';
import { normalizeSearch } from '../commands/contract-input.service.js';
import {
  DomainError,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
} from '../commands/mongo-command.service.js';
import {
  costMicroUsd,
  PriceModelError,
  rateFor,
  type ModelFailure,
} from '../price-assist/price-model.js';
import {
  checkAutofill,
  InvalidAutofillOutput,
  type CheckedAutofill,
} from './autofill-check.js';
import { AutofillImages } from './autofill-images.js';
import { AutofillModel } from './autofill-model.js';
import { AUTOFILL_SYSTEM, AUTOFILL_USER } from './autofill-prompt.js';

const DAY_MS = 86_400_000;
const SUGGESTION_TTL_MS = DAY_MS;
const LISTING_WINDOW_MS = 60_000;
const LISTING_WINDOW_CALLS = 3;
const MAX_MATCHES = 5;
const NEED_TITLE =
  'Chưa đọc được tên sách. Chụp rõ bìa trước hoặc trang bản quyền rồi thử lại.';

const rateLimited = (message: string) =>
  new DomainError(429, 'RATE_LIMITED', message);
const unavailable = (message: string) =>
  new DomainError(503, 'UNAVAILABLE', message);
const failureCopy: Record<ModelFailure, string> = {
  Timeout: 'Đọc ảnh mất quá lâu. Bạn vẫn có thể tự nhập thông tin sách hoặc thử lại sau.',
  InvalidOutput:
    'Chưa đọc được thông tin đáng tin từ ảnh. Bạn vẫn có thể tự nhập thông tin sách.',
  ProviderError:
    'Trợ lý đọc ảnh tạm thời không dùng được. Bạn vẫn có thể tự nhập thông tin sách.',
  Refusal: 'Trợ lý không đọc được các ảnh này. Bạn vẫn có thể tự nhập thông tin sách.',
};

type Prepared =
  | { kind: 'done'; doc: AutofillSuggestionDoc; cached: boolean }
  | {
      kind: 'call';
      id: string;
      ownerId: string;
      keys: string[];
      day: string;
    };

@Injectable()
export class AutofillAssistService {
  private readonly logger = new Logger(AutofillAssistService.name);
  constructor(
    private readonly mongo: MongoService,
    private readonly commands: MongoCommandService,
    private readonly config: ConfigService,
    @Optional() @Inject(AutofillModel) private readonly model: AutofillModel | null,
    @Optional() @Inject(AutofillImages) private readonly images: AutofillImages | null,
  ) {}

  private get userDailyLimit() {
    return Number(this.config.get('AUTOFILL_USER_DAILY_LIMIT') ?? 10);
  }
  // Shared with the price assistant: one daily AI budget for the system.
  private get budgetMicroUsd() {
    return Number(this.config.get('PRICE_ASSIST_DAILY_BUDGET_USD') ?? 2) * 1e6;
  }
  private get timeoutMs() {
    return Number(this.config.get('AUTOFILL_TIMEOUT_MS') ?? 25_000);
  }

  async suggest(
    auth: Actor,
    listingId: string,
    requestKey: string,
    body: Wire['AutofillSuggestionRequest'],
  ): Promise<Wire['AutofillSuggestion']> {
    const mediaIds = body.mediaIds.map((id) => id.toLowerCase());
    if (new Set(mediaIds).size !== mediaIds.length)
      invalidField('/mediaIds', 'Mỗi ảnh chỉ chọn một lần.', 'Invalid');
    const requestHash = createHash('sha256')
      .update(canonicalJson({ listingId, mediaIds }))
      .digest('hex');
    // Authorization, cache lookup and quota reservation commit together; the
    // photo read and provider call happen after commit.
    const prepared = await this.commands.read<Prepared>(auth, async (tx, actor) => {
      member(actor);
      requireActive(actor);
      const replay = await tx.c.autofill_suggestions.findOne({
        ownerId: actor._id,
        requestKey,
      });
      if (replay) {
        if (replay.requestHash !== requestHash)
          throw new DomainError(
            409,
            'IdempotencyConflict',
            'Mã yêu cầu đã được dùng cho nội dung khác.',
          );
        if (replay.status === 'Pending')
          throw rateLimited('Ảnh đang được đọc. Thử lại sau giây lát.');
        if (replay.status === 'Failed')
          throw unavailable(failureCopy[replay.failure ?? 'ProviderError']);
        return { kind: 'done', doc: replay, cached: true };
      }
      const listing = await tx.c.listings.findOne({ _id: listingId });
      if (!listing || listing.ownerId !== actor._id || listing.deletedAt)
        throw notFound();
      const editable =
        ['Draft', 'Rejected', 'Approved'].includes(listing.moderation) &&
        listing.visibility !== 'Removed' &&
        listing.trade === 'Available';
      if (!editable) throw invalidState();
      const revision = listing.currentRevisionId
        ? await tx.c.listing_revisions.findOne({ _id: listing.currentRevisionId })
        : null;
      if (revision?.bundle) throw invalidState();
      const media = await tx.c.listing_media
        .find({ _id: { $in: mediaIds }, listingId, status: 'Ready', purgedAt: null })
        .toArray();
      const byId = new Map(media.map((m) => [m._id, m]));
      if (mediaIds.some((id) => !byId.get(id)?.derivativeKey))
        invalidField(
          '/mediaIds',
          'Chỉ chọn ảnh đã tải xong của bài đăng này.',
          'Unavailable',
        );
      const ordered = mediaIds.map((id) => byId.get(id)!);
      if (!this.model || !this.images)
        throw unavailable(
          'Trợ lý đọc ảnh đang tắt. Bạn vẫn có thể tự nhập thông tin sách.',
        );
      const now = await tx.now();
      const fp = createHash('sha256')
        .update(canonicalJson({ photos: ordered.map((m) => m.sha256), model: this.model.model }))
        .digest('hex');
      const id = randomUUID();
      const base = {
        _id: id,
        ownerId: actor._id,
        listingId,
        mediaIds,
        inputFingerprint: fp,
        requestKey,
        requestHash,
        failure: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        costMicroUsd: null,
        latencyMs: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SUGGESTION_TTL_MS),
        updatedAt: now,
        lockSeq: 0,
      };
      const cached = await tx.c.autofill_suggestions.findOne(
        {
          listingId,
          inputFingerprint: fp,
          status: { $in: ['Suggested', 'NeedsMoreData'] },
          expiresAt: { $gt: now },
        },
        { sort: { createdAt: -1 } },
      );
      if (cached) {
        // This key's own record (no provider call, so no usage numbers).
        const doc: AutofillSuggestionDoc = {
          ...base,
          status: cached.status,
          response: { ...cached.response!, mediaIds },
          expiresAt: cached.expiresAt,
        };
        await tx.c.autofill_suggestions.insertOne(doc);
        return { kind: 'done', doc, cached: true };
      }
      const inFlight = await tx.c.autofill_suggestions.findOne({
        ownerId: actor._id,
        status: 'Pending',
        createdAt: { $gt: new Date(now.getTime() - 2 * this.timeoutMs - 5_000) },
      });
      if (inFlight) throw rateLimited('Đang đọc ảnh khác. Thử lại sau giây lát.');
      const recent = await tx.c.autofill_suggestions.countDocuments({
        listingId,
        model: { $ne: null },
        createdAt: { $gt: new Date(now.getTime() - LISTING_WINDOW_MS) },
      });
      if (recent >= LISTING_WINDOW_CALLS)
        throw rateLimited('Bạn vừa đọc ảnh nhiều lần. Thử lại sau một phút.');
      const day = now.toISOString().slice(0, 10);
      const usageExpiresAt = new Date(Date.parse(day) + 2 * DAY_MS);
      const global = await tx.c.price_assist_usage.findOne({ _id: `global:${day}` });
      if ((global?.costMicroUsd ?? 0) >= this.budgetMicroUsd)
        throw unavailable(
          'Trợ lý AI đã dùng hết hạn mức hôm nay. Bạn vẫn có thể tự nhập thông tin sách.',
        );
      const user = await tx.c.price_assist_usage.findOneAndUpdate(
        { _id: `autofill:user:${actor._id}:${day}` },
        { $inc: { calls: 1 }, $setOnInsert: { costMicroUsd: 0, expiresAt: usageExpiresAt } },
        { upsert: true, returnDocument: 'after' },
      );
      if ((user?.calls ?? 0) > this.userDailyLimit)
        throw rateLimited(
          'Bạn đã dùng hết lượt đọc ảnh hôm nay. Bạn vẫn có thể tự nhập thông tin sách.',
        );
      await tx.c.price_assist_usage.updateOne(
        { _id: `global:${day}` },
        { $inc: { calls: 1 }, $setOnInsert: { costMicroUsd: 0, expiresAt: usageExpiresAt } },
        { upsert: true },
      );
      await tx.c.autofill_suggestions.insertOne({ ...base, status: 'Pending', response: null });
      return {
        kind: 'call',
        id,
        ownerId: actor._id,
        keys: ordered.map((m) => m.derivativeKey!),
        day,
      };
    });
    if (prepared.kind === 'done') return toWire(prepared.doc, prepared.cached);
    return this.complete(prepared);
  }

  private async complete(p: Extract<Prepared, { kind: 'call' }>) {
    const model = this.model!;
    const started = Date.now();
    let failure: ModelFailure | null = null;
    let checked: CheckedAutofill | null = null;
    let modelId = model.model;
    let cost = 0;
    const usage = { inputTokens: 0, outputTokens: 0 };
    const attempt = async (images: string[], useFallback: boolean) => {
      const id = useFallback ? model.fallback! : model.model;
      try {
        const draft = await model.read(AUTOFILL_SYSTEM, AUTOFILL_USER, images, useFallback);
        usage.inputTokens += draft.inputTokens;
        usage.outputTokens += draft.outputTokens;
        cost += costMicroUsd(rateFor(id, null), draft.inputTokens, draft.outputTokens);
        modelId = draft.model;
        return checkAutofill(draft.output);
      } catch (e) {
        if (e instanceof PriceModelError && e.usage) {
          usage.inputTokens += e.usage.inputTokens;
          usage.outputTokens += e.usage.outputTokens;
          cost += costMicroUsd(rateFor(id, null), e.usage.inputTokens, e.usage.outputTokens);
        }
        throw e;
      }
    };
    try {
      const images = await Promise.all(p.keys.map((k) => this.images!.dataUrl(k)));
      let first: CheckedAutofill | null = null;
      try {
        first = await attempt(images, false);
      } catch (e) {
        if (!model.fallback) throw e;
      }
      checked = first;
      // One fallback call when the first model read no title or failed.
      if (model.fallback && !first?.fields.title) {
        try {
          const second = await attempt(images, true);
          if (second.fields.title || !first) checked = second;
        } catch (e) {
          if (!first) throw e;
        }
      }
    } catch (e) {
      checked = null;
      if (e instanceof PriceModelError) failure = e.kind;
      else if (e instanceof InvalidAutofillOutput) failure = 'InvalidOutput';
      else failure = 'ProviderError';
      // Ids and the provider's short reason only; never photo bytes or the key.
      this.logger.warn(
        JSON.stringify({
          autofillId: p.id,
          model: modelId,
          failure,
          detail: e instanceof Error ? e.message.slice(0, 400) : 'unknown',
        }),
      );
    }
    const matches = checked ? await this.matches(checked, p.ownerId) : [];
    const latencyMs = Date.now() - started;
    const doc = await this.mongo.tx(async (tx) => {
      await tx.lock('autofill_suggestions', [p.id]);
      const current = await tx.c.autofill_suggestions.findOne({ _id: p.id });
      if (!current) throw new Error('Pending autofill suggestion disappeared');
      const answer = checked?.fields.title ? 'Suggested' : 'NeedsMoreData';
      const set = {
        status: checked ? answer : 'Failed',
        failure: checked ? null : failure,
        response: checked ? wireBody(current, answer, checked, matches, modelId) : null,
        model: modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costMicroUsd: cost,
        latencyMs,
        updatedAt: new Date(),
      } as const;
      await tx.c.autofill_suggestions.updateOne({ _id: p.id }, { $set: set });
      for (const key of [`global:${p.day}`, `autofill:user:${current.ownerId}:${p.day}`])
        await tx.c.price_assist_usage.updateOne({ _id: key }, { $inc: { costMicroUsd: cost } });
      return { ...current, ...set } as AutofillSuggestionDoc;
    });
    if (!checked) throw unavailable(failureCopy[failure ?? 'ProviderError']);
    return toWire(doc, false);
  }

  // Confirmed books, or the caller's own Pending request: by ISBN first, then
  // by normalized title with at least one shared author when authors were read.
  private async matches(
    checked: CheckedAutofill,
    ownerId: string,
  ): Promise<Wire['AutofillMatch'][]> {
    const c = this.mongo.c;
    const { isbn, title, authors } = checked.fields;
    const visible = (b: CatalogBookDoc) =>
      b.status === 'Confirmed' || (b.status === 'Pending' && b.requesterId === ownerId);
    const out: Wire['AutofillMatch'][] = [];
    const seen = new Set<string>();
    const add = (b: CatalogBookDoc, r: CatalogRevisionDoc, by: 'Isbn' | 'TitleAuthor') => {
      if (seen.has(b._id) || out.length >= MAX_MATCHES) return;
      seen.add(b._id);
      out.push({ book: publicBookOf(b._id, r), matchedBy: by, pending: b.status === 'Pending' });
    };
    const revisionsOf = async (books: CatalogBookDoc[]) => {
      const ids = books.map((b) => b.currentRevisionId).filter((x): x is string => !!x);
      const revs = await c.catalog_revisions.find({ _id: { $in: ids } }).toArray();
      return new Map(revs.map((r) => [r._id, r]));
    };
    if (isbn) {
      const confirmed = await c.catalog_books
        .find({ status: 'Confirmed', confirmedIsbn: isbn })
        .limit(MAX_MATCHES)
        .toArray();
      const own = await c.catalog_books
        .find({ status: 'Pending', requesterId: ownerId })
        .limit(50)
        .toArray();
      const revs = await revisionsOf([...confirmed, ...own]);
      for (const b of [...confirmed, ...own]) {
        const r = revs.get(b.currentRevisionId ?? '');
        if (r && visible(b) && r.isbn === isbn) add(b, r, 'Isbn');
      }
    }
    if (title && out.length < MAX_MATCHES) {
      // Spacing and initials punctuation differ between covers and the
      // catalog ("新海 誠" / "新海誠", "J. K." / "J.K."); case and accents too.
      const authorKey = (a: string) => normalizeSearch(a).replace(/[\s.·・-]+/g, '');
      const wanted = new Set(authors.map(authorKey));
      const books = await c.catalog_books
        .find({ titleKey: titleKey(title), status: { $in: ['Confirmed', 'Pending'] } })
        .limit(20)
        .toArray();
      const revs = await revisionsOf(books);
      for (const b of books) {
        const r = revs.get(b.currentRevisionId ?? '');
        if (!r || !visible(b)) continue;
        if (wanted.size && !r.authors.some((a) => wanted.has(authorKey(a)))) continue;
        add(b, r, 'TitleAuthor');
      }
    }
    return out;
  }
}

function wireBody(
  base: Pick<AutofillSuggestionDoc, 'listingId' | 'mediaIds' | 'createdAt' | 'expiresAt'>,
  status: 'Suggested' | 'NeedsMoreData',
  checked: CheckedAutofill,
  matches: Wire['AutofillMatch'][],
  model: string,
): Record<string, unknown> {
  const missing = [...checked.missing];
  if (!checked.fields.title && !missing.includes(NEED_TITLE)) missing.unshift(NEED_TITLE);
  return {
    listingId: base.listingId,
    mediaIds: base.mediaIds,
    status,
    fields: checked.fields,
    matches,
    missing: missing.slice(0, 6),
    model,
    generatedAt: base.createdAt.toISOString(),
    expiresAt: base.expiresAt.toISOString(),
  };
}

function toWire(doc: AutofillSuggestionDoc, cached: boolean): Wire['AutofillSuggestion'] {
  return {
    ...(doc.response as Omit<Wire['AutofillSuggestion'], 'id' | 'cached'>),
    id: doc._id,
    cached,
  };
}
