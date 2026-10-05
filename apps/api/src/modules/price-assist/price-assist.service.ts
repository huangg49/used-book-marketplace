import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { PriceSuggestionDoc } from '../../database/mongo/documents.js';
import { MongoService } from '../../database/mongo/mongo.service.js';
import type { Tx } from '../../database/mongo/transaction.js';
import {
  MongoCommandService,
  member,
  requireActive,
  type Actor,
} from '../commands/mongo-command.service.js';
import {
  DomainError,
  invalidField,
  invalidState,
  notFound,
  type Wire,
} from '../commands/domain-error.js';
import {
  evaluate,
  fingerprint,
  type BookFacts,
  type Evidence,
  type PriceInput,
  type RawSource,
} from './evidence.js';
import { checkOutput, InvalidModelOutput } from './output-check.js';
import { buildUserPrompt, SYSTEM_PROMPT } from './prompt.js';
import {
  costMicroUsd,
  PriceModel,
  PriceModelError,
  rateFor,
  type ModelFailure,
} from './price-model.js';

const DAY_MS = 86_400_000;
const SUGGESTION_TTL_MS = DAY_MS;
const LISTING_WINDOW_MS = 60_000;
const LISTING_WINDOW_CALLS = 3;
const INTERNAL_LABEL = 'Giá rao trên Lật lại';

const rateLimited = (message: string) =>
  new DomainError(429, 'RATE_LIMITED', message);
const unavailable = (message: string) =>
  new DomainError(503, 'UNAVAILABLE', message);
const failureCopy: Record<ModelFailure, string> = {
  Timeout:
    'Trợ lý gợi ý giá phản hồi quá lâu. Bạn vẫn có thể tự nhập giá hoặc thử lại sau.',
  InvalidOutput:
    'Trợ lý chưa đưa ra được khoảng giá đáng tin. Bạn vẫn có thể tự nhập giá.',
  ProviderError:
    'Trợ lý gợi ý giá tạm thời không dùng được. Bạn vẫn có thể tự nhập giá.',
  Refusal:
    'Trợ lý không ước lượng được cho cuốn sách này. Bạn vẫn có thể tự nhập giá.',
};

type Prepared =
  | { kind: 'done'; doc: PriceSuggestionDoc; cached: boolean }
  | {
      kind: 'call';
      id: string;
      input: PriceInput;
      book: BookFacts;
      evidence: Evidence;
      fp: string;
      now: Date;
      day: string;
    };

@Injectable()
export class PriceAssistService {
  constructor(
    private readonly mongo: MongoService,
    private readonly commands: MongoCommandService,
    private readonly config: ConfigService,
    @Optional() @Inject(PriceModel) private readonly model: PriceModel | null,
  ) {}

  private get userDailyLimit() {
    return Number(this.config.get('PRICE_ASSIST_USER_DAILY_LIMIT') ?? 20);
  }
  private get budgetMicroUsd() {
    return Number(this.config.get('PRICE_ASSIST_DAILY_BUDGET_USD') ?? 2) * 1e6;
  }
  private get timeoutMs() {
    return Number(this.config.get('PRICE_ASSIST_TIMEOUT_MS') ?? 20_000);
  }
  private rate(): [number, number] {
    const input = this.config.get<string>('PRICE_ASSIST_INPUT_USD_PER_MTOK');
    const output = this.config.get<string>('PRICE_ASSIST_OUTPUT_USD_PER_MTOK');
    return rateFor(
      this.model?.model ?? '',
      input && output ? [Number(input), Number(output)] : null,
    );
  }

  async suggest(
    auth: Actor,
    listingId: string,
    body: Wire['PriceSuggestionRequest'],
  ): Promise<Wire['PriceSuggestion']> {
    const input: PriceInput = {
      bookId: body.bookId.toLowerCase(),
      condition: body.condition,
      readable: body.readable,
      hasMissingPages: body.hasMissingPages,
      missingEssentialContent: body.missingEssentialContent,
      conditionNote: body.conditionNote ?? '',
    };
    // Authorization, rules, cache lookup and quota reservation commit together;
    // the provider call happens after commit (no side effects in a retried tx).
    const prepared = await this.commands.read<Prepared>(auth, async (tx, actor) => {
      member(actor);
      requireActive(actor);
      const listing = await tx.c.listings.findOne({ _id: listingId });
      if (!listing || listing.ownerId !== actor._id || listing.deletedAt)
        throw notFound();
      const draftEditable =
        ['Draft', 'Rejected'].includes(listing.moderation) &&
        listing.visibility !== 'Removed' &&
        listing.trade === 'Available';
      const approvedEditable =
        listing.moderation === 'Approved' &&
        listing.visibility !== 'Removed' &&
        listing.trade === 'Available';
      if (!draftEditable && !approvedEditable) throw invalidState();
      const book = await this.book(tx, input.bookId, actor._id);
      const raw = await this.sources(tx, book, actor._id);
      const now = await tx.now();
      const evidence = evaluate(input, book, raw, now);
      const fp = fingerprint(input, raw);
      const cached = await tx.c.price_suggestions.findOne(
        {
          listingId,
          inputFingerprint: fp,
          status: { $in: ['Suggested', 'NeedsMoreData', 'Refused'] },
          expiresAt: { $gt: now },
        },
        { sort: { createdAt: -1 } },
      );
      if (cached) return { kind: 'done', doc: cached, cached: true };
      const id = randomUUID();
      const base = {
        _id: id,
        ownerId: actor._id,
        listingId,
        bookId: input.bookId,
        inputFingerprint: fp,
        failure: null,
        evidenceLevel: evidence.level,
        rangeLow: null,
        rangeHigh: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        costMicroUsd: null,
        latencyMs: null,
        outcome: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SUGGESTION_TTL_MS),
        updatedAt: now,
        lockSeq: 0,
      };
      if (evidence.status !== 'Proceed') {
        const doc: PriceSuggestionDoc = {
          ...base,
          status: evidence.status,
          response: wireBody(base, evidence, evidence.status, null, null),
        };
        await tx.c.price_suggestions.insertOne(doc);
        return { kind: 'done', doc, cached: false };
      }
      if (!this.model)
        throw unavailable(
          'Trợ lý gợi ý giá đang tắt. Bạn vẫn có thể tự nhập giá bán.',
        );
      // One in-flight call per member (the user lock above serializes this check).
      const inFlight = await tx.c.price_suggestions.findOne({
        ownerId: actor._id,
        status: 'Pending',
        createdAt: { $gt: new Date(now.getTime() - this.timeoutMs - 5_000) },
      });
      if (inFlight)
        throw rateLimited('Đang tạo một gợi ý khác. Thử lại sau giây lát.');
      const recent = await tx.c.price_suggestions.countDocuments({
        listingId,
        model: { $ne: null },
        createdAt: { $gt: new Date(now.getTime() - LISTING_WINDOW_MS) },
      });
      if (recent >= LISTING_WINDOW_CALLS)
        throw rateLimited('Bạn vừa yêu cầu nhiều gợi ý. Thử lại sau một phút.');
      const day = now.toISOString().slice(0, 10);
      const expiresAt = new Date(Date.parse(day) + 2 * DAY_MS);
      const global = await tx.c.price_assist_usage.findOne({
        _id: `global:${day}`,
      });
      if ((global?.costMicroUsd ?? 0) >= this.budgetMicroUsd)
        throw unavailable(
          'Trợ lý gợi ý giá đã dùng hết hạn mức hôm nay. Bạn vẫn có thể tự nhập giá bán.',
        );
      const user = await tx.c.price_assist_usage.findOneAndUpdate(
        { _id: `user:${actor._id}:${day}` },
        { $inc: { calls: 1 }, $setOnInsert: { costMicroUsd: 0, expiresAt } },
        { upsert: true, returnDocument: 'after' },
      );
      if ((user?.calls ?? 0) > this.userDailyLimit)
        throw rateLimited(
          'Bạn đã dùng hết lượt gợi ý giá hôm nay. Bạn vẫn có thể tự nhập giá bán.',
        );
      await tx.c.price_assist_usage.updateOne(
        { _id: `global:${day}` },
        { $inc: { calls: 1 }, $setOnInsert: { costMicroUsd: 0, expiresAt } },
        { upsert: true },
      );
      await tx.c.price_suggestions.insertOne({
        ...base,
        status: 'Pending',
        response: null,
      });
      return { kind: 'call', id, input, book, evidence, fp, now, day };
    });
    if (prepared.kind === 'done') return toWire(prepared.doc, prepared.cached);
    return this.complete(prepared);
  }

  private async complete(p: Extract<Prepared, { kind: 'call' }>) {
    const started = Date.now();
    let failure: ModelFailure | null = null;
    let usage = { inputTokens: 0, outputTokens: 0 };
    let checked: ReturnType<typeof checkOutput> | null = null;
    let modelId = this.model!.model;
    try {
      const draft = await this.model!.draft(
        SYSTEM_PROMPT,
        buildUserPrompt(p.input, p.book, p.evidence),
      );
      usage = { inputTokens: draft.inputTokens, outputTokens: draft.outputTokens };
      modelId = draft.model;
      checked = checkOutput(draft.output, p.evidence);
    } catch (e) {
      if (e instanceof PriceModelError) {
        failure = e.kind;
        usage = e.usage ?? usage;
      } else if (e instanceof InvalidModelOutput) failure = 'InvalidOutput';
      else failure = 'ProviderError';
    }
    const latencyMs = Date.now() - started;
    const cost = costMicroUsd(this.rate(), usage.inputTokens, usage.outputTokens);
    const doc = await this.mongo.tx(async (tx) => {
      await tx.lock('price_suggestions', [p.id]);
      const current = await tx.c.price_suggestions.findOne({ _id: p.id });
      if (!current) throw new Error('Pending price suggestion disappeared');
      const status = checked ? 'Suggested' : 'Failed';
      const set = {
        status,
        failure,
        rangeLow: checked?.low ?? null,
        rangeHigh: checked?.high ?? null,
        response: checked
          ? wireBody(current, p.evidence, 'Suggested', checked, modelId)
          : null,
        model: modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costMicroUsd: cost,
        latencyMs,
        updatedAt: new Date(),
      } as const;
      await tx.c.price_suggestions.updateOne({ _id: p.id }, { $set: set });
      for (const key of [`global:${p.day}`, `user:${current.ownerId}:${p.day}`])
        await tx.c.price_assist_usage.updateOne(
          { _id: key },
          { $inc: { costMicroUsd: cost } },
        );
      return { ...current, ...set } as PriceSuggestionDoc;
    });
    if (failure) throw unavailable(failureCopy[failure]);
    return toWire(doc, false);
  }

  // Same visibility rule as listing drafts: confirmed, or the owner's pending request.
  private async book(tx: Tx, bookId: string, ownerId: string): Promise<BookFacts> {
    const book = await tx.c.catalog_books.findOne({ _id: bookId });
    if (
      !book ||
      !book.currentRevisionId ||
      (book.status !== 'Confirmed' &&
        !(book.status === 'Pending' && book.requesterId === ownerId))
    )
      invalidField('/bookId', 'Chọn một đầu sách có trong danh mục.', 'Unavailable');
    const r = await tx.c.catalog_revisions.findOne({ _id: book!.currentRevisionId! });
    if (!r) throw notFound();
    return {
      id: bookId,
      title: r.title,
      authors: r.authors,
      publisher: r.publisher,
      publicationYear: r.publicationYear,
      language: r.language,
      edition: r.edition,
      category: r.category,
      isbn: r.isbn,
      confirmed: book!.status === 'Confirmed',
    };
  }

  private async sources(tx: Tx, book: BookFacts, ownerId: string) {
    const refs = await tx.c.price_references
      .find({ bookId: book.id, retiredAt: null })
      .sort({ observedAt: -1 })
      .limit(30)
      .toArray();
    const raw: RawSource[] = refs.map((r) => ({
      id: r._id,
      kind: r.kind,
      amount: r.amount,
      condition: r.condition,
      label: r.sourceLabel,
      url: r.sourceUrl,
      observedAt: r.observedAt,
      isbn: r.isbn,
    }));
    // Other members' public asking prices for the same book: asking, not sold.
    const revisions = await tx.c.listing_revisions
      .find({ bookId: book.id, salePrice: { $ne: null } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    const listings = await tx.c.listings
      .find({
        _id: { $in: [...new Set(revisions.map((r) => r.listingId))] },
        ownerId: { $ne: ownerId },
        moderation: 'Approved',
        visibility: 'Visible',
        trade: 'Available',
        deletedAt: null,
      })
      .toArray();
    const current = new Map(listings.map((l) => [l.currentRevisionId, l]));
    for (const r of revisions) {
      const listing = current.get(r._id);
      if (!listing || r.salePrice === null) continue;
      raw.push({
        id: `listing:${listing._id}`,
        kind: 'InternalAsking',
        amount: r.salePrice,
        condition: r.condition,
        label: INTERNAL_LABEL,
        url: null,
        observedAt: listing.publishedAt ?? r.submittedAt ?? r.createdAt,
        isbn: null,
      });
      if (raw.length >= 40) break;
    }
    return raw;
  }

  // Records the seller's decision with the save that carries it (same tx).
  async recordDecision(
    tx: Tx,
    ownerId: string,
    listingId: string,
    revisionId: string,
    decision: Wire['PriceAssistDecision'],
    salePrice: number | null,
  ) {
    const id = decision.suggestionId.toLowerCase();
    await tx.lock('price_suggestions', [id]);
    const s = await tx.c.price_suggestions.findOne({ _id: id });
    if (
      !s ||
      s.ownerId !== ownerId ||
      s.listingId !== listingId ||
      s.status !== 'Suggested'
    )
      invalidField(
        '/priceAssist/suggestionId',
        'Gợi ý giá này không còn dùng được cho bài đăng. Hãy lưu lại mà không kèm gợi ý.',
        'Unavailable',
      );
    await tx.c.price_suggestions.updateOne(
      { _id: id },
      {
        $set: {
          outcome: {
            revisionId,
            applied: decision.applied,
            chosenSalePrice: salePrice,
            withinRange:
              salePrice === null
                ? null
                : salePrice >= s!.rangeLow! && salePrice <= s!.rangeHigh!,
            decidedAt: await tx.now(),
          },
          updatedAt: new Date(),
        },
      },
    );
  }
}

function wireBody(
  base: Pick<PriceSuggestionDoc, 'listingId' | 'bookId' | 'inputFingerprint' | 'createdAt' | 'expiresAt'>,
  evidence: Evidence,
  status: Wire['PriceSuggestionStatus'],
  checked: ReturnType<typeof checkOutput> | null,
  model: string | null,
): Record<string, unknown> {
  return {
    listingId: base.listingId,
    bookId: base.bookId,
    inputFingerprint: base.inputFingerprint,
    status,
    evidenceLevel: evidence.level,
    rules: evidence.rules.slice(0, 12),
    range: checked ? { low: checked.low, high: checked.high } : null,
    factors: checked?.factors ?? [],
    sources: evidence.sources.map((s) => ({
      ...s,
      observedAt: s.observedAt.toISOString(),
    })),
    missing: [...evidence.missing, ...(checked?.missing ?? [])].slice(0, 6),
    dataAsOf: evidence.dataAsOf?.toISOString() ?? null,
    generatedAt: base.createdAt.toISOString(),
    expiresAt: base.expiresAt.toISOString(),
    model,
  };
}

function toWire(doc: PriceSuggestionDoc, cached: boolean): Wire['PriceSuggestion'] {
  return {
    ...(doc.response as Omit<Wire['PriceSuggestion'], 'id' | 'cached'>),
    id: doc._id,
    cached,
  };
}
